import type { KillEvent } from '@carmine/contracts';
import { describe, expect, it } from 'vitest';
import { detectMultiKills, MULTI_KILL_MINIMUM } from './multi-kills.js';

const A = '76561198000000001';
const B = '76561198000000002';
const V = '76561198000000099';

let n = 0;
const at = (seconds: number) => new Date(Date.UTC(2026, 9, 22, 18, 0, seconds)).toISOString();
const kill = (seconds: number, over: Partial<KillEvent> = {}): KillEvent => {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    at: at(seconds),
    warmup: false,
    killerSteamId: A,
    killerIsBot: false,
    victimSteamId: V,
    victimIsBot: false,
    assisterSteamId: null,
    assisterIsBot: false,
    headshot: false,
    weapon: 'ak47',
    teamKill: false,
    ...over,
  };
};
const round = (seconds: number) => ({ at: at(seconds) });

describe('detectMultiKills', () => {
  it('três mortes seguidas do mesmo jogador no Retake são um multi-kill, marcado na última', () => {
    const result = detectMultiKills({
      mode: 'retake',
      kills: [kill(0), kill(6), kill(11)],
      roundEnds: [],
    });

    expect(result).toEqual([{ steamId: A, count: 3, at: at(11) }]);
  });

  it('duas mortes não são multi-kill', () => {
    expect(detectMultiKills({ mode: 'retake', kills: [kill(0), kill(5)], roundEnds: [] })).toEqual(
      [],
    );
  });

  it('um ace (5 mortes) conta as 5', () => {
    const kills = [0, 4, 8, 12, 16].map((s) => kill(s));

    expect(detectMultiKills({ mode: 'retake', kills, roundEnds: [] })).toEqual([
      { steamId: A, count: 5, at: at(16) },
    ]);
  });

  it('uma pausa longa quebra a sequência', () => {
    const kills = [kill(0), kill(5), kill(40), kill(45), kill(50)];

    expect(detectMultiKills({ mode: 'retake', kills, roundEnds: [] })).toEqual([
      { steamId: A, count: 3, at: at(50) },
    ]);
  });

  it('o fim do round também quebra: duas mortes de cada lado dele não somam', () => {
    const kills = [kill(0), kill(5), kill(12), kill(15)];

    expect(detectMultiKills({ mode: 'retake', kills, roundEnds: [round(8)] })).toEqual([]);
  });

  it('cada jogador tem a sua sequência, e a ordem de chegada não importa', () => {
    const kills = [
      kill(10, { killerSteamId: B }),
      kill(11),
      kill(0, { killerSteamId: B }),
      kill(2),
      kill(5, { killerSteamId: B }),
      kill(4),
    ];

    const result = detectMultiKills({ mode: 'retake', kills, roundEnds: [] });

    expect(result).toEqual(
      expect.arrayContaining([
        { steamId: A, count: 3, at: at(11) },
        { steamId: B, count: 3, at: at(10) },
      ]),
    );
    expect(result).toHaveLength(2);
  });

  describe('o que não conta', () => {
    const three = (over: Partial<KillEvent>) => [kill(0, over), kill(4, over), kill(8, over)];

    it.each([
      ['aquecimento', { warmup: true }],
      ['kill em aliado', { teamKill: true }],
      ['bot como assassino', { killerIsBot: true }],
      ['bot como vítima', { victimIsBot: true }],
      ['vítima desconhecida (mundo)', { victimSteamId: null }],
      ['assassino desconhecido', { killerSteamId: null }],
    ] as const)('%s', (_, over) => {
      expect(detectMultiKills({ mode: 'retake', kills: three(over), roundEnds: [] })).toEqual([]);
    });
  });

  describe('Deathmatch', () => {
    it('o piso é mais alto: 3 mortes seguidas são normais', () => {
      const kills = [0, 3, 6].map((s) => kill(s));

      expect(detectMultiKills({ mode: 'deathmatch', kills, roundEnds: [] })).toEqual([]);
    });

    it('com 7 seguidas já é destaque', () => {
      const kills = [0, 2, 4, 6, 8, 10, 12].map((s) => kill(s));

      expect(detectMultiKills({ mode: 'deathmatch', kills, roundEnds: [] })).toEqual([
        { steamId: A, count: 7, at: at(12) },
      ]);
    });
  });

  it('os pisos são os combinados', () => {
    expect(MULTI_KILL_MINIMUM).toEqual({ retake: 3, deathmatch: 7 });
  });
});
