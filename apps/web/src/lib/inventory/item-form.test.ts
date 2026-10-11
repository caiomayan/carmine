import { describe, expect, it } from 'vitest';
import {
  addSticker,
  emptyForm,
  type FormSpec,
  formFromItem,
  formToItem,
  issueFromApiError,
  MAX_STICKERS,
  validateForm,
} from './item-form';

const AK: FormSpec = {
  id: 222,
  wear: { min: 0.1, max: 0.7 },
  seed: { min: 1, max: 1000 },
  statTrak: true,
  nameTag: true,
  stickerSlots: 4,
  charm: { seed: { min: 1, max: 100_000 } },
  vipItem: false,
};

const AGENT: FormSpec = {
  id: 8620,
  wear: null,
  seed: null,
  statTrak: false,
  nameTag: false,
  stickerSlots: 0,
  charm: null,
  vipItem: true,
};

const sticker = (id: number) => ({ id, name: `Adesivo ${id}`, image: `/s/${id}.webp` });

describe('formulário de um Item novo', () => {
  it('começa no menor float da skin, seed 1 e sem extras', () => {
    expect(emptyForm(AK)).toEqual({
      wear: 0.1,
      seed: 1,
      statTrak: false,
      nameTag: '',
      stickers: [],
      charm: null,
    });
    expect(emptyForm(AGENT)).toMatchObject({ wear: null, seed: null });
  });
});

describe('formulário -> Item do contrato', () => {
  it('monta a AK do aceite: float 0,15, seed 661, StatTrak e 2 stickers', () => {
    let form = { ...emptyForm(AK), wear: 0.15, seed: 661, statTrak: true };
    form = addSticker(form, AK, sticker(5001));
    form = addSticker(form, AK, sticker(5002));
    expect(formToItem(AK, form)).toEqual({
      id: 222,
      wear: 0.15,
      seed: 661,
      statTrak: 0,
      stickers: {
        '0': { id: 5001, schema: 0, rotation: 0, wear: 0 },
        '1': { id: 5002, schema: 1, rotation: 0, wear: 0 },
      },
    });
  });

  it('arredonda o float para 6 casas (o contrato recusa mais)', () => {
    const form = { ...emptyForm(AK), wear: 0.1 + 0.2 };
    expect(formToItem(AK, form).wear).toBe(0.3);
  });

  it('mantém a contagem do StatTrak de um Item que já tinha', () => {
    const form = formFromItem(AK, { id: 222, wear: 0.2, seed: 3, statTrak: 42 }, new Map());
    expect(formToItem(AK, form, { statTrak: 42 }).statTrak).toBe(42);
  });

  it('nametag sem espaços nas pontas; vazia some', () => {
    expect(formToItem(AK, { ...emptyForm(AK), nameTag: '  Velha Guarda ' }).nameTag).toBe(
      'Velha Guarda',
    );
    expect(formToItem(AK, { ...emptyForm(AK), nameTag: '   ' })).not.toHaveProperty('nameTag');
  });

  it('charm só com a chave 0, e a posição só quando escolhida', () => {
    const form = { ...emptyForm(AK), charm: { ...sticker(13113), seed: 77 } };
    expect(formToItem(AK, form).keychains).toEqual({ '0': { id: 13113, seed: 77 } });
    const placed = { ...form, charm: { ...form.charm, x: 1.5, y: 0.3, z: -1 } };
    expect(formToItem(AK, placed).keychains).toEqual({
      '0': { id: 13113, seed: 77, x: 1.5, y: 0.3, z: -1 },
    });
  });

  it('agente não leva float nem seed', () => {
    expect(formToItem(AGENT, emptyForm(AGENT))).toEqual({ id: 8620 });
  });
});

describe('Item do contrato -> formulário (ida e volta)', () => {
  it('recupera os mesmos valores e os nomes dos stickers', () => {
    const item = {
      id: 222,
      wear: 0.15,
      seed: 661,
      statTrak: 0,
      nameTag: 'Velha Guarda',
      stickers: { '0': { id: 5001, schema: 2, rotation: 45, wear: 0.3 } },
      keychains: { '0': { id: 13113, seed: 9 } },
    };
    const names = new Map([
      [5001, sticker(5001)],
      [13113, sticker(13113)],
    ]);
    const form = formFromItem(AK, item, names);
    expect(form.stickers[0]).toMatchObject({ id: 5001, name: 'Adesivo 5001', schema: 2 });
    expect(formToItem(AK, form, item)).toEqual(item);
  });
});

describe('stickers', () => {
  it('cada sticker novo vai para o primeiro slot livre', () => {
    let form = emptyForm(AK);
    form = addSticker(form, AK, sticker(1));
    form = { ...form, stickers: [{ ...form.stickers[0], schema: 0 }] };
    form = addSticker(form, AK, sticker(2));
    expect(form.stickers.map((s) => s.schema)).toEqual([0, 1]);
  });

  it('não passa de 5', () => {
    let form = emptyForm({ ...AK, stickerSlots: 5 });
    for (let i = 0; i < 7; i++) form = addSticker(form, { ...AK, stickerSlots: 5 }, sticker(i + 1));
    expect(form.stickers).toHaveLength(MAX_STICKERS);
  });
});

describe('validação no navegador (a API confere de novo)', () => {
  const ok = { ...emptyForm(AK), wear: 0.15, seed: 661 };

  it('aceita a AK do aceite', () => {
    expect(validateForm(AK, ok, { vip: true })).toEqual([]);
  });

  it('recusa float fora da faixa da skin e seed fora de 1–1000', () => {
    expect(validateForm(AK, { ...ok, wear: 0.05 }, { vip: true })).toEqual([
      { field: 'wear', code: 'wear_out_of_range', range: { min: 0.1, max: 0.7 } },
    ]);
    expect(validateForm(AK, { ...ok, seed: 1001 }, { vip: true })).toEqual([
      { field: 'seed', code: 'seed_out_of_range', range: { min: 1, max: 1000 } },
    ]);
    expect(validateForm(AK, { ...ok, seed: Number.NaN }, { vip: true })[0]?.field).toBe('seed');
  });

  it('StatTrak e nametag sem VIP viram vip_required', () => {
    const issues = validateForm(AK, { ...ok, statTrak: true, nameTag: 'x' }, { vip: false });
    expect(issues).toEqual([
      { field: 'statTrak', code: 'vip_required' },
      { field: 'nameTag', code: 'vip_required' },
    ]);
  });

  it('agente sem VIP não pode ser adicionado', () => {
    expect(validateForm(AGENT, emptyForm(AGENT), { vip: false })).toEqual([
      { field: 'item', code: 'vip_required' },
    ]);
  });

  it('nametag com caractere que o jogo não aceita', () => {
    const issues = validateForm(AK, { ...ok, nameTag: 'a'.repeat(21) }, { vip: true });
    expect(issues).toEqual([{ field: 'nameTag', code: 'invalid_nametag' }]);
  });

  it('dois stickers no mesmo slot', () => {
    let form = addSticker(addSticker(ok, AK, sticker(1)), AK, sticker(2));
    form = { ...form, stickers: form.stickers.map((s) => ({ ...s, schema: 1 })) };
    expect(validateForm(AK, form, { vip: true })).toEqual([
      { field: 'stickers.1.schema', code: 'invalid_sticker' },
    ]);
  });
});

describe('erros da API', () => {
  it('liga o código e o campo do contrato ao campo do formulário', () => {
    expect(
      issueFromApiError({
        statusCode: 422,
        code: 'wear_out_of_range',
        message: 'x',
        field: 'wear',
        range: { min: 0.1, max: 0.7 },
      }),
    ).toEqual({ field: 'wear', code: 'wear_out_of_range', range: { min: 0.1, max: 0.7 } });
    expect(
      issueFromApiError({
        statusCode: 422,
        code: 'invalid_sticker',
        message: 'x',
        field: 'stickers.2.wear',
      }),
    ).toEqual({ field: 'stickers.2.wear', code: 'invalid_sticker' });
  });

  it('erros sem campo ficam no formulário inteiro', () => {
    expect(issueFromApiError({ statusCode: 409, code: 'inventory_full', message: 'x' })).toEqual({
      field: 'item',
      code: 'inventory_full',
    });
  });

  it('o campo keychains.0.* vira o campo do charm', () => {
    expect(
      issueFromApiError({
        statusCode: 422,
        code: 'invalid_keychain',
        message: 'x',
        field: 'keychains.0.seed',
      }),
    ).toEqual({ field: 'charm.seed', code: 'invalid_keychain' });
  });
});
