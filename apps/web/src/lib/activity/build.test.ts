import type { ActivityEvent, RecentActivity } from '@carmine/contracts';
import { describe, expect, it } from 'vitest';
import { ACTIVITY_SHOWN, type ActivityCatalog, buildActivityView } from './build';

const SERVER = {
  id: '0b9b1f2e-0000-4000-8000-000000000001',
  name: 'retake-sp-1',
  showcaseName: 'Retake SP·1',
  code: 'SP·1',
  mode: 'retake' as const,
};

const PLAYER = { private: false, publicId: 10_042, displayName: 'Ana', avatarUrl: null };
const PRIVATE = { private: true, publicId: null, displayName: 'Jogador privado', avatarUrl: null };

let seq = 0;
const base = () => ({
  id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
  at: '2026-10-23T12:00:00.000Z',
});

const joined = (): ActivityEvent => ({ ...base(), type: 'joined', player: PLAYER, server: SERVER });
const activity = (events: ActivityEvent[]): RecentActivity => ({
  events,
  generatedAt: '2026-10-23T12:00:05.000Z',
});

const catalog: ActivityCatalog = {
  skinName: (itemId) => (itemId === 1 ? 'AK-47 | Linhas Vermelhas' : null),
};

describe('buildActivityView', () => {
  it('entrou e multi-kill levam ao cartão do servidor, com o nome de vitrine', () => {
    const view = buildActivityView(
      activity([
        joined(),
        { ...base(), type: 'multi_kill', player: PLAYER, server: SERVER, kills: 4 },
      ]),
      catalog,
    );
    expect(view.items).toMatchObject([
      {
        kind: 'joined',
        player: { name: 'Ana' },
        server: 'Retake SP·1',
        href: `/#servidor-${SERVER.id}`,
      },
      { kind: 'multi_kill', kills: 4, server: 'Retake SP·1', href: `/#servidor-${SERVER.id}` },
    ]);
  });

  it('sem nome de vitrine, usa o nome do servidor', () => {
    const view = buildActivityView(
      activity([{ ...joined(), server: { ...SERVER, showcaseName: null } } as ActivityEvent]),
      catalog,
    );
    expect(view.items[0]).toMatchObject({ server: 'retake-sp-1' });
  });

  it('o novo líder leva ao Ranking do Modo, e o Perfil privado fica como "Jogador privado"', () => {
    const view = buildActivityView(
      activity([{ ...base(), type: 'new_leader', player: PRIVATE, mode: 'deathmatch' }]),
      catalog,
    );
    expect(view.items).toEqual([
      expect.objectContaining({
        kind: 'new_leader',
        player: { name: 'Jogador privado' },
        mode: 'deathmatch',
        href: '/ranking?modo=deathmatch',
      }),
    ]);
  });

  it('a skin equipada leva ao Perfil de quem equipou, com o nome do catálogo', () => {
    const view = buildActivityView(
      activity([{ ...base(), type: 'skin_equipped', player: PLAYER, itemId: 1 }]),
      catalog,
    );
    expect(view.items).toEqual([
      expect.objectContaining({
        kind: 'skin_equipped',
        skin: 'AK-47 | Linhas Vermelhas',
        href: '/10042',
      }),
    ]);
  });

  it('uma skin que o catálogo não conhece não vira acontecimento', () => {
    const view = buildActivityView(
      activity([{ ...base(), type: 'skin_equipped', player: PLAYER, itemId: 99 }, joined()]),
      catalog,
    );
    expect(view.items.map((item) => item.kind)).toEqual(['joined']);
  });

  it('não traz o SteamID nem o id de Conta, só o que se desenha', () => {
    const view = buildActivityView(activity([joined()]), catalog);
    expect(JSON.stringify(view)).not.toMatch(/steam|avatar|publicId|"private"/i);
  });

  it(`mantém a ordem e leva no máximo ${ACTIVITY_SHOWN}`, () => {
    const events = Array.from({ length: 20 }, joined);
    const view = buildActivityView(activity(events), catalog);
    expect(view.items).toHaveLength(ACTIVITY_SHOWN);
    expect(view.items.map((item) => item.id)).toEqual(
      events.slice(0, ACTIVITY_SHOWN).map((e) => e.id),
    );
  });

  it('sem acontecimentos, a faixa vem vazia', () => {
    expect(buildActivityView(activity([]), catalog)).toEqual({ items: [] });
  });
});
