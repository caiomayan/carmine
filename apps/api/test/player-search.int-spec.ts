import { PLAYER_SEARCH_LIMIT, playerSearchSchema } from '@carmine/contracts';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accounts } from '../src/database/schema.js';
import { startTestApp, steamIdFor, type TestApp } from './support/app.js';

describe('Busca de jogadores pelo nome (paleta Ctrl+K)', () => {
  let t: TestApp;
  let next = 1;

  /** Cria a Conta como o jogo cria: no primeiro connect, com o nome Steam. */
  async function connect(steamName: string): Promise<number> {
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/server/player-connects',
      headers: { authorization: `Bearer ${t.serverKey}` },
      payload: { steamId: steamIdFor(next++), steamName },
    });
    return response.json<{ publicId: number }>().publicId;
  }

  const search = (q: string) =>
    t.app.inject({ url: `/api/players/search?q=${encodeURIComponent(q)}` });

  async function names(q: string): Promise<string[]> {
    const response = await search(q);
    expect(response.statusCode).toBe(200);
    return playerSearchSchema.parse(response.json()).players.map((p) => p.displayName);
  }

  beforeAll(async () => {
    t = await startTestApp({ RATE_LIMIT_SEARCH_PER_MINUTE: '40' });
  });

  afterAll(async () => {
    await t?.stop();
  });

  it('acha por parte do nome, sem ligar para maiúsculas nem acento', async () => {
    await connect('Aurélio');
    await connect('coldzera');

    expect(await names('aurelio')).toEqual(['Aurélio']);
    expect(await names('AURÉL')).toEqual(['Aurélio']);
    expect(await names('zera')).toEqual(['coldzera']);
    expect(await names('nada-disso')).toEqual([]);
  });

  it('devolve só ID público, nome e avatar: nunca o SteamID64', async () => {
    const publicId = await connect('Ornitorrinco');

    const response = await search('ornito');

    expect(response.json()).toEqual({
      players: [{ publicId, displayName: 'Ornitorrinco', avatarUrl: null }],
    });
    expect(response.body).not.toContain('steamId');
    expect(response.body).not.toContain('7656119');
  });

  it('ordena: nome igual, começa com, começa uma palavra, contém', async () => {
    await connect('xxfoguete');
    await connect('Rei Foguete');
    await connect('Foguetes Dois');
    await connect('foguete');

    expect(await names('foguete')).toEqual([
      'foguete',
      'Foguetes Dois',
      'Rei Foguete',
      'xxfoguete',
    ]);
  });

  it('no empate, vem quem jogou há menos tempo', async () => {
    const older = await connect('Gemeo Velho');
    await connect('Gemeo Novo');
    await t.postgres.db
      .update(accounts)
      .set({ lastConnectedAt: new Date('2026-01-01T00:00:00Z') })
      .where(eq(accounts.publicId, older));

    expect(await names('gemeo')).toEqual(['Gemeo Novo', 'Gemeo Velho']);
  });

  it('limita o resultado', async () => {
    for (let i = 0; i < PLAYER_SEARCH_LIMIT + 3; i++) await connect(`Multidao ${i}`);

    expect(await names('multidao')).toHaveLength(PLAYER_SEARCH_LIMIT);
  });

  it('o Perfil privado aparece pelo nome: só as Estatísticas ficam escondidas', async () => {
    const publicId = await connect('Reservado');
    await t.postgres.db
      .update(accounts)
      .set({ profilePrivate: true })
      .where(eq(accounts.publicId, publicId));

    const response = await search('reservado');

    expect(response.json()).toEqual({
      players: [{ publicId, displayName: 'Reservado', avatarUrl: null }],
    });
  });

  it('a Conta anonimizada não aparece', async () => {
    const publicId = await connect('Esquecido');
    await t.postgres.db
      .update(accounts)
      .set({ anonymizedAt: new Date() })
      .where(eq(accounts.publicId, publicId));

    expect(await names('esquecido')).toEqual([]);
  });

  it('o curinga do LIKE vale como letra', async () => {
    await connect('100% real');
    await connect('cem por cento');

    expect(await names('100%')).toEqual(['100% real']);
    expect(await names('__')).toEqual([]);
  });

  it.each([
    ['sem busca', ''],
    ['de uma letra só', 'a'],
    ['só espaços', '   '],
    ['longa demais', 'a'.repeat(51)],
  ])('recusa a busca %s com 400', async (_title, q) => {
    expect((await search(q)).statusCode).toBe(400);
  });

  it('recusa quando falta o parâmetro', async () => {
    expect((await t.app.inject({ url: '/api/players/search' })).statusCode).toBe(400);
  });

  it('tem rate limit próprio, por IP', async () => {
    const ip = '198.51.100.77';
    const get = () => t.app.inject({ url: '/api/players/search?q=ab', remoteAddress: ip });
    const first = await get();
    expect(first.statusCode).toBe(200);
    expect(first.headers['ratelimit-policy']).toBe('"search";q=40;w=60');

    for (let i = 1; i < 40; i++) await get();

    const limited = await get();
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
  });
});
