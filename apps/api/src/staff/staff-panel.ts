import {
  type AccountAnonymized,
  type ApplySanctions,
  isPermanentMeasure,
  REPORT_REASONS_NEEDING_EVIDENCE,
  type RemoveRankingEntry,
  type ReportStatus,
  type RevokeSanction,
  type SetStaffRole,
  STAFF_ROLE_RANK,
  STAFF_SEARCH_LIMIT,
  STAFF_SEARCH_MIN_LENGTH,
  type StaffAccountDetail,
  type StaffAccountSearch,
  type StaffAccountSummary,
  type StaffAuditPage,
  type StaffMember,
  type StaffReportPage,
  type StaffServer,
  type StaffVipGrant,
  staffCan,
  type UpdateStaffServer,
} from '@carmine/contracts';
import { Logger } from '@nestjs/common';
import { and, desc, eq, gt, ilike, or, type SQL, sql } from 'drizzle-orm';
import {
  AccountAlreadyAnonymized,
  type AccountErasure,
  AccountIsStaff,
} from '../accounts/account-erasure.js';
import type { Account, AccountsService } from '../accounts/accounts.service.js';
import type { DisplayNames } from '../accounts/display-names.js';
import type { SessionStore } from '../auth/sessions.js';
import type { Database } from '../database/database.js';
import { accounts } from '../database/schema.js';
import {
  type GameServer,
  type GameServerRegistry,
  hostnameOf,
  ServerCodeTaken,
} from '../game-servers/game-server-registry.js';
import { SanctionNotActive, type Sanctions } from '../moderation/sanctions.js';
import {
  InvalidReportCursor,
  ReportNotFound,
  ReportNotOpen,
  ReportTargetMismatch,
  type StaffReports,
} from '../reports/staff-reports.js';
import {
  RankingEntryAlreadyRemoved,
  RankingEntryNotFound,
  type RankingRemovals,
} from '../stats/ranking-removals.js';
import { NoVipToRevoke, type VipPeriods } from '../vip/vip-periods.js';
import { toVipStatus } from '../vip/vip-status.js';
import {
  InvalidAuditCursor,
  type StaffAction,
  type StaffAuditFilter,
  type StaffAuditLog,
} from './audit-log.js';
import type { StaffActor } from './staff.guard.js';
import { StaffRejection } from './staff-errors.js';
import { AccountNotClaimed, LastOwner, type StaffRoles } from './staff-roles.js';

/** Ações da Staff sobre uma Conta que aparecem no detalhe dela. */
const DETAIL_AUDIT_ENTRIES = 20;

/** Uma busca maior que isso não é um nome nem um ID: só custaria um `ilike` caro. */
const STAFF_SEARCH_MAX_LENGTH = 100;

/** Motivo da revogação automática do VIP no ban permanente por cheat. */
const CHEAT_VIP_REASON = 'Ban permanente por cheat: VIP encerrado sem reembolso';

export interface StaffPanelDeps {
  db: Database;
  accounts: AccountsService;
  displayNames: DisplayNames;
  sanctions: Sanctions;
  roles: StaffRoles;
  audit: StaffAuditLog;
  vip: VipPeriods;
  sessions: SessionStore;
  servers: GameServerRegistry;
  reports: StaffReports;
  erasure: AccountErasure;
  rankingRemovals: RankingRemovals;
  /** Tira do cache o `equipped/v5` da Conta (mudou o VIP). */
  invalidateEquipped: (steamId: string) => Promise<void>;
}

/**
 * O painel da Staff (S07): cada operação já checa as regras de quem pode o quê além da permissão
 * da rota (não punir a si mesmo nem papel igual ou maior, permanente só com permissão, revogar só
 * o próprio sem `sanctions.revokeAny`), registra no log de auditoria e devolve o que o web mostra.
 * Recusas saem como {@link StaffRejection}, com o código do contrato.
 */
export class StaffPanel {
  private readonly logger = new Logger(StaffPanel.name);

  constructor(private readonly deps: StaffPanelDeps) {}

  /**
   * Busca por ID público (`10016` ou `#10016`), SteamID64 (ou link do perfil Steam) ou parte do
   * Nome de exibição ou do nome Steam.
   */
  async search(query: string): Promise<StaffAccountSearch> {
    const q = query.trim().slice(0, STAFF_SEARCH_MAX_LENGTH);
    if (q.length < STAFF_SEARCH_MIN_LENGTH) return { accounts: [] };
    const conditions: SQL[] = [];
    const steamId = /(?:^|\/profiles\/)(7656\d{13})(?:\/|$)/.exec(q)?.[1];
    if (steamId) conditions.push(eq(accounts.steamId, BigInt(steamId)));
    const publicId = /^#?([1-9]\d{0,14})$/.exec(q)?.[1];
    if (publicId) conditions.push(eq(accounts.publicId, Number(publicId)));
    const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    conditions.push(ilike(accounts.displayName, pattern), ilike(accounts.steamName, pattern));
    const rows = await this.deps.db
      .select()
      .from(accounts)
      // Conta anonimizada sem ban valendo já não tem SteamID64 (é negativo): fora da busca.
      .where(and(gt(accounts.steamId, 0n), or(...conditions)))
      .orderBy(sql`${accounts.lastConnectedAt} desc nulls last`, desc(accounts.createdAt))
      .limit(STAFF_SEARCH_LIMIT);
    const found = rows.map((row) => ({ ...row, steamId: row.steamId.toString() }));
    return { accounts: await this.summaries(found) };
  }

  async detail(publicId: number, now = new Date()): Promise<StaffAccountDetail> {
    return this.detailOf(await this.account(publicId), now);
  }

  async applySanctions(
    actor: StaffActor,
    publicId: number,
    input: ApplySanctions,
    now = new Date(),
  ): Promise<StaffAccountDetail> {
    const target = await this.account(publicId);
    await this.assertCanPunish(actor, target);
    if (target.anonymizedAt !== null) {
      throw new StaffRejection('account_anonymized', 'A Conta foi anonimizada');
    }
    if (
      input.measures.some(isPermanentMeasure) &&
      !staffCan(actor.role, 'sanctions.applyPermanent')
    ) {
      throw new StaffRejection('permanent_not_allowed', 'Seu papel não aplica Punição permanente');
    }
    if (input.reportId !== undefined) {
      const reason = await this.openReport(input.reportId, target.id);
      // Sem demo, a Denúncia de cheat ou de voz sozinha não basta: precisa de evidência adicional.
      if (
        REPORT_REASONS_NEEDING_EVIDENCE.includes(reason) &&
        input.witness === undefined &&
        input.evidenceUrl === undefined
      ) {
        throw new StaffRejection(
          'report_needs_evidence',
          'Denúncia de cheat ou voz só gera Punição com evidência adicional: informe a testemunha ou o link',
        );
      }
    }
    const suggestion = (await this.deps.sanctions.suggestionsFor(target.id, now)).find(
      (s) => s.category === input.category,
    );
    const staff = staffAction(actor, input.reason);
    const applied = await this.deps.sanctions.apply(
      target.id,
      staff,
      {
        category: input.category,
        measures: input.measures,
        ...(input.witness !== undefined && { witness: input.witness }),
        ...(input.evidenceUrl !== undefined && { evidenceUrl: input.evidenceUrl }),
        ...(input.reportId !== undefined && { reportId: input.reportId }),
      },
      now,
      suggestion?.measures,
    );
    if (applied.banned) await this.dropSessions(target);
    if (applied.permanentCheatBan)
      await this.endVip(target, { ...staff, reason: CHEAT_VIP_REASON }, now);
    return this.detailOf(target, now);
  }

  async revokeSanction(
    actor: StaffActor,
    sanctionId: string,
    input: RevokeSanction,
    now = new Date(),
  ): Promise<StaffAccountDetail> {
    const sanction = await this.deps.sanctions.find(sanctionId);
    if (!sanction) throw new StaffRejection('sanction_not_found', 'Punição não encontrada');
    if (
      sanction.appliedBySteamId !== actor.steamId &&
      !staffCan(actor.role, 'sanctions.revokeAny')
    ) {
      throw new StaffRejection('revoke_not_allowed', 'Seu papel só revoga as Punições que aplicou');
    }
    try {
      await this.deps.sanctions.revoke(
        sanctionId,
        staffAction(actor, input.reason),
        { appealAccepted: input.appealAccepted },
        now,
      );
    } catch (error) {
      if (error instanceof SanctionNotActive) {
        throw new StaffRejection('sanction_not_active', error.message);
      }
      throw error;
    }
    const target = await this.deps.accounts.findById(sanction.accountId);
    if (!target) throw new StaffRejection('account_not_found', 'Conta não encontrada');
    return this.detailOf(target, now);
  }

  async grantVip(
    actor: StaffActor,
    publicId: number,
    input: StaffVipGrant,
    now = new Date(),
  ): Promise<StaffAccountDetail> {
    const target = await this.account(publicId);
    await this.deps.vip.grant(target.id, input.days, now, staffAction(actor, input.reason));
    await this.deps.invalidateEquipped(target.steamId);
    return this.detailOf(target, now);
  }

  async revokeVip(
    actor: StaffActor,
    publicId: number,
    reason: string,
    now = new Date(),
  ): Promise<StaffAccountDetail> {
    const target = await this.account(publicId);
    try {
      await this.deps.vip.revoke(target.id, staffAction(actor, reason), now);
    } catch (error) {
      if (error instanceof NoVipToRevoke) {
        throw new StaffRejection('no_vip_to_revoke', 'A Conta não tem VIP ativo');
      }
      throw error;
    }
    await this.deps.invalidateEquipped(target.steamId);
    return this.detailOf(target, now);
  }

  async resetDisplayName(
    actor: StaffActor,
    publicId: number,
    reason: string,
    now = new Date(),
  ): Promise<StaffAccountDetail> {
    const target = await this.account(publicId);
    const updated = await this.deps.displayNames.reset(target.id, staffAction(actor, reason), now);
    return this.detailOf(updated, now);
  }

  /** Tira a Conta do Ranking de um Modo e semana (S12); as Estatísticas continuam. */
  async removeFromRanking(
    actor: StaffActor,
    publicId: number,
    input: RemoveRankingEntry,
    now = new Date(),
  ): Promise<StaffAccountDetail> {
    const target = await this.account(publicId);
    try {
      await this.deps.rankingRemovals.remove(
        { accountId: target.id, steamId: target.steamId },
        input.mode,
        input.weekStart,
        staffAction(actor, input.reason),
        now,
      );
    } catch (error) {
      if (error instanceof RankingEntryNotFound) {
        throw new StaffRejection('ranking_entry_not_found', error.message);
      }
      if (error instanceof RankingEntryAlreadyRemoved) {
        throw new StaffRejection('ranking_entry_already_removed', error.message);
      }
      throw error;
    }
    return this.detailOf(target, now);
  }

  /** A fila de Denúncias (S13), com o contexto de cada uma. */
  async reports(
    status: ReportStatus,
    options: { before?: string; limit?: number },
  ): Promise<StaffReportPage> {
    try {
      return await this.deps.reports.page(status, options);
    } catch (error) {
      if (error instanceof InvalidReportCursor) {
        throw new StaffRejection('invalid_body', 'before: cursor inválido');
      }
      throw error;
    }
  }

  /** Arquiva a Denúncia aberta, com motivo; fica no log de auditoria. */
  async archiveReport(
    actor: StaffActor,
    reportId: string,
    reason: string,
    now = new Date(),
  ): Promise<void> {
    try {
      await this.deps.reports.archive(reportId, staffAction(actor, reason), now);
    } catch (error) {
      throw reportRejection(error);
    }
  }

  async setRole(
    actor: StaffActor,
    publicId: number,
    input: SetStaffRole,
    now = new Date(),
  ): Promise<StaffAccountDetail> {
    const target = await this.account(publicId);
    try {
      await this.deps.roles.set(target.id, input.role, staffAction(actor, input.reason), now);
    } catch (error) {
      if (error instanceof AccountNotClaimed) {
        throw new StaffRejection('account_not_claimed', error.message);
      }
      if (error instanceof LastOwner) throw new StaffRejection('last_owner', error.message);
      throw error;
    }
    return this.detailOf(target, now);
  }

  /**
   * Executa um pedido de exclusão de dados (S08): anonimiza a Conta, sem volta. A Conta da Staff
   * sai da Staff antes; repetir é recusado.
   */
  async anonymize(
    actor: StaffActor,
    publicId: number,
    reason: string,
    now = new Date(),
  ): Promise<AccountAnonymized> {
    const target = await this.account(publicId);
    try {
      const erasure = await this.deps.erasure.anonymize(target.id, staffAction(actor, reason), now);
      if (!erasure.sessionsDropped) {
        this.logger.warn(`Sessões de #${publicId} não caíram na anonimização; expiram sozinhas`);
      }
      return {
        publicId: erasure.publicId,
        anonymizedAt: erasure.anonymizedAt.toISOString(),
        steamIdRetained: erasure.steamIdRetained,
      };
    } catch (error) {
      if (error instanceof AccountAlreadyAnonymized) {
        throw new StaffRejection('account_anonymized', 'A Conta já foi anonimizada');
      }
      if (error instanceof AccountIsStaff) {
        throw new StaffRejection('target_protected', error.message);
      }
      throw error;
    }
  }

  members(): Promise<StaffMember[]> {
    return this.deps.roles.members();
  }

  async servers(): Promise<StaffServer[]> {
    return (await this.deps.servers.list()).map(toStaffServer);
  }

  async updateServer(
    actor: StaffActor,
    serverId: string,
    input: UpdateStaffServer,
    now = new Date(),
  ): Promise<StaffServer> {
    try {
      const server = await this.deps.servers.updateShowcase(
        serverId,
        { showcaseName: input.showcaseName, code: input.code },
        staffAction(actor, input.reason),
        now,
      );
      if (!server) throw new StaffRejection('server_not_found', 'Servidor não encontrado');
      return toStaffServer(server);
    } catch (error) {
      if (error instanceof ServerCodeTaken) {
        throw new StaffRejection('server_code_taken', error.message);
      }
      throw error;
    }
  }

  async auditPage(filter: StaffAuditFilter): Promise<StaffAuditPage> {
    try {
      return await this.deps.audit.page(filter);
    } catch (error) {
      if (error instanceof InvalidAuditCursor) {
        throw new StaffRejection('invalid_body', 'before: cursor inválido');
      }
      throw error;
    }
  }

  private async openReport(reportId: string, targetAccountId: string) {
    try {
      return await this.deps.reports.openReasonFor(reportId, targetAccountId);
    } catch (error) {
      throw reportRejection(error);
    }
  }

  private async account(publicId: number): Promise<Account> {
    const account = await this.deps.accounts.findByPublicId(publicId);
    // Anonimizada e já sem o SteamID64 (sem ban valendo): não há mais o que ver nem fazer.
    if (!account || BigInt(account.steamId) < 0n) {
      throw new StaffRejection('account_not_found', 'Conta não encontrada');
    }
    return account;
  }

  /** Ninguém se pune; só o Dono pune quem tem papel igual ou maior que o seu. */
  private async assertCanPunish(actor: StaffActor, target: Account): Promise<void> {
    if (target.id === actor.accountId) {
      throw new StaffRejection('target_protected', 'Você não pode punir a própria Conta');
    }
    const targetRole = await this.deps.roles.roleOf(target.id);
    if (
      targetRole !== null &&
      actor.role !== 'owner' &&
      STAFF_ROLE_RANK[targetRole] >= STAFF_ROLE_RANK[actor.role]
    ) {
      throw new StaffRejection(
        'target_protected',
        'Só o Dono pune alguém da Staff com papel igual ou maior',
      );
    }
  }

  /** O ban derruba as sessões do site; com o Valkey fora, o guard ainda barra as mutações. */
  private async dropSessions(target: Account): Promise<void> {
    try {
      await this.deps.sessions.destroyAllOf(target.id);
    } catch (error) {
      this.logger.warn(
        `Sessões de ${target.steamId} não caíram (o ban barra as mutações mesmo assim): ${(error as Error).message}`,
      );
    }
  }

  private async endVip(target: Account, staff: StaffAction, now: Date): Promise<void> {
    try {
      await this.deps.vip.revoke(target.id, staff, now);
      await this.deps.invalidateEquipped(target.steamId);
    } catch (error) {
      if (!(error instanceof NoVipToRevoke)) throw error;
    }
  }

  private async detailOf(account: Account, now: Date): Promise<StaffAccountDetail> {
    const [[summary], vip, sanctions, suggestions, audit] = await Promise.all([
      this.summaries([account], now),
      this.deps.vip.statusOf(account.id, now),
      this.deps.sanctions.historyOf(account.id, now),
      this.deps.sanctions.suggestionsFor(account.id, now),
      this.deps.audit.page({ targetAccountId: account.id, limit: DETAIL_AUDIT_ENTRIES }),
    ]);
    if (!summary) throw new Error('resumo da Conta ausente');
    return {
      account: summary,
      vip: toVipStatus(vip),
      sanctions,
      suggestions,
      audit: audit.entries,
    };
  }

  private async summaries(list: Account[], now = new Date()): Promise<StaffAccountSummary[]> {
    const ids = list.map((a) => a.id);
    const [roles, active] = await Promise.all([
      this.deps.roles.rolesOf(ids),
      this.deps.sanctions.activeTypesOf(ids, now),
    ]);
    return list.map((a) => ({
      publicId: a.publicId,
      steamId: a.steamId,
      displayName: a.displayName,
      steamName: a.steamName,
      avatarUrl: a.avatarUrl,
      claimed: a.claimedAt !== null,
      staffRole: roles.get(a.id) ?? null,
      activeSanctions: active.get(a.id) ?? [],
      lastConnectedAt: a.lastConnectedAt?.toISOString() ?? null,
      anonymized: a.anonymizedAt !== null,
    }));
  }
}

/** Os erros da fila de Denúncias como recusas do painel; o resto sobe. */
function reportRejection(error: unknown): unknown {
  if (error instanceof ReportNotFound) return new StaffRejection('report_not_found', error.message);
  if (error instanceof ReportNotOpen) return new StaffRejection('report_not_open', error.message);
  if (error instanceof ReportTargetMismatch) {
    return new StaffRejection('report_target_mismatch', error.message);
  }
  return error;
}

function staffAction(actor: StaffActor, reason: string): StaffAction {
  return { actorSteamId: actor.steamId, reason: reason.trim() };
}

function toStaffServer(server: GameServer): StaffServer {
  return {
    id: server.id,
    name: server.name,
    mode: server.mode,
    address: server.address,
    showcaseName: server.showcaseName,
    code: server.code,
    hostname: hostnameOf(server),
  };
}
