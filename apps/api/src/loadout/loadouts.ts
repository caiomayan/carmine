import {
  type AssignInput,
  type Cs2Item,
  type EquipInput,
  inGameOf,
  type Loadout,
  type LoadoutAssignment,
  type LoadoutChange,
  type LoadoutErrorCode,
  type LoadoutSide,
  MAIN_PRESET_NAME,
  PRESET_HIGHLIGHT_SLOTS,
  PRESETS_FREE_LIMIT,
  PRESETS_VIP_LIMIT,
  type Preset,
  type PresetList,
  type ShowcaseItem,
  type UnequipInput,
} from '@carmine/contracts';
import { and, asc, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { Catalog } from '../catalog/catalog.js';
import type { Database } from '../database/database.js';
import { accounts, inventoryItems, loadoutSlots, presets } from '../database/schema.js';
import type { LoadoutChangeListener } from '../equipped/equipped-cache.js';
import type { VipPeriods } from '../vip/vip-periods.js';
import { type AssignedItem, entriesOf, sidesToApply, slotKey } from './slot-rules.js';

/** Uma operação do Loadout ou dos Presets recusada, com o código estável do contrato. */
export class LoadoutRejection extends Error {
  constructor(
    readonly code: LoadoutErrorCode,
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'LoadoutRejection';
  }
}

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type Db = Database | Transaction;
type PresetRow = typeof presets.$inferSelect;
type DbSide = (typeof loadoutSlots.$inferSelect)['side'];

const toDbSide = (side: LoadoutSide | null): DbSide => side ?? 'any';
const fromDbSide = (side: DbSide): LoadoutSide | null => (side === 'any' ? null : side);

/** Um slot de um lado a gravar: `itemId` nulo volta à Arma padrão. */
interface SlotChange {
  slot: string;
  side: LoadoutSide | null;
  itemId: string | null;
}

/**
 * O Loadout e os Presets (`Preset`) de cada Conta (S05). O Loadout é o Preset ativo; toda Conta
 * tem um Preset principal, criado na primeira leitura ou mutação. Com Período VIP ativo, a Conta
 * tem até {@link PRESETS_VIP_LIMIT} Presets; sem VIP, os extras ficam somente leitura. Toda
 * recusa é uma {@link LoadoutRejection}; toda mudança no Preset ativo avisa o
 * {@link LoadoutChangeListener} (o cache do `equipped/v5`).
 */
export class Loadouts {
  constructor(
    private readonly db: Database,
    private readonly catalog: Catalog,
    private readonly vipPeriods: VipPeriods,
    private readonly listener: LoadoutChangeListener,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** O Loadout (o Preset ativo) ou outro Preset, com todos os slots. */
  async get(accountId: string, presetId?: string): Promise<Loadout> {
    await this.ensureMain(this.db, accountId);
    const vip = await this.vipOf(accountId);
    const preset = await this.findPreset(this.db, accountId, presetId);
    return this.loadoutOf(this.db, preset, vip);
  }

  /** Equipa o Item no slot dele, nos lados pedidos; o que estava lá é substituído. */
  async equip(accountId: string, input: EquipInput): Promise<LoadoutChange> {
    return this.change(accountId, input.presetId, async (tx) => {
      const [item] = await this.activeItems(tx, accountId, [input.uid]);
      if (!item) throw new LoadoutRejection('item_not_found', 'Item não encontrado', 'uid');
      const target = this.catalog.slotOf(item.item.id);
      if (!target) throw new LoadoutRejection('invalid_slot', 'Item não se equipa', 'uid');
      const sides = sidesToApply(target.sides, input.sides);
      if ('field' in sides) {
        throw new LoadoutRejection('side_not_allowed', 'O Item não existe nesse lado', sides.field);
      }
      return sides.sides.map((side) => ({ slot: target.slot, side, itemId: item.id }));
    });
  }

  /** O slot volta à Arma padrão nos lados pedidos (todos, sem pedido). */
  async unequip(accountId: string, input: UnequipInput): Promise<LoadoutChange> {
    return this.change(accountId, input.presetId, async () => {
      const slotSides = this.sidesOfSlot(input.slot, 'slot');
      const sides = sidesToApply(slotSides, input.sides);
      if ('field' in sides) {
        throw new LoadoutRejection('side_not_allowed', 'O slot não existe nesse lado', sides.field);
      }
      return sides.sides.map((side) => ({ slot: input.slot, side, itemId: null }));
    });
  }

  /** Define exatamente estes slots (o "Desfazer" de equip e unequip). */
  async assign(accountId: string, input: AssignInput): Promise<LoadoutChange> {
    return this.change(accountId, input.presetId, async (tx) => {
      const uids = input.assignments.flatMap(({ uid }) => (uid === null ? [] : [uid]));
      const items = new Map(
        (await this.activeItems(tx, accountId, uids)).map((item) => [item.id, item]),
      );
      return input.assignments.map(({ slot, side, uid }, index): SlotChange => {
        const at = (field: string) => `assignments.${index}.${field}`;
        const slotSides = this.sidesOfSlot(slot, at('slot'));
        if (slotSides === null ? side !== null : side === null || !slotSides.includes(side)) {
          throw new LoadoutRejection(
            'side_not_allowed',
            'O slot não existe nesse lado',
            at('side'),
          );
        }
        if (uid === null) return { slot, side, itemId: null };
        const item = items.get(uid);
        if (!item) throw new LoadoutRejection('item_not_found', 'Item não encontrado', at('uid'));
        const target = this.catalog.slotOf(item.item.id);
        if (target?.slot !== slot) {
          throw new LoadoutRejection('invalid_slot', 'O Item não é desse slot', at('uid'));
        }
        if (side !== null && !target.sides?.includes(side)) {
          throw new LoadoutRejection(
            'side_not_allowed',
            'O Item não existe nesse lado',
            at('side'),
          );
        }
        return { slot, side, itemId: uid };
      });
    });
  }

  /** O Preset ativo em vitrine no Perfil: só o que vai para o jogo, sem os atributos VIP. */
  async showcase(accountId: string): Promise<ShowcaseItem[]> {
    const [active] = await this.db
      .select()
      .from(presets)
      .where(and(eq(presets.accountId, accountId), eq(presets.active, true)));
    if (!active) return [];
    const vip = await this.vipOf(accountId);
    const assigned = await this.assignedOf(this.db, active.id);
    return this.catalog.slots().flatMap(({ slot, side }): ShowcaseItem[] => {
      const equipped = assigned.get(slotKey(slot, side));
      if (!equipped) return [];
      const { notInGame, strippedInGame } = inGameOf(equipped.type, equipped.item, { vip });
      if (notInGame !== null) return [];
      const { statTrak, nameTag, ...item } = equipped.item;
      return [
        {
          slot,
          side,
          item: {
            ...item,
            ...(statTrak !== undefined && !strippedInGame.includes('statTrak') && { statTrak }),
            ...(nameTag !== undefined && !strippedInGame.includes('nameTag') && { nameTag }),
          },
        },
      ];
    });
  }

  /** Os Presets da Conta: o principal primeiro, depois do mais antigo ao mais novo. */
  async listPresets(accountId: string): Promise<PresetList> {
    await this.ensureMain(this.db, accountId);
    const vip = await this.vipOf(accountId);
    return this.presetListOf(this.db, accountId, vip);
  }

  /** Cria um Preset (exige VIP), cópia do Loadout atual ou vazio. Não ativa. */
  async createPreset(
    accountId: string,
    input: { name: string; from: 'current' | 'empty' },
  ): Promise<Preset> {
    const vip = await this.vipOf(accountId);
    if (!vip) throw new LoadoutRejection('vip_required', 'Criar Presets exige VIP');
    return this.db.transaction(async (tx) => {
      await this.lockAccount(tx, accountId);
      await this.ensureMain(tx, accountId);
      const [total] = await tx
        .select({ value: count() })
        .from(presets)
        .where(eq(presets.accountId, accountId));
      if ((total?.value ?? 0) >= PRESETS_VIP_LIMIT) {
        throw new LoadoutRejection('preset_limit', `No máximo ${PRESETS_VIP_LIMIT} Presets`);
      }
      const now = this.clock();
      const [created] = await tx
        .insert(presets)
        .values({ accountId, name: input.name, createdAt: now, updatedAt: now })
        .returning();
      const preset = created as PresetRow;
      if (input.from === 'current') {
        const active = await this.findPreset(tx, accountId, undefined);
        const slots = await tx
          .select()
          .from(loadoutSlots)
          .where(eq(loadoutSlots.presetId, active.id));
        if (slots.length > 0) {
          await tx
            .insert(loadoutSlots)
            .values(slots.map((slot) => ({ ...slot, presetId: preset.id })));
        }
      }
      return this.presetOf(tx, preset, vip);
    });
  }

  async renamePreset(accountId: string, presetId: string, name: string): Promise<Preset> {
    const vip = await this.vipOf(accountId);
    const preset = await this.writablePreset(this.db, accountId, presetId, vip);
    const [renamed] = await this.db
      .update(presets)
      .set({ name, updatedAt: this.clock() })
      .where(eq(presets.id, preset.id))
      .returning();
    return this.presetOf(this.db, renamed as PresetRow, vip);
  }

  /** Ativa o Preset: ele passa a ser o Loadout (o que vai para o jogo). */
  async activatePreset(accountId: string, presetId: string): Promise<PresetList> {
    const vip = await this.vipOf(accountId);
    const list = await this.db.transaction(async (tx) => {
      await this.lockAccount(tx, accountId);
      await this.ensureMain(tx, accountId);
      const preset = await this.writablePreset(tx, accountId, presetId, vip);
      await this.setActive(tx, accountId, preset.id);
      return this.presetListOf(tx, accountId, vip);
    });
    await this.listener.loadoutChanged(accountId);
    return list;
  }

  /** Apaga um Preset extra; se era o ativo, o principal volta a ser o Loadout. */
  async deletePreset(accountId: string, presetId: string): Promise<PresetList> {
    const vip = await this.vipOf(accountId);
    const { list, wasActive } = await this.db.transaction(async (tx) => {
      await this.lockAccount(tx, accountId);
      await this.ensureMain(tx, accountId);
      const preset = await this.findPreset(tx, accountId, presetId);
      if (preset.main) {
        throw new LoadoutRejection('preset_main', 'O Preset principal não é apagado');
      }
      await this.writablePreset(tx, accountId, presetId, vip);
      await tx.delete(presets).where(eq(presets.id, preset.id));
      if (preset.active) {
        const main = await this.mainPreset(tx, accountId);
        await this.setActive(tx, accountId, main.id);
      }
      return { list: await this.presetListOf(tx, accountId, vip), wasActive: preset.active };
    });
    if (wasActive) await this.listener.loadoutChanged(accountId);
    return list;
  }

  /**
   * Aplica as mudanças de `plan` no Preset (o ativo, sem `presetId`) numa transação e devolve
   * o Loadout depois e, dos slots que mudaram, o que tinham antes.
   */
  private async change(
    accountId: string,
    presetId: string | undefined,
    plan: (tx: Transaction) => Promise<SlotChange[]>,
  ): Promise<LoadoutChange> {
    const vip = await this.vipOf(accountId);
    const result = await this.db.transaction(async (tx) => {
      await this.lockAccount(tx, accountId);
      await this.ensureMain(tx, accountId);
      const preset = await this.writablePreset(tx, accountId, presetId, vip);
      const changes = await plan(tx);
      const before = await this.assignedOf(tx, preset.id);
      const previous: LoadoutAssignment[] = [];
      const seen = new Set<string>();
      for (const change of changes) {
        const key = slotKey(change.slot, change.side);
        const old = before.get(key)?.uid ?? null;
        if (!seen.has(key) && old !== change.itemId) {
          previous.push({ slot: change.slot, side: change.side, uid: old });
        }
        seen.add(key);
        await this.write(tx, preset.id, change);
      }
      if (previous.length > 0) {
        await tx.update(presets).set({ updatedAt: this.clock() }).where(eq(presets.id, preset.id));
      }
      return { preset, previous, loadout: await this.loadoutOf(tx, preset, vip) };
    });
    if (result.preset.active && result.previous.length > 0) {
      await this.listener.loadoutChanged(accountId);
    }
    return { loadout: result.loadout, previous: result.previous };
  }

  private async write(tx: Transaction, presetId: string, change: SlotChange): Promise<void> {
    const where = and(
      eq(loadoutSlots.presetId, presetId),
      eq(loadoutSlots.slot, change.slot),
      eq(loadoutSlots.side, toDbSide(change.side)),
    );
    if (change.itemId === null) {
      await tx.delete(loadoutSlots).where(where);
      return;
    }
    await tx
      .insert(loadoutSlots)
      .values({ presetId, slot: change.slot, side: toDbSide(change.side), itemId: change.itemId })
      .onConflictDoUpdate({
        target: [loadoutSlots.presetId, loadoutSlots.slot, loadoutSlots.side],
        set: { itemId: change.itemId },
      });
  }

  /** Os lados de um slot que existe (`null` no music kit), ou recusa com `field`. */
  private sidesOfSlot(slot: string, field: string): LoadoutSide[] | null {
    const definitions = this.catalog.slots().filter((definition) => definition.slot === slot);
    if (definitions.length === 0) {
      throw new LoadoutRejection('invalid_slot', 'Slot que não existe', field);
    }
    if (definitions.some(({ side }) => side === null)) return null;
    return definitions.map(({ side }) => side as LoadoutSide);
  }

  private async loadoutOf(db: Db, preset: PresetRow, vip: boolean): Promise<Loadout> {
    const assigned = await this.assignedOf(db, preset.id);
    const readOnly = isReadOnly(preset, vip);
    return {
      presetId: preset.id,
      presetName: preset.name,
      active: preset.active,
      readOnly,
      readOnlyReason: readOnly ? 'vip_inactive' : null,
      entries: entriesOf(this.catalog.slots(), assigned, { vip }),
    };
  }

  /** Os Itens equipados no Preset, por slot e lado. Itens removidos não contam. */
  private async assignedOf(db: Db, presetId: string): Promise<Map<string, AssignedItem>> {
    const rows = await db
      .select({
        slot: loadoutSlots.slot,
        side: loadoutSlots.side,
        uid: inventoryItems.id,
        item: inventoryItems.item,
      })
      .from(loadoutSlots)
      .innerJoin(
        inventoryItems,
        and(eq(inventoryItems.id, loadoutSlots.itemId), isNull(inventoryItems.deletedAt)),
      )
      .where(eq(loadoutSlots.presetId, presetId));
    return new Map(
      rows.map(({ slot, side, uid, item }) => [
        slotKey(slot, fromDbSide(side)),
        { uid, item, type: this.catalog.find(item.id)?.type ?? '' },
      ]),
    );
  }

  private async activeItems(
    db: Db,
    accountId: string,
    uids: string[],
  ): Promise<{ id: string; item: Cs2Item }[]> {
    if (uids.length === 0) return [];
    return db
      .select({ id: inventoryItems.id, item: inventoryItems.item })
      .from(inventoryItems)
      .where(
        and(
          inArray(inventoryItems.id, uids),
          eq(inventoryItems.accountId, accountId),
          isNull(inventoryItems.deletedAt),
        ),
      );
  }

  private async presetListOf(db: Db, accountId: string, vip: boolean): Promise<PresetList> {
    const rows = await db
      .select()
      .from(presets)
      .where(eq(presets.accountId, accountId))
      .orderBy(desc(presets.main), asc(presets.createdAt), asc(presets.id));
    const ids = rows.map(({ id }) => id);
    const [counts, highlights] = await Promise.all([
      this.equippedCounts(db, ids),
      this.highlightsOf(db, ids),
    ]);
    return {
      presets: rows.map((row) =>
        toPreset(row, vip, counts.get(row.id) ?? 0, highlights.get(row.id) ?? []),
      ),
      limit: vip ? PRESETS_VIP_LIMIT : PRESETS_FREE_LIMIT,
    };
  }

  private async presetOf(db: Db, row: PresetRow, vip: boolean): Promise<Preset> {
    const [counts, highlights] = await Promise.all([
      this.equippedCounts(db, [row.id]),
      this.highlightsOf(db, [row.id]),
    ]);
    return toPreset(row, vip, counts.get(row.id) ?? 0, highlights.get(row.id) ?? []);
  }

  /** Os Itens equipados nos slots de destaque de cada Preset (Itens removidos não contam). */
  private async highlightsOf(
    db: Db,
    presetIds: string[],
  ): Promise<Map<string, LoadoutAssignment[]>> {
    if (presetIds.length === 0) return new Map();
    const rows = await db
      .select({
        presetId: loadoutSlots.presetId,
        slot: loadoutSlots.slot,
        side: loadoutSlots.side,
        uid: inventoryItems.id,
      })
      .from(loadoutSlots)
      .innerJoin(
        inventoryItems,
        and(eq(inventoryItems.id, loadoutSlots.itemId), isNull(inventoryItems.deletedAt)),
      )
      .where(
        and(
          inArray(loadoutSlots.presetId, presetIds),
          inArray(loadoutSlots.slot, [...PRESET_HIGHLIGHT_SLOTS]),
        ),
      );
    const byPreset = new Map<string, LoadoutAssignment[]>();
    for (const row of rows) {
      const list = byPreset.get(row.presetId) ?? [];
      list.push({ slot: row.slot, side: fromDbSide(row.side), uid: row.uid });
      byPreset.set(row.presetId, list);
    }
    return byPreset;
  }

  private async equippedCounts(db: Db, presetIds: string[]): Promise<Map<string, number>> {
    if (presetIds.length === 0) return new Map();
    const rows = await db
      .select({ presetId: loadoutSlots.presetId, value: count() })
      .from(loadoutSlots)
      .innerJoin(
        inventoryItems,
        and(eq(inventoryItems.id, loadoutSlots.itemId), isNull(inventoryItems.deletedAt)),
      )
      .where(inArray(loadoutSlots.presetId, presetIds))
      .groupBy(loadoutSlots.presetId);
    return new Map(rows.map(({ presetId, value }) => [presetId, value]));
  }

  /** O Preset pedido (ou o ativo) que a Conta pode mudar agora. */
  private async writablePreset(
    db: Db,
    accountId: string,
    presetId: string | undefined,
    vip: boolean,
  ): Promise<PresetRow> {
    const preset = await this.findPreset(db, accountId, presetId);
    if (isReadOnly(preset, vip)) {
      throw new LoadoutRejection(
        'preset_read_only',
        'Sem VIP ativo, este Preset é somente leitura; ative o Principal para editar',
      );
    }
    return preset;
  }

  private async findPreset(
    db: Db,
    accountId: string,
    presetId: string | undefined,
  ): Promise<PresetRow> {
    const [preset] = await db
      .select()
      .from(presets)
      .where(
        and(
          eq(presets.accountId, accountId),
          presetId === undefined ? eq(presets.active, true) : eq(presets.id, presetId),
        ),
      );
    if (!preset) throw new LoadoutRejection('preset_not_found', 'Preset não encontrado');
    return preset;
  }

  private async mainPreset(db: Db, accountId: string): Promise<PresetRow> {
    const [main] = await db
      .select()
      .from(presets)
      .where(and(eq(presets.accountId, accountId), eq(presets.main, true)));
    if (!main) throw new Error(`Conta ${accountId} sem Preset principal`);
    return main;
  }

  private async setActive(tx: Transaction, accountId: string, presetId: string): Promise<void> {
    // Primeiro desativa: o índice único só permite um ativo por Conta.
    await tx
      .update(presets)
      .set({ active: false })
      .where(and(eq(presets.accountId, accountId), eq(presets.active, true)));
    await tx.update(presets).set({ active: true }).where(eq(presets.id, presetId));
  }

  /**
   * Cria o Preset principal (ativo) de quem ainda não tem. Duas chamadas simultâneas esbarram no
   * índice único, e a segunda não faz nada.
   */
  private async ensureMain(db: Db, accountId: string): Promise<void> {
    const [main] = await db
      .select({ id: presets.id })
      .from(presets)
      .where(and(eq(presets.accountId, accountId), eq(presets.main, true)));
    if (main) return;
    await db
      .insert(presets)
      .values({ accountId, name: MAIN_PRESET_NAME, main: true, active: true })
      .onConflictDoNothing();
  }

  /** Serializa as mutações de uma Conta (as mesmas do Inventário). */
  private async lockAccount(tx: Transaction, accountId: string): Promise<void> {
    await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .for('update');
  }

  private async vipOf(accountId: string): Promise<boolean> {
    return (await this.vipPeriods.statusOf(accountId, this.clock())).active;
  }
}

const isReadOnly = (preset: PresetRow, vip: boolean) => !preset.main && !vip;

function toPreset(
  row: PresetRow,
  vip: boolean,
  equippedCount: number,
  highlights: LoadoutAssignment[],
): Preset {
  const readOnly = isReadOnly(row, vip);
  return {
    id: row.id,
    name: row.name,
    main: row.main,
    active: row.active,
    readOnly,
    readOnlyReason: readOnly ? 'vip_inactive' : null,
    equippedCount,
    highlights,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
