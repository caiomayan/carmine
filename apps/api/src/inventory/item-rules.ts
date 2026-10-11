import {
  type Cs2Item,
  INVENTORY_ITEM_TYPES,
  type InventoryErrorCode,
  type VipFeature,
  vipFeaturesOf,
} from '@carmine/contracts';
import {
  CS2_INVENTORY_RULES,
  CS2_ITEMS,
  CS2_MAX_KEYCHAINS,
  CS2_MAX_STICKERS,
  CS2_NAMETAG_RE,
  CS2EconomyInstance,
  type CS2EconomyItem,
  checkAddable,
  checkAttachable,
  checkInventoryItem,
} from '@ianlucas/cs2-lib';

const ITEM_TYPES: ReadonlySet<string> = new Set(INVENTORY_ITEM_TYPES);

/** Por que um Item foi recusado, no formato do erro do contrato. */
export interface ItemRuleViolation {
  code: InventoryErrorCode;
  message: string;
  field?: string;
  range?: { min: number; max: number };
}

/**
 * O Item como é guardado: mapas de stickers e charms vazios valem como ausentes (a cs2-lib
 * recusa um mapa, mesmo vazio, num Item que não leva stickers).
 */
export function normalizeItem({ stickers, keychains, ...item }: Cs2Item): Cs2Item {
  return {
    ...item,
    ...(stickers && Object.keys(stickers).length > 0 && { stickers }),
    ...(keychains && Object.keys(keychains).length > 0 && { keychains }),
  };
}

/**
 * As regras do jogo para um Item do Inventário, a partir do catálogo da cs2-lib (ADR 0006).
 */
export class ItemRules {
  private readonly economy = new CS2EconomyInstance();

  constructor() {
    this.economy.load({ items: CS2_ITEMS });
  }

  /**
   * A primeira regra que o Item quebra, ou `null` se ele pode estar no Inventário da Conta.
   * Primeiro o que o jogo não permite; só depois o que o plano grátis não cobre (`vip_required`).
   */
  check(item: Cs2Item, account: { vip: boolean }): ItemRuleViolation | null {
    if (!this.economy.items.has(item.id)) {
      return { code: 'invalid_item', field: 'id', message: 'Item fora do catálogo' };
    }
    const catalogItem = this.economy.getById(item.id);
    if (!ITEM_TYPES.has(catalogItem.type)) {
      return { code: 'invalid_item', field: 'id', message: `${catalogItem.type} não é um Item` };
    }
    // Luvas sem skin não existem no jogo: para quem joga, são as luvas padrão.
    if (catalogItem.isDefault === true || !checkAddable(catalogItem)) {
      return { code: 'default_weapon', field: 'id', message: 'Arma padrão não é um Item' };
    }
    return (
      checkWear(item, catalogItem) ??
      checkSeed(item, catalogItem) ??
      checkStatTrak(item, catalogItem) ??
      checkNameTag(item, catalogItem) ??
      this.checkStickers(item, catalogItem) ??
      this.checkKeychains(item, catalogItem) ??
      this.checkWithCs2Lib(normalizeItem(item)) ??
      (account.vip ? null : checkFreePlan(item, catalogItem))
    );
  }

  /**
   * Rede de segurança: a validação da própria cs2-lib, caso uma versão nova dela passe a
   * recusar algo que as regras acima ainda aceitam.
   */
  private checkWithCs2Lib(item: Cs2Item): ItemRuleViolation | null {
    if (checkInventoryItem(this.economy, item)) return null;
    return { code: 'invalid_item', message: 'Item recusado pela validação da cs2-lib' };
  }

  /** Um sticker ou charm do catálogo que pode ser aplicado (não é o "padrão" de nada). */
  private attachable(id: number, is: (item: CS2EconomyItem) => boolean): boolean {
    if (!this.economy.items.has(id)) return false;
    const attachment = this.economy.getById(id);
    return is(attachment) && checkAttachable(attachment);
  }

  private checkStickers({ stickers }: Cs2Item, weapon: CS2EconomyItem): ItemRuleViolation | null {
    const entries = Object.entries(stickers ?? {});
    if (entries.length === 0) return null;
    if (!weapon.hasStickers()) {
      return {
        code: 'stickers_not_allowed',
        field: 'stickers',
        message: 'Só skins de arma levam stickers',
      };
    }
    if (entries.length > CS2_MAX_STICKERS) {
      return { code: 'too_many_stickers', field: 'stickers', message: 'No máximo 5 stickers' };
    }
    const invalid = (field: string): ItemRuleViolation => ({
      code: 'invalid_sticker',
      field,
      message: `Sticker inválido (${field})`,
    });
    const usedSlots = new Set<number>();
    for (const [key, sticker] of entries) {
      const order = Number(key);
      if (order >= CS2_MAX_STICKERS) return invalid(`stickers.${key}`);
      const at = (attribute: string) => invalid(`stickers.${key}.${attribute}`);
      if (!this.attachable(sticker.id, (item) => item.isSticker())) return at('id');
      // Sem `schema`, o sticker vai no slot da sua posição na ordem (como na cs2-lib).
      const slot = sticker.schema ?? order;
      if (!CS2_INVENTORY_RULES.stickerSchema.check(slot, weapon) || usedSlots.has(slot)) {
        return at('schema');
      }
      usedSlots.add(slot);
      for (const attribute of ['wear', 'rotation', 'x', 'y'] as const) {
        const rule = STICKER_RULES[attribute];
        if (!CS2_INVENTORY_RULES[rule].check(sticker[attribute], weapon)) return at(attribute);
      }
    }
    return null;
  }

  private checkKeychains({ keychains }: Cs2Item, weapon: CS2EconomyItem): ItemRuleViolation | null {
    const entries = Object.entries(keychains ?? {});
    if (entries.length === 0) return null;
    if (!weapon.hasKeychains()) {
      return {
        code: 'keychains_not_allowed',
        field: 'keychains',
        message: 'Só skins de arma levam charm',
      };
    }
    if (entries.length > CS2_MAX_KEYCHAINS) {
      return { code: 'too_many_keychains', field: 'keychains', message: 'No máximo 1 charm' };
    }
    const invalid = (field: string): ItemRuleViolation => ({
      code: 'invalid_keychain',
      field,
      message: `Charm inválido (${field})`,
    });
    for (const [key, charm] of entries) {
      if (key !== '0') return invalid(`keychains.${key}`);
      if (!this.attachable(charm.id, (item) => item.isKeychain())) return invalid('keychains.0.id');
      for (const attribute of ['seed', 'x', 'y', 'z'] as const) {
        const rule = KEYCHAIN_RULES[attribute];
        if (!CS2_INVENTORY_RULES[rule].check(charm[attribute], weapon)) {
          return invalid(`keychains.0.${attribute}`);
        }
      }
    }
    return null;
  }
}

const KEYCHAIN_RULES = {
  seed: 'keychainSeed',
  x: 'keychainPositionX',
  y: 'keychainPositionY',
  z: 'keychainPositionZ',
} as const;

const STICKER_RULES = {
  wear: 'stickerWear',
  rotation: 'stickerRotation',
  x: 'stickerX',
  y: 'stickerY',
} as const;

const VIP_FIELDS: Record<VipFeature, string> = {
  agent: 'id',
  musicKit: 'id',
  statTrak: 'statTrak',
  nameTag: 'nameTag',
};

function checkFreePlan(item: Cs2Item, catalogItem: CS2EconomyItem): ItemRuleViolation | null {
  const [feature] = vipFeaturesOf(catalogItem.type, item);
  if (feature === undefined) return null;
  return { code: 'vip_required', field: VIP_FIELDS[feature], message: `${feature} exige VIP` };
}

function checkStatTrak(
  { statTrak }: Cs2Item,
  catalogItem: CS2EconomyItem,
): ItemRuleViolation | null {
  if (statTrak === undefined || catalogItem.hasStatTrak()) return null;
  return { code: 'stattrak_not_allowed', field: 'statTrak', message: 'Este Item não tem StatTrak' };
}

function checkNameTag({ nameTag }: Cs2Item, catalogItem: CS2EconomyItem): ItemRuleViolation | null {
  if (nameTag === undefined) return null;
  if (!catalogItem.hasNameTag()) {
    return { code: 'nametag_not_allowed', field: 'nameTag', message: 'Este Item não tem nametag' };
  }
  if (!CS2_NAMETAG_RE.test(nameTag)) {
    return { code: 'invalid_nametag', field: 'nameTag', message: 'Nametag que o jogo não aceita' };
  }
  return null;
}

const notAllowed = (field: string): ItemRuleViolation => ({
  code: 'attribute_not_allowed',
  field,
  message: `Este Item não tem ${field}`,
});

function checkWear({ wear }: Cs2Item, catalogItem: CS2EconomyItem): ItemRuleViolation | null {
  if (wear === undefined) return null;
  if (!catalogItem.hasWear()) return notAllowed('wear');
  // O contrato já garante as 6 casas decimais; a faixa é a da skin.
  const range = { min: catalogItem.getMinimumWear(), max: catalogItem.getMaximumWear() };
  if (wear < range.min || wear > range.max) {
    return { code: 'wear_out_of_range', field: 'wear', range, message: 'Float fora da faixa' };
  }
  return null;
}

function checkSeed({ seed }: Cs2Item, catalogItem: CS2EconomyItem): ItemRuleViolation | null {
  if (seed === undefined) return null;
  if (!catalogItem.hasSeed()) return notAllowed('seed');
  const range = { min: catalogItem.getMinimumSeed(), max: catalogItem.getMaximumSeed() };
  if (seed < range.min || seed > range.max) {
    return { code: 'seed_out_of_range', field: 'seed', range, message: 'Seed fora da faixa' };
  }
  return null;
}
