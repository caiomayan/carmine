import { Logger } from '@nestjs/common';
import { and, gt, inArray } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { staffMembers, vipPeriods } from '../database/schema.js';
import { type PeriodRow, planStatusOfPeriods } from '../plans/plan-periods.js';
import type { DiscordClient } from './discord-client.js';
import type { DiscordLink, DiscordLinks } from './discord-links.js';
import {
  type DiscordRoleKey,
  desiredRoleKeys,
  planRoles,
  type RoleFacts,
} from './discord-roles.js';

export interface DiscordRoleSyncOptions {
  /** Cargo → ID no servidor; só os configurados são gerenciados. */
  roleIds: Partial<Record<DiscordRoleKey, string>>;
  /** Depois desse tempo uma Conta é conferida no Discord mesmo sem mudança (cargo tirado à mão). */
  recheckMs?: number;
  /** A pessoa não está no servidor: só tenta de novo depois disso (ela pode voltar). */
  absentRetryMs?: number;
  /** O Discord falhou para a Conta: não insiste antes disso. */
  failureRetryMs?: number;
  now?: () => Date;
}

export type SyncOutcome = 'synced' | 'absent' | 'failed';

/** Falhas seguidas que encerram a passada (o Discord está fora ou a gente está limitada). */
const MAX_FAILURES_PER_PASS = 3;

const REASON = 'Carmine: cargos sincronizados com a Conta';

/**
 * Reconcilia os cargos do Discord com o estado desejado das Contas vinculadas (S15). Não há evento
 * para o VIP que vence, então um job compara periodicamente o que cada Conta deve ter (VIP ativo,
 * papel de Staff) com o que a última passada deixou aplicado e só fala com o Discord quando há
 * diferença (ou, de tempos em tempos, para pegar um cargo mexido à mão). A conferência lê os cargos
 * reais da pessoa e mexe só nos cargos gerenciados, então repetir é inofensivo.
 */
export class DiscordRoleSync {
  private readonly logger = new Logger(DiscordRoleSync.name);
  private readonly recheckMs: number;
  private readonly absentRetryMs: number;
  private readonly failureRetryMs: number;
  private readonly now: () => Date;
  private running = false;

  constructor(
    private readonly db: Database,
    private readonly links: DiscordLinks,
    private readonly client: DiscordClient,
    private readonly options: DiscordRoleSyncOptions,
  ) {
    this.recheckMs = options.recheckMs ?? 6 * 60 * 60_000;
    this.absentRetryMs = options.absentRetryMs ?? 30 * 60_000;
    this.failureRetryMs = options.failureRetryMs ?? 10_000;
    this.now = options.now ?? (() => new Date());
  }

  /** Uma passada em todas as Contas vinculadas; nunca rejeita e nunca roda duas ao mesmo tempo. */
  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const now = this.now();
      const links = await this.links.all();
      const facts = await this.factsOf(
        links.map((link) => link.accountId),
        now,
      );
      let failures = 0;
      for (const link of links) {
        if (link.retryAt !== null && link.retryAt > now) continue;
        const desired = this.effective(desiredRoleKeys(facts.get(link.accountId) ?? NO_FACTS));
        if (!this.isDue(link, desired, now)) continue;
        // Discord fora do ar: não insiste com todo mundo; a próxima passada tenta de novo.
        if (
          (await this.apply(link, desired, now)) === 'failed' &&
          ++failures >= MAX_FAILURES_PER_PASS
        ) {
          this.logger.warn(
            'Discord falhando: a passada dos cargos parou e recomeça no próximo ciclo',
          );
          break;
        }
      }
    } catch (error) {
      this.logger.warn(`Passada dos cargos do Discord falhou: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Reconcilia já os cargos de uma Conta (ao vincular). Com o token do vínculo, põe a pessoa no
   * servidor antes se ela ainda não estiver (`guilds.join`).
   */
  async reconcile(accountId: string, accessToken?: string): Promise<SyncOutcome | null> {
    const link = await this.links.of(accountId);
    if (!link) return null;
    const now = this.now();
    const facts = await this.factsOf([accountId], now);
    return this.apply(
      link,
      this.effective(desiredRoleKeys(facts.get(accountId) ?? NO_FACTS)),
      now,
      accessToken,
    );
  }

  /**
   * Desvincula: tira os cargos gerenciados no Discord e só então apaga o vínculo. Se o Discord
   * falhar, o vínculo fica e o erro sobe, para a pessoa tentar de novo (nunca sobram cargos de quem
   * já não está ligado). Devolve falso se a Conta não estava vinculada.
   */
  async unlink(accountId: string): Promise<boolean> {
    const link = await this.links.of(accountId);
    if (!link) return false;
    await this.strip(link.discordId);
    await this.links.remove(accountId);
    return true;
  }

  /** Tira de um usuário do Discord todos os cargos gerenciados; sem erro se ele não está no servidor. */
  async strip(discordId: string): Promise<void> {
    const actual = await this.client.memberRoles(discordId);
    if (actual === null) return;
    const { remove } = planRoles(this.options.roleIds, [], new Set(actual));
    for (const roleId of remove) {
      await this.client.removeRole(discordId, roleId, REASON);
    }
  }

  /** As chaves cujo cargo tem ID configurado: o que de fato dá para aplicar. */
  private effective(keys: DiscordRoleKey[]): DiscordRoleKey[] {
    return keys.filter((key) => this.options.roleIds[key] !== undefined);
  }

  private isDue(link: DiscordLink, desired: DiscordRoleKey[], now: Date): boolean {
    if (link.syncedAt === null) return true;
    if (now.getTime() - link.syncedAt.getTime() >= this.recheckMs) return true;
    return !sameKeys(link.syncedRoles, desired);
  }

  private async apply(
    link: DiscordLink,
    desired: DiscordRoleKey[],
    now: Date,
    accessToken?: string,
  ): Promise<SyncOutcome> {
    const absent = () =>
      this.links.retryAfter(link.accountId, new Date(now.getTime() + this.absentRetryMs));
    try {
      let actual = await this.client.memberRoles(link.discordId);
      if (actual === null && accessToken !== undefined) {
        await this.client.joinGuild(link.discordId, accessToken);
        actual = (await this.client.memberRoles(link.discordId)) ?? [];
      }
      if (actual === null) {
        await absent();
        return 'absent';
      }
      const { add, remove } = planRoles(this.options.roleIds, desired, new Set(actual));
      for (const roleId of add) {
        if (!(await this.client.addRole(link.discordId, roleId, REASON))) {
          await absent();
          return 'absent';
        }
      }
      for (const roleId of remove) {
        if (!(await this.client.removeRole(link.discordId, roleId, REASON))) {
          await absent();
          return 'absent';
        }
      }
      await this.links.markSynced(link.accountId, desired, this.now());
      return 'synced';
    } catch (error) {
      this.logger.warn(
        `Cargos da Conta ${link.accountId} não sincronizaram: ${(error as Error).message}`,
      );
      await this.links
        .retryAfter(link.accountId, new Date(now.getTime() + this.failureRetryMs))
        .catch(() => undefined);
      return 'failed';
    }
  }

  private async factsOf(accountIds: string[], now: Date): Promise<Map<string, RoleFacts>> {
    const facts = new Map<string, RoleFacts>();
    if (accountIds.length === 0) return facts;
    const [staff, periods] = await Promise.all([
      this.db
        .select({ accountId: staffMembers.accountId, role: staffMembers.role })
        .from(staffMembers)
        .where(inArray(staffMembers.accountId, accountIds)),
      this.db
        .select({
          accountId: vipPeriods.accountId,
          startsAt: vipPeriods.startsAt,
          endsAt: vipPeriods.endsAt,
          plan: vipPeriods.plan,
          test: vipPeriods.test,
        })
        .from(vipPeriods)
        .where(and(inArray(vipPeriods.accountId, accountIds), gt(vipPeriods.endsAt, now))),
    ]);
    const roles = new Map(staff.map((row) => [row.accountId, row.role]));
    const byAccount = new Map<string, PeriodRow[]>();
    for (const { accountId, ...period } of periods) {
      byAccount.set(accountId, [...(byAccount.get(accountId) ?? []), period]);
    }
    for (const accountId of accountIds) {
      facts.set(accountId, {
        plan: planStatusOfPeriods(byAccount.get(accountId) ?? [], now).plan,
        staffRole: roles.get(accountId) ?? null,
      });
    }
    return facts;
  }
}

const NO_FACTS: RoleFacts = { plan: null, staffRole: null };

function sameKeys(stored: readonly string[], desired: readonly string[]): boolean {
  return stored.length === desired.length && desired.every((key) => stored.includes(key));
}
