import type { LiveServer } from '@carmine/contracts';
import type { Match, Roster, RosterPlayer, ServerExtras, Side, Today, TodayMap } from './types';

/**
 * Os estados da página do servidor com dados de exemplo (nomes fictícios), para a vitrine de dev
 * (`/dev/servidor`, só com CARMINE_UI_GALLERY=1) e os testes: a API ainda não entrega os blocos da S12b, então é
 * aqui que a página "pronta" aparece. Nada daqui vai para produção.
 */

export type ScenarioKey =
  | 'cheio'
  | 'vazio'
  | 'offline'
  | 'warmup'
  | 'deathmatch'
  | 'coletando'
  | 'antigo'
  | 'nunca';

export type Scenario = {
  key: ScenarioKey;
  label: string;
  server: LiveServer;
  extras: ServerExtras;
};

const base: LiveServer = {
  id: '5a0e9c3e-1d2b-4c47-9a55-3b7a2f0c8d11',
  name: 'retake-1',
  showcaseName: 'Retake · Rotação',
  code: null,
  mode: 'retake',
  address: '203.0.113.5:27015',
  region: 'sao-paulo',
  map: 'de_mirage',
  players: 9,
  maxPlayers: 9,
  state: 'full',
  lastHeartbeatAt: '2026-10-26T21:07:00.000Z',
  lastMap: 'de_mirage',
};

const player = (
  id: string,
  name: string | null,
  publicId: number | null,
  team: Side | null,
  kills: number,
  deaths: number,
  score: number,
): RosterPlayer => ({ id, name, avatarUrl: null, publicId, team, kills, deaths, score });

/** Os nove do Retake lotado (5 CT, 4 TR; dois com Perfil privado). */
export const FULL_ROSTER: RosterPlayer[] = [
  player('rafa', 'Rafa Tavares', 1042, 'ct', 14, 6, 31),
  player('bia', 'Bia Montenegro', 2208, 'ct', 11, 8, 25),
  player('lipe', 'Lipe Duarte', 3317, 'ct', 9, 9, 21),
  player('priv1', null, null, 'ct', 7, 10, 17),
  player('cami', 'Camila Reis', 4120, 'ct', 5, 11, 12),
  player('juca', 'Juca', 1876, 't', 13, 7, 28),
  player('thiago', 'Thiago Nobre', 2954, 't', 10, 9, 22),
  player('mari', 'Mari Alencar', 5301, 't', 8, 10, 19),
  player('priv2', null, null, 't', 6, 12, 14),
];

const WARMUP_ROSTER: RosterPlayer[] = [
  player('rafa', 'Rafa Tavares', 1042, 'ct', 0, 0, 0),
  player('bia', 'Bia Montenegro', 2208, 'ct', 0, 0, 0),
  player('priv1', null, null, 'ct', 0, 0, 0),
  player('juca', 'Juca', 1876, 't', 0, 0, 0),
  player('thiago', 'Thiago Nobre', 2954, 't', 0, 0, 0),
  player('mari', 'Mari Alencar', 5301, 't', 0, 0, 0),
];

/** Os 12 do Deathmatch (sem lado; dois com Perfil privado). */
export const DM_ROSTER: RosterPlayer[] = [
  player('duda', 'Duda Falcão', 1311, null, 31, 9, 36),
  player('leo', 'Léo Prado', 2640, null, 28, 12, 33),
  player('nina', 'Nina Castro', 3875, null, 24, 11, 28),
  player('priv1', null, null, null, 22, 15, 25),
  player('gabi', 'Gabi Moura', 4402, null, 19, 14, 22),
  player('heitor', 'Heitor', 5108, null, 18, 17, 21),
  player('lucia', 'Lúcia Brandt', 6023, null, 16, 15, 18),
  player('pedro', 'Pedro Zanin', 2217, null, 14, 18, 16),
  player('alice', 'Alice Rangel', 7380, null, 12, 16, 14),
  player('priv2', null, null, null, 11, 20, 12),
  player('vini', 'Vini', 8159, null, 9, 19, 10),
  player('samuel', 'Samuel Teles', 9246, null, 6, 22, 7),
];

const MAPS_ENDED: TodayMap[] = [
  { map: 'de_anubis', from: '16:30', to: '17:45', rounds: 40, ctWins: 21, tWins: 19 },
  { map: 'de_overpass', from: '17:45', to: '18:20', rounds: 21, ctWins: 10, tWins: 11 },
  { map: 'de_dust2', from: '18:20', to: '19:12', rounds: 31, ctWins: 15, tWins: 16 },
  { map: 'de_nuke', from: '19:12', to: '19:52', rounds: 27, ctWins: 14, tWins: 13 },
  { map: 'de_inferno', from: '19:52', to: '20:41', rounds: 33, ctWins: 18, tWins: 15 },
];

const HOURS = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 14, 34, 32, 38, 30, 18, 0, 0];

const todayLive: Today = {
  date: '2026-10-26',
  clock: '21:07',
  rounds: { played: 166, ctWins: 86, tWins: 80 },
  maps: [
    ...MAPS_ENDED,
    { map: 'de_mirage', from: '20:41', to: null, rounds: 14, ctWins: 8, tWins: 6 },
  ],
  hours: HOURS,
  hoursMetric: 'rounds',
  peakPlayers: { at: '20:12', count: 9 },
  uniquePlayers: 31,
  since: '2026-10-24T03:00:00.000Z',
};

const todayEnded: Today = {
  ...todayLive,
  maps: [
    ...MAPS_ENDED,
    { map: 'de_mirage', from: '20:41', to: '20:58', rounds: 14, ctWins: 8, tWins: 6 },
  ],
};

/** Aquecimento do Inferno: o Mirage acabou às 21:04 e o mapa novo ainda não tem round. */
const todayWarmup: Today = {
  ...todayLive,
  rounds: { played: 172, ctWins: 89, tWins: 83 },
  maps: [
    ...MAPS_ENDED,
    { map: 'de_mirage', from: '20:41', to: '21:04', rounds: 20, ctWins: 11, tWins: 9 },
    { map: 'de_inferno', from: '21:04', to: null, rounds: 0, ctWins: 0, tWins: 0 },
  ],
  hours: HOURS.map((rounds, hour) => (hour === 21 ? 24 : rounds)),
};

/** O Deathmatch não tem rounds por lado: os mapas vêm das Sessões e o gráfico mostra jogadores por hora. */
const todayDm: Today = {
  date: '2026-10-26',
  clock: '21:07',
  rounds: null,
  maps: [
    { map: 'de_anubis', from: '18:20', to: '18:50', rounds: null, ctWins: null, tWins: null },
    { map: 'de_overpass', from: '18:50', to: '19:20', rounds: null, ctWins: null, tWins: null },
    { map: 'de_nuke', from: '19:20', to: '19:48', rounds: null, ctWins: null, tWins: null },
    { map: 'de_inferno', from: '19:48', to: '20:15', rounds: null, ctWins: null, tWins: null },
    { map: 'de_mirage', from: '20:15', to: '20:44', rounds: null, ctWins: null, tWins: null },
    { map: 'de_dust2', from: '20:44', to: null, rounds: null, ctWins: null, tWins: null },
  ],
  hours: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, 14, 16, 12, 0, 0],
  hoursMetric: 'players',
  peakPlayers: { at: '21:02', count: 16 },
  uniquePlayers: 44,
  since: '2026-10-24T03:00:00.000Z',
};

/** Servidor com plugin antigo: o histórico existe, mas sem rounds, pico nem jogadores diferentes. */
const todayOld: Today = {
  ...todayDm,
  maps: todayLive.maps.map((row) => ({ ...row, rounds: null, ctWins: null, tWins: null })),
  hours: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 8, 9, 9, 9, 7, 0, 0],
  peakPlayers: null,
  uniquePlayers: null,
};

const ready = <T>(data: T) => ({ status: 'ready', data }) as const;
const collecting: ServerExtras = {
  match: { status: 'collecting', since: '2026-10-28T03:00:00.000Z' },
  roster: { status: 'collecting', since: '2026-10-28T03:00:00.000Z' },
  today: { status: 'collecting', since: '2026-10-28T03:00:00.000Z' },
};

export const SCENARIOS: Record<ScenarioKey, Scenario> = {
  cheio: {
    key: 'cheio',
    label: 'Ao vivo, cheio',
    server: base,
    extras: {
      match: ready<Match | null>({ round: 15, ctScore: 8, tScore: 6, warmup: false }),
      roster: ready<Roster>({ players: FULL_ROSTER, scoreboard: true }),
      today: ready(todayLive),
    },
  },
  vazio: {
    key: 'vazio',
    label: 'Ao vivo, vazio',
    server: { ...base, players: 0, state: 'online' },
    extras: {
      match: ready<Match | null>(null),
      roster: ready<Roster>({ players: [], scoreboard: true }),
      today: ready(todayEnded),
    },
  },
  offline: {
    key: 'offline',
    label: 'Offline',
    server: {
      ...base,
      map: null,
      players: 0,
      state: 'offline',
      lastHeartbeatAt: '2026-10-26T20:42:00.000Z',
    },
    extras: {
      match: ready<Match | null>(null),
      roster: ready<Roster>({ players: [], scoreboard: true }),
      today: ready(todayEnded),
    },
  },
  warmup: {
    key: 'warmup',
    label: 'Esquentando',
    server: { ...base, map: 'de_inferno', lastMap: 'de_inferno', players: 6, state: 'online' },
    extras: {
      match: ready<Match | null>({ round: 0, ctScore: 0, tScore: 0, warmup: true }),
      roster: ready<Roster>({ players: WARMUP_ROSTER, scoreboard: true }),
      today: ready(todayWarmup),
    },
  },
  deathmatch: {
    key: 'deathmatch',
    label: 'Deathmatch',
    server: {
      ...base,
      id: '9c41b7f2-6e0a-4d3c-8b1f-2a7d5e3c9f40',
      name: 'dm-1',
      showcaseName: 'Deathmatch · Rotação',
      mode: 'deathmatch',
      address: '203.0.113.12:27015',
      map: 'de_dust2',
      lastMap: 'de_dust2',
      players: 12,
      maxPlayers: 16,
      state: 'online',
    },
    // Todos contra todos: sem placar de times; quem manda é a lista por pontos.
    extras: {
      match: ready<Match | null>(null),
      roster: ready<Roster>({ players: DM_ROSTER, scoreboard: true }),
      today: ready(todayDm),
    },
  },
  coletando: {
    key: 'coletando',
    label: 'Coletando (hoje)',
    server: base,
    extras: collecting,
  },
  antigo: {
    key: 'antigo',
    label: 'Plugin antigo',
    server: base,
    // Sem `match` (coletando) e sem placar por jogador: só os nomes; o histórico sem rounds.
    extras: {
      match: { status: 'collecting', since: null },
      roster: ready<Roster>({
        players: FULL_ROSTER.map((row) => ({ ...row, team: null, kills: 0, deaths: 0, score: 0 })),
        scoreboard: false,
      }),
      today: ready(todayOld),
    },
  },
  nunca: {
    key: 'nunca',
    label: 'Nunca online',
    server: {
      ...base,
      map: null,
      lastMap: null,
      players: 0,
      state: 'offline',
      lastHeartbeatAt: null,
    },
    extras: {
      match: { status: 'collecting', since: null },
      roster: { status: 'collecting', since: null },
      today: { status: 'collecting', since: null },
    },
  },
};

export const SCENARIO_KEYS = Object.keys(SCENARIOS) as ScenarioKey[];

export function isScenarioKey(value: string | undefined): value is ScenarioKey {
  return value !== undefined && value in SCENARIOS;
}

/* ---------- a simulação de rounds (só para ver o placar mudar) ---------- */

/** Cada round do Retake: quem ganhou e quem abateu quem. Em laço, para a demonstração não acabar. */
const SCRIPT: { winner: Side; kills: [string, string][] }[] = [
  {
    winner: 'ct',
    kills: [
      ['rafa', 'juca'],
      ['bia', 'thiago'],
      ['rafa', 'mari'],
    ],
  },
  {
    winner: 't',
    kills: [
      ['thiago', 'lipe'],
      ['juca', 'priv1'],
      ['mari', 'cami'],
      ['juca', 'bia'],
    ],
  },
  {
    winner: 't',
    kills: [
      ['juca', 'rafa'],
      ['priv2', 'cami'],
      ['juca', 'lipe'],
    ],
  },
  {
    winner: 'ct',
    kills: [
      ['lipe', 'priv2'],
      ['priv1', 'thiago'],
      ['cami', 'mari'],
    ],
  },
  {
    winner: 'ct',
    kills: [
      ['bia', 'juca'],
      ['rafa', 'thiago'],
      ['bia', 'priv2'],
    ],
  },
  {
    winner: 't',
    kills: [
      ['mari', 'bia'],
      ['thiago', 'priv1'],
      ['mari', 'lipe'],
      ['juca', 'cami'],
    ],
  },
];

/** Os abates do Deathmatch a cada passo: quem abateu quem (o líder muda no meio do laço). */
const DM_SCRIPT: [string, string][][] = [
  [
    ['leo', 'duda'],
    ['leo', 'samuel'],
    ['nina', 'vini'],
  ],
  [
    ['leo', 'pedro'],
    ['leo', 'alice'],
    ['gabi', 'priv2'],
  ],
  [
    ['leo', 'nina'],
    ['duda', 'leo'],
    ['heitor', 'samuel'],
  ],
  [
    ['duda', 'gabi'],
    ['duda', 'lucia'],
    ['priv1', 'vini'],
  ],
  [
    ['leo', 'duda'],
    ['leo', 'heitor'],
    ['leo', 'priv1'],
  ],
  [
    ['duda', 'leo'],
    ['nina', 'pedro'],
    ['duda', 'alice'],
  ],
];

export type SimState = { match: Match | null; players: RosterPlayer[]; step: number };

/** O próximo passo do roteiro: no Retake um round (placar, round e jogadores); no Deathmatch só os abates. */
export function advance(state: SimState): SimState {
  const players = state.players.map((row) => ({ ...row }));
  const apply = (kills: [string, string][]) => {
    for (const [killer, victim] of kills) {
      const k = players.find((row) => row.id === killer);
      const v = players.find((row) => row.id === victim);
      if (k) {
        k.kills += 1;
        k.score += 2;
      }
      if (v) v.deaths += 1;
    }
  };

  if (state.match === null) {
    const kills = DM_SCRIPT[state.step % DM_SCRIPT.length];
    if (!kills) return state;
    apply(kills);
    return { ...state, step: state.step + 1, players };
  }

  const round = SCRIPT[state.step % SCRIPT.length];
  if (!round) return state;
  apply(round.kills);
  return {
    step: state.step + 1,
    players,
    match: {
      warmup: false,
      round: state.match.round + 1,
      ctScore: state.match.ctScore + (round.winner === 'ct' ? 1 : 0),
      tScore: state.match.tScore + (round.winner === 't' ? 1 : 0),
    },
  };
}
