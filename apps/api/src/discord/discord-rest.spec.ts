import { describe, expect, it, vi } from 'vitest';
import { DiscordApiError } from './discord-client.js';
import { DiscordRest } from './discord-rest.js';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

function rest(responses: Response[]) {
  const calls: Call[] = [];
  const sleeps: number[] = [];
  let clock = 1_000_000;
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method ?? 'GET',
      headers: init?.headers as Record<string, string>,
      body: init?.body as string | undefined,
    });
    const next = responses.shift();
    if (!next) throw new Error('resposta não prevista');
    return next;
  }) as unknown as typeof fetch;
  const client = new DiscordRest({
    clientId: '100',
    clientSecret: 'segredo',
    botToken: 'token-do-bot',
    guildId: '200',
    apiUrl: 'https://discord.test/api/v10',
    authorizeUrl: 'https://discord.test/oauth2/authorize',
    redirectUri: 'https://stcarmine.com/api/auth/discord/callback',
    fetchImpl,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
    now: () => clock,
  });
  return { client, calls, sleeps };
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, ...init });

describe('DiscordRest', () => {
  it('monta a URL de autorização com o redirect fixo, os escopos e o state', () => {
    const url = new URL(rest([]).client.authorizeUrl('estado-1'));
    expect(url.origin + url.pathname).toBe('https://discord.test/oauth2/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: '100',
      response_type: 'code',
      redirect_uri: 'https://stcarmine.com/api/auth/discord/callback',
      scope: 'identify guilds.join',
      state: 'estado-1',
      prompt: 'none',
    });
  });

  it('um 429 espera o retry_after e repete a mesma chamada', async () => {
    const { client, calls, sleeps } = rest([
      json(
        { message: 'You are being rate limited.', retry_after: 1.5, global: false },
        { status: 429 },
      ),
      new Response(null, { status: 204 }),
    ]);

    await expect(client.addRole('300', '400', 'Vínculo')).resolves.toBe(true);

    expect(calls).toHaveLength(2);
    expect(calls.map((c) => c.method)).toEqual(['PUT', 'PUT']);
    expect(calls[0]?.url).toBe('https://discord.test/api/v10/guilds/200/members/300/roles/400');
    expect(calls[0]?.headers.authorization).toBe('Bot token-do-bot');
    expect(sleeps).toEqual([1500]);
  });

  it('com o balde zerado (Remaining 0), a próxima chamada da rota espera o Reset-After', async () => {
    const { client, sleeps } = rest([
      new Response(null, {
        status: 204,
        headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset-after': '0.8' },
      }),
      new Response(null, { status: 204 }),
    ]);

    await client.addRole('300', '400', 'a');
    await client.addRole('300', '401', 'b');

    expect(sleeps).toEqual([800]);
  });

  it('um 429 global trava também as outras rotas', async () => {
    const { client, sleeps } = rest([
      json({ retry_after: 2, global: true }, { status: 429 }),
      new Response(null, { status: 204 }),
      json({ id: '999' }),
    ]);

    await client.addRole('300', '400', 'a');
    await client.postMessage('500', { embeds: [] });

    // Só a espera do 429; a segunda rota já encontra o relógio depois do bloqueio.
    expect(sleeps).toEqual([2000]);
  });

  it('desiste depois de tentar de novo demais, sem ficar em laço', async () => {
    const { client, calls } = rest(
      Array.from({ length: 10 }, () => json({ retry_after: 0.1 }, { status: 429 })),
    );

    await expect(client.addRole('300', '400', 'a')).rejects.toMatchObject({
      name: 'DiscordApiError',
      status: 429,
    });
    expect(calls).toHaveLength(4);
  });

  it('não espera um 429 longo demais: falha para o job tentar no próximo ciclo', async () => {
    const { client, sleeps } = rest([json({ retry_after: 600 }, { status: 429 })]);

    await expect(client.addRole('300', '400', 'a')).rejects.toBeInstanceOf(DiscordApiError);
    expect(sleeps).toEqual([]);
  });

  it('pessoa fora do servidor (404) vira nulo/falso, não erro', async () => {
    const { client } = rest([
      json({ code: 10007 }, { status: 404 }),
      json({ code: 10007 }, { status: 404 }),
    ]);

    expect(await client.memberRoles('300')).toBeNull();
    expect(await client.removeRole('300', '400', 'a')).toBe(false);
  });

  it('outros erros viram DiscordApiError com o status', async () => {
    const { client } = rest([json({ message: 'Missing Permissions' }, { status: 403 })]);

    await expect(client.addRole('300', '400', 'a')).rejects.toMatchObject({ status: 403 });
  });

  it('o motivo da mudança vai no registro de auditoria do Discord, codificado', async () => {
    const { client, calls } = rest([new Response(null, { status: 204 })]);

    await client.addRole('300', '400', 'Vínculo com a Conta #10003');

    expect(calls[0]?.headers['x-audit-log-reason']).toBe(
      encodeURIComponent('Vínculo com a Conta #10003'),
    );
  });

  it('troca o code pelo token e lê o usuário, sem guardar o token', async () => {
    const { client, calls } = rest([
      json({ access_token: 'tok-de-uso-unico', token_type: 'Bearer' }),
      json({ id: '300', username: 'coldzera', global_name: 'Coldzera' }),
    ]);

    const result = await client.exchangeCode('codigo');

    expect(result).toEqual({
      accessToken: 'tok-de-uso-unico',
      user: { id: '300', username: 'Coldzera' },
    });
    expect(calls[0]?.url).toBe('https://discord.test/api/v10/oauth2/token');
    expect(Object.fromEntries(new URLSearchParams(calls[0]?.body))).toEqual({
      client_id: '100',
      client_secret: 'segredo',
      grant_type: 'authorization_code',
      code: 'codigo',
      redirect_uri: 'https://stcarmine.com/api/auth/discord/callback',
    });
    expect(calls[0]?.headers.authorization).toBeUndefined();
    expect(calls[1]?.headers.authorization).toBe('Bearer tok-de-uso-unico');
  });

  it('as mensagens do bot nunca marcam ninguém', async () => {
    const { client, calls } = rest([json({ id: '999' })]);

    expect(await client.postMessage('500', { embeds: [{ title: 'Status' }] })).toBe('999');

    expect(JSON.parse(calls[0]?.body ?? '{}')).toEqual({
      embeds: [{ title: 'Status' }],
      allowed_mentions: { parse: [] },
    });
  });

  it('editar uma mensagem que sumiu devolve falso', async () => {
    const { client } = rest([json({ code: 10008 }, { status: 404 })]);

    expect(await client.editMessage('500', '999', { embeds: [] })).toBe(false);
  });
});
