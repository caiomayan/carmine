import type { Page } from '@playwright/test';
import type { Route } from 'next';
import type { HeaderView } from '../src/lib/header-previews/view';

/** Os destinos dos painéis são rotas do site: as fixtures os escrevem como o servidor os monta. */
const route = (href: string) => href as Route;

/** Dados de mentira para os painéis do header: o E2E não depende da API nem do catálogo. */

export const SERVER_ID = '0b9f8c1e-7a4d-4e2b-9c3a-5d6e7f809102';
export const OTHER_ID = '1c0a9d2f-8b5e-4f3c-8d4b-6e7f8a901213';
export const UID_KNIFE = '2b1d3c4e-5f60-4a7b-8c9d-0e1f2a3b4c5d';
export const UID_RIFLE = '3c2e4d5f-6a71-4b8c-9d0e-1f2a3b4c5d6e';
const IMAGE = '/icon1.png';

const server = (over: Partial<HeaderView['play']['others'][number]> = {}) => ({
  id: SERVER_ID,
  href: route(`/#servidor-${SERVER_ID}`),
  name: 'Retake · Rotação',
  mode: 'retake' as const,
  map: 'de_mirage',
  players: 7,
  maxPlayers: 9,
  state: 'online' as const,
  address: '203.0.113.10:27015',
  ...over,
});

/** Quem entrou: servidor onde há amigos, Loadout, Inventário e a posição no Ranking. */
export const SIGNED_IN: HeaderView = {
  signedIn: true,
  play: {
    recommended: {
      ...server(),
      reason: 'friends',
      friends: [
        { key: '10016', name: 'coldzera', avatarUrl: null, href: route('/10016') },
        { key: '10017', name: 'Aurélio', avatarUrl: null, href: route('/10017') },
      ],
    },
    others: [
      server({
        id: OTHER_ID,
        href: route(`/#servidor-${OTHER_ID}`),
        name: 'Deathmatch · FFA',
        mode: 'deathmatch',
        map: 'de_dust2',
        players: 9,
        state: 'full',
      }),
      server({
        id: '5d4f6e7a-8b92-4c0d-8e1f-2a3b4c5d6e7f',
        href: route('/#servidor-5d4f6e7a'),
        name: 'Retake · Treino',
        map: 'de_inferno',
        players: 2,
      }),
    ],
    friendsPlaying: 2,
  },
  loadout: {
    side: 'ct',
    presetName: 'Principal',
    slots: [
      {
        slot: 'knife',
        equipped: true,
        title: 'Fade',
        caption: 'Karambit',
        image: IMAGE,
        href: route(`/inventory/${UID_KNIFE}`),
        statTrak: false,
      },
      {
        slot: 'gloves',
        equipped: false,
        title: null,
        caption: null,
        image: null,
        href: route('/loadout'),
        statTrak: false,
      },
      {
        slot: 'weapon_m4a1_silencer',
        equipped: true,
        title: 'Cadeia de Caracteres',
        caption: 'M4A1-S',
        image: IMAGE,
        href: route(`/inventory/${UID_RIFLE}`),
        statTrak: true,
      },
      {
        slot: 'weapon_awp',
        equipped: false,
        title: 'AWP',
        caption: null,
        image: IMAGE,
        href: route('/loadout'),
        statTrak: false,
      },
    ],
  },
  example: null,
  inventory: {
    total: 12,
    limit: 200,
    latest: [
      {
        key: UID_RIFLE,
        title: 'Cadeia de Caracteres',
        caption: 'M4A1-S',
        image: IMAGE,
        href: route(`/inventory/${UID_RIFLE}`),
        statTrak: true,
      },
      {
        key: UID_KNIFE,
        title: 'Fade',
        caption: 'Karambit',
        image: IMAGE,
        href: route(`/inventory/${UID_KNIFE}`),
        statTrak: false,
      },
    ],
  },
  ranking: {
    // Daqui a 3 dias e meio: a contagem mostra dias e horas.
    closesAt: new Date(Date.now() + 3.5 * 86_400_000).toISOString(),
    modes: [
      {
        mode: 'retake',
        href: route('/ranking?modo=retake'),
        top: [
          { position: 1, name: 'coldzera', avatarUrl: null, href: route('/10016'), self: false },
          { position: 2, name: 'Jogador privado', avatarUrl: null, href: null, self: false },
          { position: 3, name: 'Eu mesmo', avatarUrl: null, href: route('/10020'), self: true },
        ],
        mine: { position: 3, progress: null, href: route('/ranking?modo=retake#minha-linha') },
      },
      {
        mode: 'deathmatch',
        href: route('/ranking?modo=deathmatch'),
        top: [],
        mine: {
          position: null,
          progress: { unit: 'minutes', missing: 12 },
          href: route('/ranking?modo=deathmatch'),
        },
      },
    ],
  },
};

/** Visitante: o mais cheio, o Loadout de exemplo, o convite do Inventário e o top 3. */
export const SIGNED_OUT: HeaderView = {
  ...SIGNED_IN,
  signedIn: false,
  play: {
    recommended: { ...server(), reason: 'fullest', friends: [] },
    others: SIGNED_IN.play.others,
    friendsPlaying: null,
  },
  loadout: null,
  example: {
    side: 't',
    presetName: '',
    slots: (SIGNED_IN.loadout?.slots ?? []).map((slot) => ({ ...slot, href: route('/loadout') })),
  },
  inventory: null,
  ranking: SIGNED_IN.ranking && {
    ...SIGNED_IN.ranking,
    modes: SIGNED_IN.ranking.modes.map((mode) => ({ ...mode, mine: null })),
  },
};

/** Intercepta a rota das prévias do web; devolve quantas vezes ela foi chamada. */
export async function routePreviews(
  page: Page,
  view: HeaderView = SIGNED_IN,
  { status = 200, delayMs = 0 }: { status?: number; delayMs?: number } = {},
) {
  const calls: string[] = [];
  await page.route('**/header/previews**', async (route) => {
    calls.push(route.request().url());
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    if (status !== 200) return route.fulfill({ status, json: { error: 'unavailable' } });
    return route.fulfill({ status: 200, json: view });
  });
  return calls;
}
