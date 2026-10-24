/**
 * Protótipo "vida" (branch proto/vida): dados de exemplo FIXOS e rótulos das duas direções. Nada daqui
 * vem da API; os nomes de jogadores são inventados. Os termos seguem o CONTEXT.md ("Partida" só existe
 * no 5v5, então a faixa da semana fala em rounds, abates, HS% e horas).
 */
import palettes from './palettes.json';

export type HomeState = 'amigos' | 'sem-nada' | 'deslogado' | 'offline' | 'carregando';
export type Mode = 'retake' | 'deathmatch';
export type MapSlug =
  | 'mirage'
  | 'dust2'
  | 'inferno'
  | 'ancient'
  | 'anubis'
  | 'nuke'
  | 'overpass'
  | 'cache';

export const STATES: { id: HomeState; label: string }[] = [
  { id: 'amigos', label: 'Logado · com amigos' },
  { id: 'sem-nada', label: 'Logado · sem nada' },
  { id: 'deslogado', label: 'Deslogado' },
  { id: 'offline', label: 'Zero servidores online' },
  { id: 'carregando', label: 'Carregando' },
];

export function parseState(value: string | string[] | undefined): HomeState {
  const v = Array.isArray(value) ? value[0] : value;
  return STATES.some((s) => s.id === v) ? (v as HomeState) : 'amigos';
}

export const MAP_NAMES: Record<MapSlug, string> = {
  mirage: 'Mirage',
  dust2: 'Dust2',
  inferno: 'Inferno',
  ancient: 'Ancient',
  anubis: 'Anubis',
  nuke: 'Nuke',
  overpass: 'Overpass',
  cache: 'Cache',
};

/** Uma cor por mapa (direção B): a cor do cartão e do fundo, e a cor do texto que fica sobre ela. */
export const MAP_COLOR: Record<MapSlug, { color: string; deep: string; ink: string }> = {
  dust2: { color: '#e8b04f', deep: '#8a5a14', ink: '#1d1304' },
  inferno: { color: '#ff6a2b', deep: '#9c2d08', ink: '#240a02' },
  nuke: { color: '#22a6b8', deep: '#0b5668', ink: '#021a20' },
  ancient: { color: '#3fbf6a', deep: '#14693a', ink: '#03200f' },
  mirage: { color: '#f0845c', deep: '#a1421f', ink: '#2a0d03' },
  anubis: { color: '#d6b23a', deep: '#7b6410', ink: '#231b02' },
  overpass: { color: '#7aa8e8', deep: '#2f5aa0', ink: '#04122a' },
  cache: { color: '#9bb83b', deep: '#566d12', ink: '#131b02' },
};

export type DemoPerson = {
  id: string;
  name: string;
  /** Matiz do avatar (0–360). */
  hue: number;
};

export const PEOPLE: Record<string, DemoPerson> = {
  lia: { id: 'lia', name: 'lia.exe', hue: 330 },
  dudu: { id: 'dudu', name: 'Dudu', hue: 28 },
  nathy: { id: 'nathy', name: 'Nathy', hue: 190 },
  kuririn: { id: 'kuririn', name: 'Kuririn', hue: 12 },
  duda: { id: 'duda', name: 'DudaBR', hue: 150 },
  ze: { id: 'ze', name: 'ZéDoRetake', hue: 48 },
  mafalda: { id: 'mafalda', name: 'Mafalda', hue: 268 },
  cacau: { id: 'cacau', name: 'Cacau', hue: 95 },
  jao: { id: 'jao', name: 'Jão', hue: 210 },
  noite: { id: 'noite', name: 'NoiteCarmim', hue: 352 },
};

export type DemoServer = {
  id: string;
  name: string;
  code: string;
  mode: Mode;
  map: MapSlug;
  players: number;
  max: number;
  /** Jogadores por lado (só no Retake). */
  ct?: number;
  t?: number;
  /** Offline: "há 3 h" e o maior número de jogadores da última sessão. */
  lastGame?: string;
  peak?: number;
  friends: string[];
};

const S1: DemoServer = {
  id: 'sp1',
  name: 'Retake · Rotação',
  code: '#1',
  mode: 'retake',
  map: 'mirage',
  players: 8,
  max: 9,
  ct: 4,
  t: 4,
  friends: ['lia', 'dudu'],
};
const S2: DemoServer = {
  id: 'sp2',
  name: 'Deathmatch · Livre',
  code: '#2',
  mode: 'deathmatch',
  map: 'dust2',
  players: 11,
  max: 16,
  friends: ['nathy'],
};
const S3: DemoServer = {
  id: 'sp3',
  name: 'Retake · Treino',
  code: '#3',
  mode: 'retake',
  map: 'inferno',
  players: 0,
  max: 9,
  lastGame: 'há 3 h',
  peak: 9,
  friends: [],
};
const S4: DemoServer = {
  id: 'sp4',
  name: 'Deathmatch · Arena',
  code: '#4',
  mode: 'deathmatch',
  map: 'ancient',
  players: 0,
  max: 16,
  lastGame: 'há 1 dia',
  peak: 14,
  friends: [],
};

export function serversFor(state: HomeState): DemoServer[] {
  switch (state) {
    case 'sem-nada':
      return [
        { ...S2, players: 3, friends: [] },
        { ...S1, players: 0, ct: 0, t: 0, lastGame: 'há 25 min', peak: 9, friends: [] },
        S3,
        S4,
      ];
    case 'offline':
      return [
        { ...S1, players: 0, ct: 0, t: 0, lastGame: 'há 25 min', peak: 9, friends: [] },
        { ...S2, players: 0, lastGame: 'há 41 min', peak: 14, friends: [] },
        S3,
        S4,
      ];
    case 'deslogado':
      return [{ ...S1, friends: [] }, { ...S2, friends: [] }, S3, S4];
    default:
      return [S1, S2, S3, S4];
  }
}

export const isLive = (s: DemoServer) => s.players > 0;

export type FriendNow = { person: string; serverId: string };
export const FRIENDS_NOW: FriendNow[] = [
  { person: 'lia', serverId: 'sp1' },
  { person: 'dudu', serverId: 'sp1' },
  { person: 'nathy', serverId: 'sp2' },
];

/** Os quatro tipos do contrato de atividade (`packages/contracts/src/activity.ts`). */
export type DemoActivity =
  | { id: string; type: 'multi_kill'; person: string; kills: number; server: string }
  | { id: string; type: 'skin_equipped'; person: string; skin: number }
  | { id: string; type: 'joined'; person: string; server: string }
  | { id: string; type: 'new_leader'; person: string; mode: Mode };

export const ACTIVITY_POOL: DemoActivity[] = [
  { id: 'e1', type: 'multi_kill', person: 'kuririn', kills: 4, server: 'Retake · #1' },
  { id: 'e2', type: 'skin_equipped', person: 'mafalda', skin: 461 },
  { id: 'e3', type: 'joined', person: 'jao', server: 'Deathmatch · #2' },
  { id: 'e4', type: 'new_leader', person: 'duda', mode: 'deathmatch' },
  { id: 'e5', type: 'skin_equipped', person: 'lia', skin: 1327 },
  { id: 'e6', type: 'multi_kill', person: 'ze', kills: 3, server: 'Retake · #1' },
  { id: 'e7', type: 'joined', person: 'cacau', server: 'Retake · #1' },
  { id: 'e8', type: 'skin_equipped', person: 'kuririn', skin: 222 },
  { id: 'e9', type: 'multi_kill', person: 'duda', kills: 5, server: 'Deathmatch · #2' },
  { id: 'e10', type: 'joined', person: 'noite', server: 'Retake · #1' },
];

export const TOP3: Record<Mode, { person: string; value: string }[]> = {
  retake: [
    { person: 'kuririn', value: '412' },
    { person: 'lia', value: '388' },
    { person: 'ze', value: '371' },
  ],
  deathmatch: [
    { person: 'duda', value: '2,41' },
    { person: 'mafalda', value: '2,33' },
    { person: 'cacau', value: '2,18' },
  ],
};
export const TOP3_UNIT: Record<Mode, string> = { retake: 'rounds ganhos', deathmatch: 'abates por minuto' };

export const WEEK = {
  range: '19 a 25 de outubro',
  progress: 0.62,
  rows: [
    { key: 'rounds', label: 'rounds jogados', value: 48213, decimals: 0, suffix: '', delta: '+12% sobre a semana passada' },
    { key: 'kills', label: 'abates', value: 21907, decimals: 0, suffix: '', delta: '+9% sobre a semana passada' },
    { key: 'hs', label: 'de abates na cabeça', value: 41.3, decimals: 1, suffix: '%', delta: '+1,2 ponto sobre a semana passada' },
    { key: 'hours', label: 'horas em servidor', value: 1284, decimals: 0, suffix: ' h', delta: '+6% sobre a semana passada' },
  ],
};

export type DemoLoadout = {
  skin: number;
  person: string;
  server: string;
  sides: ('ct' | 't')[];
  statTrak: boolean;
  wear: string;
  float: string;
};

export const LOADOUTS_WEEK: DemoLoadout[] = [
  { skin: 1327, person: 'lia', server: 'Retake · Mirage', sides: ['ct', 't'], statTrak: false, wear: 'Nova de Fábrica', float: '0,0121' },
  { skin: 306, person: 'duda', server: 'Deathmatch · Dust2', sides: ['ct'], statTrak: true, wear: 'Pouco Usada', float: '0,1044' },
  { skin: 461, person: 'mafalda', server: 'Retake · Mirage', sides: ['ct', 't'], statTrak: true, wear: 'Nova de Fábrica', float: '0,0237' },
  { skin: 222, person: 'kuririn', server: 'Retake · Mirage', sides: ['t'], statTrak: true, wear: 'Pouco Usada', float: '0,0862' },
  { skin: 86, person: 'cacau', server: 'Deathmatch · Dust2', sides: ['ct', 't'], statTrak: false, wear: 'Nova de Fábrica', float: '0,0049' },
  { skin: 220, person: 'ze', server: 'Retake · Mirage', sides: ['t'], statTrak: false, wear: 'Testada em Campo', float: '0,2210' },
];

type PaletteEntry = { colors: string[]; average: string; light: number; name?: string; image?: string };
const PALETTES = palettes as unknown as {
  maps: Record<string, PaletteEntry>;
  skins: Record<string, PaletteEntry>;
};

/** Até 3 cores vivas extraídas do mapa (public/maps) por `scripts/vida-palettes.mjs`. */
export function mapColors(map: MapSlug): [string, string, string] {
  const c = PALETTES.maps[map]?.colors ?? ['#c23a41'];
  return [c[0] ?? '#c23a41', c[1] ?? c[0] ?? '#c23a41', c[2] ?? c[1] ?? c[0] ?? '#c23a41'];
}

/** Até 3 cores vivas extraídas da imagem da skin. */
export function skinColors(skin: number): [string, string, string] {
  const c = PALETTES.skins[String(skin)]?.colors ?? ['#c23a41'];
  return [c[0] ?? '#c23a41', c[1] ?? c[0] ?? '#c23a41', c[2] ?? c[1] ?? c[0] ?? '#c23a41'];
}

export const mapSrc = (map: MapSlug, width: 800 | 1600 = 1600) => `/maps/${map}-${width}.webp`;

/** Recorta o que a tela precisa de um Item para não levar o catálogo ao navegador. */
export type SkinInfo = {
  id: number;
  title: string;
  subtitle: string | null;
  rarity: 'consumer' | 'industrial' | 'milspec' | 'restricted' | 'classified' | 'covert' | 'contraband';
  image: string;
  colors: [string, string, string];
};

export const RARITY_LABEL: Record<SkinInfo['rarity'], string> = {
  consumer: 'Comum',
  industrial: 'Industrial',
  milspec: 'Militar',
  restricted: 'Restrita',
  classified: 'Classificada',
  covert: 'Secreta',
  contraband: 'Contrabando',
};

/** Raras (e StatTrak) ganham o brilho holográfico. */
export const isHolo = (rarity: SkinInfo['rarity'], statTrak: boolean) =>
  statTrak || rarity === 'covert' || rarity === 'contraband' || rarity === 'classified';

/** Hash estável de nome → matiz, para avatares sem imagem. */
export function hueOf(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) % 360;
  return h;
}
