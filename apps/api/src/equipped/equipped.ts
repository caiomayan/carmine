import type { LoadoutSide } from '@carmine/contracts';
import { and, eq, isNull } from 'drizzle-orm';
import type { Catalog } from '../catalog/catalog.js';
import type { Database } from '../database/database.js';
import { accounts, inventoryItems, loadoutSlots, presets, vipPeriods } from '../database/schema.js';
import { vipStatusAt } from '../vip/vip-status.js';
import { EQUIPPED_CACHE_TTL_MS, type EquippedCache } from './equipped-cache.js';
import { toEquippedV5 } from './equipped-v5.js';

/**
 * O Loadout de uma Conta no `equipped/v5`, pronto para o plugin: o Preset ativo, com o filtro
 * VIP, servido do cache sempre que possível. A resposta guardada nunca passa do fim do Período
 * VIP, então o Item VIP sai do jogo no próximo connect ou `!ws` depois do fim.
 */
export class Equipped {
  constructor(
    private readonly db: Database,
    private readonly catalog: Catalog,
    private readonly cache: EquippedCache,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** O corpo JSON da resposta. Uma Conta que não existe joga com as Armas padrão. */
  async bodyOf(steamId: string): Promise<string> {
    const cached = await this.cache.lookup(steamId);
    if ('body' in cached) return cached.body;
    const now = this.clock();
    const { body, validForMs } = await this.compute(BigInt(steamId), now);
    if (cached.generation !== null) {
      await this.cache.store(steamId, cached.generation, body, validForMs);
    }
    return body;
  }

  private async compute(steamId: bigint, now: Date): Promise<{ body: string; validForMs: number }> {
    const [items, periods] = await Promise.all([
      this.db
        .select({
          slot: loadoutSlots.slot,
          side: loadoutSlots.side,
          item: inventoryItems.item,
          econUid: inventoryItems.econUid,
        })
        .from(accounts)
        .innerJoin(presets, and(eq(presets.accountId, accounts.id), eq(presets.active, true)))
        .innerJoin(loadoutSlots, eq(loadoutSlots.presetId, presets.id))
        .innerJoin(
          inventoryItems,
          and(eq(inventoryItems.id, loadoutSlots.itemId), isNull(inventoryItems.deletedAt)),
        )
        .where(eq(accounts.steamId, steamId)),
      this.db
        .select({ startsAt: vipPeriods.startsAt, endsAt: vipPeriods.endsAt })
        .from(vipPeriods)
        .innerJoin(accounts, eq(accounts.id, vipPeriods.accountId))
        .where(eq(accounts.steamId, steamId)),
    ]);
    const vip = vipStatusAt(periods, now);
    const equipped = items.map(({ side, ...rest }) => ({
      ...rest,
      side: side === 'any' ? null : (side as LoadoutSide),
    }));
    const body = JSON.stringify(toEquippedV5(equipped, this.catalog, { vip: vip.active }));
    const untilVipEnds = vip.endsAt ? vip.endsAt.getTime() - now.getTime() : Infinity;
    return { body, validForMs: Math.min(EQUIPPED_CACHE_TTL_MS, untilVipEnds) };
  }
}
