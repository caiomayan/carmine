import {
  type Cs2Item,
  INVENTORY_MAX_ITEMS,
  INVENTORY_RESTORE_WINDOW_SECONDS,
  type InventoryItem,
  type ItemUsages,
  type RemovedInventoryItem,
} from '@carmine/contracts';
import { and, count, desc, eq, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import type { Analytics } from '../analytics/analytics.js';
import type { Database } from '../database/database.js';
import { accounts, inventoryItems } from '../database/schema.js';
import type { LoadoutChangeListener } from '../equipped/equipped-cache.js';
import { itemUsagesOf } from '../loadout/item-usages.js';
import type { VipPeriods } from '../vip/vip-periods.js';
import { type ItemRules, type ItemRuleViolation, normalizeItem } from './item-rules.js';

/** Uma operação do Inventário recusada, com o código estável do contrato. */
export class InventoryRejection extends Error {
  constructor(readonly violation: ItemRuleViolation) {
    super(violation.message);
    this.name = 'InventoryRejection';
  }
}

const rejection = (code: ItemRuleViolation['code'], message: string) =>
  new InventoryRejection({ code, message });

/**
 * Removidos há mais que isso saem de vez do banco (na próxima remoção ou adição da Conta). Até
 * lá, um restore tardio recebe `restore_expired` em vez de `not_found`.
 */
const PURGE_AFTER_MS = 24 * 60 * 60 * 1000;

const RESTORE_WINDOW_MS = INVENTORY_RESTORE_WINDOW_SECONDS * 1000;

type Row = typeof inventoryItems.$inferSelect;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * O contador do StatTrak é do servidor (só os abates no jogo o mudam): ao ligar o StatTrak ele
 * começa em 0, e o valor enviado pelo cliente é ignorado.
 */
const withCounterAtZero = (item: Cs2Item): Cs2Item =>
  item.statTrak === undefined ? item : { ...item, statTrak: 0 };

const toInventoryItem = (row: Row): InventoryItem => ({
  uid: row.id,
  item: row.item,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/**
 * O Inventário (`Inventory`) de cada Conta: até {@link INVENTORY_MAX_ITEMS} Itens validados
 * pelas {@link ItemRules}, com remoção desfazível por {@link INVENTORY_RESTORE_WINDOW_SECONDS} s.
 * Toda recusa é uma {@link InventoryRejection}. Editar, remover e restaurar avisam o
 * {@link LoadoutChangeListener}: o Item pode estar equipado.
 */
export class Inventory {
  constructor(
    private readonly db: Database,
    private readonly rules: ItemRules,
    private readonly vipPeriods: VipPeriods,
    private readonly listener: LoadoutChangeListener,
    private readonly clock: () => Date = () => new Date(),
    /** Os eventos do plano de analytics (A1); sempre depois do commit. Sem ele, nada é emitido. */
    private readonly analytics: Pick<Analytics, 'capture'> = { capture: () => undefined },
  ) {}

  /** Os Itens da Conta, do mais novo para o mais antigo. */
  async list(accountId: string): Promise<InventoryItem[]> {
    const rows = await this.db
      .select()
      .from(inventoryItems)
      .where(and(eq(inventoryItems.accountId, accountId), isNull(inventoryItems.deletedAt)))
      .orderBy(desc(inventoryItems.createdAt), desc(inventoryItems.id));
    return rows.map(toInventoryItem);
  }

  async add(accountId: string, item: Cs2Item): Promise<InventoryItem> {
    const valid = await this.validate(accountId, item);
    const now = this.clock();
    const { created, total } = await this.db.transaction(async (tx) => {
      await this.lockAccount(tx, accountId);
      await this.purge(tx, accountId, now);
      const before = await this.assertRoom(tx, accountId);
      const [row] = await tx
        .insert(inventoryItems)
        .values({ accountId, item: withCounterAtZero(valid), createdAt: now, updatedAt: now })
        .returning();
      return { created: toInventoryItem(row as Row), total: before + 1 };
    });
    const props = this.rules.eventProps(valid);
    if (props) {
      this.analytics.capture('item_adicionado', {
        accountId,
        props: { ...props, total_apos: total },
        at: now,
      });
    }
    return created;
  }

  /**
   * Substitui todos os atributos do Item; o `id` do catálogo não muda. O contador do StatTrak
   * não vem do cliente: com o StatTrak ligado, fica o da linha no instante da escrita (num só
   * UPDATE, então um abate gravado ao mesmo tempo não se perde); recém-ligado, começa em 0;
   * desligado, o contador some (religar começa de novo em 0).
   */
  async replace(accountId: string, uid: string, item: Cs2Item): Promise<InventoryItem> {
    const current = await this.findActive(this.db, accountId, uid);
    if (current.item.id !== item.id) {
      throw rejection('item_id_immutable', 'O Item do catálogo não muda numa edição');
    }
    const valid = withCounterAtZero(await this.validate(accountId, item));
    const next =
      valid.statTrak === undefined
        ? valid
        : sql`${JSON.stringify(valid)}::jsonb || (case when ${inventoryItems.item} ? 'statTrak' then jsonb_build_object('statTrak', ${inventoryItems.item}->'statTrak') else '{}'::jsonb end)`;
    const [row] = await this.db
      .update(inventoryItems)
      .set({ item: next, updatedAt: this.clock() })
      .where(
        and(
          eq(inventoryItems.id, uid),
          eq(inventoryItems.accountId, accountId),
          isNull(inventoryItems.deletedAt),
        ),
      )
      .returning();
    // Removido entre a leitura e a escrita.
    if (!row) throw notFound();
    await this.listener.loadoutChanged(accountId);
    const props = this.rules.eventProps(valid);
    if (props) this.analytics.capture('item_editado', { accountId, props });
    return toInventoryItem(row);
  }

  /** Onde o Item está em uso (Loadout atual, Presets). */
  async usages(accountId: string, uid: string): Promise<ItemUsages> {
    await this.findActive(this.db, accountId, uid);
    return itemUsagesOf(this.db, uid);
  }

  /**
   * Tira o Item do Inventário (soft delete). Até `restorableUntil`, {@link restore} o devolve
   * com o mesmo `uid`. Os slots continuam apontando para ele, mas as leituras ignoram Itens
   * removidos: os slots e Presets em uso voltam à Arma padrão.
   */
  async remove(accountId: string, uid: string): Promise<RemovedInventoryItem> {
    const now = this.clock();
    const { removed, item, total } = await this.db.transaction(async (tx) => {
      const current = await this.findActive(tx, accountId, uid);
      const usages = await itemUsagesOf(tx, uid);
      await tx.update(inventoryItems).set({ deletedAt: now }).where(eq(inventoryItems.id, uid));
      await this.purge(tx, accountId, now);
      const [left] = await tx
        .select({ total: count() })
        .from(inventoryItems)
        .where(and(eq(inventoryItems.accountId, accountId), isNull(inventoryItems.deletedAt)));
      return {
        removed: {
          uid,
          usages,
          restorableUntil: new Date(now.getTime() + RESTORE_WINDOW_MS).toISOString(),
        },
        item: current.item,
        total: left?.total ?? 0,
      };
    });
    await this.listener.loadoutChanged(accountId);
    const props = this.rules.eventProps(item);
    if (props) {
      this.analytics.capture('item_removido', {
        accountId,
        props: {
          tipo: props.tipo,
          item_id: props.item_id,
          em_uso: removed.usages.loadout.length > 0 || removed.usages.presets.length > 0,
          total_apos: total,
        },
        at: now,
      });
    }
    return removed;
  }

  /**
   * Desfaz a remoção: o Item volta com o mesmo `uid` e aos mesmos slots (menos aqueles em que
   * outro Item foi equipado nesse meio-tempo). Restaurar um Item que já está no Inventário (um
   * clique repetido) só o devolve. Não pede VIP de novo: Itens VIP continuam no Inventário
   * mesmo depois do fim do Período VIP.
   */
  async restore(accountId: string, uid: string): Promise<InventoryItem> {
    const now = this.clock();
    const { restored, afterSeconds } = await this.db.transaction(async (tx) => {
      await this.lockAccount(tx, accountId);
      const row = await this.findOwned(tx, accountId, uid);
      // Um clique repetido: o Item já estava no Inventário, nada voltou (e nada é medido).
      if (row.deletedAt === null) return { restored: toInventoryItem(row), afterSeconds: null };
      if (now.getTime() - row.deletedAt.getTime() > RESTORE_WINDOW_MS) {
        throw rejection('restore_expired', 'O prazo para desfazer a remoção acabou');
      }
      await this.assertRoom(tx, accountId);
      const [back] = await tx
        .update(inventoryItems)
        .set({ deletedAt: null })
        .where(eq(inventoryItems.id, uid))
        .returning();
      return {
        restored: toInventoryItem(back as Row),
        afterSeconds: Math.round((now.getTime() - row.deletedAt.getTime()) / 1000),
      };
    });
    await this.listener.loadoutChanged(accountId);
    if (afterSeconds !== null) {
      this.analytics.capture('item_restaurado', {
        accountId,
        props: { segundos_ate_desfazer: afterSeconds },
        at: now,
      });
    }
    return restored;
  }

  private async validate(accountId: string, item: Cs2Item): Promise<Cs2Item> {
    const { active } = await this.vipPeriods.statusOf(accountId, this.clock());
    const violation = this.rules.check(item, { vip: active });
    if (violation) throw new InventoryRejection(violation);
    return normalizeItem(item);
  }

  /**
   * Serializa as mutações de uma mesma Conta: sem isso, duas adições simultâneas com 299 Itens
   * passariam as duas pela contagem.
   */
  private async lockAccount(tx: Transaction, accountId: string): Promise<void> {
    await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .for('update');
  }

  /** Garante espaço para mais um Item e devolve quantos a Conta tem agora. */
  private async assertRoom(tx: Transaction, accountId: string): Promise<number> {
    const [result] = await tx
      .select({ total: count() })
      .from(inventoryItems)
      .where(and(eq(inventoryItems.accountId, accountId), isNull(inventoryItems.deletedAt)));
    const total = result?.total ?? 0;
    if (total >= INVENTORY_MAX_ITEMS) {
      throw rejection('inventory_full', `O Inventário já tem ${INVENTORY_MAX_ITEMS} Itens`);
    }
    return total;
  }

  private async purge(tx: Transaction, accountId: string, now: Date): Promise<void> {
    await tx
      .delete(inventoryItems)
      .where(
        and(
          eq(inventoryItems.accountId, accountId),
          isNotNull(inventoryItems.deletedAt),
          lt(inventoryItems.deletedAt, new Date(now.getTime() - PURGE_AFTER_MS)),
        ),
      );
  }

  /** O Item da Conta, removido ou não; de outra Conta é como se não existisse. */
  private async findOwned(
    db: Database | Transaction,
    accountId: string,
    uid: string,
  ): Promise<Row> {
    const [row] = await db
      .select()
      .from(inventoryItems)
      .where(and(eq(inventoryItems.id, uid), eq(inventoryItems.accountId, accountId)))
      .for('update');
    if (!row) throw notFound();
    return row;
  }

  private async findActive(
    db: Database | Transaction,
    accountId: string,
    uid: string,
  ): Promise<Row> {
    const row = await this.findOwned(db, accountId, uid);
    if (row.deletedAt !== null) throw notFound();
    return row;
  }
}

const notFound = () => rejection('not_found', 'Item não encontrado no Inventário');
