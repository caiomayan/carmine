import { randomUUID } from 'node:crypto';
import { type APIRequestContext, expect } from '@playwright/test';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Uma semana (ou várias) antes de agora: os eventos caem nas semanas anteriores do agregado. */
export const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();

export interface PlayedWeek {
  /** Quando o jogo aconteceu (ISO); o padrão é agora. */
  at?: string;
  /** Rounds vencidos pelo CT, jogados juntos por `steamIds`. */
  rounds: { steamIds: string[]; count: number };
  /** Kills (killer → victim), uma por item; `headshot` marca a cabeça. */
  kills?: { killer: string; victim: string; headshot?: boolean }[];
  /** Tempo de jogo de quem, em segundos (fecha uma Sessão que terminou em `at`). */
  sessions?: { steamId: string; seconds: number }[];
}

/**
 * Manda ao Servidor Carmine os eventos de uma semana de jogo (rounds, kills e Sessões), como o plugin os
 * mandaria. Serve para semear o agregado semanal que o Perfil lê, em semanas diferentes.
 */
export async function playWeek(request: APIRequestContext, week: PlayedWeek) {
  const at = week.at ?? new Date().toISOString();
  const sessions = week.sessions ?? [];
  const response = await request.post('/api/server/events', {
    headers: { authorization: `Bearer ${process.env.E2E_SERVER_KEY}` },
    data: {
      kills: (week.kills ?? []).map(({ killer, victim, headshot = false }) => ({
        id: randomUUID(),
        at,
        warmup: false,
        killerSteamId: killer,
        killerIsBot: false,
        victimSteamId: victim,
        victimIsBot: false,
        assisterSteamId: null,
        assisterIsBot: false,
        headshot,
        weapon: 'ak47',
        teamKill: false,
      })),
      damages: [],
      roundEnds: Array.from({ length: week.rounds.count }, () => ({
        id: randomUUID(),
        at,
        warmup: false,
        winner: 'ct',
        players: week.rounds.steamIds.map((steamId) => ({ steamId, team: 'ct' })),
      })),
      sessionStarts: [],
      sessionEnds: sessions.map(({ steamId, seconds }) => ({
        id: randomUUID(),
        at,
        sessionId: randomUUID(),
        steamId,
        startedAt: new Date(Date.parse(at) - seconds * 1000).toISOString(),
      })),
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
}
