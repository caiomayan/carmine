import type { LiveServer } from '@carmine/contracts';

/**
 * PROTÓTIPO da página do servidor (/servidores/[id]): dados fixos de exemplo no formato que a S12b vai entregar
 * (`LiveServer.match`, `/servers/{id}/players`, `/servers/{id}/today`). Nada daqui vem da API; os nomes são
 * fictícios. Sai junto com o protótipo, quando a página de verdade for implementada.
 */

export type Side = 'ct' | 't';

export type Match = { round: number; ctScore: number; tScore: number; warmup: boolean };

/** Uma linha de `/servers/{id}/players`: o Perfil privado vem sem nome nem link (D2) e conta no total. */
export type RosterPlayer = {
  id: string;
  name: string | null;
  publicId: number | null;
  team: Side;
  kills: number;
  deaths: number;
  score: number;
};

export type TodayMap = {
  map: string;
  from: string;
  to: string | null;
  rounds: number;
  ctWins: number;
  tWins: number;
};

export type Today = {
  dateLabel: string;
  rounds: { played: number; ctWins: number; tWins: number };
  maps: TodayMap[];
  /** Rounds por hora, de 0h a 23h. */
  hours: number[];
  peakPlayers: { at: string; count: number };
  uniquePlayers: number;
  /** A hora de agora no exemplo, para o gráfico marcar a barra. */
  nowHour: number;
};

export type ScenarioKey = 'cheio' | 'vazio' | 'offline' | 'warmup';

export type Scenario = {
  key: ScenarioKey;
  label: string;
  server: LiveServer;
  match: Match | null;
  players: RosterPlayer[];
  today: Today;
  /** Há quanto tempo o servidor parou, em minutos (só no offline). */
  offlineMinutes: number | null;
};

const base: LiveServer = {
  id: '5a0e9c3e-1d2b-4c47-9a55-3b7a2f0c8d11',
  name: 'retake-1',
  showcaseName: 'Retake · Rotação',
  code: 'SP·1',
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

const p = (
  id: string,
  name: string | null,
  publicId: number | null,
  team: Side,
  kills: number,
  deaths: number,
  score: number,
): RosterPlayer => ({ id, name, publicId, team, kills, deaths, score });

/** Os nove do Retake lotado (5 CT, 4 TR; dois com Perfil privado). */
export const FULL_ROSTER: RosterPlayer[] = [
  p('rafa', 'Rafa Tavares', 1042, 'ct', 14, 6, 31),
  p('bia', 'Bia Montenegro', 2208, 'ct', 11, 8, 25),
  p('lipe', 'Lipe Duarte', 3317, 'ct', 9, 9, 21),
  p('priv1', null, null, 'ct', 7, 10, 17),
  p('cami', 'Camila Reis', 4120, 'ct', 5, 11, 12),
  p('juca', 'Juca', 1876, 't', 13, 7, 28),
  p('thiago', 'Thiago Nobre', 2954, 't', 10, 9, 22),
  p('mari', 'Mari Alencar', 5301, 't', 8, 10, 19),
  p('priv2', null, null, 't', 6, 12, 14),
];

const WARMUP_ROSTER: RosterPlayer[] = [
  p('rafa', 'Rafa Tavares', 1042, 'ct', 0, 0, 0),
  p('bia', 'Bia Montenegro', 2208, 'ct', 0, 0, 0),
  p('priv1', null, null, 'ct', 0, 0, 0),
  p('juca', 'Juca', 1876, 't', 0, 0, 0),
  p('thiago', 'Thiago Nobre', 2954, 't', 0, 0, 0),
  p('mari', 'Mari Alencar', 5301, 't', 0, 0, 0),
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
  dateLabel: 'Hoje, 26 de outubro',
  rounds: { played: 166, ctWins: 86, tWins: 80 },
  maps: [
    ...MAPS_ENDED,
    { map: 'de_mirage', from: '20:41', to: null, rounds: 14, ctWins: 8, tWins: 6 },
  ],
  hours: HOURS,
  peakPlayers: { at: '20:12', count: 9 },
  uniquePlayers: 31,
  nowHour: 21,
};

const todayEnded: Today = {
  ...todayLive,
  maps: [
    ...MAPS_ENDED,
    { map: 'de_mirage', from: '20:41', to: '20:58', rounds: 14, ctWins: 8, tWins: 6 },
  ],
};

const todayWarmup: Today = {
  ...todayLive,
  rounds: { played: 152, ctWins: 78, tWins: 74 },
  maps: MAPS_ENDED.slice(0, 5).map((row, i) =>
    i === 4 ? { ...row, to: '21:04', rounds: 33 } : row,
  ),
  hours: HOURS.map((rounds, hour) => (hour === 21 ? 4 : rounds)),
  nowHour: 21,
};

export const SCENARIOS: Record<ScenarioKey, Scenario> = {
  cheio: {
    key: 'cheio',
    label: 'Ao vivo, cheio',
    server: base,
    match: { round: 15, ctScore: 8, tScore: 6, warmup: false },
    players: FULL_ROSTER,
    today: todayLive,
    offlineMinutes: null,
  },
  vazio: {
    key: 'vazio',
    label: 'Ao vivo, vazio',
    server: { ...base, players: 0, state: 'online' },
    match: null,
    players: [],
    today: todayEnded,
    offlineMinutes: null,
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
    match: null,
    players: [],
    today: todayEnded,
    offlineMinutes: 25,
  },
  warmup: {
    key: 'warmup',
    label: 'Aquecimento',
    server: { ...base, map: 'de_inferno', lastMap: 'de_inferno', players: 6, state: 'online' },
    match: { round: 0, ctScore: 0, tScore: 0, warmup: true },
    players: WARMUP_ROSTER,
    today: todayWarmup,
    offlineMinutes: null,
  },
};

export const SCENARIO_KEYS = Object.keys(SCENARIOS) as ScenarioKey[];

export function isScenarioKey(value: string | undefined): value is ScenarioKey {
  return value !== undefined && value in SCENARIOS;
}

/* ---------- a simulação de rounds (só para ver o placar mudar) ---------- */

/** Cada round do roteiro: quem ganhou e quem abateu quem. Em laço, para a demonstração não acabar. */
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

export type LiveState = { match: Match; players: RosterPlayer[]; step: number };

/** O próximo round do roteiro: placar, round e os números de cada jogador. */
export function advance(state: LiveState): LiveState {
  const round = SCRIPT[state.step % SCRIPT.length];
  if (!round) return state;
  const players = state.players.map((player) => ({ ...player }));
  for (const [killer, victim] of round.kills) {
    const k = players.find((row) => row.id === killer);
    const v = players.find((row) => row.id === victim);
    if (k) {
      k.kills += 1;
      k.score += 2;
    }
    if (v) v.deaths += 1;
  }
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

/** Por pontos, depois abates, depois nome (Perfil privado por último): a ordem do placar do jogo. */
export function ranked(players: RosterPlayer[], team: Side): RosterPlayer[] {
  return players
    .filter((player) => player.team === team)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.kills - a.kills ||
        Number(a.name === null) - Number(b.name === null) ||
        (a.name ?? '').localeCompare(b.name ?? ''),
    );
}
