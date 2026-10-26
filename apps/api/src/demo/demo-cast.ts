import { createHmac } from 'node:crypto';
import type { GameMode } from '@carmine/contracts';
import { between, seeded } from './demo-random.js';

/** Um Servidor Carmine fictício. Os endereços são os de documentação (RFC 5737): não existem. */
export interface DemoServer {
  name: string;
  mode: GameMode;
  address: string;
  showcaseName: string;
  code: string;
  /** Vagas públicas que o batimento informa. */
  maxPlayers: number;
  maps: readonly string[];
  /** Quantos jogadores o simulador mantém conectados (min = max: sempre o mesmo número). */
  online: { min: number; max: number };
}

export const DEMO_SERVERS: readonly DemoServer[] = [
  {
    name: 'retake-1',
    mode: 'retake',
    address: '203.0.113.10:27015',
    showcaseName: 'Retake · Rotação',
    code: 'SP·1',
    maxPlayers: 9,
    maps: ['de_mirage', 'de_inferno', 'de_ancient', 'de_nuke'],
    online: { min: 5, max: 8 },
  },
  {
    name: 'retake-2',
    mode: 'retake',
    address: '203.0.113.10:27016',
    showcaseName: 'Retake · Competitivo',
    code: 'SP·2',
    maxPlayers: 9,
    maps: ['de_anubis', 'de_overpass', 'de_vertigo'],
    online: { min: 9, max: 9 },
  },
  {
    name: 'dm-1',
    mode: 'deathmatch',
    address: '203.0.113.11:27015',
    showcaseName: 'Deathmatch · Arena',
    code: 'SP·3',
    maxPlayers: 20,
    maps: ['de_dust2', 'de_inferno', 'de_mirage'],
    online: { min: 8, max: 13 },
  },
];

export const DEMO_SERVER_NAMES: ReadonlySet<string> = new Set(DEMO_SERVERS.map((s) => s.name));

/**
 * A chave do servidor fictício, derivada do segredo da homologação: o seed grava o hash e o simulador
 * calcula a mesma chave, sem estado compartilhado. Mesmo formato das chaves de verdade (`cmk_...`).
 */
export function demoServerKey(secret: string, serverName: string): string {
  return `cmk_${createHmac('sha256', secret).update(`servidor:${serverName}`).digest('base64url')}`;
}

export interface DemoPlayer {
  steamId: string;
  /** Nome Steam fictício (o jogo e o site mostram este). */
  name: string;
  /** O servidor onde joga (o Modo dele vem daí). */
  home: string;
  /** Habilidade relativa, 0,7 a 1,35: puxa o ranking para cima ou para baixo. */
  skill: number;
  vip: boolean;
}

const HANDLES: Record<string, readonly string[]> = {
  'retake-1': [
    'Ravena',
    'tigrao',
    'Nebula',
    'k0ala',
    'Duda_Sniper',
    'Bruxo',
    'Lupa',
    'Zeca',
    'mateus.fps',
    'Pipoca',
    'Sombra',
  ],
  'retake-2': [
    'Kaizen',
    'Valkiria',
    'Neguinho',
    'jujuba',
    'Frost',
    'CapitaoBR',
    'Aurora',
    'r4ta',
    'Tempestade',
    'Pixel',
  ],
  'dm-1': [
    'Faisca',
    'Bolinha',
    'Zumbi',
    'Mirage_Man',
    'Lobo',
    'Cacau',
    'Rakuen',
    'Tubarao',
    'Neon',
    'Gaucho',
    'Vesper',
    'Cometa',
    'Mocoto',
  ],
};

/**
 * SteamID64 fictícios: um bloco alto e contíguo, válido para o contrato (conta individual) e fora do
 * que a Steam já emitiu. Em homologação não há Conta de verdade que possa colidir.
 */
const STEAM_ID_BASE = 76561199999000000n;

/** Os jogadores fictícios, estáveis entre deploys (a ordem decide o SteamID64). */
export const DEMO_PLAYERS: readonly DemoPlayer[] = (() => {
  const players: DemoPlayer[] = [];
  for (const server of DEMO_SERVERS) {
    for (const name of HANDLES[server.name] ?? []) {
      const steamId = String(STEAM_ID_BASE + BigInt(players.length + 1));
      players.push({
        steamId,
        name,
        home: server.name,
        skill: Math.round(between(seeded(`habilidade:${steamId}`), 0.7, 1.35) * 100) / 100,
        vip: players.length % 4 === 0,
      });
    }
  }
  return players;
})();

export function playersOf(server: string): DemoPlayer[] {
  return DEMO_PLAYERS.filter((player) => player.home === server);
}
