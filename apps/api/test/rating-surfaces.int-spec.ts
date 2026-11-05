import {
  type PlayerCard,
  playerCardSchema,
  playerGameLineSchema,
  profileStatsSchema,
  RATING_MIN_ROUNDS,
} from '@carmine/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accountStatsWeekly } from '../src/database/schema.js';
import { startTestApp, steamIdFor, type TestApp } from './support/app.js';
import { signedInPlayer } from './support/player.js';
import {
  seedPopulation,
  seedRetakeAccount,
  sheetAccounts,
  thisWeek,
  zeroCounts,
} from './support/rating-surfaces.js';
import { installStableClock } from './support/stable-clock.js';

// Antes de qualquer `new Date()` do arquivo: sem cruzar a meia-noite de Brasília durante o teste.
installStableClock();

/**
 * S21 P4 (#239): o Rating Carmine nas superfícies da API (Perfil, `!rank`, `!stats` e card).
 * Escritos ANTES do código (escritor de testes separado de quem implementa): todos falham hoje.
 * Fontes: spec S21 (docs/specs/beta-aberto.md, "Onde aparece" e "Aceite") e ADR 0029 ("Estados").
 * Os números esperados vêm da planilha de conferência (c01 = 0,85; x01 = Calibrando 37/100).
 *
 * Todos os rounds ficam em "hoje": a janela de 90 dias (Perfil) e a da semana (Ranking) leem os
 * mesmos rounds, então estes testes não decidem qual janela vale em `!rank`/`!stats`/card (pergunta no PR).
 *
 * Nomes de campo que a spec não define e que os testes ASSUMEM (perguntas no PR): `ModeStats.rating`
 * (um `ModeRating`) e `ProfileStats.overallRating` (um `OverallRating` ou nulo).
 */
describe('Rating Carmine nas superfícies da API (S21 P4)', () => {
  let t: TestApp;
  const sheet = (id: string) => {
    const found = sheetAccounts.find((a) => a.id === id);
    if (!found) throw new Error(`conta ${id} fora da planilha`);
    return found;
  };

  beforeAll(async () => {
    t = await startTestApp();
  });

  afterAll(async () => {
    await t?.stop();
  });

  const asServer = { authorization: '' };
  const line = async (n: number, which: 'rank' | 'stats') => {
    asServer.authorization = `Bearer ${t.serverKey}`;
    const response = await t.app.inject({
      url: `/api/server/players/${steamIdFor(n)}/${which}`,
      headers: asServer,
    });
    expect(response.statusCode, response.body).toBe(200);
    return playerGameLineSchema.parse(response.json()).message;
  };
  const card = async (n: number): Promise<PlayerCard> => {
    asServer.authorization = `Bearer ${t.serverKey}`;
    const response = await t.app.inject({
      url: `/api/server/players/${steamIdFor(n)}/card`,
      headers: asServer,
    });
    expect(response.statusCode, response.body).toBe(200);
    return playerCardSchema.parse(response.json());
  };
  const profile = async (publicId: number) =>
    profileStatsSchema.parse(
      (await t.app.inject({ url: `/api/profiles/${publicId}/stats` })).json(),
    );
  const retakeOf = (stats: Awaited<ReturnType<typeof profile>>) =>
    stats.modes.find((m) => m.mode === 'retake');

  const N = { noPopulation: 7000, c01: 7001, x01: 7002, x05: 7003, dm: 7010 } as const;
  const publicIds = new Map<number, number>();
  const make = async (n: number) => {
    const who = await signedInPlayer(t, n);
    publicIds.set(n, who.account.publicId);
    return who.account.id;
  };
  const publicId = (n: number) => publicIds.get(n) as number;

  it('sem população do Modo (menos de 20 Contas), nenhum número de Rating aparece em lugar nenhum', async () => {
    // Fonte: ADR 0029, "Estados" e "Consequences": `sem população`, nunca um número inventado.
    const id = await make(N.noPopulation);
    await seedRetakeAccount(t, id, {
      ct: { ...zeroCounts, rounds: 150, kills: 90 },
      lifetimeRounds: 150,
    });

    const stats = await profile(publicId(N.noPopulation));

    expect(retakeOf(stats)?.rating).toEqual({ status: 'no_population' });
    expect(stats.overallRating ?? null).toBeNull();
    // No jogo e no card: nada que pareça o Rating (`0,85`) nem Calibrando.
    expect(await line(N.noPopulation, 'rank')).not.toMatch(/Rating|Calibrando/);
    expect(await line(N.noPopulation, 'stats')).not.toMatch(/Rating|Calibrando/);
    expect((await card(N.noPopulation)).rating).not.toMatch(/\d,\d{2}|Calibrando/);
  });

  it('o Perfil traz o Rating de cada Modo e o geral (c01: 0,85 em 636 rounds)', async () => {
    // Fonte: spec S21 "Perfil: o Rating do Modo é o número maior do topo, com o geral abaixo";
    // ADR 0029 (conta de c01: 0,85 com n = 636) e contrato ModeRating/OverallRating (packages/contracts/src/rating.ts).
    await seedPopulation(t);
    const c01 = sheet('c01');
    const id = await make(N.c01);
    await seedRetakeAccount(t, id, { ct: c01.ct, t: c01.t, lifetimeRounds: c01.lifetimeRounds });

    const stats = await profile(publicId(N.c01));

    expect(retakeOf(stats)?.rating).toEqual({ status: 'rated', rating: 0.85, rounds: 636 });
    expect(stats.overallRating).toEqual({ rating: 0.85, rounds: 636 });
  });

  it('o Deathmatch não tem Rating no Perfil (tem a Pontuação DM) e o geral não o conta', async () => {
    // Fonte: spec S21 "Deathmatch não tem Rating"; "Rating geral: ... O DM não entra".
    const who = await signedInPlayer(t, N.dm);
    await t.postgres.db.insert(accountStatsWeekly).values({
      accountId: who.account.id,
      mode: 'deathmatch',
      weekStart: thisWeek(),
      kills: 40,
      deaths: 30,
      assists: 0,
      headshots: 10,
      damage: 4000,
      roundsPlayed: 0,
      roundsWon: 0,
      secondsPlayed: 3600,
    });

    const stats = await profile(who.account.publicId);

    const dm = stats.modes.find((m) => m.mode === 'deathmatch');
    expect(dm).toBeDefined();
    expect(dm).not.toHaveProperty('rating');
    expect(stats.overallRating ?? null).toBeNull();
  });

  it('Conta com 37 rounds no Modo: Calibrando 37/100 no Perfil, no !rank, no !stats e no card', async () => {
    // Fonte: spec S21 "Aceite: Uma Conta com 37 rounds no Modo vê `Calibrando · 37/100` no Perfil, no
    // `!rank` e no card"; ADR 0029 ("Calibrando"). O texto difere entre a spec (`Calibrando · 37/100`)
    // e o ADR (`Calibrando 37/100`): o regex aceita as duas (pergunta no PR).
    const x01 = sheet('x01');
    const id = await make(N.x01);
    await seedRetakeAccount(t, id, { ct: x01.ct, t: x01.t, lifetimeRounds: x01.lifetimeRounds });
    const calibrating = /Calibrando\s*·?\s*37\/100/;

    const stats = await profile(publicId(N.x01));

    expect(retakeOf(stats)?.rating).toEqual({
      status: 'calibrating',
      rounds: 37,
      required: RATING_MIN_ROUNDS,
    });
    expect(stats.overallRating ?? null).toBeNull();
    expect(await line(N.x01, 'rank')).toMatch(calibrating);
    expect(await line(N.x01, 'stats')).toMatch(calibrating);
    expect((await card(N.x01)).rating).toMatch(calibrating);
  });

  it('com Rating: o !rank, o !stats e o card mostram 0,85 (vírgula, 2 casas) sem perder o resto da linha', async () => {
    // Fonte: spec S21 "`!rank` e `!stats` (S16) e o card (S19) mostram o Rating ou o Calibrando";
    // spec S19 (`rating` do card é o texto pronto, vazio = a linha some); ADR 0029 ("2 casas").
    const rank = await line(N.c01, 'rank');
    const stats = await line(N.c01, 'stats');
    const cardOf = await card(N.c01);

    expect(rank).toMatch(/0,85/);
    expect(rank).toMatch(/1º da semana/); // a posição do S16 continua
    expect(stats).toMatch(/0,85/);
    expect(stats).toMatch(/K\/D/); // os números do S16 continuam
    expect(cardOf.rating).toMatch(/0,85/);
    expect(cardOf.name).not.toBe('');
  });

  it('100 rounds na vida e nenhum nos 90 dias: Perfil sem Rating nessa janela, e nenhum número no card', async () => {
    // Fonte: ADR 0029 ("Calibrando": `Sem rounds nos últimos 90 dias`) e spec S21 "Janela do Perfil".
    // A semana antiga só existe para o Modo aparecer no Perfil (x05 não tem rounds recentes).
    const x05 = sheet('x05');
    const id = await make(N.x05);
    await seedRetakeAccount(t, id, {
      lifetimeRounds: x05.lifetimeRounds,
      weeklyRounds: x05.lifetimeRounds,
      weekStart: '2026-01-05',
    });

    const stats = await profile(publicId(N.x05));

    expect(retakeOf(stats)?.rating).toEqual({ status: 'no_rounds' });
    expect(stats.overallRating ?? null).toBeNull();
    expect((await card(N.x05)).rating).not.toMatch(/\d,\d{2}|Calibrando/);
  });
});
