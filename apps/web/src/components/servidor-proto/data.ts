import type { LiveServer } from '@carmine/contracts';

/**
 * PROTÓTIPO da página do servidor (/servidores/[id]): dados fixos de exemplo no formato que a S12b vai entregar
 * (`LiveServer.match`, `/servers/{id}/players`, `/servers/{id}/today`). Nada daqui vem da API; os nomes são
 * fictícios. Sai junto com o protótipo, quando a página de verdade for implementada.
 *
 * O Retake não tem "partida": os rounds seguem até o mapa rotacionar. O que a S12b entrega por mapa é o horário, os
 * rounds e os rounds ganhos por lado (somados), não um placar final de partida; o Deathmatch não tem lado.
 */

export type Side = 'ct' | 't';

/** Rounds ganhos por lado neste mapa (a S12b conta pelo `round_end` se o placar do cs2-retakes não servir). */
export type Match = { round: number; ctScore: number; tScore: number; warmup: boolean };

/** Uma linha de `/servers/{id}/players`: o Perfil privado vem sem nome nem link (D2) e conta no total. */
export type RosterPlayer = {
  id: string;
  name: string | null;
  publicId: number | null;
  /** Nulo no Deathmatch (todos contra todos). */
  team: Side | null;
  kills: number;
  deaths: number;
  score: number;
};

export type TodayMap = {
  map: string;
  from: string;
  to: string | null;
  rounds: number;
  /** Rounds ganhos por lado neste mapa; nulos no Deathmatch. */
  ctWins: number | null;
  tWins: number | null;
};

export type Today = {
  dateLabel: string;
  /** A hora do exemplo ("agora"), no relógio de Brasília. */
  clock: string;
  rounds: { played: number; ctWins: number | null; tWins: number | null };
  maps: TodayMap[];
  /** Rounds por hora, de 0h a 23h. */
  hours: number[];
  peakPlayers: { at: string; count: number };
  uniquePlayers: number;
  /** A hora de agora no exemplo, para o gráfico marcar a barra. */
  nowHour: number;
};

export type ScenarioKey = 'cheio' | 'vazio' | 'offline' | 'warmup' | 'deathmatch';

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
  // O código do servidor não aparece na interface (como nos cartões).
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

const p = (
  id: string,
  name: string | null,
  publicId: number | null,
  team: Side | null,
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

/** Os 12 do Deathmatch (sem lado; dois com Perfil privado). */
export const DM_ROSTER: RosterPlayer[] = [
  p('duda', 'Duda Falcão', 1311, null, 31, 9, 36),
  p('leo', 'Léo Prado', 2640, null, 28, 12, 33),
  p('nina', 'Nina Castro', 3875, null, 24, 11, 28),
  p('priv1', null, null, null, 22, 15, 25),
  p('gabi', 'Gabi Moura', 4402, null, 19, 14, 22),
  p('heitor', 'Heitor', 5108, null, 18, 17, 21),
  p('lucia', 'Lúcia Brandt', 6023, null, 16, 15, 18),
  p('pedro', 'Pedro Zanin', 2217, null, 14, 18, 16),
  p('alice', 'Alice Rangel', 7380, null, 12, 16, 14),
  p('priv2', null, null, null, 11, 20, 12),
  p('vini', 'Vini', 8159, null, 9, 19, 10),
  p('samuel', 'Samuel Teles', 9246, null, 6, 22, 7),
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
  clock: '21:07',
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

const DM_HOURS = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 11, 9, 4, 0, 0];

const todayDm: Today = {
  dateLabel: 'Hoje, 26 de outubro',
  clock: '21:07',
  rounds: { played: 32, ctWins: null, tWins: null },
  maps: [
    { map: 'de_anubis', from: '18:20', to: '18:50', rounds: 6, ctWins: null, tWins: null },
    { map: 'de_overpass', from: '18:50', to: '19:20', rounds: 6, ctWins: null, tWins: null },
    { map: 'de_nuke', from: '19:20', to: '19:48', rounds: 6, ctWins: null, tWins: null },
    { map: 'de_inferno', from: '19:48', to: '20:15', rounds: 5, ctWins: null, tWins: null },
    { map: 'de_mirage', from: '20:15', to: '20:44', rounds: 6, ctWins: null, tWins: null },
    { map: 'de_dust2', from: '20:44', to: null, rounds: 3, ctWins: null, tWins: null },
  ],
  hours: DM_HOURS,
  peakPlayers: { at: '21:02', count: 16 },
  uniquePlayers: 44,
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
    label: 'Esquentando',
    server: { ...base, map: 'de_inferno', lastMap: 'de_inferno', players: 6, state: 'online' },
    match: { round: 0, ctScore: 0, tScore: 0, warmup: true },
    players: WARMUP_ROSTER,
    today: todayWarmup,
    offlineMinutes: null,
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
    // Todos contra todos: `match` é nulo e quem manda é a lista por pontos.
    match: null,
    players: DM_ROSTER,
    today: todayDm,
    offlineMinutes: null,
  },
};

export const SCENARIO_KEYS = Object.keys(SCENARIOS) as ScenarioKey[];

export function isScenarioKey(value: string | undefined): value is ScenarioKey {
  return value !== undefined && value in SCENARIOS;
}

/** Minutos entre dois horários "HH:MM" do mesmo dia. */
export function minutesBetween(from: string, to: string): number {
  const toMinutes = (clock: string) => {
    const [h = '0', m = '0'] = clock.split(':');
    return Number(h) * 60 + Number(m);
  };
  return Math.max(0, toMinutes(to) - toMinutes(from));
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

export type LiveState = { match: Match | null; players: RosterPlayer[]; step: number };

/** O próximo passo do roteiro: no Retake um round (placar, round e jogadores); no Deathmatch só os abates. */
export function advance(state: LiveState): LiveState {
  const players = state.players.map((player) => ({ ...player }));
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

/** Por pontos, depois abates, depois nome (Perfil privado por último): a ordem do placar do jogo. */
function byScore(a: RosterPlayer, b: RosterPlayer): number {
  return (
    b.score - a.score ||
    b.kills - a.kills ||
    Number(a.name === null) - Number(b.name === null) ||
    (a.name ?? '').localeCompare(b.name ?? '')
  );
}

/** Os jogadores de um lado, em ordem de placar. */
export function ranked(players: RosterPlayer[], team: Side): RosterPlayer[] {
  return players.filter((player) => player.team === team).sort(byScore);
}

/** Todos, em ordem de placar (o Deathmatch). */
export function rankedAll(players: RosterPlayer[]): RosterPlayer[] {
  return [...players].sort(byScore);
}

/** Em ordem alfabética (o aquecimento: sem número, a ordem não quer dizer nada). */
export function alphabetical(players: RosterPlayer[], team: Side): RosterPlayer[] {
  return players
    .filter((player) => player.team === team)
    .sort(
      (a, b) =>
        Number(a.name === null) - Number(b.name === null) ||
        (a.name ?? '').localeCompare(b.name ?? ''),
    );
}
