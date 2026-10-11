import { z } from 'zod';

/**
 * Contratos do Inventário (S04). O Item vai no formato `CS2BaseInventoryItem` da
 * `@ianlucas/cs2-lib` (ADR 0006), só com os atributos que a plataforma simula: o mesmo JSON
 * serve ao viewer 3D, à validação da API e, na S05, à conversão para o `equipped/v5`.
 *
 * O schema só checa o formato. As regras que dependem do catálogo (o Item existe, faixa de float
 * da skin, onde cabe StatTrak, nametag, stickers e charm, VIP, limite) são da API e voltam como
 * {@link InventoryError} com um {@link InventoryErrorCode} estável.
 */

/** Itens por Conta. Os removidos (à espera do Desfazer) não contam. */
export const INVENTORY_MAX_ITEMS = 300;

/**
 * Por quanto tempo depois de remover dá para restaurar o Item (`POST .../restore`). O web
 * oferece "Desfazer" por 8 s; a folga cobre a latência e um clique no último instante.
 */
export const INVENTORY_RESTORE_WINDOW_SECONDS = 30;

/**
 * Tipos da cs2-lib (`CS2ItemType`) que são Itens: skin de arma, faca, luvas, agente e music
 * kit. Sticker e Charm não são Itens; só existem aplicados numa skin de arma. Dentro desses
 * tipos, as Armas padrão (`isDefault`) e as luvas base também não são Itens.
 */
export const INVENTORY_ITEM_TYPES = ['weapon', 'melee', 'glove', 'agent', 'musickit'] as const;

export type InventoryItemType = (typeof INVENTORY_ITEM_TYPES)[number];

const MAX_WEAR_DECIMALS = 6;

/**
 * Casas decimais da representação do número, como a cs2-lib conta (`0.1 + 0.2` tem 17): o web
 * deve arredondar antes de mandar, ex.: `Number(wear.toFixed(6))`.
 */
function countDecimals(value: number): number {
  const [mantissa = '', exponent] = value.toString().split('e');
  const decimals = mantissa.split('.')[1]?.length ?? 0;
  return exponent === undefined ? decimals : Math.max(0, decimals - Number(exponent));
}

const hasAtMostDecimals = (value: number, decimals: number) =>
  Number.isFinite(value) && countDecimals(value) <= decimals;

/** Chave de um mapa de stickers ou charms: um índice inteiro em texto ("0", "1", ...). */
const indexKey = z.string().regex(/^\d{1,2}$/);

/**
 * Sticker aplicado. A chave do mapa é a ordem (0 a 4); `schema` é o slot no modelo da arma
 * (de 0 à quantidade de slots da arma - 1; ausente, vale a ordem).
 */
export const appliedStickerSchema = z
  .strictObject({
    /** Id do sticker no catálogo da cs2-lib. */
    id: z.int().positive(),
    schema: z.int().min(0).optional(),
    /** Desgaste do sticker, de 0 a 1, em passos de 0,01 (validado pela API). */
    wear: z.number().min(0).max(1).optional(),
    /** Graus, de -180 a 180, em passos de 0,5 (validado pela API). */
    rotation: z.number().min(-180).max(180).optional(),
    /** Deslocamento no slot; os limites dependem da arma (validado pela API). */
    x: z.number().optional(),
    y: z.number().optional(),
  })
  .meta({ id: 'AppliedSticker' });

/** Charm (`keychain`) aplicado. Só existe a chave "0". Posição: limites dependem da arma. */
export const appliedCharmSchema = z
  .strictObject({
    /** Id do charm no catálogo da cs2-lib. */
    id: z.int().positive(),
    /** Padrão do charm, de 1 a 100.000. */
    seed: z.int().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    z: z.number().optional(),
  })
  .meta({ id: 'AppliedCharm' });

/**
 * Um Item no formato `CS2BaseInventoryItem` da cs2-lib, só com os atributos simulados. Campos
 * do Loadout (`equipped*`) ficam fora: equipar é da S05 e não é atributo do Item.
 */
export const cs2ItemSchema = z
  .strictObject({
    /** Id do Item no catálogo da cs2-lib (não é o def/paint da Valve). Não muda numa edição. */
    id: z.int().positive(),
    /** Float (desgaste), até 6 casas decimais, dentro da faixa da skin. */
    wear: z
      .number()
      .min(0)
      .max(1)
      .refine((wear) => hasAtMostDecimals(wear, MAX_WEAR_DECIMALS), {
        message: `até ${MAX_WEAR_DECIMALS} casas decimais`,
      })
      .optional(),
    /** Seed (padrão), de 1 a 1000. */
    seed: z.int().optional(),
    /** Presente = StatTrak; o valor é a contagem (começa em 0). Exige VIP. */
    statTrak: z.int().min(0).max(999_999).optional(),
    /** Nametag, até 20 caracteres (regra da cs2-lib, validada pela API). Exige VIP. */
    nameTag: z.string().min(1).max(64).optional(),
    /** Até 5 stickers, só em skins de arma. */
    stickers: z.record(indexKey, appliedStickerSchema).optional(),
    /** Até 1 charm, só em skins de arma. */
    keychains: z.record(indexKey, appliedCharmSchema).optional(),
  })
  .meta({ id: 'CS2BaseInventoryItem' });

export type Cs2Item = z.infer<typeof cs2ItemSchema>;

/** Um Item do Inventário. `uid` é estável: Loadout e Presets (S05) o referenciam. */
export const inventoryItemSchema = z
  .object({
    uid: z.uuid(),
    item: cs2ItemSchema,
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .meta({ id: 'InventoryItem' });

export type InventoryItem = z.infer<typeof inventoryItemSchema>;

/** `GET /api/inventory`: os Itens da Conta da sessão, do mais novo para o mais antigo. */
export const inventorySchema = z
  .object({
    items: z.array(inventoryItemSchema).max(INVENTORY_MAX_ITEMS),
    limit: z.literal(INVENTORY_MAX_ITEMS),
  })
  .meta({ id: 'Inventory' });

export type Inventory = z.infer<typeof inventorySchema>;

/**
 * Corpo de `POST /api/inventory/items` (adicionar) e de `PUT /api/inventory/items/{uid}`
 * (editar). A edição substitui todos os atributos: o que não vier é removido. O `id` do
 * catálogo não muda numa edição (`item_id_immutable`).
 */
export const inventoryItemInputSchema = z
  .object({ item: cs2ItemSchema })
  .meta({ id: 'InventoryItemInput' });

export type InventoryItemInput = z.infer<typeof inventoryItemInputSchema>;

/** Lado de um slot do Loadout. */
export const loadoutSideSchema = z.enum(['ct', 't']).meta({ id: 'LoadoutSide' });

export type LoadoutSide = z.infer<typeof loadoutSideSchema>;

/**
 * `GET /api/inventory/items/{uid}/usages`: onde o Item está em uso. Sempre vazio na S04;
 * a S05 preenche (o formato de `slot` será fechado lá).
 */
export const itemUsagesSchema = z
  .object({
    loadout: z.array(z.object({ slot: z.string(), side: loadoutSideSchema })),
    presets: z.array(z.object({ id: z.uuid(), name: z.string() })),
  })
  .meta({ id: 'ItemUsages' });

export type ItemUsages = z.infer<typeof itemUsagesSchema>;

/**
 * `DELETE /api/inventory/items/{uid}`: o Item sai do Inventário (e, na S05, dos slots e
 * Presets, que voltam à Arma padrão). Até `restorableUntil`, `POST .../restore` o devolve com o
 * mesmo `uid` e nos mesmos lugares.
 */
export const removedInventoryItemSchema = z
  .object({
    uid: z.uuid(),
    /** Onde o Item estava em uso antes de remover. */
    usages: itemUsagesSchema,
    restorableUntil: z.iso.datetime({ offset: true }),
  })
  .meta({ id: 'RemovedInventoryItem' });

export type RemovedInventoryItem = z.infer<typeof removedInventoryItemSchema>;

/**
 * Códigos estáveis dos erros do Inventário, para o web escolher a mensagem. O HTTP de cada um
 * está em {@link INVENTORY_ERROR_STATUS}.
 */
export const INVENTORY_ERROR_CODES = [
  /** O corpo não está no formato do contrato (campo desconhecido, tipo errado...). */
  'invalid_body',
  /** O `id` não existe no catálogo, ou é de algo que não é Item (sticker, charm, caixa...). */
  'invalid_item',
  /** O `id` é de uma Arma padrão (ou luva base): não é um Item. */
  'default_weapon',
  /** O float está fora da faixa da skin (`range`). */
  'wear_out_of_range',
  /** O seed está fora da faixa (`range`). */
  'seed_out_of_range',
  /** Atributo que esse Item não tem (`field`): float ou seed em agente, music kit, faca vanilla... */
  'attribute_not_allowed',
  /** StatTrak num Item que não aceita StatTrak (luvas, agentes). */
  'stattrak_not_allowed',
  /** Nametag num Item que não aceita nametag (luvas, agentes, music kits). */
  'nametag_not_allowed',
  /** Nametag com caracteres ou tamanho que o jogo não aceita (até 20 caracteres). */
  'invalid_nametag',
  /** Stickers num Item que não é skin de arma. */
  'stickers_not_allowed',
  /** Mais de 5 stickers. */
  'too_many_stickers',
  /** Sticker inexistente, ou com slot, desgaste, rotação ou posição inválidos (`field`). */
  'invalid_sticker',
  /** Charm num Item que não é skin de arma. */
  'keychains_not_allowed',
  /** Mais de 1 charm. */
  'too_many_keychains',
  /** Charm inexistente, ou com seed ou posição inválidos (`field`). */
  'invalid_keychain',
  /** A edição tentou trocar o `id` do catálogo; remova e adicione outro Item. */
  'item_id_immutable',
  /** Agente, music kit, StatTrak ou nametag sem Período VIP ativo (`field`). */
  'vip_required',
  /** O Inventário já tem {@link INVENTORY_MAX_ITEMS} Itens. */
  'inventory_full',
  /** Nenhum Item com esse `uid` no Inventário desta Conta. */
  'not_found',
  /** A janela do Desfazer ({@link INVENTORY_RESTORE_WINDOW_SECONDS} s) já passou. */
  'restore_expired',
] as const;

export type InventoryErrorCode = (typeof INVENTORY_ERROR_CODES)[number];

export const INVENTORY_ERROR_STATUS = {
  invalid_body: 400,
  invalid_item: 422,
  default_weapon: 422,
  wear_out_of_range: 422,
  seed_out_of_range: 422,
  attribute_not_allowed: 422,
  stattrak_not_allowed: 422,
  nametag_not_allowed: 422,
  invalid_nametag: 422,
  stickers_not_allowed: 422,
  too_many_stickers: 422,
  invalid_sticker: 422,
  keychains_not_allowed: 422,
  too_many_keychains: 422,
  invalid_keychain: 422,
  item_id_immutable: 422,
  vip_required: 403,
  inventory_full: 409,
  not_found: 404,
  restore_expired: 410,
} as const satisfies Record<InventoryErrorCode, number>;

/** Corpo de todo erro do Inventário. */
export const inventoryErrorSchema = z
  .object({
    statusCode: z.int(),
    code: z.enum(INVENTORY_ERROR_CODES),
    /** Texto para log e depuração; o web mostra a própria mensagem a partir de `code`. */
    message: z.string(),
    /** Caminho do atributo com problema, ex.: `wear`, `stickers.2.rotation`, `keychains.0.seed`. */
    field: z.string().optional(),
    /** Faixa aceita, em `wear_out_of_range` e `seed_out_of_range`. */
    range: z.object({ min: z.number(), max: z.number() }).optional(),
  })
  .meta({ id: 'InventoryError' });

export type InventoryError = z.infer<typeof inventoryErrorSchema>;
