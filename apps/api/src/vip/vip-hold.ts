import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import type { Catalog } from '../catalog/catalog.js';
import type { Database } from '../database/database.js';
import {
  accounts,
  inventoryItems,
  loadoutSlots,
  presets,
  vipHeldItems,
  vipPeriods,
} from '../database/schema.js';
import type { VipPeriods } from './vip-periods.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Quanto tempo os Itens VIP ficam guardados depois que o VIP acaba. */
export const VIP_HOLD_DAYS = 30;

/** Tipos de Item (cs2-lib) que só existem com VIP: saem inteiros. */
const VIP_ONLY_TYPES = new Set(['agent', 'musickit']);

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface VipHoldOptions {
  db: Database;
  catalog: Pick<Catalog, 'find' | 'economy'>;
  vip: Pick<VipPeriods, 'statusOf'>;
  /** Limpa o `equipped/v5` da Conta; nunca lança. */
  onChanged?: (accountId: string) => Promise<unknown>;
  clock?: () => Date;
  /** Desligada (o padrão em produção até os Termos novos): não guarda, não devolve e não apaga nada. */
  enabled?: boolean;
}

/**
 * A guarda dos Itens VIP (S14, D3). Quando o VIP da Conta acaba, o agente e o kit de música saem
 * do Inventário e do Loadout, e o StatTrak e a nametag das skins saem da skin; tudo vai para
 * `vip_held_items` por {@link VIP_HOLD_DAYS} dias, a contar do fim do VIP. Se o VIP volta, tudo volta
 * inteiro e nos mesmos slots; passado o prazo, é apagado. Tirar de verdade (em vez de filtrar na
 * leitura) garante que nenhuma tela nem o jogo enxergam o que está guardado. Idempotente, e seguro
 * com várias instâncias (a Conta é travada).
 */
export class VipHold {
  private readonly db: Database;
  private readonly clock: () => Date;

  constructor(private readonly options: VipHoldOptions) {
    this.db = options.db;
    this.clock = options.clock ?? (() => new Date());
  }

  /** Ids do catálogo que só existem com VIP (agentes e kits de música). */
  private vipOnlyIds(): number[] {
    return this.options.catalog.economy.itemsAsArray
      .filter((item) => VIP_ONLY_TYPES.has(item.type))
      .map((item) => item.id);
  }

  /**
   * Deixa a Conta no estado certo para o VIP de agora: sem VIP, guarda o que for de VIP; com VIP, devolve
   * o que estava guardado. Devolve o que fez.
   */
  async syncAccount(
    accountId: string,
    now = this.clock(),
  ): Promise<'held' | 'restored' | 'unchanged'> {
    if (this.options.enabled === false) return 'unchanged';
    const status = await this.options.vip.statusOf(accountId, now);
    const outcome = await this.db.transaction(async (tx) => {
      const [locked] = await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .for('update');
      if (!locked) return 'unchanged' as const;
      return status.active
        ? await this.restore(tx, accountId, now)
        : await this.hold(tx, accountId, status.endedAt ?? now, now);
    });
    if (outcome !== 'unchanged')
      await this.options.onChanged?.(accountId)?.catch?.(() => undefined);
    return outcome;
  }

  /**
   * Um passo do job: guarda a de quem perdeu o VIP e devolve a de quem o recuperou, em lotes, e apaga
   * o que passou do prazo. Devolve quantas Contas mexeu.
   */
  async sweep(
    now = this.clock(),
    limit = 100,
  ): Promise<{ held: number; restored: number; purged: number }> {
    const noVip = sql`not exists (select 1 from ${vipPeriods} p where p.account_id = ${inventoryItems.accountId} and p.starts_at <= ${now} and p.ends_at > ${now})`;
    const ids = this.vipOnlyIds();
    const toHold = await this.db
      .selectDistinct({ accountId: inventoryItems.accountId })
      .from(inventoryItems)
      .where(
        and(
          sql`${inventoryItems.deletedAt} is null`,
          sql`(${inventoryItems.item} ? 'statTrak' or ${inventoryItems.item} ? 'nameTag' ${
            ids.length > 0
              ? sql`or (${inventoryItems.item}->>'id')::int in (${sql.join(
                  ids.map((id) => sql`${id}`),
                  sql`, `,
                )})`
              : sql``
          })`,
          noVip,
        ),
      )
      .limit(limit);
    const toRestore = await this.db
      .selectDistinct({ accountId: vipHeldItems.accountId })
      .from(vipHeldItems)
      .where(
        sql`exists (select 1 from ${vipPeriods} p where p.account_id = ${vipHeldItems.accountId} and p.starts_at <= ${now} and p.ends_at > ${now})`,
      )
      .limit(limit);

    let held = 0;
    let restored = 0;
    for (const { accountId } of [...toHold, ...toRestore]) {
      const outcome = await this.syncAccount(accountId, now).catch(() => 'unchanged' as const);
      if (outcome === 'held') held++;
      if (outcome === 'restored') restored++;
    }
    const purged = await this.purge(now);
    return { held, restored, purged };
  }

  /** Apaga o que passou do prazo de guarda. */
  async purge(now = this.clock()): Promise<number> {
    const removed = await this.db
      .delete(vipHeldItems)
      .where(lt(vipHeldItems.heldAt, new Date(now.getTime() - VIP_HOLD_DAYS * DAY_MS)))
      .returning({ id: vipHeldItems.id });
    return removed.length;
  }

  private async hold(
    tx: Tx,
    accountId: string,
    heldAt: Date,
    now: Date,
  ): Promise<'held' | 'unchanged'> {
    const rows = await tx
      .select({
        id: inventoryItems.id,
        item: inventoryItems.item,
        createdAt: inventoryItems.createdAt,
      })
      .from(inventoryItems)
      .where(
        and(eq(inventoryItems.accountId, accountId), sql`${inventoryItems.deletedAt} is null`),
      );
    let changed = false;
    for (const row of rows) {
      const type = this.options.catalog.find(row.item.id)?.type;
      if (type !== undefined && VIP_ONLY_TYPES.has(type)) {
        const slots = await tx
          .select({
            presetId: loadoutSlots.presetId,
            slot: loadoutSlots.slot,
            side: loadoutSlots.side,
          })
          .from(loadoutSlots)
          .where(eq(loadoutSlots.itemId, row.id));
        await tx
          .insert(vipHeldItems)
          .values({
            accountId,
            kind: 'item',
            itemId: row.id,
            item: row.item as unknown as Record<string, unknown>,
            itemCreatedAt: row.createdAt,
            slots,
            heldAt,
          })
          .onConflictDoNothing();
        // Os slots do Loadout caem junto (cascade): a volta os refaz a partir de `slots`.
        await tx.delete(inventoryItems).where(eq(inventoryItems.id, row.id));
        changed = true;
      } else if (row.item.statTrak !== undefined || row.item.nameTag !== undefined) {
        const attributes: Record<string, unknown> = {};
        if (row.item.statTrak !== undefined) attributes.statTrak = row.item.statTrak;
        if (row.item.nameTag !== undefined) attributes.nameTag = row.item.nameTag;
        await tx
          .insert(vipHeldItems)
          .values({ accountId, kind: 'attributes', itemId: row.id, item: attributes, heldAt })
          .onConflictDoNothing();
        await tx
          .update(inventoryItems)
          .set({ item: sql`${inventoryItems.item} - 'statTrak' - 'nameTag'`, updatedAt: now })
          .where(eq(inventoryItems.id, row.id));
        changed = true;
      }
    }
    return changed ? 'held' : 'unchanged';
  }

  private async restore(tx: Tx, accountId: string, now: Date): Promise<'restored' | 'unchanged'> {
    const held = await tx.select().from(vipHeldItems).where(eq(vipHeldItems.accountId, accountId));
    if (held.length === 0) return 'unchanged';
    const presetIds = new Set(
      (
        await tx.select({ id: presets.id }).from(presets).where(eq(presets.accountId, accountId))
      ).map((preset) => preset.id),
    );
    for (const row of held) {
      if (row.kind === 'item') {
        await tx
          .insert(inventoryItems)
          .values({
            id: row.itemId,
            accountId,
            item: row.item as never,
            createdAt: row.itemCreatedAt ?? now,
            updatedAt: now,
          })
          .onConflictDoNothing();
        const slots = row.slots.filter((slot) => presetIds.has(slot.presetId));
        if (slots.length > 0) {
          // Um slot que a pessoa ocupou enquanto isso fica com o que ela pôs.
          await tx
            .insert(loadoutSlots)
            .values(slots.map((slot) => ({ ...slot, itemId: row.itemId })))
            .onConflictDoNothing();
        }
      } else {
        await tx
          .update(inventoryItems)
          .set({
            item: sql`${JSON.stringify(row.item)}::jsonb || ${inventoryItems.item}`,
            updatedAt: now,
          })
          .where(and(eq(inventoryItems.id, row.itemId), eq(inventoryItems.accountId, accountId)));
      }
    }
    await tx.delete(vipHeldItems).where(
      inArray(
        vipHeldItems.id,
        held.map((row) => row.id),
      ),
    );
    return 'restored';
  }
}
