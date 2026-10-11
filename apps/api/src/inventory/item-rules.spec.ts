import type { Cs2Item } from '@carmine/contracts';
import { describe, expect, it } from 'vitest';
import { ItemRules } from './item-rules.js';

/** Ids do catálogo da cs2-lib 9.5.0 usados nos testes. */
const CATALOG = {
  // AK-47 | Redline: float de 0,10 a 0,70; 4 slots de sticker, x de -0,3869 a 0,6456 e
  // y de -0,0357 a 0,2192; charm em x de -11,5196 a 25,0893, y de -0,0439 a 0,999 e z de
  // -2,9334 a 4,3025.
  akRedline: 222,
  defaultAk: 4, // AK-47 (Arma padrão)
  defaultKnife: 35, // faca CT padrão
  defaultGloves: 58, // luvas TR padrão
  defaultMusicKit: 1779,
  baseGloves: 56, // Broken Fang Gloves sem skin (não existe no jogo)
  vanillaBayonet: 37, // ★ Bayonet sem skin (existe no jogo)
  gloves: 1707, // Broken Fang Gloves | Jade
  agent: 8620, // Agent | Ground Rebel | Elite Crew
  musicKit: 1780, // Daniel Sadowski, Crimson Assault
  sticker: 1847, // Sticker | Shooter
  charm: 13113, // Charm | Lil' Ava
  graffiti: 9543,
  case: 9129,
};

const rules = new ItemRules();
const free = { vip: false };
const vip = { vip: true };

const redline = (attributes: Partial<Cs2Item> = {}): Cs2Item => ({
  id: CATALOG.akRedline,
  ...attributes,
});

describe('ItemRules', () => {
  it('aceita a AK do aceite: float 0,15, seed 661, StatTrak e 2 stickers', () => {
    const item = redline({
      wear: 0.15,
      seed: 661,
      statTrak: 0,
      stickers: { '0': { id: CATALOG.sticker }, '1': { id: CATALOG.sticker, wear: 0.3 } },
    });

    expect(rules.check(item, vip)).toBeNull();
  });

  it('recusa um id fora do catálogo', () => {
    expect(rules.check({ id: 999_999 }, vip)).toMatchObject({ code: 'invalid_item', field: 'id' });
  });

  it.each([
    ['sticker solto', CATALOG.sticker],
    ['charm solto', CATALOG.charm],
    ['grafite', CATALOG.graffiti],
    ['caixa', CATALOG.case],
  ])('recusa %s: não é um Item', (_, id) => {
    expect(rules.check({ id }, vip)).toMatchObject({ code: 'invalid_item', field: 'id' });
  });

  it.each([
    ['AK-47 padrão', CATALOG.defaultAk],
    ['faca padrão', CATALOG.defaultKnife],
    ['luvas padrão', CATALOG.defaultGloves],
    ['music kit padrão', CATALOG.defaultMusicKit],
    ['luvas sem skin', CATALOG.baseGloves],
  ])('recusa a %s: Arma padrão não é Item', (_, id) => {
    expect(rules.check({ id }, vip)).toMatchObject({ code: 'default_weapon', field: 'id' });
  });

  it('aceita uma faca vanilla, que existe no jogo', () => {
    expect(rules.check({ id: CATALOG.vanillaBayonet }, free)).toBeNull();
  });

  describe('float', () => {
    it.each([0.1, 0.15, 0.7])('aceita %s, dentro da faixa da Redline', (wear) => {
      expect(rules.check(redline({ wear }), free)).toBeNull();
    });

    it.each([0.05, 0.700001, 1])('recusa %s, fora da faixa da Redline (0,10 a 0,70)', (wear) => {
      expect(rules.check(redline({ wear }), free)).toEqual({
        code: 'wear_out_of_range',
        field: 'wear',
        message: expect.any(String),
        range: { min: 0.1, max: 0.7 },
      });
    });

    it.each([
      ['faca vanilla', CATALOG.vanillaBayonet],
      ['agente', CATALOG.agent],
    ])('recusa float em %s, que não tem desgaste', (_, id) => {
      expect(rules.check({ id, wear: 0.2 }, vip)).toMatchObject({
        code: 'attribute_not_allowed',
        field: 'wear',
      });
    });
  });

  describe('seed', () => {
    it.each([1, 661, 1000])('aceita %s', (seed) => {
      expect(rules.check(redline({ seed }), free)).toBeNull();
    });

    it.each([0, 1001])('recusa %s, fora de 1 a 1000', (seed) => {
      expect(rules.check(redline({ seed }), free)).toEqual({
        code: 'seed_out_of_range',
        field: 'seed',
        message: expect.any(String),
        range: { min: 1, max: 1000 },
      });
    });

    it('recusa seed num music kit', () => {
      expect(rules.check({ id: CATALOG.musicKit, seed: 10 }, vip)).toMatchObject({
        code: 'attribute_not_allowed',
        field: 'seed',
      });
    });
  });

  describe('StatTrak e nametag', () => {
    it.each([
      ['luvas', CATALOG.gloves],
      ['agente', CATALOG.agent],
    ])('recusa StatTrak em %s', (_, id) => {
      expect(rules.check({ id, statTrak: 0 }, vip)).toMatchObject({
        code: 'stattrak_not_allowed',
        field: 'statTrak',
      });
    });

    it('aceita StatTrak em faca e music kit', () => {
      expect(rules.check({ id: CATALOG.vanillaBayonet, statTrak: 10 }, vip)).toBeNull();
      expect(rules.check({ id: CATALOG.musicKit, statTrak: 0 }, vip)).toBeNull();
    });

    it.each([
      ['luvas', CATALOG.gloves],
      ['music kit', CATALOG.musicKit],
    ])('recusa nametag em %s', (_, id) => {
      expect(rules.check({ id, nameTag: 'Carmine' }, vip)).toMatchObject({
        code: 'nametag_not_allowed',
        field: 'nameTag',
      });
    });

    it.each([
      ['espaço no começo', ' Carmine'],
      ['espaço no fim', 'Carmine '],
      ['mais de 20 caracteres', 'a'.repeat(21)],
      ['caractere de controle', 'Carmine'],
    ])('recusa nametag com %s', (_, nameTag) => {
      expect(rules.check(redline({ nameTag }), vip)).toMatchObject({
        code: 'invalid_nametag',
        field: 'nameTag',
      });
    });

    it('nametag aceita acentos e vai até 20 caracteres', () => {
      expect(rules.check(redline({ nameTag: 'Pão de Queijo Mineiro' }), vip)).toMatchObject({
        code: 'invalid_nametag',
      });
      expect(rules.check(redline({ nameTag: 'Pão de Queijo Minas' }), vip)).toBeNull();
    });
  });

  describe('VIP', () => {
    it.each([
      ['agentes', { id: CATALOG.agent }, 'id'],
      ['music kits', { id: CATALOG.musicKit }, 'id'],
      ['StatTrak', redline({ statTrak: 0 }), 'statTrak'],
      ['nametag', redline({ nameTag: 'Carmine' }), 'nameTag'],
    ])('sem Período VIP ativo, recusa %s', (_, item, field) => {
      expect(rules.check(item, free)).toMatchObject({ code: 'vip_required', field });
      expect(rules.check(item, vip)).toBeNull();
    });

    it('um atributo que o Item não aceita é recusado antes de pedir VIP', () => {
      expect(rules.check({ id: CATALOG.gloves, statTrak: 0 }, free)).toMatchObject({
        code: 'stattrak_not_allowed',
      });
    });

    it('skins de arma, facas e luvas sem StatTrak nem nametag são do plano grátis', () => {
      expect(rules.check(redline({ wear: 0.2, seed: 1 }), free)).toBeNull();
      expect(rules.check({ id: CATALOG.vanillaBayonet }, free)).toBeNull();
      expect(rules.check({ id: CATALOG.gloves, wear: 0.3, seed: 5 }, free)).toBeNull();
    });
  });

  describe('stickers', () => {
    const sticker = { id: CATALOG.sticker };

    it('aceita até 4 stickers na AK, com slot, desgaste, rotação e posição', () => {
      const stickers = {
        '0': { ...sticker, schema: 3, wear: 0.15, rotation: -90.5, x: 0.6456, y: -0.0357 },
        '1': { ...sticker, schema: 0, wear: 1, rotation: 180, x: -0.3869, y: 0.2192 },
        // Sem slot, vai no da sua posição na ordem (2).
        '2': sticker,
        '3': { ...sticker, schema: 1 },
      };

      expect(rules.check(redline({ stickers }), free)).toBeNull();
    });

    it('um mapa vazio vale como sem stickers', () => {
      expect(rules.check({ id: CATALOG.vanillaBayonet, stickers: {} }, free)).toBeNull();
    });

    it.each([
      ['faca', CATALOG.vanillaBayonet],
      ['luvas', CATALOG.gloves],
    ])('recusa stickers em %s', (_, id) => {
      expect(rules.check({ id, stickers: { '0': sticker } }, free)).toMatchObject({
        code: 'stickers_not_allowed',
        field: 'stickers',
      });
    });

    it('recusa mais de 5 stickers', () => {
      const stickers = Object.fromEntries([0, 1, 2, 3, 4, 5].map((i) => [String(i), sticker]));

      expect(rules.check(redline({ stickers }), free)).toMatchObject({
        code: 'too_many_stickers',
        field: 'stickers',
      });
    });

    it.each([
      ['posição na ordem além da 5ª', { '5': sticker }, 'stickers.5'],
      ['id fora do catálogo', { '0': { id: 999_999 } }, 'stickers.0.id'],
      ['id que não é sticker', { '0': { id: CATALOG.charm } }, 'stickers.0.id'],
      ['slot que a AK não tem', { '0': { ...sticker, schema: 4 } }, 'stickers.0.schema'],
      [
        'dois stickers no mesmo slot',
        { '0': { ...sticker, schema: 1 }, '1': { ...sticker, schema: 1 } },
        'stickers.1.schema',
      ],
      ['desgaste fora do passo de 0,01', { '0': { ...sticker, wear: 0.155 } }, 'stickers.0.wear'],
      [
        'rotação fora do passo de 0,5',
        { '0': { ...sticker, rotation: 12.3 } },
        'stickers.0.rotation',
      ],
      ['x fora da arma', { '0': { ...sticker, x: 0.7 } }, 'stickers.0.x'],
      ['y fora da arma', { '0': { ...sticker, y: -0.1 } }, 'stickers.0.y'],
      ['x com mais de 4 casas', { '0': { ...sticker, x: 0.12345 } }, 'stickers.0.x'],
    ])('recusa sticker com %s', (_, stickers, field) => {
      expect(rules.check(redline({ stickers }), free)).toMatchObject({
        code: 'invalid_sticker',
        field,
      });
    });
  });

  describe('charm', () => {
    const charm = { id: CATALOG.charm };

    it('aceita 1 charm na AK, com seed e posição', () => {
      const keychains = { '0': { ...charm, seed: 100_000, x: 25.0893, y: -0.0439, z: 4.3025 } };

      expect(rules.check(redline({ keychains }), free)).toBeNull();
    });

    it('recusa charm em faca', () => {
      expect(
        rules.check({ id: CATALOG.vanillaBayonet, keychains: { '0': charm } }, free),
      ).toMatchObject({ code: 'keychains_not_allowed', field: 'keychains' });
    });

    it('recusa mais de 1 charm', () => {
      expect(rules.check(redline({ keychains: { '0': charm, '1': charm } }), free)).toMatchObject({
        code: 'too_many_keychains',
        field: 'keychains',
      });
    });

    it.each([
      ['chave diferente de 0', { '1': charm }, 'keychains.1'],
      ['id que não é charm', { '0': { id: CATALOG.sticker } }, 'keychains.0.id'],
      ['seed 0', { '0': { ...charm, seed: 0 } }, 'keychains.0.seed'],
      ['seed acima de 100.000', { '0': { ...charm, seed: 100_001 } }, 'keychains.0.seed'],
      ['x fora da arma', { '0': { ...charm, x: 26 } }, 'keychains.0.x'],
      ['y fora da arma', { '0': { ...charm, y: 1 } }, 'keychains.0.y'],
      ['z fora da arma', { '0': { ...charm, z: -3 } }, 'keychains.0.z'],
    ])('recusa charm com %s', (_, keychains, field) => {
      expect(rules.check(redline({ keychains }), free)).toMatchObject({
        code: 'invalid_keychain',
        field,
      });
    });
  });
});
