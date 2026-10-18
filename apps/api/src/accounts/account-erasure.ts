import { ANONYMIZED_DISPLAY_NAME } from '@carmine/contracts';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import {
  accounts,
  inventoryItems,
  presets,
  sanctions,
  staffMembers,
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
}

export interface Erasure {
  publicId: number;
  anonymizedAt: Date;
  /** Havia um ban valendo: o SteamID64 fica na Conta até ele acabar. */
  steamIdRetained: boolean;
  /** As sessões do site caíram (com o Valkey fora, não; elas expiram sozinhas). */
  sessionsDropped: boolean;
}

/**
 * Pedido de exclusão de dados (S08, Política de Privacidade, seção 8): anonimiza a Conta, sem
 * volta. Some o que identifica a pessoa (nome Steam, Nome de exibição, avatar, Perfil público,
 * reivindicação) e o que ela montou (Inventário, Presets, Loadout, Períodos VIP, preferência de
 * chat); o vínculo com a Steam se desfaz (`steamId = -publicId`), então quem voltar a jogar ganha
 * uma Conta nova. Fica o necessário por obrigação legal ou para a moderação valer: as Punições e
 * o log de auditoria (registro interno, com o SteamID64 no log) e, com um ban valendo, o SteamID64
 * na Conta, até o ban acabar (`keepUnlessReleased`). Os registros de pagamento da S14 terão
 * tabela própria e ficam pelo prazo legal.
 */
export class AccountErasure {
  constructor(
    private readonly db: Database,
    private readonly deps: ErasureDeps,
  ) {}

  async anonymize(accountId: string, staff: StaffAction, now = new Date()): Promise<Erasure> {
    const { steamId, publicId, steamIdRetained } = await this.db.transaction(async (tx) => {
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
      const removedVip = await tx
        .delete(vipPeriods)
        .where(eq(vipPeriods.accountId, accountId))
        .returning({ id: vipPeriods.id });
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
          },
        },
        at: now,
      });
      return {
        steamId: account.steamId.toString(),
        publicId: account.publicId,
        steamIdRetained: retained,
      };
    });

    let sessionsDropped = true;
    try {
      await this.deps.dropSessions(accountId);
    } catch {
      sessionsDropped = false;
    }
    await this.deps.invalidateEquipped(steamId);
    return { publicId, anonymizedAt: now, steamIdRetained, sessionsDropped };
  }
}
