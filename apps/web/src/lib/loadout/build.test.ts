import type { InventoryItem, Loadout, LoadoutEntry } from '@carmine/contracts';
import { describe, expect, it } from 'vitest';
import { buildCandidates, buildLoadoutView } from './build';

// Ids da @ianlucas/cs2-lib 9.5.0 (fixada no package.json).
const AK_REDLINE = 222;
const KARAMBIT_FADE = 1327;
const FIRST_AGENT = 8620;

const AK_UID = '00000000-0000-4000-8000-000000000001';
const KNIFE_UID = '00000000-0000-4000-8000-000000000002';
const AGENT_UID = '00000000-0000-4000-8000-000000000003';
const GONE_UID = '00000000-0000-4000-8000-000000000009';

const stamp = '2026-10-11T12:00:00.000Z';
const owned = (uid: string, id: number, extra = {}): InventoryItem => ({
  uid,
  item: { id, ...extra },
  createdAt: stamp,
  updatedAt: stamp,
});
const entry = (patch: Partial<LoadoutEntry> & Pick<LoadoutEntry, 'slot'>): LoadoutEntry => ({
  side: 't',
  group: 'rifle',
  def: null,
  uid: null,
  notInGame: null,
  strippedInGame: [],
  ...patch,
});
const loadout = (entries: LoadoutEntry[]): Loadout => ({
  presetId: '00000000-0000-4000-8000-0000000000aa',
  presetName: 'Principal',
  active: true,
  readOnly: false,
  readOnlyReason: null,
  entries,
});

const items = [
  owned(AK_UID, AK_REDLINE, { statTrak: 0, wear: 0.15 }),
  owned(KNIFE_UID, KARAMBIT_FADE),
  owned(AGENT_UID, FIRST_AGENT),
];

describe('Loadout para a tela', () => {
  it('um slot vazio mostra a Arma padrão do lado', () => {
    const view = buildLoadoutView(loadout([entry({ slot: 'weapon_ak47', def: 7 })]), items);
    expect(view.slots[0]).toMatchObject({
      key: 'weapon_ak47:t',
      group: 'rifle',
      defaultName: 'AK-47',
      item: null,
    });
  });

  it('um slot equipado mostra o Item com nome do catálogo', () => {
    const view = buildLoadoutView(
      loadout([entry({ slot: 'weapon_ak47', def: 7, uid: AK_UID })]),
      items,
    );
    expect(view.slots[0]?.item).toMatchObject({
      uid: AK_UID,
      title: 'AK-47',
      subtitle: 'Linhas Vermelhas',
      statTrak: true,
    });
  });

  it('faca, luvas, agente e music kit vão juntos para o alto', () => {
    const view = buildLoadoutView(
      loadout([
        entry({ slot: 'weapon_ak47', def: 7 }),
        entry({ slot: 'knife', group: 'knife', uid: KNIFE_UID }),
        entry({ slot: 'musicKit', side: null, group: 'musicKit' }),
      ]),
      items,
    );
    expect(view.slots.map((slot) => [slot.key, slot.group])).toEqual([
      ['weapon_ak47:t', 'rifle'],
      ['knife:t', 'gear'],
      ['musicKit:all', 'gear'],
    ]);
  });

  it('o aviso de fora do jogo vem do contrato', () => {
    const view = buildLoadoutView(
      loadout([
        entry({ slot: 'agent', group: 'agent', uid: AGENT_UID, notInGame: 'vip_inactive' }),
      ]),
      items,
    );
    expect(view.slots[0]).toMatchObject({ notInGame: 'vip_inactive', item: { uid: AGENT_UID } });
  });

  it('um uid que não está no Inventário aparece com nome genérico, nunca some', () => {
    const view = buildLoadoutView(
      loadout([entry({ slot: 'weapon_ak47', def: 7, uid: GONE_UID })]),
      items,
    );
    expect(view.slots[0]?.item).toMatchObject({ uid: GONE_UID, title: 'Item' });
  });
});

describe('Itens que dá para equipar', () => {
  it('cada Item vem com o slot e os lados possíveis', () => {
    const candidates = buildCandidates(items);
    expect(candidates.map((c) => [c.uid, c.slot, c.sides])).toEqual([
      [AK_UID, 'weapon_ak47', ['t']],
      [KNIFE_UID, 'knife', ['ct', 't']],
      [AGENT_UID, 'agent', ['t']],
    ]);
  });
});
