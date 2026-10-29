import { ANONYMIZED_DISPLAY_NAME } from '@carmine/contracts';
import { and, eq, ne, sql } from 'drizzle-orm';
import { eraseAvatarsOf } from '../avatars/avatar-erasure.js';
import type { Database } from '../database/database.js';
import {
  accountStatsDaily,
  accountStatsWeekly,
  accounts,
  accountWeaponStats,
  chatMessages,
  discordLinks,
  inventoryItems,
  mapPlayPlayers,
  playSessions,
  presets,
  reports,
  roundEvents,
  roundPlayerSummaries,
  sanctions,
  staffMembers,
  vipHeldItems,
  vipPeriods,
} from '../database/schema.js';
import { recordStaffAudit, type StaffAction } from '../staff/audit-log.js';
import { activeBanAt, detachedSteamId } from './accounts.service.js';

/** A Conta já foi anonimizada: não há o que repetir. */
export class AccountAlreadyAnonymized extends Error {
  constructor() {
    super('a Conta já foi anonimizada');
  }
}

/** Conta da Staff: tire o papel antes (o log da Staff precisa saber quem ela era). */
export class AccountIsStaff extends Error {
  constructor() {
    super('a Conta é da Staff: tire o papel antes de anonimizar');
  }
}

export interface ErasureDeps {
  /** Encerra as sessões do site da Conta. */
  dropSessions: (accountId: string) => Promise<unknown>;
  /** Tira do cache o `equipped/v5` do SteamID64. */
  invalidateEquipped: (steamId: string) => Promise<void>;
  /** Tira os cargos do Discord de quem estava vinculado (S15); ausente: o Discord está desligado. */
  removeDiscordRoles?: (discordId: string) => Promise<void>;
  /**
   * Apaga a pessoa e os eventos dela no PostHog (A1, ADR 0021); ausente ou `off`: a análise está desligada. `pending`:
   * não deu agora (sem a chave de gestão ou o PostHog fora) e o Dono apaga à mão (`docs/operacao/exclusao-de-dados.md`).
   */
  erasePerson?: (accountId: string) => Promise<AnalyticsErasure>;
}

export type AnalyticsErasure = 'removed' | 'absent' | 'pending' | 'off';

export interface Erasure {
  publicId: number;
  anonymizedAt: Date;
  /** Havia um ban valendo: o SteamID64 fica na Conta até ele acabar. */
  steamIdRetained: boolean;
  /** As sessões do site caíram (com o Valkey fora, não; elas expiram sozinhas). */
  sessionsDropped: boolean;
  /** O que houve com a pessoa no PostHog; `pending` pede o passo manual. */
  analytics: AnalyticsErasure;
}

/**
 * Pedido de exclusão de dados (S08, Política de Privacidade, seção 8): anonimiza a Conta, sem
 * volta. Some o que identifica a pessoa (nome Steam, Nome de exibição, avatar, Perfil público,
 * reivindicação), as Estatísticas e o que ela montou (Inventário, Presets, Loadout, Períodos VIP,
 * preferência de chat), o chat que ela escreveu (`chat_messages`), o vínculo dela com as
 * Denúncias que fez (S13) e as linhas dela dentro do chat copiado em Denúncias de outras pessoas;
 * o vínculo com a Steam se desfaz (`steamId = -publicId`), então quem voltar a jogar ganha
 * uma Conta nova. Fica o necessário por obrigação legal ou para a moderação valer: as Punições e
 * o log de auditoria (registro interno, com o SteamID64 no log) e, com um ban valendo, o SteamID64
 * na Conta, até o ban acabar (`keepUnlessReleased`). As Denúncias contra ela também ficam, com
 * o chat copiado, até o prazo de 90 dias (registro de moderação, como as Punições). Os registros de pagamento da S14 terão
 * tabela própria e ficam pelo prazo legal.
 */
export class AccountErasure {
  constructor(
    private readonly db: Database,
    private readonly deps: ErasureDeps,
  ) {}

  async anonymize(accountId: string, staff: StaffAction, now = new Date()): Promise<Erasure> {
    const { steamId, publicId, steamIdRetained, discordId } = await this.db.transaction(
      async (tx) => {
        const [account] = await tx
          .select()
          .from(accounts)
          .where(eq(accounts.id, accountId))
          .for('update');
        if (!account) throw new Error(`Conta ${accountId} não existe`);
        if (account.anonymizedAt !== null) throw new AccountAlreadyAnonymized();
        const [member] = await tx
          .select({ role: staffMembers.role })
          .from(staffMembers)
          .where(eq(staffMembers.accountId, accountId));
        if (member) throw new AccountIsStaff();

        const [ban] = await tx
          .select({ id: sanctions.id })
          .from(sanctions)
          .where(and(eq(sanctions.accountId, accountId), activeBanAt(now)))
          .limit(1);
        const retained = ban !== undefined;

        // Os slots do Loadout caem junto (cascade) com os Presets e os Itens.
        const removedPresets = await tx
          .delete(presets)
          .where(eq(presets.accountId, accountId))
          .returning({ id: presets.id });
        const removedItems = await tx
          .delete(inventoryItems)
          .where(eq(inventoryItems.accountId, accountId))
          .returning({ id: inventoryItems.id });
        // O vínculo com o Discord é dado pessoal (S15): some junto; os cargos saem logo depois.
        const [unlinkedDiscord] = await tx
          .delete(discordLinks)
          .where(eq(discordLinks.accountId, accountId))
          .returning({ discordId: discordLinks.discordId });
        // Foto de perfil própria (ADR 0022): os arquivos saem pela fila de remoção, na mesma transação.
        const removedAvatars = await eraseAvatarsOf(tx, accountId);
        const removedVip = await tx
          .delete(vipPeriods)
          .where(eq(vipPeriods.accountId, accountId))
          .returning({ id: vipPeriods.id });
        const removedStats = await tx
          .delete(accountStatsWeekly)
          .where(eq(accountStatsWeekly.accountId, accountId))
          .returning({ weekStart: accountStatsWeekly.weekStart });
        // S12b: o detalhe das Estatísticas (a linha da Conta não é apagada, então o cascade não age).
        const removedDaily = await tx
          .delete(accountStatsDaily)
          .where(eq(accountStatsDaily.accountId, accountId))
          .returning({ day: accountStatsDaily.day });
        const removedWeapons = await tx
          .delete(accountWeaponStats)
          .where(eq(accountWeaponStats.accountId, accountId))
          .returning({ weapon: accountWeaponStats.weapon });
        const removedSessions = await tx
          .delete(playSessions)
          .where(eq(playSessions.accountId, accountId))
          .returning({ id: playSessions.id });
        // S17 (ADR 0024): o resumo dos rounds e do mapa some; nos eventos brutos a Conta vira nula (anonimizada)
        // e o resto do round, que é dos outros jogadores também, fica.
        await tx.delete(roundPlayerSummaries).where(eq(roundPlayerSummaries.accountId, accountId));
        await tx.delete(mapPlayPlayers).where(eq(mapPlayPlayers.accountId, accountId));
        await tx
          .update(roundEvents)
          .set({ actorAccountId: null })
          .where(eq(roundEvents.actorAccountId, accountId));
        await tx
          .update(roundEvents)
          .set({ targetAccountId: null })
          .where(eq(roundEvents.targetAccountId, accountId));
        await tx
          .update(roundEvents)
          .set({ assistAccountId: null })
          .where(eq(roundEvents.assistAccountId, accountId));
        const removedHeld = await tx
          .delete(vipHeldItems)
          .where(eq(vipHeldItems.accountId, accountId))
          .returning({ id: vipHeldItems.id });
        const removedChat = await tx
          .delete(chatMessages)
          .where(eq(chatMessages.accountId, accountId))
          .returning({ id: chatMessages.id });
        const unlinkedReports = await tx
          .update(reports)
          .set({ reporterAccountId: null })
          .where(eq(reports.reporterAccountId, accountId))
          .returning({ id: reports.id });
        // As linhas da pessoa no chat copiado em Denúncias de outros: nome e texto saem, o resto fica.
        const scrubbedReports = await tx
          .update(reports)
          .set({
            chatContext: sql`(
            select coalesce(jsonb_agg(
              case when (line->>'publicId')::bigint = ${account.publicId}
                then line || jsonb_build_object('displayName', ${ANONYMIZED_DISPLAY_NAME}::text, 'text', '[removido]')
                else line end
              order by position), '[]'::jsonb)
            from jsonb_array_elements(${reports.chatContext}) with ordinality as lines(line, position)
          )`,
          })
          .where(
            and(
              ne(reports.targetAccountId, accountId),
              sql`${reports.chatContext} @> jsonb_build_array(jsonb_build_object('publicId', ${account.publicId}::bigint))`,
            ),
          )
          .returning({ id: reports.id });
        await tx
          .update(accounts)
          .set({
            steamId: retained ? account.steamId : detachedSteamId(account.publicId),
            steamName: '',
            displayName: ANONYMIZED_DISPLAY_NAME,
            displayNameBlockedSteamName: null,
            customDisplayName: null,
            displayNameChangedAt: null,
            profilePrivate: false,
            avatarUrl: null,
            avatarFetchedAt: null,
            steamAvatarUrl: null,
            avatarSource: 'steam',
            avatarUploadBlockedUntil: null,
            claimedAt: null,
            chatHidden: false,
            anonymizedAt: now,
          })
          .where(eq(accounts.id, accountId));
        await recordStaffAudit(tx, {
          action: 'account_anonymize',
          staff,
          target: { accountId, steamId: account.steamId },
          details: {
            steamIdRetained: retained,
            removed: {
              inventoryItems: removedItems.length,
              presets: removedPresets.length,
              vipPeriods: removedVip.length,
              statsWeeks: removedStats.length,
              statsDays: removedDaily.length,
              weaponStats: removedWeapons.length,
              playSessions: removedSessions.length,
              vipHeldItems: removedHeld.length,
              chatMessages: removedChat.length,
              reportsUnlinked: unlinkedReports.length,
              reportsScrubbed: scrubbedReports.length,
              discordLinks: unlinkedDiscord ? 1 : 0,
              avatars: removedAvatars,
            },
          },
          at: now,
        });
        return {
          steamId: account.steamId.toString(),
          publicId: account.publicId,
          steamIdRetained: retained,
          discordId: unlinkedDiscord?.discordId ?? null,
        };
      },
    );

    let sessionsDropped = true;
    try {
      await this.deps.dropSessions(accountId);
    } catch {
      sessionsDropped = false;
    }
    await this.deps.invalidateEquipped(steamId);
    if (discordId !== null) {
      // Melhor esforço: a Conta já foi anonimizada; um cargo que sobrar não identifica ninguém.
      await this.deps.removeDiscordRoles?.(discordId).catch(() => undefined);
    }
    // Depois do commit e sem nunca falhar a exclusão: o que não der agora fica como pendente.
    const analytics = await this.deps.erasePerson?.(accountId).catch(() => 'pending' as const);
    return {
      publicId,
      anonymizedAt: now,
      steamIdRetained,
      sessionsDropped,
      analytics: analytics ?? 'off',
    };
  }
}
