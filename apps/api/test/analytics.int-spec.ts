import { analyticsPreferenceSchema } from '@carmine/contracts/analytics';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Analytics, AnalyticsPreferences } from '../src/analytics/analytics.js';
import { accounts } from '../src/database/schema.js';
import { startTestApp, type TestApp } from './support/app.js';
import { signedInPlayer } from './support/player.js';

/**
 * A chave "Participar da análise de uso" (A1, ADR 0021): vem ligada, o direito de oposição vale na hora e a Conta
 * anonimizada nunca participa. Sem a chave do PostHog a análise está desligada, e o endpoint diz isso para o web esconder a chave.
 */
describe('Participar da análise de uso', () => {
  let t: TestApp;
  let next = 1;

  beforeAll(async () => {
    // O modo `log` (a homologação) liga a análise sem enviar nada a ninguém.
    t = await startTestApp({ ANALYTICS_DRIVER: 'log', ANALYTICS_ENVIRONMENT: 'staging' });
  });

  afterAll(async () => {
    await t?.stop();
  });

  const preference = async (player: Awaited<ReturnType<typeof signedInPlayer>>) =>
    analyticsPreferenceSchema.parse((await player.call('GET', '/api/me/analytics')).json());

  it('a Conta nova participa por padrão e a análise aparece como ligada', async () => {
    const player = await signedInPlayer(t, next++);

    expect(await preference(player)).toEqual({ participate: true, enabled: true });
    expect(t.app.get(Analytics).enabled).toBe(true);
    expect(await t.app.get(AnalyticsPreferences).participates(player.account.id)).toBe(true);
  });

  it('desligar a chave vale na hora e fica gravado; ligar de novo volta', async () => {
    const player = await signedInPlayer(t, next++);
    const preferences = t.app.get(AnalyticsPreferences);
    // Aquece o cache da decisão com "participa": o PUT precisa descartá-lo.
    expect(await preferences.participates(player.account.id)).toBe(true);

    const off = await player.call('PUT', '/api/me/analytics', { participate: false });

    expect(off.statusCode, off.body).toBe(200);
    expect(analyticsPreferenceSchema.parse(off.json())).toEqual({
      participate: false,
      enabled: true,
    });
    expect(await preference(player)).toMatchObject({ participate: false });
    expect(await preferences.participates(player.account.id)).toBe(false);
    const [row] = await t.postgres.db
      .select({ optOut: accounts.analyticsOptOut })
      .from(accounts)
      .where(eq(accounts.id, player.account.id));
    expect(row?.optOut).toBe(true);

    await player.call('PUT', '/api/me/analytics', { participate: true });
    expect(await preferences.participates(player.account.id)).toBe(true);
  });

  it('a escolha é de cada Conta', async () => {
    const out = await signedInPlayer(t, next++);
    const stays = await signedInPlayer(t, next++);

    await out.call('PUT', '/api/me/analytics', { participate: false });

    expect(await preference(out)).toMatchObject({ participate: false });
    expect(await preference(stays)).toMatchObject({ participate: true });
  });

  it('Conta anonimizada nunca participa, nem inexistente', async () => {
    const player = await signedInPlayer(t, next++);
    const preferences = t.app.get(AnalyticsPreferences);
    await t.postgres.db
      .update(accounts)
      .set({ anonymizedAt: new Date() })
      .where(eq(accounts.id, player.account.id));

    // Outra instância, sem o cache da anterior.
    const fresh = new AnalyticsPreferences(t.postgres.db);
    expect(await fresh.participates(player.account.id)).toBe(false);
    expect(await fresh.participates('00000000-0000-4000-8000-000000000000')).toBe(false);
    expect(preferences).toBeDefined();
  });

  it('pede sessão e CSRF, e recusa um corpo fora do contrato', async () => {
    const player = await signedInPlayer(t, next++);

    expect((await t.app.inject({ method: 'GET', url: '/api/me/analytics' })).statusCode).toBe(401);
    expect(
      (
        await t.app.inject({
          method: 'PUT',
          url: '/api/me/analytics',
          payload: { participate: false },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (await player.call('PUT', '/api/me/analytics', { participate: 'talvez' })).statusCode,
    ).toBe(400);
  });
});

describe('Análise desligada (padrão)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await startTestApp();
  });

  afterAll(async () => {
    await t?.stop();
  });

  it('sem a chave do PostHog a API diz que está desligada e a escolha continua valendo', async () => {
    const player = await signedInPlayer(t, 1);

    expect(
      analyticsPreferenceSchema.parse((await player.call('GET', '/api/me/analytics')).json()),
    ).toEqual({
      participate: true,
      enabled: false,
    });
    expect(t.app.get(Analytics).enabled).toBe(false);
    const set = await player.call('PUT', '/api/me/analytics', { participate: false });
    expect(analyticsPreferenceSchema.parse(set.json())).toEqual({
      participate: false,
      enabled: false,
    });
  });
});
