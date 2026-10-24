import { describe, expect, it } from 'vitest';
import {
  nextWeekTurn,
  parseRankingQuery,
  playedParts,
  rankingHref,
  rankingMoves,
  recentWeekStarts,
} from './ranking';

describe('parseRankingQuery', () => {
  it('padrão: Retake, semana atual', () => {
    expect(parseRankingQuery({})).toEqual({ mode: 'retake', week: undefined });
  });

  it('lê o Modo e a semana da URL', () => {
    expect(parseRankingQuery({ modo: 'deathmatch', semana: '2026-10-12' })).toEqual({
      mode: 'deathmatch',
      week: '2026-10-12',
    });
  });

  it('ignora Modo desconhecido e semana fora do formato', () => {
    expect(parseRankingQuery({ modo: '5v5', semana: 'ontem' })).toEqual({
      mode: 'retake',
      week: undefined,
    });
    expect(parseRankingQuery({ modo: ['deathmatch', 'retake'] }).mode).toBe('deathmatch');
  });
});

describe('rankingHref', () => {
  it('a semana atual fica fora do endereço', () => {
    expect(rankingHref('retake', '2026-10-12', '2026-10-12')).toBe('/ranking?modo=retake');
    expect(rankingHref('deathmatch', '2026-10-05', '2026-10-12')).toBe(
      '/ranking?modo=deathmatch&semana=2026-10-05',
    );
  });
});

describe('playedParts', () => {
  it('separa horas e minutos', () => {
    expect(playedParts(0)).toEqual({ hours: 0, minutes: 0 });
    expect(playedParts(45 * 60 + 59)).toEqual({ hours: 0, minutes: 45 });
    expect(playedParts(3 * 3600 + 5 * 60)).toEqual({ hours: 3, minutes: 5 });
  });
});

describe('recentWeekStarts', () => {
  it('lista as semanas da atual para trás, pelo horário de Brasília', () => {
    // Domingo 2026-10-18 23:00 em Brasília ainda é a semana de 2026-10-12.
    expect(recentWeekStarts(new Date('2026-10-19T02:00:00Z'), 3)).toEqual([
      '2026-10-12',
      '2026-10-05',
      '2026-09-28',
    ]);
    // Segunda 00:00 em Brasília já é a semana nova.
    expect(recentWeekStarts(new Date('2026-10-19T03:00:00Z'), 1)).toEqual(['2026-10-19']);
  });
});

describe('nextWeekTurn', () => {
  it('é a próxima segunda-feira às 00:00 de Brasília', () => {
    // Quarta, 15 de outubro de 2026, 12:00 em Brasília (15:00 UTC): vira na segunda, 19, 00:00 BRT.
    const now = Date.parse('2026-10-14T15:00:00Z');
    expect(new Date(nextWeekTurn(now)).toISOString()).toBe('2026-10-19T03:00:00.000Z');
  });

  it('na própria segunda-feira vira só na seguinte, e no domingo à noite vira em minutos', () => {
    const monday = Date.parse('2026-10-19T03:00:00Z');
    expect(new Date(nextWeekTurn(monday)).toISOString()).toBe('2026-10-26T03:00:00.000Z');
    const sunday = Date.parse('2026-10-19T02:59:00Z');
    expect(nextWeekTurn(sunday) - sunday).toBe(60_000);
  });
});

describe('rankingMoves', () => {
  const row = (position: number, publicId: number | null) => ({ position, player: { publicId } });

  it('marca quem subiu e quem caiu, por posições', () => {
    const before = [row(1, 10), row(2, 20), row(3, 30)];
    const after = [row(1, 20), row(2, 10), row(3, 30)];
    expect([...rankingMoves(before, after)]).toEqual([
      [20, 1],
      [10, -1],
    ]);
  });

  it('não marca quem não mudou, quem chegou agora nem o Perfil privado', () => {
    const before = [row(1, 10), row(2, null)];
    const after = [row(1, 10), row(2, null), row(3, 99)];
    expect(rankingMoves(before, after).size).toBe(0);
  });

  it('sem leitura anterior igual não há movimento', () => {
    const same = [row(1, 10), row(2, 20)];
    expect(rankingMoves(same, same).size).toBe(0);
  });
});
