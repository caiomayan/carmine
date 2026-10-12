import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { accounts, inventoryItems, loadoutSlots, presets, vipPeriods } from '../database/schema.js';
import { vipStatusAt } from '../vip/vip-status.js';
import type { EquippedCache } from './equipped-cache.js';

/** O maior StatTrak que o contrato do Item aceita (`cs2ItemSchema.statTrak`). */
const MAX_STAT_TRAK = 999_999;

/**
 * - `counted`: o StatTrak subiu 1;
 * - `ignored`: nada a contar (Item sem StatTrak, Conta sem VIP ou Item fora do Loadout);
 * - `unknown`: nenhum Item com esse `uid` no Inventário dessa Conta.
 */
export type StatTrakIncrement = 'counted' | 'ignored' | 'unknown';

/**
 * O contador do StatTrak (S05). O cs2-css-inventory-simulator soma no jogo a cada abate e avisa
 * a API; aqui ele é gravado, para valer no próximo connect ou `!ws`. Só conta o Item do Loadout
 * (o Preset ativo) de quem tem Período VIP ativo: sem VIP, o StatTrak nem vai para o jogo.
 */
export class StatTrakCounter {
  constructor(
    private readonly db: Database,
    private readonly cache: EquippedCache,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** Um abate com o Item de `econUid` (o `uid` do `equipped/v5`) da Conta de `steamId`. */
  async increment(steamId: string, econUid: number): Promise<StatTrakIncrement> {
    const [target] = await this.db
      .select({ id: inventoryItems.id, accountId: accounts.id, item: inventoryItems.item })
      .from(inventoryItems)
      .innerJoin(accounts, eq(accounts.id, inventoryItems.accountId))
      .where(
        and(
          eq(accounts.steamId, BigInt(steamId)),
          eq(inventoryItems.econUid, econUid),
          isNull(inventoryItems.deletedAt),
        ),
      );
    if (!target) return 'unknown';
    if (target.item.statTrak === undefined) return 'ignored';
    if (!(await this.hasVip(target.accountId)) || !(await this.isEquipped(target))) {
      return 'ignored';
    }
    // Atômico: dois abates ao mesmo tempo somam 2.
    const [counted] = await this.db
      .update(inventoryItems)
      .set({
        item: sql`jsonb_set(${inventoryItems.item}, '{statTrak}', to_jsonb(least((${inventoryItems.item}->>'statTrak')::int + 1, ${MAX_STAT_TRAK})))`,
      })
      .where(
        and(
          eq(inventoryItems.id, target.id),
          isNull(inventoryItems.deletedAt),
          sql`${inventoryItems.item} ? 'statTrak'`,
        ),
      )
      .returning({ id: inventoryItems.id });
    if (!counted) return 'ignored';
    await this.cache.invalidate(steamId);
    return 'counted';
  }

  private async hasVip(accountId: string): Promise<boolean> {
    const periods = await this.db
      .select({ startsAt: vipPeriods.startsAt, endsAt: vipPeriods.endsAt })
      .from(vipPeriods)
      .where(eq(vipPeriods.accountId, accountId));
    return vipStatusAt(periods, this.clock()).active;
  }

  private async isEquipped({ id, accountId }: { id: string; accountId: string }): Promise<boolean> {
    const [slot] = await this.db
      .select({ slot: loadoutSlots.slot })
      .from(loadoutSlots)
      .innerJoin(presets, eq(presets.id, loadoutSlots.presetId))
      .where(
        and(
          eq(loadoutSlots.itemId, id),
          eq(presets.accountId, accountId),
          eq(presets.active, true),
        ),
      )
      .limit(1);
    return slot !== undefined;
  }
}
