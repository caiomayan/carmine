import { randomUUID } from 'node:crypto';
import {
  GAME_INSTANT_SANCTION_SECONDS,
  type GameSanction,
  isLastingSanction,
  LASTING_SANCTION_TYPES,
  type OwnSanction,
  type ProfileSanctions,
  requiresCheatProof,
  type SanctionCategory,
  type SanctionMeasure,
  type SanctionSuggestion,
  type SanctionType,
  type StaffSanction,
  sanctionCategorySchema,
  suggestSanction,
} from '@carmine/contracts';
import { aliasedTable, and, desc, eq, gt, inArray, isNull, lte, or, type SQL } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { accounts, reports, sanctions } from '../database/schema.js';
import { recordStaffAudit, type StaffAction } from '../staff/audit-log.js';
import {
  gameSanctionMessage,
  isActiveAt,
  previousOffensesAt,
  type SanctionRecord,
  toProfileSanctions,
} from './sanction-rules.js';

const MINUTE_MS = 60 * 1000;

type SanctionRow = typeof sanctions.$inferSelect;

export class SanctionNotFound extends Error {
  constructor() {
    super('Punição não encontrada');
  }
}

/** Revogar o que já foi revogado, ou encerrar um ban/mute/gag que já venceu (sem recurso). */
export class SanctionNotActive extends Error {
  constructor() {
    super('a Punição já foi revogada ou já venceu');
  }
}

/** Uma ocorrência a aplicar: Categoria e 1 ou 2 medidas (a sugestão da tabela ou ajustada). */
export interface SanctionIncident {
  category: SanctionCategory;
  measures: SanctionMeasure[];
  /** Testemunha mencionada; ban por cheat exige ela ou `evidenceUrl`. */
  witness?: string;
  /** Link da evidência anexada. */
  evidenceUrl?: string;
  /** A Denúncia (S13) que originou a Punição: é fechada como "punida" na mesma transação. */
  reportId?: string;
}

/** Ban por cheat sem testemunha nem evidência (o contrato já barra; isto é a rede de segurança). */
export class CheatProofMissing extends Error {
  constructor() {
    super('ban por cheat exige testemunha ou link da evidência');
  }
}

/** O que ficou registrado de uma ocorrência aplicada. */
export interface AppliedIncident {
  incidentId: string;
  sanctionIds: string[];
  /** Alguma medida é um ban (as sessões do site da Conta devem cair). */
  banned: boolean;
  /** Ban permanente por cheat: o VIP acaba, sem reembolso. */
  permanentCheatBan: boolean;
}

/** Uma Punição revogada. */
export interface RevokedSanction {
  id: string;
  accountId: string;
  appliedBySteamId: string;
  type: SanctionType;
}

/**
 * As Punições (`Sanction`) das Contas (S07): aplicar e revogar (com auditoria na mesma
 * transação), o que o painel, o Perfil e o jogo veem. Expirar não precisa de nada: toda leitura
 * compara `endsAt` com o agora. Quem pode o quê é do painel da Staff, não daqui.
 */
export class Sanctions {
  /**
   * @param appeal onde recorrer, como aparece no jogo (ex.: `stcarmine.com/regras#recurso`).
   */
  constructor(
    private readonly db: Database,
    private readonly appeal: string,
  ) {}

  /**
   * Aplica uma ocorrência a partir de `now`. `suggested` é a sugestão da tabela naquele momento
   * (vai para o log, para se ver quando a Staff ajustou).
   */
  async apply(
    accountId: string,
    staff: StaffAction,
    incident: SanctionIncident,
    now = new Date(),
    suggested?: SanctionMeasure[],
  ): Promise<AppliedIncident> {
    const witness = incident.witness?.trim() || null;
    const evidenceUrl = incident.evidenceUrl?.trim() || null;
    if (requiresCheatProof(incident.category, incident.measures) && !witness && !evidenceUrl) {
      throw new CheatProofMissing();
    }
    const incidentId = randomUUID();
    const sanctionIds = await this.db.transaction(async (tx) => {
      const [account] = await tx
        .select({ steamId: accounts.steamId })
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .for('update');
      if (!account) throw new Error(`Conta ${accountId} não existe`);
      const inserted = await tx
        .insert(sanctions)
        .values(
          incident.measures.map((measure) => ({
            incidentId,
            accountId,
            type: measure.type,
            category: incident.category,
            reason: staff.reason,
            witness,
            evidenceUrl,
            startsAt: now,
            endsAt:
              isLastingSanction(measure.type) && measure.durationMinutes !== null
                ? new Date(now.getTime() + measure.durationMinutes * MINUTE_MS)
                : null,
            appliedBySteamId: BigInt(staff.actorSteamId),
            createdAt: now,
          })),
        )
        .returning({ id: sanctions.id });
      const ids = inserted.map((row) => row.id);
      await recordStaffAudit(tx, {
        action: 'sanction_apply',
        staff,
        target: { accountId, steamId: account.steamId },
        details: {
          incidentId,
          sanctionIds: ids,
          category: incident.category,
          measures: incident.measures,
          ...(witness && { witness }),
          ...(evidenceUrl && { evidenceUrl }),
          ...(suggested && { suggested }),
          ...(incident.reportId && { reportId: incident.reportId }),
        },
        at: now,
      });
      if (incident.reportId) {
        await tx
          .update(reports)
          .set({
            status: 'sanctioned',
            resolvedAt: now,
            resolvedBySteamId: BigInt(staff.actorSteamId),
          })
          .where(and(eq(reports.id, incident.reportId), eq(reports.status, 'open')));
      }
      return ids;
    });
    return {
      incidentId,
      sanctionIds,
      banned: incident.measures.some((m) => m.type === 'ban'),
      permanentCheatBan:
        incident.category === 'cheat' &&
        incident.measures.some((m) => m.type === 'ban' && m.durationMinutes === null),
    };
  }

  /**
   * Revoga a Punição em `now`. `appealAccepted`: o recurso foi aceito; ela some do Perfil e da
   * reincidência (vale também para uma que já venceu). Sem recurso, só o que ainda vale (ou um
   * kick/aviso ainda não revogado).
   */
  async revoke(
    sanctionId: string,
    staff: StaffAction,
    options: { appealAccepted: boolean },
    now = new Date(),
  ): Promise<RevokedSanction> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ sanction: sanctions, steamId: accounts.steamId })
        .from(sanctions)
        .innerJoin(accounts, eq(accounts.id, sanctions.accountId))
        .where(eq(sanctions.id, sanctionId))
        .for('update', { of: sanctions });
      if (!row) throw new SanctionNotFound();
      const { sanction } = row;
      const expired = isLastingSanction(sanction.type) && !isActiveAt(sanction, now);
      if (sanction.revokedAt !== null || (expired && !options.appealAccepted)) {
        throw new SanctionNotActive();
      }
      await tx
        .update(sanctions)
        .set({
          revokedAt: now,
          revokedBySteamId: BigInt(staff.actorSteamId),
          revokeReason: staff.reason,
          appealAccepted: options.appealAccepted,
        })
        .where(eq(sanctions.id, sanctionId));
      await recordStaffAudit(tx, {
        action: 'sanction_revoke',
        staff,
        target: { accountId: sanction.accountId, steamId: row.steamId },
        details: {
          sanctionId,
          incidentId: sanction.incidentId,
          type: sanction.type,
          category: sanction.category,
          appealAccepted: options.appealAccepted,
          endsAtBefore: sanction.endsAt?.toISOString() ?? null,
        },
        at: now,
      });
      return {
        id: sanction.id,
        accountId: sanction.accountId,
        appliedBySteamId: sanction.appliedBySteamId.toString(),
        type: sanction.type,
      };
    });
  }

  /** A Conta dona da Punição e quem a aplicou, ou `null` se ela não existe. */
  async find(sanctionId: string): Promise<{ accountId: string; appliedBySteamId: string } | null> {
    const [row] = await this.db
      .select({ accountId: sanctions.accountId, appliedBy: sanctions.appliedBySteamId })
      .from(sanctions)
      .where(eq(sanctions.id, sanctionId));
    return row ? { accountId: row.accountId, appliedBySteamId: row.appliedBy.toString() } : null;
  }

  /** Todas as Punições da Conta, para a Staff: com motivo, autor e revogação. */
  async historyOf(accountId: string, now = new Date()): Promise<StaffSanction[]> {
    const appliedBy = aliasedTable(accounts, 'applied_by');
    const revokedBy = aliasedTable(accounts, 'revoked_by');
    const rows = await this.db
      .select({
        sanction: sanctions,
        appliedPublicId: appliedBy.publicId,
        appliedName: appliedBy.displayName,
        revokedPublicId: revokedBy.publicId,
        revokedName: revokedBy.displayName,
      })
      .from(sanctions)
      .leftJoin(appliedBy, eq(appliedBy.steamId, sanctions.appliedBySteamId))
      .leftJoin(revokedBy, eq(revokedBy.steamId, sanctions.revokedBySteamId))
      .where(eq(sanctions.accountId, accountId))
      .orderBy(desc(sanctions.startsAt), desc(sanctions.createdAt));
    return rows.map(({ sanction: s, ...who }) => ({
      id: s.id,
      incidentId: s.incidentId,
      type: s.type,
      category: s.category,
      reason: s.reason,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt?.toISOString() ?? null,
      active: isActiveAt(s, now),
      witness: s.witness,
      evidenceUrl: s.evidenceUrl,
      appliedBy: {
        steamId: s.appliedBySteamId.toString(),
        publicId: who.appliedPublicId,
        displayName: who.appliedName,
      },
      revocation:
        s.revokedAt === null || s.revokedBySteamId === null
          ? null
          : {
              at: s.revokedAt.toISOString(),
              by: {
                steamId: s.revokedBySteamId.toString(),
                publicId: who.revokedPublicId,
                displayName: who.revokedName,
              },
              reason: s.revokeReason ?? '',
              appealAccepted: s.appealAccepted,
            },
    }));
  }

  /** A sugestão da tabela de reincidência, por Categoria, para a próxima ocorrência. */
  async suggestionsFor(accountId: string, now = new Date()): Promise<SanctionSuggestion[]> {
    const counts = previousOffensesAt(await this.recordsOf(accountId), now);
    return sanctionCategorySchema.options.map((category) => ({
      category,
      previousOffenses: counts[category],
      ...suggestSanction(category, counts[category]),
    }));
  }

  /** As Punições do Perfil público; o histórico, só para quem está logado no site. */
  async profileOf(
    accountId: string,
    viewer: { withHistory: boolean },
    now = new Date(),
  ): Promise<ProfileSanctions> {
    return toProfileSanctions(await this.recordsOf(accountId), now, viewer);
  }

  /** As Punições valendo agora, com o motivo: só para a própria Conta (`GET /api/me`). */
  async activeOf(accountId: string, now = new Date()): Promise<OwnSanction[]> {
    const rows = await this.db
      .select()
      .from(sanctions)
      .where(and(eq(sanctions.accountId, accountId), activeAt(now)))
      .orderBy(desc(sanctions.startsAt));
    return rows.map((s) => ({
      id: s.id,
      type: s.type,
      category: s.category,
      reason: s.reason,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt?.toISOString() ?? null,
    }));
  }

  /** A Conta está banida agora. */
  async isBanned(accountId: string, now = new Date()): Promise<boolean> {
    const [row] = await this.db
      .select({ id: sanctions.id })
      .from(sanctions)
      .where(and(eq(sanctions.accountId, accountId), eq(sanctions.type, 'ban'), activeAt(now)))
      .limit(1);
    return row !== undefined;
  }

  /** Tipos das Punições valendo agora, por Conta (para a busca da Staff). */
  async activeTypesOf(
    accountIds: string[],
    now = new Date(),
  ): Promise<Map<string, SanctionType[]>> {
    const types = new Map<string, SanctionType[]>();
    if (accountIds.length === 0) return types;
    const rows = await this.db
      .selectDistinct({ accountId: sanctions.accountId, type: sanctions.type })
      .from(sanctions)
      .where(and(inArray(sanctions.accountId, accountIds), activeAt(now)));
    for (const { accountId, type } of rows) {
      types.set(accountId, [...(types.get(accountId) ?? []), type]);
    }
    return types;
  }

  /**
   * O que o Carmine.Core aplica nos jogadores destes SteamID64: ban, mute e gag valendo, e kick e
   * aviso dos últimos {@link GAME_INSTANT_SANCTION_SECONDS} s (o plugin executa cada um uma vez).
   */
  async forGame(steamIds: readonly string[], now = new Date()): Promise<GameSanction[]> {
    if (steamIds.length === 0) return [];
    const recent = new Date(now.getTime() - GAME_INSTANT_SANCTION_SECONDS * 1000);
    const rows = await this.db
      .select({ sanction: sanctions, steamId: accounts.steamId })
      .from(sanctions)
      .innerJoin(accounts, eq(accounts.id, sanctions.accountId))
      .where(
        and(
          inArray(
            accounts.steamId,
            steamIds.map((id) => BigInt(id)),
          ),
          or(
            activeAt(now),
            and(
              inArray(sanctions.type, ['kick', 'warning']),
              isNull(sanctions.revokedAt),
              gt(sanctions.startsAt, recent),
              lte(sanctions.startsAt, now),
            ),
          ),
        ),
      )
      .orderBy(sanctions.startsAt);
    return rows.map(({ sanction: s, steamId }) => ({
      id: s.id,
      steamId: steamId.toString(),
      type: s.type,
      category: s.category,
      endsAt: s.endsAt?.toISOString() ?? null,
      message: gameSanctionMessage(s, this.appeal),
    }));
  }

  private async recordsOf(accountId: string): Promise<SanctionRecord[]> {
    const rows: SanctionRow[] = await this.db
      .select()
      .from(sanctions)
      .where(eq(sanctions.accountId, accountId));
    return rows;
  }
}

/** Ban, mute ou gag não revogado, já começado e não vencido em `now`. */
function activeAt(now: Date): SQL {
  return and(
    inArray(sanctions.type, [...LASTING_SANCTION_TYPES]),
    isNull(sanctions.revokedAt),
    lte(sanctions.startsAt, now),
    or(isNull(sanctions.endsAt), gt(sanctions.endsAt, now)),
  ) as SQL;
}
