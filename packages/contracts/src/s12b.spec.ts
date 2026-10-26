import { describe, expect, it } from 'vitest';
import {
  liveServerListSchema,
  matchStateSchema,
  scoreboardEntrySchema,
  serverHeartbeatSchema,
} from './live-servers.js';
import { createReportSchema } from './reports.js';
import { serverPlayersSchema, serverTodaySchema } from './server-detail.js';
import { eventBatchSchema, killEventSchema, roundEndEventSchema } from './stats.js';
import {
  profileActivitySchema,
  profileSessionsSchema,
  profileWeaponsSchema,
  STAT_WEAPONS,
} from './stats-detail.js';

const STEAM_ID = '76561198000000001';
const UUID = '0b9f8c1e-7a4d-4e2b-9c3a-5d6e7f809102';
const AT = '2026-10-26T20:00:00-03:00';

const kill = {
  id: UUID,
  at: AT,
  warmup: false,
  killerSteamId: STEAM_ID,
  killerIsBot: false,
  victimSteamId: null,
  victimIsBot: true,
  assisterSteamId: null,
  assisterIsBot: false,
  headshot: true,
  weapon: 'ak47',
  teamKill: false,
};

describe('S12b · eventos (campos novos opcionais, plugin velho e novo convivem)', () => {
  it('a kill de sempre continua valendo e a nova leva o lado do assassino', () => {
    expect(killEventSchema.parse(kill).killerTeam).toBeUndefined();
    expect(killEventSchema.parse({ ...kill, killerTeam: 't' }).killerTeam).toBe('t');
    expect(killEventSchema.parse({ ...kill, killerTeam: null }).killerTeam).toBeNull();
    expect(killEventSchema.safeParse({ ...kill, killerTeam: 'spectator' }).success).toBe(false);
  });

  it('o fim de round de sempre vale; o novo traz mapa, número e placar', () => {
    const round = { id: UUID, at: AT, warmup: false, winner: 'ct', players: [] };
    expect(roundEndEventSchema.parse(round)).toEqual(round);
    expect(
      roundEndEventSchema.parse({
        ...round,
        map: 'de_mirage',
        roundNumber: 14,
        scoreCt: 8,
        scoreT: 6,
      }),
    ).toMatchObject({ map: 'de_mirage', roundNumber: 14, scoreCt: 8, scoreT: 6 });
    expect(roundEndEventSchema.safeParse({ ...round, roundNumber: 0 }).success).toBe(false);
    expect(roundEndEventSchema.safeParse({ ...round, scoreT: -1 }).success).toBe(false);
  });

  it('as Sessões levam o mapa de entrada e os mapas por onde passaram (máx. 8)', () => {
    const batch = (extra: object, end: object) => ({
      kills: [],
      damages: [],
      roundEnds: [],
      sessionStarts: [{ id: UUID, at: AT, sessionId: UUID, steamId: STEAM_ID, ...extra }],
      sessionEnds: [
        { id: UUID, at: AT, sessionId: UUID, steamId: STEAM_ID, startedAt: AT, ...end },
      ],
    });
    expect(eventBatchSchema.safeParse(batch({}, {})).success).toBe(true);
    expect(
      eventBatchSchema.safeParse(batch({ map: 'de_dust2' }, { maps: ['de_dust2', 'de_inferno'] }))
        .success,
    ).toBe(true);
    const nineMaps = Array.from({ length: 9 }, (_, n) => `de_mapa${n}`);
    expect(eventBatchSchema.safeParse(batch({}, { maps: nineMaps })).success).toBe(false);
  });
});

describe('S12b · batimento', () => {
  const heartbeat = { map: 'de_mirage', players: [STEAM_ID], maxPlayers: 9 };

  it('o batimento de sempre vale (plugin velho)', () => {
    expect(serverHeartbeatSchema.parse(heartbeat)).toEqual(heartbeat);
  });

  it('Retake: placar de times e placar por jogador', () => {
    const parsed = serverHeartbeatSchema.parse({
      ...heartbeat,
      match: { round: 15, ctScore: 8, tScore: 6, warmup: false },
      scoreboard: [{ steamId: STEAM_ID, team: 'ct', kills: 12, deaths: 5, score: 31 }],
    });
    expect(parsed.match?.round).toBe(15);
    expect(parsed.scoreboard?.[0]?.team).toBe('ct');
  });

  it('Deathmatch: sem placar de times (match nulo), com números por jogador e time nulo', () => {
    const parsed = serverHeartbeatSchema.parse({
      ...heartbeat,
      match: null,
      scoreboard: [{ steamId: STEAM_ID, team: null, kills: 20, deaths: 11, score: 20 }],
    });
    expect(parsed.match).toBeNull();
    expect(parsed.scoreboard?.[0]?.team).toBeNull();
  });

  it('recusa placar absurdo e lista grande demais', () => {
    expect(
      matchStateSchema.safeParse({ round: 0, ctScore: 0, tScore: 0, warmup: false }).success,
    ).toBe(false);
    expect(
      matchStateSchema.safeParse({ round: 1, ctScore: -1, tScore: 0, warmup: true }).success,
    ).toBe(false);
    const entry = scoreboardEntrySchema.parse({
      steamId: STEAM_ID,
      team: 't',
      kills: 0,
      deaths: 0,
      score: 0,
    });
    expect(
      serverHeartbeatSchema.safeParse({ ...heartbeat, scoreboard: Array(129).fill(entry) }).success,
    ).toBe(false);
  });

  it('a lista ao vivo vale com e sem `match` no servidor', () => {
    const server = {
      id: UUID,
      name: 'retake-1',
      showcaseName: null,
      code: null,
      mode: 'retake',
      address: '203.0.113.10:27015',
      region: 'sao-paulo',
      map: 'de_mirage',
      players: 3,
      maxPlayers: 9,
      state: 'online',
      lastHeartbeatAt: AT,
      lastMap: 'de_mirage',
    };
    const list = (s: object) => ({
      servers: [s],
      summary: { online: 1, players: 3 },
      generatedAt: AT,
    });
    expect(liveServerListSchema.safeParse(list(server)).success).toBe(true);
    expect(liveServerListSchema.safeParse(list({ ...server, match: null })).success).toBe(true);
    expect(
      liveServerListSchema.safeParse(
        list({ ...server, match: { round: 3, ctScore: 1, tScore: 1, warmup: false } }),
      ).success,
    ).toBe(true);
  });
});

describe('S12b · Perfil', () => {
  it('o Perfil privado vem sem nada e `since` nulo', () => {
    expect(profileActivitySchema.parse({ visible: false, since: null, days: [] }).days).toEqual([]);
    expect(
      profileWeaponsSchema.parse({ visible: false, since: null, mode: 'all', weapons: [] }).weapons,
    ).toEqual([]);
    expect(
      profileSessionsSchema.parse({ visible: false, since: null, sessions: [] }).sessions,
    ).toEqual([]);
  });

  it('atividade, armas e Sessões de uma Conta com dados', () => {
    expect(
      profileActivitySchema.safeParse({
        visible: true,
        since: '2026-10-26',
        days: [{ day: '2026-10-26', secondsPlayed: 3600, roundsPlayed: 60, kills: 40 }],
      }).success,
    ).toBe(true);
    expect(
      profileWeaponsSchema.safeParse({
        visible: true,
        since: '2026-10-26',
        mode: 'retake',
        weapons: [{ weapon: 'ak47', kills: 10, headshots: 4, ct: 0, t: 10 }],
      }).success,
    ).toBe(true);
    expect(
      profileSessionsSchema.safeParse({
        visible: true,
        since: '2026-10-26',
        sessions: [
          {
            id: UUID,
            mode: 'deathmatch',
            map: 'de_dust2',
            maps: ['de_dust2', 'de_inferno'],
            day: '2026-10-26',
            startedAt: null,
            endedAt: null,
            seconds: 3480,
            live: false,
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('as armas são uma lista fechada, sem repetição, que termina em `other`', () => {
    expect(new Set(STAT_WEAPONS).size).toBe(STAT_WEAPONS.length);
    expect(STAT_WEAPONS.at(-1)).toBe('other');
    expect(
      profileWeaponsSchema.safeParse({
        visible: true,
        since: null,
        mode: 'all',
        weapons: [{ weapon: 'hkp2000', kills: 1, headshots: 0, ct: 1, t: 0 }],
      }).success,
    ).toBe(false);
  });
});

describe('S12b · servidor', () => {
  it('jogadores: privado sem identidade, e números nulos sem placar por jogador', () => {
    const parsed = serverPlayersSchema.parse({
      serverId: UUID,
      mode: 'retake',
      state: 'online',
      map: 'de_mirage',
      maxPlayers: 9,
      match: { round: 3, ctScore: 1, tScore: 1, warmup: false },
      scoreboard: false,
      updatedAt: AT,
      players: [
        {
          player: {
            private: true,
            publicId: null,
            displayName: 'Jogador privado',
            avatarUrl: null,
          },
          team: null,
          kills: null,
          deaths: null,
          score: null,
          self: false,
        },
      ],
    });
    expect(parsed.players[0]?.player.publicId).toBeNull();
  });

  it('hoje: Retake com rounds; Deathmatch com `rounds` nulo e mapas sem placar', () => {
    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, rounds: 0, players: 0 }));
    const today = {
      serverId: UUID,
      mode: 'retake',
      date: '2026-10-26',
      isToday: true,
      since: '2026-10-20',
      rounds: { played: 80, ctWins: 41, tWins: 39 },
      maps: [
        {
          map: 'de_mirage',
          from: AT,
          to: AT,
          rounds: 80,
          ctWins: 41,
          tWins: 39,
          finalScore: { ct: 13, t: 7 },
        },
      ],
      hours,
      peakPlayers: { at: AT, count: 9 },
      uniquePlayers: 14,
      generatedAt: AT,
    };
    expect(serverTodaySchema.safeParse(today).success).toBe(true);
    expect(
      serverTodaySchema.safeParse({
        ...today,
        mode: 'deathmatch',
        rounds: null,
        maps: [
          {
            map: 'de_dust2',
            from: AT,
            to: AT,
            rounds: null,
            ctWins: null,
            tWins: null,
            finalScore: null,
          },
        ],
      }).success,
    ).toBe(true);
    expect(serverTodaySchema.safeParse({ ...today, hours: hours.slice(1) }).success).toBe(false);
  });
});

describe('campos nulos ausentes (o cliente C# omite o que é nulo)', () => {
  it('uma kill sem assistente, sem assassino ou sem vítima vale e vira null', () => {
    const { killerSteamId: _k, victimSteamId: _v, assisterSteamId: _a, ...bare } = kill;
    const parsed = killEventSchema.parse(bare);
    expect([parsed.killerSteamId, parsed.victimSteamId, parsed.assisterSteamId]).toEqual([
      null,
      null,
      null,
    ]);
    expect(killEventSchema.parse({ ...bare, assisterSteamId: STEAM_ID }).assisterSteamId).toBe(
      STEAM_ID,
    );
  });

  it('um lote com a kill do jeito que o plugin manda é aceito', () => {
    const { assisterSteamId: _a, ...plugin } = kill;
    expect(
      eventBatchSchema.safeParse({
        kills: [plugin],
        damages: [],
        roundEnds: [],
        sessionStarts: [],
        sessionEnds: [],
      }).success,
    ).toBe(true);
  });

  it('o SteamID presente continua tendo de ser válido', () => {
    expect(killEventSchema.safeParse({ ...kill, assisterSteamId: '123' }).success).toBe(false);
  });

  it('a Denúncia sem round ou mapa e a linha do placar sem time valem', () => {
    expect(
      createReportSchema.parse({
        reporterSteamId: STEAM_ID,
        targetSteamId: STEAM_ID,
        reason: 'cheat',
      }),
    ).toMatchObject({ round: null, map: null });
    expect(
      scoreboardEntrySchema.parse({ steamId: STEAM_ID, kills: 1, deaths: 0, score: 3 }).team,
    ).toBeNull();
  });
});
