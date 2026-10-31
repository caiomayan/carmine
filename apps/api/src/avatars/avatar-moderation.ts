import {
  REPORT_DAILY_LIMIT,
  REPORT_DAILY_LIMIT_MESSAGE,
  STAFF_REPORTS_PAGE_DEFAULT,
} from '@carmine/contracts';
import {
  AVATAR_REMOVED_RETENTION_DAYS,
  AVATAR_REPORTS_PER_HOUR,
  type AvatarDecisionInput,
  type AvatarReason,
  type AvatarReportReceived,
  type StaffAccountAvatar,
  type StaffAvatar,
  type StaffAvatarCase,
  type StaffAvatarCasePage,
} from '@carmine/contracts/avatar';
import { Logger } from '@nestjs/common';
import {
  aliasedTable,
  and,
  count,
  desc,
  eq,
  exists,
  gt,
  inArray,
  isNotNull,
  isNull,
  type SQL,
  sql,
} from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { accountAvatars, accounts, avatarReports } from '../database/schema.js';
import { countReportsSince, lockReporter } from '../reports/report-tally.js';
import { reporterLowWeight, reviewDeadline, weightWindowStart } from '../reports/report-weight.js';
import { recordStaffAudit } from '../staff/audit-log.js';
import type { StaffActor } from '../staff/staff.guard.js';
import { StaffRejection } from '../staff/staff-errors.js';
import { dayStartOf, nextDayStartOf } from '../stats/stats-week.js';
import type { AvatarFiles } from './avatar-files.js';
import type { AvatarReportNotifier } from './avatar-moderation-discord.js';
import { AvatarRejection } from './avatar-processor.js';
import type { MediaDeletions } from './media-deletions.js';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type AvatarRow = typeof accountAvatars.$inferSelect;
type AccountRow = typeof accounts.$inferSelect;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** O cursor não é desta fila (ou foi adulterado). */
export class InvalidAvatarCursor extends Error {}

const decider = aliasedTable(accounts, 'decider');

/** As fotos que a Staff pode decidir: a atual da Conta e as que ainda estão no histórico (com arquivos). */
const REVIEWABLE: AvatarRow['status'][] = ['active', 'suspended', 'replaced', 'reverted'];

/** Um valor de data que o driver pode devolver como `Date` ou como texto (colunas calculadas). */
const asDate = (value: Date | string): Date => (value instanceof Date ? value : new Date(value));

/**
 * O instante que ordena a foto na fila aberta: o da denúncia aberta mais antiga de quem tem peso normal (a do prazo) e,
 * se todas são de quem perdeu peso, o da mais antiga. Colunas por extenso: ver o comentário em `page`.
 */
const firstOpen = (since: Date) => sql`coalesce(
  (
    select min(r.created_at) from avatar_reports r
    where r.avatar_id = "account_avatars"."id" and r.dismissed_at is null
      and not ${reporterLowWeight(sql.raw('r.reporter_account_id'), since)}
  ),
  (
    select min(r.created_at) from avatar_reports r
    where r.avatar_id = "account_avatars"."id" and r.dismissed_at is null
  )
)`;

/**
 * O grupo da foto na fila aberta: 0 se ela tem alguma denúncia aberta de quem tem peso normal, 1 se só tem de quem
 * perdeu peso (essas vão para o fim da fila). O peso é o da regra única de denúncia (ADR 0027), de todos os tipos.
 */
const queueGroup = (since: Date) => sql<number>`(case when exists (
  select 1 from avatar_reports r
  where r.avatar_id = "account_avatars"."id" and r.dismissed_at is null
    and not ${reporterLowWeight(sql.raw('r.reporter_account_id'), since)}
) then 0 else 1 end)`;

/**
 * A moderação da foto de perfil (ADR 0022 e 0025), depois da publicação na hora: a denúncia (só entra na fila; não
 * tira nada do ar), a fila da Staff, a decisão (manter ou remover) e a remoção em um clique, com o bloqueio de novos
 * envios que a Staff escolhe. Toda decisão fica no log de auditoria, na mesma transação. Os arquivos mudam de lugar pelos primitivos de
 * {@link AvatarFiles}, também dentro da transação (o R2 não participa dela: se a cópia falhar,
 * nada muda).
 */
export class AvatarModeration {
  private readonly logger = new Logger(AvatarModeration.name);

  constructor(
    private readonly db: Database,
    private readonly files: AvatarFiles,
    private readonly deletions: MediaDeletions,
    private readonly notifier: AvatarReportNotifier,
    /** Funcionalidade ligada (R2 de mídia configurado). */
    private readonly enabled: boolean,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /* ------------------------------ denúncia ------------------------------ */

  /**
   * Denuncia a foto própria de um Perfil. Uma por Conta e foto; no máximo `AVATAR_REPORTS_PER_HOUR`
   * por hora por pessoa. A denúncia só entra na fila da Staff: nunca tira a foto do ar. Contra uma imagem que a Staff
   * já aprovou, ela é descartada (a resposta é a mesma). Só uma imagem nova pode ser denunciada de novo.
   */
  async report(
    reporterId: string,
    targetPublicId: number,
    reason: AvatarReason,
  ): Promise<AvatarReportReceived> {
    if (!this.enabled) throw new AvatarRejection('disabled', 'Foto de perfil indisponível');
    const now = this.now();
    const [target] = await this.db
      .select()
      .from(accounts)
      .where(eq(accounts.publicId, targetPublicId));
    if (!target || target.anonymizedAt !== null) {
      throw new AvatarRejection('no_custom_avatar', 'Este Perfil não tem foto própria');
    }
    if (target.id === reporterId) {
      throw new AvatarRejection('own_avatar', 'Você não pode denunciar a sua própria foto');
    }
    const [avatar] = await this.db
      .select()
      .from(accountAvatars)
      .where(and(eq(accountAvatars.accountId, target.id), eq(accountAvatars.status, 'active')));
    if (!avatar) throw new AvatarRejection('no_custom_avatar', 'Este Perfil não tem foto própria');
    const verdict = await this.db.transaction(async (tx) => {
      await lockReporter(tx, reporterId);
      // O teto por dia soma todos os tipos de Denúncia (regra única de denúncia, ADR 0027).
      const sentToday = await countReportsSince(tx, reporterId, dayStartOf(now));
      if (sentToday >= REPORT_DAILY_LIMIT) {
        throw new AvatarRejection(
          'report_daily_limit',
          REPORT_DAILY_LIMIT_MESSAGE,
          nextDayStartOf(now),
        );
      }
      const recent = await tx
        .select({ createdAt: avatarReports.createdAt })
        .from(avatarReports)
        .where(
          and(
            eq(avatarReports.reporterAccountId, reporterId),
            gt(avatarReports.createdAt, new Date(now.getTime() - HOUR_MS)),
          ),
        )
        .orderBy(avatarReports.createdAt);
      if (recent.length >= AVATAR_REPORTS_PER_HOUR) {
        const counting = recent[recent.length - AVATAR_REPORTS_PER_HOUR];
        throw new AvatarRejection(
          'report_limit',
          'Muitas denúncias de foto na última hora',
          counting && new Date(counting.createdAt.getTime() + HOUR_MS),
        );
      }
      // Imagem já aprovada: descarta, sem gravar nada. Fica depois dos limites para a resposta ser a mesma de uma
      // denúncia aceita em qualquer caso (quem denuncia não aprende se a imagem está aprovada).
      if (avatar.decision === 'keep') return 'discarded' as const;
      const inserted = await tx
        .insert(avatarReports)
        .values({ avatarId: avatar.id, reporterAccountId: reporterId, reason, createdAt: now })
        .onConflictDoNothing()
        .returning({ id: avatarReports.id });
      if (inserted.length === 0) {
        throw new AvatarRejection('already_reported', 'Você já denunciou esta foto');
      }
      return 'recorded' as const;
    });
    if (verdict === 'discarded') return { received: true };

    // Avisa a Staff na primeira denúncia aberta da foto.
    const [open] = await this.db
      .select({ reporters: count() })
      .from(avatarReports)
      .where(and(eq(avatarReports.avatarId, avatar.id), isNull(avatarReports.dismissedAt)));
    const reporters = open?.reporters ?? 1;
    if (reporters === 1) {
      this.notifier.notify({
        reason,
        targetName: target.displayName,
        targetPublicId: target.publicId,
        reporters,
      });
    }
    return { received: true };
  }

  /* ------------------------------- a fila ------------------------------- */

  /**
   * A fila de denúncias de foto. `open`: fotos no ar, no histórico (ainda com arquivos) ou no estado antigo de
   * suspensas, com denúncia ainda sem decisão, as mais antigas primeiro (o prazo de 24 h corre) e, no fim, as que só
   * têm denúncia de quem perdeu peso; `decided`: as já decididas, da mais recente.
   */
  async page(
    status: 'open' | 'decided',
    options: { before?: string; limit?: number } = {},
  ): Promise<StaffAvatarCasePage> {
    const limit = options.limit ?? STAFF_REPORTS_PAGE_DEFAULT;
    const open = status === 'open';
    // Colunas escritas por extenso de propósito: numa seleção de uma tabela só, o drizzle tira o prefixo das
    // colunas dentro de `sql`, e a subconsulta passaria a comparar com as colunas dela mesma.
    const since = weightWindowStart(this.now());
    const sortAt = open ? firstOpen(since) : sql`"account_avatars"."decided_at"`;
    const sortKey = sql<string>`to_char(${sortAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
    const group = open ? queueGroup(since) : sql<number>`0`;
    const conditions: SQL[] = open
      ? [
          inArray(accountAvatars.status, REVIEWABLE),
          isNull(accountAvatars.deletedAt),
          exists(
            this.db
              .select({ one: sql`1` })
              .from(avatarReports)
              .where(
                and(
                  eq(avatarReports.avatarId, accountAvatars.id),
                  isNull(avatarReports.dismissedAt),
                ),
              ),
          ),
        ]
      : [
          isNotNull(accountAvatars.decidedAt),
          isNotNull(accountAvatars.decision),
          // Só as que passaram pela fila: remoção direta da ficha, sem denúncia, fica no histórico da Conta.
          exists(
            this.db
              .select({ one: sql`1` })
              .from(avatarReports)
              .where(eq(avatarReports.avatarId, accountAvatars.id)),
          ),
        ];
    if (options.before) {
      const cursor = decodeCursor(options.before);
      conditions.push(
        open
          ? sql`(${group}, ${sortAt}, ${accountAvatars.id}) > (${cursor.group}::int, ${cursor.key}::timestamptz, ${cursor.id}::uuid)`
          : sql`(${sortAt}, ${accountAvatars.id}) < (${cursor.key}::timestamptz, ${cursor.id}::uuid)`,
      );
    }
    const rows = await this.db
      .select({ avatar: accountAvatars, sortKey, group })
      .from(accountAvatars)
      .where(and(...conditions))
      .orderBy(
        ...(open
          ? [group, sortAt, accountAvatars.id]
          : [desc(accountAvatars.decidedAt), desc(accountAvatars.id)]),
      )
      .limit(limit + 1);
    const pageRows = rows.slice(0, limit);
    const cases = await this.casesOf(
      pageRows.map((row) => row.avatar),
      since,
    );
    const last = rows.length > limit ? pageRows[pageRows.length - 1] : undefined;

    const [counted] = await this.db
      .select({ openCount: count() })
      .from(accountAvatars)
      .where(
        and(
          inArray(accountAvatars.status, REVIEWABLE),
          isNull(accountAvatars.deletedAt),
          exists(
            this.db
              .select({ one: sql`1` })
              .from(avatarReports)
              .where(
                and(
                  eq(avatarReports.avatarId, accountAvatars.id),
                  isNull(avatarReports.dismissedAt),
                ),
              ),
          ),
        ),
      );
    return {
      cases,
      nextCursor: last ? encodeCursor(last.group, last.sortKey, last.avatar.id) : null,
      openCount: counted?.openCount ?? 0,
    };
  }

  /** Um caso da fila (o que a decisão devolve). */
  async caseOf(avatarId: string): Promise<StaffAvatarCase> {
    const [avatar] = await this.db
      .select()
      .from(accountAvatars)
      .where(eq(accountAvatars.id, avatarId));
    const [one] = avatar ? await this.casesOf([avatar], weightWindowStart(this.now())) : [];
    if (!one) throw new StaffRejection('avatar_not_found', 'Foto não encontrada');
    return one;
  }

  /** Monta os casos de uma lista de fotos, na mesma ordem. */
  private async casesOf(avatars: AvatarRow[], since: Date): Promise<StaffAvatarCase[]> {
    if (avatars.length === 0) return [];
    const ids = avatars.map((avatar) => avatar.id);
    const [people, totals, reasons, previous, waiting] = await Promise.all([
      this.db
        .select({
          avatarId: accountAvatars.id,
          publicId: accounts.publicId,
          displayName: accounts.displayName,
          deciderPublicId: decider.publicId,
          deciderName: decider.displayName,
        })
        .from(accountAvatars)
        // leftJoin: o innerJoin seguido de outro join na mesma tabela quebra a inferência de tipos do drizzle.
        .leftJoin(accounts, eq(accounts.id, accountAvatars.accountId))
        .leftJoin(decider, eq(decider.steamId, accountAvatars.decidedBySteamId))
        .where(inArray(accountAvatars.id, ids)),
      this.db
        .select({
          avatarId: avatarReports.avatarId,
          reporters: count(),
          firstAt: sql<Date | string>`min(${avatarReports.createdAt})`,
          lastAt: sql<Date | string>`max(${avatarReports.createdAt})`,
        })
        .from(avatarReports)
        .where(inArray(avatarReports.avatarId, ids))
        .groupBy(avatarReports.avatarId),
      this.db
        .select({
          avatarId: avatarReports.avatarId,
          reason: avatarReports.reason,
          total: count(),
        })
        .from(avatarReports)
        .where(inArray(avatarReports.avatarId, ids))
        .groupBy(avatarReports.avatarId, avatarReports.reason),
      // As fotos já removidas das Contas desta página; a própria foto não conta como "anterior".
      this.db
        .select({ id: accountAvatars.id, accountId: accountAvatars.accountId })
        .from(accountAvatars)
        .where(
          and(
            eq(accountAvatars.status, 'removed'),
            inArray(
              accountAvatars.accountId,
              avatars.map((avatar) => avatar.accountId),
            ),
          ),
        ),
      // As denúncias ainda abertas de cada foto: quantas e a mais antiga de quem tem peso normal (a do prazo).
      this.db
        .select({
          avatarId: avatarReports.avatarId,
          open: count(),
          firstNormalAt: sql<
            Date | string | null
          >`min(${avatarReports.createdAt}) filter (where not ${reporterLowWeight(sql.raw('"avatar_reports"."reporter_account_id"'), since)})`,
        })
        .from(avatarReports)
        .where(and(inArray(avatarReports.avatarId, ids), isNull(avatarReports.dismissedAt)))
        .groupBy(avatarReports.avatarId),
    ]);
    return avatars.map((avatar): StaffAvatarCase => {
      const who = people.find((row) => row.avatarId === avatar.id);
      const total = totals.find((row) => row.avatarId === avatar.id);
      const pending = waiting.find((row) => row.avatarId === avatar.id);
      const firstNormal = pending?.firstNormalAt ? asDate(pending.firstNormalAt) : null;
      return {
        kind: 'avatar',
        avatar: this.staffAvatar(avatar),
        deadlineAt: reviewDeadline('avatar', firstNormal)?.toISOString() ?? null,
        lowWeight: pending !== undefined && pending.open > 0 && firstNormal === null,
        account: { publicId: who?.publicId ?? 0, displayName: who?.displayName ?? '' },
        reports: {
          reporters: total?.reporters ?? 0,
          byReason: reasons
            .filter((row) => row.avatarId === avatar.id)
            .map((row) => ({ reason: row.reason, count: row.total }))
            .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
          // Sem denúncia (remoção direta da ficha): o envio é o que há de mais antigo.
          firstAt: (total ? asDate(total.firstAt) : avatar.createdAt).toISOString(),
          lastAt: (total ? asDate(total.lastAt) : avatar.createdAt).toISOString(),
        },
        previousRemovals: previous.filter(
          (row) => row.accountId === avatar.accountId && row.id !== avatar.id,
        ).length,
        decision:
          avatar.decision && avatar.decidedAt
            ? {
                decision: avatar.decision,
                reason: avatar.decisionReason,
                note: avatar.decisionNote ?? '',
                at: avatar.decidedAt.toISOString(),
                by: {
                  steamId: (avatar.decidedBySteamId ?? 0n).toString(),
                  publicId: who?.deciderPublicId ?? null,
                  displayName: who?.deciderName ?? null,
                },
              }
            : null,
      };
    });
  }

  private staffAvatar(avatar: AvatarRow): StaffAvatar {
    return {
      id: avatar.id,
      status: avatar.status,
      // A URL pública só vale enquanto a foto está no ar; nos outros estados, a imagem vem da rota da Staff.
      url: this.enabled && avatar.status === 'active' ? this.files.url(avatar.id) : null,
      uploadedAt: avatar.createdAt.toISOString(),
      takenDownAt: avatar.takenDownAt?.toISOString() ?? null,
    };
  }

  /* ------------------------------- decisão ------------------------------- */

  /** Decide uma foto denunciada (ou qualquer foto própria no ar ou no histórico): manter ou remover. */
  async decide(
    actor: StaffActor,
    avatarId: string,
    input: AvatarDecisionInput,
  ): Promise<StaffAvatarCase> {
    await this.apply(actor, avatarId, input, this.now());
    return this.caseOf(avatarId);
  }

  /** Remove a foto atual de uma Conta sem denúncia, direto da ficha (um clique). */
  async removeFromAccount(
    actor: StaffActor,
    publicId: number,
    input: AvatarDecisionInput,
  ): Promise<StaffAccountAvatar> {
    if (input.decision !== 'remove') {
      throw new StaffRejection('invalid_body', 'Na ficha da Conta só vale remover a foto');
    }
    const [account] = await this.db.select().from(accounts).where(eq(accounts.publicId, publicId));
    if (!account) throw new StaffRejection('account_not_found', 'Conta não encontrada');
    const [current] = await this.db
      .select()
      .from(accountAvatars)
      .where(
        and(
          eq(accountAvatars.accountId, account.id),
          inArray(accountAvatars.status, ['active', 'suspended']),
        ),
      );
    if (!current) throw new StaffRejection('no_custom_avatar', 'A Conta não tem foto própria');
    await this.apply(actor, current.id, input, this.now());
    return this.accountAvatar(publicId);
  }

  private async apply(
    actor: StaffActor,
    avatarId: string,
    input: AvatarDecisionInput,
    now: Date,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      const locked = await this.lock(tx, avatarId);
      if (!locked) throw new StaffRejection('avatar_not_found', 'Foto não encontrada');
      const { avatar, account } = locked;
      if (!REVIEWABLE.includes(avatar.status) || avatar.deletedAt !== null) {
        throw new StaffRejection('avatar_not_reviewable', 'Esta foto já não está em análise');
      }
      // A foto atual da Conta (no ar ou no estado antigo de suspensa); as outras estão só no histórico.
      const isCurrent = avatar.status === 'active' || avatar.status === 'suspended';
      const decided = {
        decision: input.decision,
        decidedAt: now,
        decidedBySteamId: BigInt(actor.steamId),
        decisionReason: input.decision === 'remove' ? (input.reason ?? 'other') : null,
        decisionNote: input.note,
      };
      let blockDays = 0;
      let blockedUntil: Date | null = null;

      if (input.decision === 'keep') {
        // Volta ao ar o que estava suspenso (estado antigo); as denúncias são arquivadas e a imagem fica imune.
        if (avatar.status === 'suspended') {
          await this.files.putBack(tx, avatar.id);
          await tx
            .update(accountAvatars)
            .set({ ...decided, status: 'active', takenDownAt: null })
            .where(eq(accountAvatars.id, avatar.id));
          await tx
            .update(accounts)
            .set({ avatarSource: 'custom', avatarUrl: this.files.url(avatar.id) })
            .where(eq(accounts.id, account.id));
        } else {
          await tx.update(accountAvatars).set(decided).where(eq(accountAvatars.id, avatar.id));
        }
        await tx
          .update(avatarReports)
          .set({ dismissedAt: now })
          .where(and(eq(avatarReports.avatarId, avatar.id), isNull(avatarReports.dismissedAt)));
      } else {
        // No ar ou no histórico: copia para o privado antes (se falhar, nada muda). Suspensa: já está no privado.
        if (avatar.status !== 'suspended') await this.files.takeDown(tx, avatar.id);
        await this.files.retain(tx, avatar.id, AVATAR_REMOVED_RETENTION_DAYS, now);
        // A Staff escolhe o bloqueio; sem ele, não bloqueia.
        blockDays = input.blockDays ?? 0;
        await tx
          .update(accountAvatars)
          .set({
            ...decided,
            status: 'removed',
            takenDownAt: avatar.takenDownAt ?? now,
            retiredAt: now,
          })
          .where(eq(accountAvatars.id, avatar.id));
        if (isCurrent) await this.backToSteam(tx, account);
        if (blockDays > 0) {
          blockedUntil = new Date(now.getTime() + blockDays * DAY_MS);
          await tx
            .update(accounts)
            .set({ avatarUploadBlockedUntil: blockedUntil })
            .where(eq(accounts.id, account.id));
        }
      }
      await recordStaffAudit(tx, {
        action: input.decision === 'keep' ? 'avatar_keep' : 'avatar_remove',
        staff: { actorSteamId: actor.steamId, reason: input.note },
        target: { accountId: account.id, steamId: account.steamId },
        details: {
          avatarId: avatar.id,
          wasStatus: avatar.status,
          ...(input.decision === 'remove' && {
            avatarReason: input.reason ?? 'other',
            blockDays,
            blockedUntil: blockedUntil?.toISOString() ?? null,
          }),
        },
        at: now,
      });
    });
    this.drain();
  }

  /* ------------------------------ a ficha ------------------------------ */

  /** A foto na ficha da Conta: a atual, o bloqueio de novos envios e as remoções anteriores. */
  async accountAvatar(publicId: number): Promise<StaffAccountAvatar> {
    const [account] = await this.db.select().from(accounts).where(eq(accounts.publicId, publicId));
    if (!account) throw new StaffRejection('account_not_found', 'Conta não encontrada');
    const [current] = await this.db
      .select()
      .from(accountAvatars)
      .where(
        and(
          eq(accountAvatars.accountId, account.id),
          inArray(accountAvatars.status, ['active', 'suspended']),
        ),
      );
    const removed = await this.db
      .select({ avatar: accountAvatars, publicId: decider.publicId, name: decider.displayName })
      .from(accountAvatars)
      .leftJoin(decider, eq(decider.steamId, accountAvatars.decidedBySteamId))
      .where(and(eq(accountAvatars.accountId, account.id), eq(accountAvatars.status, 'removed')))
      .orderBy(desc(accountAvatars.decidedAt));
    const now = this.now();
    const blockedUntil = account.avatarUploadBlockedUntil;
    return {
      source: account.avatarSource,
      current: current ? this.staffAvatar(current) : null,
      uploadBlockedUntil: blockedUntil && blockedUntil > now ? blockedUntil.toISOString() : null,
      removals: removed.map((row) => ({
        avatarId: row.avatar.id,
        at: (row.avatar.decidedAt ?? row.avatar.createdAt).toISOString(),
        reason: row.avatar.decisionReason ?? 'other',
        note: row.avatar.decisionNote ?? '',
        by: {
          steamId: (row.avatar.decidedBySteamId ?? 0n).toString(),
          publicId: row.publicId,
          displayName: row.name,
        },
      })),
    };
  }

  /** A imagem (512 px) de uma foto, no ar, suspensa ou guardada, para a Staff ver. */
  async image(avatarId: string): Promise<Buffer> {
    const [avatar] = await this.db
      .select({ status: accountAvatars.status, deletedAt: accountAvatars.deletedAt })
      .from(accountAvatars)
      .where(eq(accountAvatars.id, avatarId));
    if (
      !avatar ||
      !this.enabled ||
      avatar.deletedAt !== null ||
      ![...REVIEWABLE, 'removed'].includes(avatar.status)
    ) {
      throw new StaffRejection('avatar_not_found', 'Foto não encontrada');
    }
    const bytes = await this.files.read(avatarId);
    if (!bytes) throw new StaffRejection('avatar_not_found', 'A imagem já foi apagada');
    return bytes;
  }

  /* ------------------------------- apoio ------------------------------- */

  /**
   * Trava a Conta e depois a foto (a mesma ordem do envio, para dois pedidos juntos não travarem um
   * ao outro) e devolve as duas linhas já travadas; nulo se a foto não existe.
   */
  private async lock(
    tx: Transaction,
    avatarId: string,
  ): Promise<{ avatar: AvatarRow; account: AccountRow } | null> {
    const [peek] = await tx
      .select({ accountId: accountAvatars.accountId })
      .from(accountAvatars)
      .where(eq(accountAvatars.id, avatarId));
    if (!peek) return null;
    const [account] = await tx
      .select()
      .from(accounts)
      .where(eq(accounts.id, peek.accountId))
      .for('update');
    const [avatar] = await tx
      .select()
      .from(accountAvatars)
      .where(eq(accountAvatars.id, avatarId))
      .for('update');
    return account && avatar ? { avatar, account } : null;
  }

  /** O avatar efetivo volta a ser o da Steam (a foto saiu do ar). */
  private async backToSteam(tx: Transaction, account: AccountRow): Promise<void> {
    await tx
      .update(accounts)
      .set({ avatarSource: 'steam', avatarUrl: account.steamAvatarUrl })
      .where(eq(accounts.id, account.id));
  }

  /** Esvazia a fila de remoção de arquivos já, para a foto sair do cache da CDN na hora (o job faria em até 30 s). */
  private drain(): void {
    this.deletions.drain().catch((error: unknown) => {
      this.logger.warn(`A fila de remoção de fotos falhou: ${(error as Error).message}`);
    });
  }
}

/**
 * O cursor leva o grupo da fila, o instante com microssegundos (como o banco o guarda: um `Date` os perderia e
 * repetiria o último caso) e o ID.
 */
function encodeCursor(group: number, key: string, id: string): string {
  return Buffer.from(`${group}|${key}|${id}`).toString('base64url');
}

function decodeCursor(cursor: string): { group: number; key: string; id: string } {
  const [group = '', key = '', id = ''] = Buffer.from(cursor, 'base64url').toString().split('|');
  if (
    !/^[01]$/.test(group) ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(key) ||
    !/^[0-9a-f-]{36}$/.test(id)
  ) {
    throw new InvalidAvatarCursor('cursor inválido');
  }
  return { group: Number(group), key, id };
}
