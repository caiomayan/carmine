import { describe, expect, it } from 'vitest';
import { parseRankingQuery, playedParts, rankingHref, recentWeekStarts } from './ranking';

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
