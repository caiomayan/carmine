import type { Cs2Item, InventoryError, InventoryErrorCode } from '@carmine/contracts';

/**
 * O estado do editor de Item (S04) e a conversão de e para o Item do contrato
 * (`CS2BaseInventoryItem`). Roda no navegador, sem a cs2-lib: as faixas de cada skin chegam do
 * servidor em {@link FormSpec}. A validação daqui só antecipa a da API, que é quem decide.
 */

export const MAX_STICKERS = 5;
const WEAR_DECIMALS = 6;
const STICKER_WEAR_DECIMALS = 2;
const ROTATION_STEP = 0.5;
const POSITION_DECIMALS = 4;
/** Mesma regra de nametag da cs2-lib (`CS2_NAMETAG_RE`, MIT): até 20 caracteres, sem espaço nas pontas. */
const NAMETAG_RE = /^(?! )[\u{20}-\u{7e}\u{a0}-\u{10ffff}]{0,19}[\u{21}-\u{7e}\u{a0}-\u{10ffff}]$/u;

type Range = { min: number; max: number };

/** O que o editor sabe do Item do catálogo (subconjunto serializável do `ItemSpec`). */
export type FormSpec = {
  id: number;
  wear: Range | null;
  seed: Range | null;
  statTrak: boolean;
  nameTag: boolean;
  stickerSlots: number;
  charm: { seed: Range } | null;
  /** Agente ou music kit: o Item inteiro exige VIP. */
  vipItem: boolean;
};

/** Nome e imagem de um sticker ou charm, guardados junto para o rascunho voltar completo. */
export type AttachmentLabel = { id: number; name: string; image: string };

export type StickerForm = AttachmentLabel & {
  /** Slot no modelo da arma (0 a slots - 1). */
  schema: number;
  rotation: number;
  wear: number;
  x?: number;
  y?: number;
};

export type CharmForm = AttachmentLabel & { seed: number; x?: number; y?: number; z?: number };

export type ItemForm = {
  wear: number | null;
  seed: number | null;
  statTrak: boolean;
  nameTag: string;
  stickers: StickerForm[];
  charm: CharmForm | null;
};

/**
 * Um problema num campo: `field` segue os caminhos do contrato (`wear`, `stickers.1.schema`),
 * com `charm.*` no lugar de `keychains.0.*` e `item` para o Item inteiro.
 */
export type FormIssue = { field: string; code: InventoryErrorCode; range?: Range };

const round = (value: number, decimals: number) => Number(value.toFixed(decimals));
const roundToStep = (value: number, step: number) => round(Math.round(value / step) * step, 4);

export function emptyForm(spec: FormSpec): ItemForm {
  return {
    wear: spec.wear ? spec.wear.min : null,
    seed: spec.seed ? spec.seed.min : null,
    statTrak: false,
    nameTag: '',
    stickers: [],
    charm: null,
  };
}

/** O primeiro slot do modelo que nenhum sticker ocupa (ou o 0, se todos estão ocupados). */
function freeSchema(stickers: StickerForm[], slots: number): number {
  const used = new Set(stickers.map((sticker) => sticker.schema));
  for (let schema = 0; schema < slots; schema++) if (!used.has(schema)) return schema;
  return 0;
}

export function addSticker(form: ItemForm, spec: FormSpec, label: AttachmentLabel): ItemForm {
  if (form.stickers.length >= MAX_STICKERS || spec.stickerSlots === 0) return form;
  const sticker: StickerForm = {
    ...label,
    schema: freeSchema(form.stickers, spec.stickerSlots),
    rotation: 0,
    wear: 0,
  };
  return { ...form, stickers: [...form.stickers, sticker] };
}

/**
 * O Item no formato do contrato. `previous` é o Item salvo (na edição): a contagem do
 * StatTrak continua a mesma enquanto ele estiver ligado.
 */
export function formToItem(
  spec: FormSpec,
  form: ItemForm,
  previous?: Pick<Cs2Item, 'statTrak'>,
): Cs2Item {
  const item: Cs2Item = { id: spec.id };
  if (spec.wear && form.wear !== null) item.wear = round(form.wear, WEAR_DECIMALS);
  if (spec.seed && form.seed !== null) item.seed = Math.round(form.seed);
  if (spec.statTrak && form.statTrak) item.statTrak = previous?.statTrak ?? 0;
  const nameTag = form.nameTag.trim();
  if (spec.nameTag && nameTag) item.nameTag = nameTag;
  if (spec.stickerSlots > 0 && form.stickers.length > 0) {
    item.stickers = Object.fromEntries(
      form.stickers.slice(0, MAX_STICKERS).map((sticker, index) => {
        const applied: NonNullable<Cs2Item['stickers']>[string] = {
          id: sticker.id,
          schema: sticker.schema,
          rotation: roundToStep(sticker.rotation, ROTATION_STEP),
          wear: round(sticker.wear, STICKER_WEAR_DECIMALS),
        };
        if (sticker.x !== undefined) applied.x = round(sticker.x, POSITION_DECIMALS);
        if (sticker.y !== undefined) applied.y = round(sticker.y, POSITION_DECIMALS);
        return [String(index), applied];
      }),
    );
  }
  if (spec.charm && form.charm) {
    const { id, seed, x, y, z } = form.charm;
    const charm: NonNullable<Cs2Item['keychains']>[string] = { id, seed: Math.round(seed) };
    // A posição vai inteira ou não vai: sem ela, o charm fica no lugar padrão da arma.
    if (x !== undefined && y !== undefined && z !== undefined) {
      charm.x = round(x, POSITION_DECIMALS);
      charm.y = round(y, POSITION_DECIMALS);
      charm.z = round(z, POSITION_DECIMALS);
    }
    item.keychains = { '0': charm };
  }
  return item;
}

const fallbackLabel = (id: number): AttachmentLabel => ({ id, name: `#${id}`, image: '' });

/** O formulário de um Item salvo; `labels` traz nome e imagem dos stickers e do charm. */
export function formFromItem(
  spec: FormSpec,
  item: Cs2Item,
  labels: ReadonlyMap<number, AttachmentLabel>,
): ItemForm {
  const label = (id: number) => labels.get(id) ?? fallbackLabel(id);
  const stickers = Object.entries(item.stickers ?? {})
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([key, sticker]) => ({
      ...label(sticker.id),
      schema: sticker.schema ?? Number(key),
      rotation: sticker.rotation ?? 0,
      wear: sticker.wear ?? 0,
      ...(sticker.x !== undefined ? { x: sticker.x } : {}),
      ...(sticker.y !== undefined ? { y: sticker.y } : {}),
    }));
  const keychain = item.keychains?.['0'];
  return {
    wear: item.wear ?? (spec.wear ? spec.wear.min : null),
    seed: item.seed ?? (spec.seed ? spec.seed.min : null),
    statTrak: item.statTrak !== undefined,
    nameTag: item.nameTag ?? '',
    stickers,
    charm: keychain
      ? {
          ...label(keychain.id),
          seed: keychain.seed ?? 1,
          ...(keychain.x !== undefined ? { x: keychain.x } : {}),
          ...(keychain.y !== undefined ? { y: keychain.y } : {}),
          ...(keychain.z !== undefined ? { z: keychain.z } : {}),
        }
      : null,
  };
}

const inRange = (value: number | null, range: Range) =>
  value !== null && Number.isFinite(value) && value >= range.min && value <= range.max;

/** Antecipa as recusas da API, na ordem dos campos do formulário. */
export function validateForm(
  spec: FormSpec,
  form: ItemForm,
  { vip }: { vip: boolean },
): FormIssue[] {
  if (spec.vipItem && !vip) return [{ field: 'item', code: 'vip_required' }];
  const issues: FormIssue[] = [];
  if (spec.wear && !inRange(form.wear, spec.wear)) {
    issues.push({ field: 'wear', code: 'wear_out_of_range', range: spec.wear });
  }
  if (spec.seed && !(inRange(form.seed, spec.seed) && Number.isInteger(form.seed))) {
    issues.push({ field: 'seed', code: 'seed_out_of_range', range: spec.seed });
  }
  if (spec.statTrak && form.statTrak && !vip) {
    issues.push({ field: 'statTrak', code: 'vip_required' });
  }
  const nameTag = form.nameTag.trim();
  if (spec.nameTag && nameTag) {
    if (!vip) issues.push({ field: 'nameTag', code: 'vip_required' });
    else if (!NAMETAG_RE.test(nameTag)) issues.push({ field: 'nameTag', code: 'invalid_nametag' });
  }
  const seen = new Set<number>();
  form.stickers.forEach((sticker, index) => {
    if (sticker.schema >= spec.stickerSlots || seen.has(sticker.schema)) {
      issues.push({ field: `stickers.${index}.schema`, code: 'invalid_sticker' });
    }
    seen.add(sticker.schema);
  });
  if (spec.charm && form.charm && !inRange(form.charm.seed, spec.charm.seed)) {
    issues.push({ field: 'charm.seed', code: 'invalid_keychain', range: spec.charm.seed });
  }
  return issues;
}

/** O erro do contrato no mesmo formato das recusas do navegador. */
export function issueFromApiError(error: InventoryError): FormIssue {
  const field = error.field?.replace(/^keychains\.\d+/, 'charm') ?? 'item';
  return { field, code: error.code, ...(error.range ? { range: error.range } : {}) };
}
