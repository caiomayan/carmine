import {
  LOADOUT_SIDES,
  LOADOUT_SLOT_GROUPS,
  type LoadoutSide,
  type LoadoutSlot,
  type LoadoutSlotGroup,
  loadoutSlotOf,
} from '@carmine/contracts';
import { CS2_ITEMS, CS2EconomyInstance, type CS2EconomyItem } from '@ianlucas/cs2-lib';

/** Um slot de um lado, como existe no jogo. `side` nulo só no music kit. */
export interface SlotDefinition {
  slot: LoadoutSlot;
  side: LoadoutSide | null;
  group: LoadoutSlotGroup;
  /** `definitionIndex` da arma nos slots `weapon_*`; nulo nos outros. */
  def: number | null;
}

const WEAPON_GROUPS: ReadonlySet<string> = new Set([
  'secondary',
  'smg',
  'rifle',
  'heavy',
  'equipment',
]);

const bothSides = (slot: LoadoutSlot, group: LoadoutSlotGroup): SlotDefinition[] =>
  LOADOUT_SIDES.map((side) => ({ slot, side, group, def: null }));

/**
 * O catálogo da cs2-lib (ADR 0006), carregado uma vez por processo: o que é cada Item e onde ele
 * é equipado. Compartilhado pelas regras do Inventário, pelo Loadout e pelo `equipped/v5`.
 */
export class Catalog {
  readonly economy = new CS2EconomyInstance();
  private slotList: SlotDefinition[] | undefined;

  constructor() {
    this.economy.load({ items: CS2_ITEMS });
  }

  /** O Item do catálogo, ou `undefined` se o id não existe. */
  find(id: number): CS2EconomyItem | undefined {
    return this.economy.items.has(id) ? this.economy.getById(id) : undefined;
  }

  /** Onde o Item é equipado e em que lados; `null` se não existe ou não se equipa. */
  slotOf(id: number): { slot: LoadoutSlot; sides: LoadoutSide[] | null } | null {
    const item = this.find(id);
    return item ? loadoutSlotOf(item) : null;
  }

  /**
   * Todos os slots do Loadout, um por lado, na ordem dos grupos ({@link LOADOUT_SLOT_GROUPS});
   * dentro de um grupo, as armas na ordem do `definitionIndex`. Só armas que têm skin.
   */
  slots(): readonly SlotDefinition[] {
    this.slotList ??= this.buildSlots();
    return this.slotList;
  }

  private buildSlots(): SlotDefinition[] {
    const all = [...this.economy.items.values()];
    const skinned = new Set(
      all.filter((item) => item.type === 'weapon' && !item.isDefault).map((item) => item.modelKey),
    );
    const weapons = all
      .filter((item) => item.type === 'weapon' && item.isDefault && skinned.has(item.modelKey))
      .filter((item) => WEAPON_GROUPS.has(item.loadoutCategory ?? ''))
      .sort((a, b) => (a.definitionIndex ?? 0) - (b.definitionIndex ?? 0));
    const weaponSlots = (group: LoadoutSlotGroup) =>
      weapons
        .filter((weapon) => weapon.loadoutCategory === group)
        .flatMap((weapon) => {
          const { slot, sides } = loadoutSlotOf(weapon) ?? { slot: '', sides: [] };
          return (sides ?? []).map((side) => ({
            slot,
            side,
            group,
            def: weapon.definitionIndex ?? null,
          }));
        });
    return LOADOUT_SLOT_GROUPS.flatMap((group): SlotDefinition[] => {
      switch (group) {
        case 'knife':
        case 'gloves':
        case 'agent':
          return bothSides(group, group);
        case 'musicKit':
          return [{ slot: 'musicKit', side: null, group, def: null }];
        default:
          return weaponSlots(group);
      }
    });
  }
}
