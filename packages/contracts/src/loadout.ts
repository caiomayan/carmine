import './zod-jitless.js';
import { z } from 'zod';
import { PRESETS_CAPO_LIMIT, PRESETS_PADRINHO_LIMIT } from './plans.js';
import { LOADOUT_SIDES, PRESET_NAME_MAX_LENGTH, PRESETS_FREE_LIMIT } from './rules.js';

/**
 * Contratos do Loadout e dos Presets (S05).
 *
 * O Loadout é o Preset ativo: equipar e desequipar mudam o Preset ativo (ou outro, com
 * `presetId`). Toda Conta tem o Preset principal (`main`), que é o Loadout do plano grátis e
 * nunca fica somente leitura; com um plano ativo, cria até o limite dele no total (Capo 6, Padrinho 25). Sem
 * VIP, os Presets extras ficam somente leitura (nem editar, renomear, ativar ou apagar); se um
 * deles estava ativo, ele continua sendo o Loadout, só que sem os Itens VIP no jogo, até a
 * Conta ativar o principal.
 *
 * Slots ({@link LoadoutSlot}), um por lado (CT, TR):
 * - `weapon_<modelo>` para cada arma (o nome da classe no jogo: `weapon_ak47`,
 *   `weapon_m4a1_silencer`, `weapon_usp_silencer`...), só nos lados em que a arma existe (a AK
 *   só no TR);
 * - `knife`, `gloves` e `agent` (o agente só no lado do time dele);
 * - `musicKit`, sem lado (`side: null`).
 *
 * Um slot sem Item usa a Arma padrão (ou a faca, as luvas e o agente padrão do time).
 */

/** Lado de um slot do Loadout. */
export { LOADOUT_SIDES } from './rules.js';

export const loadoutSideSchema = z.enum(LOADOUT_SIDES).meta({ id: 'LoadoutSide' });

export type LoadoutSide = z.infer<typeof loadoutSideSchema>;

/** Slot de um lado; `null` só no `musicKit`, que vale para os dois. */
export const loadoutSlotSideSchema = loadoutSideSchema.nullable();

export const LOADOUT_SLOT_RE = /^(weapon_[a-z0-9_]+|knife|gloves|agent|musicKit)$/;

export const loadoutSlotSchema = z.string().regex(LOADOUT_SLOT_RE).meta({ id: 'LoadoutSlot' });

export type LoadoutSlot = z.infer<typeof loadoutSlotSchema>;

/** Grupo do slot, para o web agrupar (`loadoutCategory` da cs2-lib nas armas). */
export const LOADOUT_SLOT_GROUPS = [
  'knife',
  'gloves',
  'secondary',
  'smg',
  'rifle',
  'heavy',
  'equipment',
  'agent',
  'musicKit',
] as const;

export type LoadoutSlotGroup = (typeof LOADOUT_SLOT_GROUPS)[number];

export { loadoutSlotOf, type SlotCatalogItem } from './rules.js';

/**
 * Por que um Item equipado não vai (inteiro) para o jogo:
 * - `vip_inactive`: agente ou music kit sem Período VIP ativo;
 * - `plugin_unsupported`: o cs2-css-inventory-simulator não aplica esse Item (hoje, nenhum).
 */
export const NOT_IN_GAME_REASONS = ['vip_inactive', 'plugin_unsupported'] as const;

export type NotInGameReason = (typeof NOT_IN_GAME_REASONS)[number];

/** Atributos que saem do Item no jogo sem Período VIP ativo. */
export const VIP_STRIPPED_ATTRIBUTES = ['statTrak', 'nameTag'] as const;

export type VipStrippedAttribute = (typeof VIP_STRIPPED_ATTRIBUTES)[number];

/**
 * O que, de um Item equipado, vai para o jogo. `type` é o `CS2ItemType` da cs2-lib. É a mesma
 * regra do filtro VIP do `equipped/v5`: sem VIP, agentes e music kits ficam fora e o StatTrak e
 * a nametag saem do Item.
 */
export function inGameOf(
  type: string,
  item: { statTrak?: number | undefined; nameTag?: string | undefined },
  account: { vip: boolean },
): { notInGame: NotInGameReason | null; strippedInGame: VipStrippedAttribute[] } {
  if (account.vip) return { notInGame: null, strippedInGame: [] };
  if (type === 'agent' || type === 'musickit') {
    return { notInGame: 'vip_inactive', strippedInGame: [] };
  }
  const strippedInGame: VipStrippedAttribute[] = [];
  if (item.statTrak !== undefined) strippedInGame.push('statTrak');
  if (item.nameTag !== undefined) strippedInGame.push('nameTag');
  return { notInGame: null, strippedInGame };
}

/**
 * Atributos que o cs2-css-inventory-simulator (sem modificação) não aplica por completo no
 * jogo, para o editor avisar antes de salvar. Hoje, nenhum: float, seed, StatTrak (o contador
 * sobe a cada abate, gravado por `POST /api/increment-item-stattrak`), nametag, stickers
 * (posição, rotação, desgaste), charm, faca, luvas, agente por time e music kit são aplicados.
 * A lista fica para o que uma versão nova do plugin ou do jogo deixar de aplicar.
 *
 * Observação sem aviso: se duas armas visíveis no servidor tiverem a mesma pintura, o mesmo seed
 * e o float igual até a 3ª casa, mas stickers diferentes, o plugin desloca o float de uma delas
 * em passos de 0,001 (limitação do cache de materiais do CS2).
 */
export const GAME_LIMITATIONS = [] as const satisfies readonly string[];

export type GameLimitation = (typeof GAME_LIMITATIONS)[number];

/** Limitações do jogo para este Item (vazio se tudo é aplicado). Ver {@link GAME_LIMITATIONS}. */
export function gameLimitationsOf(
  _type: string,
  _item: { statTrak?: number | undefined },
): { code: GameLimitation; field: string }[] {
  return [];
}

/** Um slot de um lado, e o Item que está nele (`uid` nulo = Arma padrão). */
export const loadoutAssignmentSchema = z
  .object({
    slot: loadoutSlotSchema,
    side: loadoutSlotSideSchema,
    uid: z.uuid().nullable(),
  })
  .meta({ id: 'LoadoutAssignment' });

export type LoadoutAssignment = z.infer<typeof loadoutAssignmentSchema>;

/** Um slot do Loadout com o que está nele e o que disso vai para o jogo. */
export const loadoutEntrySchema = z
  .object({
    slot: loadoutSlotSchema,
    side: loadoutSlotSideSchema,
    group: z.enum(LOADOUT_SLOT_GROUPS),
    /** `definitionIndex` da arma (só nos slots `weapon_*`), o mesmo do `equipped/v5`. */
    def: z.int().nullable(),
    /** Item do Inventário equipado; nulo = Arma padrão. */
    uid: z.uuid().nullable(),
    /** O Item equipado não vai para o jogo, e por quê; nulo se vai (ou se o slot está vazio). */
    notInGame: z.enum(NOT_IN_GAME_REASONS).nullable(),
    /** Atributos do Item equipado que não vão para o jogo (sem VIP). */
    strippedInGame: z.array(z.enum(VIP_STRIPPED_ATTRIBUTES)),
  })
  .meta({ id: 'LoadoutEntry' });

export type LoadoutEntry = z.infer<typeof loadoutEntrySchema>;

/** Por que um Preset é somente leitura. */
export const PRESET_READ_ONLY_REASONS = ['vip_inactive'] as const;

/**
 * `GET /api/loadout` (o Preset ativo) ou `GET /api/loadout?presetId=<id>`: todos os slots que
 * existem, na ordem dos grupos, com ou sem Item.
 */
export const loadoutSchema = z
  .object({
    presetId: z.uuid(),
    presetName: z.string(),
    /** É o Preset ativo (o que vai para o jogo). */
    active: z.boolean(),
    readOnly: z.boolean(),
    readOnlyReason: z.enum(PRESET_READ_ONLY_REASONS).nullable(),
    entries: z.array(loadoutEntrySchema),
  })
  .meta({ id: 'Loadout' });

export type Loadout = z.infer<typeof loadoutSchema>;

const targetPreset = {
  /** Preset a mudar; ausente = o ativo (o Loadout). */
  presetId: z.uuid().optional(),
};

/**
 * `POST /api/loadout/equip`: equipa o Item no slot dele, nos lados pedidos (ausente = todos os
 * lados em que o Item existe; ignorado no music kit). O que estava lá é substituído.
 */
export const equipInputSchema = z
  .object({
    uid: z.uuid(),
    sides: z.array(loadoutSideSchema).min(1).max(2).optional(),
    ...targetPreset,
  })
  .meta({ id: 'EquipInput' });

export type EquipInput = z.infer<typeof equipInputSchema>;

/** `POST /api/loadout/unequip`: o slot volta à Arma padrão nos lados pedidos (ausente = todos). */
export const unequipInputSchema = z
  .object({
    slot: loadoutSlotSchema,
    sides: z.array(loadoutSideSchema).min(1).max(2).optional(),
    ...targetPreset,
  })
  .meta({ id: 'UnequipInput' });

export type UnequipInput = z.infer<typeof unequipInputSchema>;

/**
 * `POST /api/loadout/assign`: define exatamente estes slots (`uid` nulo = Arma padrão), de uma
 * vez. É o "Desfazer" de um equip/unequip: mande o `previous` da resposta.
 */
export const assignInputSchema = z
  .object({
    assignments: z.array(loadoutAssignmentSchema).min(1).max(100),
    ...targetPreset,
  })
  .meta({ id: 'AssignInput' });

export type AssignInput = z.infer<typeof assignInputSchema>;

/** Resposta de equip, unequip e assign: o Loadout depois e os slots mudados como eram antes. */
export const loadoutChangeSchema = z
  .object({
    loadout: loadoutSchema,
    /** Só os slots que mudaram, com o que tinham antes; vazio se nada mudou. */
    previous: z.array(loadoutAssignmentSchema),
  })
  .meta({ id: 'LoadoutChange' });

export type LoadoutChange = z.infer<typeof loadoutChangeSchema>;

export { PRESET_NAME_MAX_LENGTH, PRESETS_FREE_LIMIT, PRESETS_VIP_LIMIT } from './rules.js';

/** Nome do Preset principal de toda Conta. */
export const MAIN_PRESET_NAME = 'Principal';

export const presetNameSchema = z.string().trim().min(1).max(PRESET_NAME_MAX_LENGTH);

/**
 * Os slots que aparecem na frente da carta do Preset (a mão de cartas do /loadout): faca, luvas e
 * o rifle de cada lado (AK-47 no TR; no CT, a M4A1-S se equipada, senão a M4A4).
 */
export const PRESET_HIGHLIGHT_SLOTS = [
  'knife',
  'gloves',
  'weapon_ak47',
  'weapon_m4a1_silencer',
  'weapon_m4a1',
] as const;

export const presetSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    /** O Preset principal: sempre existe, nunca é apagado nem fica somente leitura. */
    main: z.boolean(),
    /** É o Loadout atual (o que vai para o jogo). */
    active: z.boolean(),
    readOnly: z.boolean(),
    readOnlyReason: z.enum(PRESET_READ_ONLY_REASONS).nullable(),
    /** Slots com Item. */
    equippedCount: z.int().min(0),
    /**
     * O que a carta do Preset mostra na frente: os Itens equipados em {@link PRESET_HIGHLIGHT_SLOTS},
     * por lado. Só slots com Item (vazio = arma padrão); o web resolve nome e imagem pelo Inventário.
     */
    highlights: z.array(loadoutAssignmentSchema),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .meta({ id: 'Preset' });

export type Preset = z.infer<typeof presetSchema>;

/** `GET /api/presets`: o principal primeiro, depois os outros do mais antigo ao mais novo. */
export const presetListSchema = z
  .object({
    presets: z.array(presetSchema).min(1).max(PRESETS_PADRINHO_LIMIT),
    /** Quantos Presets a Conta pode ter agora (1 sem VIP, 20 com VIP). */
    limit: z.union([
      z.literal(PRESETS_FREE_LIMIT),
      z.literal(PRESETS_CAPO_LIMIT),
      z.literal(PRESETS_PADRINHO_LIMIT),
    ]),
  })
  .meta({ id: 'PresetList' });

export type PresetList = z.infer<typeof presetListSchema>;

/**
 * `POST /api/presets` (exige VIP): cria um Preset, cópia do Loadout atual (`from: 'current'`,
 * o padrão) ou vazio. Não ativa.
 */
export const createPresetInputSchema = z
  .object({
    name: presetNameSchema,
    from: z.enum(['current', 'empty']).default('current'),
  })
  .meta({ id: 'CreatePresetInput' });

export type CreatePresetInput = z.input<typeof createPresetInputSchema>;

/** `PATCH /api/presets/{id}`: renomeia. */
export const renamePresetInputSchema = z
  .object({ name: presetNameSchema })
  .meta({ id: 'RenamePresetInput' });

export type RenamePresetInput = z.infer<typeof renamePresetInputSchema>;

/**
 * Códigos estáveis dos erros do Loadout e dos Presets. O HTTP de cada um está em
 * {@link LOADOUT_ERROR_STATUS}.
 */
export const LOADOUT_ERROR_CODES = [
  /** O corpo não está no formato do contrato. */
  'invalid_body',
  /** Nenhum Item com esse `uid` no Inventário desta Conta. */
  'item_not_found',
  /** Nenhum Preset com esse id nesta Conta. */
  'preset_not_found',
  /** Slot que não existe (`field`), ou um Item num slot que não é o dele. */
  'invalid_slot',
  /** O Item (ou o slot) não existe nesse lado: a AK no CT, um agente TR no CT (`field`). */
  'side_not_allowed',
  /**
   * Criar um Preset sem Período VIP ativo. Equipar um Item VIP sem VIP é permitido: ele fica no
   * Loadout com `notInGame`/`strippedInGame` e volta ao jogo na renovação.
   */
  'vip_required',
  /** Preset extra sem Período VIP ativo: não muda, não ativa, não é apagado. */
  'preset_read_only',
  /** O Preset principal não é apagado. */
  'preset_main',
  /** Já há tantos Presets quanto o plano permite (Capo 6, Padrinho 25). */
  'preset_limit',
] as const;

export type LoadoutErrorCode = (typeof LOADOUT_ERROR_CODES)[number];

export const LOADOUT_ERROR_STATUS = {
  invalid_body: 400,
  item_not_found: 404,
  preset_not_found: 404,
  invalid_slot: 422,
  side_not_allowed: 422,
  vip_required: 403,
  preset_read_only: 403,
  preset_main: 409,
  preset_limit: 409,
} as const satisfies Record<LoadoutErrorCode, number>;

export const loadoutErrorSchema = z
  .object({
    statusCode: z.int(),
    code: z.enum(LOADOUT_ERROR_CODES),
    message: z.string(),
    /** Caminho do campo com problema, ex.: `sides.0`, `assignments.2.uid`. */
    field: z.string().optional(),
  })
  .meta({ id: 'LoadoutError' });

export type LoadoutError = z.infer<typeof loadoutErrorSchema>;
