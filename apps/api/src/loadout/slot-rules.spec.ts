import { describe, expect, it } from 'vitest';
import type { SlotDefinition } from '../catalog/catalog.js';
import { entriesOf, sidesToApply } from './slot-rules.js';

describe('sidesToApply', () => {
  it('sem lados pedidos, vale todos os lados do Item', () => {
    expect(sidesToApply(['ct', 't'], undefined)).toEqual({ sides: ['ct', 't'] });
    expect(sidesToApply(['t'], undefined)).toEqual({ sides: ['t'] });
  });

  it('aceita os lados pedidos em que o Item existe, sem repetir', () => {
    expect(sidesToApply(['ct', 't'], ['t', 't'])).toEqual({ sides: ['t'] });
  });

  it('recusa um lado em que o Item não existe, apontando qual', () => {
    expect(sidesToApply(['t'], ['t', 'ct'])).toEqual({ field: 'sides.1' });
  });

  it('o music kit não tem lado: os lados pedidos são ignorados', () => {
    expect(sidesToApply(null, ['ct'])).toEqual({ sides: [null] });
  });
});

describe('entriesOf', () => {
  const slots: SlotDefinition[] = [
    { slot: 'knife', side: 'ct', group: 'knife', def: null },
    { slot: 'weapon_ak47', side: 't', group: 'rifle', def: 7 },
    { slot: 'agent', side: 't', group: 'agent', def: null },
    { slot: 'musicKit', side: null, group: 'musicKit', def: null },
  ];
  const uid = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
  const assigned = new Map([
    ['weapon_ak47:t', { uid: uid(1), type: 'weapon', item: { id: 222, statTrak: 0 } }],
    ['agent:t', { uid: uid(2), type: 'agent', item: { id: 8620 } }],
  ]);

  it('lista todos os slots, com o Item equipado ou vazio (Arma padrão)', () => {
    const entries = entriesOf(slots, assigned, { vip: true });

    expect(entries.map((e) => [e.slot, e.side, e.uid])).toEqual([
      ['knife', 'ct', null],
      ['weapon_ak47', 't', uid(1)],
      ['agent', 't', uid(2)],
      ['musicKit', null, null],
    ]);
    expect(entries[1]).toEqual({
      slot: 'weapon_ak47',
      side: 't',
      group: 'rifle',
      def: 7,
      uid: uid(1),
      notInGame: null,
      strippedInGame: [],
    });
  });

  it('sem VIP, diz o que não vai para o jogo', () => {
    const [, ak, agent] = entriesOf(slots, assigned, { vip: false });

    expect(ak?.strippedInGame).toEqual(['statTrak']);
    expect(agent?.notInGame).toBe('vip_inactive');
  });
});
