import { currentSessionSchema, discordLinkStatusSchema } from '@carmine/contracts';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from '../src/auth/session-cookies.js';
import { SessionStore } from '../src/auth/sessions.js';
import { discordLinks, vipPeriods } from '../src/database/schema.js';
import { StaffRoles } from '../src/staff/staff-roles.js';
import { VipPeriods } from '../src/vip/vip-periods.js';
import { startTestApp, type TestApp } from './support/app.js';
import { Browser } from './support/browser.js';
import {
  FAKE_DISCORD_BOT_TOKEN,
  FAKE_DISCORD_GUILD_ID,
  FakeDiscord,
  type FakeDiscordUser,
} from './support/fake-discord.js';
import { signedInPlayer } from './support/player.js';

const ROLE = {
  player: '810000000000000001',
  vip: '810000000000000002',
  staff: '810000000000000003',
  owner: '810000000000000004',
};
const COMMUNITY_ROLE = '810000000000000099';
const STATUS_CHANNEL = '820000000000000001';
const STAFF = { actorSteamId: '76561198000009999', reason: 'teste' };

describe('Discord integrado (S15)', () => {
  let discord: FakeDiscord;
  let t: TestApp;
  let next = 1;

  beforeAll(async () => {
    discord = await FakeDiscord.start();
    t = await startTestApp({
      DISCORD_CLIENT_ID: '830000000000000001',
      DISCORD_CLIENT_SECRET: 'segredo-do-cliente',
      DISCORD_BOT_TOKEN: FAKE_DISCORD_BOT_TOKEN,
      DISCORD_GUILD_ID: FAKE_DISCORD_GUILD_ID,
      DISCORD_ROLE_PLAYER_ID: ROLE.player,
      DISCORD_ROLE_VIP_ID: ROLE.vip,
      DISCORD_ROLE_STAFF_ID: ROLE.staff,
      DISCORD_ROLE_OWNER_ID: ROLE.owner,
      DISCORD_STATUS_CHANNEL_ID: STATUS_CHANNEL,
      DISCORD_API_URL: discord.apiUrl,
      DISCORD_AUTHORIZE_URL: discord.authorizeUrl,
      // Os jobs rodam de verdade, só que a cada segundo em vez de a cada 30 s / 1 min.
      DISCORD_SYNC_SECONDS: '1',
      DISCORD_STATUS_SECONDS: '1',
    });
  }, 180_000);

  afterAll(async () => {
    await t?.stop();
    await discord?.stop();
  });

  /** Uma Conta com sessão, e um navegador com o cookie dela. */
  const account = async (options: { vipUntil?: number } = {}) => {
    const n = next++;
    const player = await signedInPlayer(t, 1000 + n, options);
    const session = await t.app.get(SessionStore).create(player.account.id);
    const browser = new Browser(t.app);
    browser.cookies.set(SESSION_COOKIE, session.id);
    const user: FakeDiscordUser = {
      id: String(840000000000000000n + BigInt(n)),
      username: `u${n}`,
    };
    return { ...player, browser, user };
  };
  type Player = Awaited<ReturnType<typeof account>>;

  /** O vínculo como o navegador faz: início → Discord autoriza → volta ao callback. */
  const link = async (p: Player, user = p.user, returnTo = '/10001') => {
    const start = await p.browser.get(
      `/api/auth/discord/link?returnTo=${encodeURIComponent(returnTo)}`,
    );
    expect(start.statusCode, start.body).toBe(302);
    const authorize = new URL(String(start.headers.location));
    expect(authorize.origin + authorize.pathname).toBe(discord.authorizeUrl);
    const code = discord.issueCode(user);
    return p.browser.get(
      `/api/auth/discord/callback?code=${code}&state=${authorize.searchParams.get('state')}`,
    );
  };

  const resultOf = (response: { headers: Record<string, unknown> }) => {
    const location = new URL(String(response.headers.location));
    return { path: location.pathname, discord: location.searchParams.get('discord') };
  };

  const rolesOf = (user: FakeDiscordUser) => discord.rolesOf(user.id);
  const eventually = (check: () => unknown, expected: unknown) =>
    expect.poll(check, { timeout: 20_000, interval: 200 }).toEqual(expected);
  const status = async (p: Player) =>
    discordLinkStatusSchema.parse((await p.call('GET', '/api/discord/link')).json());

  describe('vínculo (OAuth2)', () => {
    it('sem sessão Steam o vínculo nem começa: manda entrar', async () => {
      const response = await new Browser(t.app).get('/api/auth/discord/link?returnTo=/10001');

      expect(response.statusCode).toBe(302);
      const to = new URL(String(response.headers.location));
      expect(to.pathname).toBe('/entrar');
      expect(to.searchParams.get('voltar')).toBe('/10001');
    });

    it('começa com redirect_uri fixo, escopos identify e guilds.join e um state aleatório', async () => {
      const p = await account();

      const start = await p.browser.get('/api/auth/discord/link');

      const authorize = new URL(String(start.headers.location));
      expect(Object.fromEntries(authorize.searchParams)).toMatchObject({
        client_id: '830000000000000001',
        response_type: 'code',
        redirect_uri: 'http://localhost:3000/api/auth/discord/callback',
        scope: 'identify guilds.join',
      });
      expect(authorize.searchParams.get('state')).toHaveLength(43);
      expect(p.browser.cookie('carmine_discord')).toBe(authorize.searchParams.get('state'));
    });

    it('vincula: mostra o usuário do Discord, põe a pessoa no servidor e dá o cargo de Jogador', async () => {
      const p = await account();

      const back = await link(p);

      expect(back.statusCode).toBe(303);
      expect(resultOf(back)).toEqual({ path: '/10001', discord: 'vinculado' });
      expect((await status(p)).link?.username).toBe(`Nome ${p.user.id}`);
      expect((await status(p)).enabled).toBe(true);
      // Ela não estava no servidor: guilds.join a pôs, e o cargo veio na hora (sem esperar o job).
      expect(rolesOf(p.user)).toEqual([ROLE.player]);
      // Só o necessário: ID e nome, nenhum token.
      const [row] = await t.postgres.db
        .select()
        .from(discordLinks)
        .where(eq(discordLinks.accountId, p.account.id));
      expect(Object.keys(row ?? {}).sort()).toEqual([
        'accountId',
        'discordId',
        'linkedAt',
        'retryAt',
        'syncedAt',
        'syncedRoles',
        'username',
      ]);
      expect(JSON.stringify(row)).not.toContain('token');
    });

    it('quem já está no servidor não é posto de novo e mantém os cargos da comunidade', async () => {
      const p = await account();
      discord.join(p.user.id, [COMMUNITY_ROLE]);

      await link(p);

      expect(rolesOf(p.user)).toEqual([ROLE.player, COMMUNITY_ROLE].sort());
      expect(discord.calls(new RegExp(`PUT .*members/${p.user.id}$`))).toEqual([]);
    });

    it('recusa state inválido: outro state, sem cookie, ou reaproveitado', async () => {
      const p = await account();
      const start = await p.browser.get('/api/auth/discord/link');
      const state = new URL(String(start.headers.location)).searchParams.get('state');
      const code = discord.issueCode(p.user);

      // state diferente do cookie
      const forged = await p.browser.get(`/api/auth/discord/callback?code=${code}&state=forjado`);
      expect(resultOf(forged).discord).toBe('invalido');

      // sem o cookie do fluxo (outro navegador com a mesma sessão)
      const other = new Browser(t.app);
      other.cookies.set(SESSION_COOKIE, p.browser.cookie(SESSION_COOKIE) ?? '');
      const noCookie = await other.get(`/api/auth/discord/callback?code=${code}&state=${state}`);
      expect(resultOf(noCookie).discord).toBe('invalido');

      expect((await status(p)).link).toBeNull();
      expect(discord.members.has(p.user.id)).toBe(false);
    });

    it('o state é de uso único', async () => {
      const p = await account();
      const start = await p.browser.get('/api/auth/discord/link');
      const state = new URL(String(start.headers.location)).searchParams.get('state');
      const callback = (code: string) =>
        p.browser.get(`/api/auth/discord/callback?code=${code}&state=${state}`);
      p.browser.cookies.set('carmine_discord', String(state));

      expect(resultOf(await callback(discord.issueCode(p.user))).discord).toBe('vinculado');
      p.browser.cookies.set('carmine_discord', String(state));
      expect(resultOf(await callback(discord.issueCode(p.user))).discord).toBe('invalido');
    });

    it('o state de uma Conta não vale para a sessão de outra (login CSRF)', async () => {
      const victim = await account();
      const attacker = await account();
      const start = await attacker.browser.get('/api/auth/discord/link');
      const state = new URL(String(start.headers.location)).searchParams.get('state') ?? '';
      // A vítima segue o link do atacante: tem o cookie e a sessão dela, mas o state é de outra Conta.
      victim.browser.cookies.set('carmine_discord', state);

      const back = await victim.browser.get(
        `/api/auth/discord/callback?code=${discord.issueCode(attacker.user)}&state=${state}`,
      );

      expect(resultOf(back).discord).toBe('invalido');
      expect((await status(victim)).link).toBeNull();
    });

    it('desistir na tela do Discord volta como cancelado, sem vincular', async () => {
      const p = await account();
      const start = await p.browser.get('/api/auth/discord/link');
      const state = new URL(String(start.headers.location)).searchParams.get('state');

      const back = await p.browser.get(
        `/api/auth/discord/callback?error=access_denied&state=${state}`,
      );

      expect(resultOf(back).discord).toBe('cancelado');
      expect((await status(p)).link).toBeNull();
    });

    it('um Discord só liga a uma Conta: a segunda é recusada e a primeira continua', async () => {
      const first = await account();
      const second = await account();
      await link(first);

      const back = await link(second, first.user);

      expect(resultOf(back).discord).toBe('em-uso');
      expect((await status(second)).link).toBeNull();
      expect((await status(first)).link).not.toBeNull();
    });

    it('uma Conta com Discord ligado não liga outro sem desvincular', async () => {
      const p = await account();
      await link(p);

      const back = await link(p, { id: '850000000000000001', username: 'outro' });

      expect(resultOf(back).discord).toBe('conta-ja-vinculada');
      expect((await status(p)).link?.username).toBe(`Nome ${p.user.id}`);
    });

    it('sem sessão a volta do Discord não liga nada', async () => {
      const response = await new Browser(t.app).get('/api/auth/discord/callback?code=x&state=y');

      expect(response.statusCode).toBe(303);
      expect(new URL(String(response.headers.location)).pathname).toBe('/entrar');
    });
  });

  describe('cargos sincronizados', () => {
    it('um VIP concedido dá o cargo VIP e um VIP vencido o tira, pelo job', async () => {
      const p = await account();
      await link(p);
      expect(rolesOf(p.user)).toEqual([ROLE.player]);

      await t.app.get(VipPeriods).grant(p.account.id, 30, new Date(), STAFF);
      await eventually(() => rolesOf(p.user), [ROLE.player, ROLE.vip].sort());

      // O Período acaba sem nenhum evento: só o job percebe.
      await t.postgres.db
        .update(vipPeriods)
        .set({
          startsAt: new Date(Date.now() - 2 * 86_400_000),
          endsAt: new Date(Date.now() - 1000),
        })
        .where(eq(vipPeriods.accountId, p.account.id));
      await eventually(() => rolesOf(p.user), [ROLE.player]);
    });

    it('um VIP revogado pela Staff tira o cargo', async () => {
      const p = await account({ vipUntil: Date.now() + 10 * 86_400_000 });
      await link(p);
      expect(rolesOf(p.user)).toEqual([ROLE.player, ROLE.vip].sort());

      await t.app.get(VipPeriods).revoke(p.account.id, STAFF);

      await eventually(() => rolesOf(p.user), [ROLE.player]);
    });

    it('um papel de Staff dado no painel vira cargo; Dono soma o cargo Dono; tirar o papel tira os cargos', async () => {
      const p = await account();
      const other = await account();
      await link(p);
      const staff = t.app.get(StaffRoles);
      // A plataforma não fica sem Dono: outro Dono segura a vez enquanto este muda de papel.
      await staff.set(other.account.id, 'owner', STAFF);

      await staff.set(p.account.id, 'moderator', STAFF);
      await eventually(() => rolesOf(p.user), [ROLE.player, ROLE.staff].sort());

      await staff.set(p.account.id, 'owner', STAFF);
      await eventually(() => rolesOf(p.user), [ROLE.player, ROLE.staff, ROLE.owner].sort());

      await staff.set(p.account.id, 'admin', STAFF);
      await eventually(() => rolesOf(p.user), [ROLE.player, ROLE.staff].sort());

      await staff.set(p.account.id, null, STAFF);
      await eventually(() => rolesOf(p.user), [ROLE.player]);
    });

    it('aguenta o 429 do Discord: espera o retry_after e termina de aplicar os cargos', async () => {
      const p = await account({ vipUntil: Date.now() + 10 * 86_400_000 });
      discord.rateLimitNext = 3;

      await link(p);

      expect(rolesOf(p.user)).toEqual([ROLE.player, ROLE.vip].sort());
    });

    it('com o Discord fora do ar o vínculo não fica pela metade: avisa e dá para tentar de novo', async () => {
      const p = await account();
      discord.broken = true;

      const back = await link(p);

      expect(resultOf(back).discord).toBe('indisponivel');
      expect((await status(p)).link).toBeNull();
      discord.broken = false;
      expect(resultOf(await link(p)).discord).toBe('vinculado');
      expect(rolesOf(p.user)).toEqual([ROLE.player]);
    });

    it('o job reaplica os cargos de um vínculo que falhou depois, quando o Discord volta', async () => {
      const p = await account();
      await link(p);
      discord.broken = true;
      await t.app.get(VipPeriods).grant(p.account.id, 30, new Date(), STAFF);
      await new Promise((resolve) => setTimeout(resolve, 2500));
      expect(rolesOf(p.user)).toEqual([ROLE.player]);

      discord.broken = false;

      // Tenta de novo em segundos (10 s depois da falha).
      await eventually(() => rolesOf(p.user), [ROLE.player, ROLE.vip].sort());
    });

    it('quem sai do servidor do Discord não derruba o job das outras Contas', async () => {
      const gone = await account();
      const stays = await account();
      await link(gone);
      await link(stays);
      discord.members.delete(gone.user.id);

      await t.app.get(VipPeriods).grant(stays.account.id, 30, new Date(), STAFF);

      await eventually(() => rolesOf(stays.user), [ROLE.player, ROLE.vip].sort());
      expect((await status(gone)).link).not.toBeNull();
    });
  });

  describe('desvincular', () => {
    it('tira os cargos, apaga o vínculo e preserva os cargos da comunidade', async () => {
      const p = await account({ vipUntil: Date.now() + 10 * 86_400_000 });
      discord.join(p.user.id, [COMMUNITY_ROLE]);
      await link(p);
      expect(rolesOf(p.user)).toEqual([ROLE.player, ROLE.vip, COMMUNITY_ROLE].sort());

      const response = await p.call('DELETE', '/api/discord/link');

      expect(response.statusCode, response.body).toBe(204);
      expect(rolesOf(p.user)).toEqual([COMMUNITY_ROLE]);
      expect((await status(p)).link).toBeNull();
    });

    it('exige o token CSRF', async () => {
      const p = await account();
      await link(p);

      const response = await p.browser.request({ method: 'DELETE', url: '/api/discord/link' });

      expect(response.statusCode).toBe(403);
      expect((await status(p)).link).not.toBeNull();
    });

    it('se o Discord falhar, o vínculo fica (nunca sobram cargos de quem já não está ligado)', async () => {
      const p = await account();
      await link(p);
      discord.broken = true;

      const response = await p.call('DELETE', '/api/discord/link');
      discord.broken = false;

      expect(response.statusCode).toBe(503);
      expect((await status(p)).link).not.toBeNull();
      expect((await p.call('DELETE', '/api/discord/link')).statusCode).toBe(204);
      expect(rolesOf(p.user)).toEqual([]);
    });

    it('depois de desvincular, o mesmo Discord pode ser ligado a outra Conta', async () => {
      const first = await account();
      const second = await account();
      await link(first);
      await first.call('DELETE', '/api/discord/link');

      const back = await link(second, first.user);

      expect(resultOf(back).discord).toBe('vinculado');
    });
  });

  describe('bot de status', () => {
    it('posta uma mensagem e depois só edita a mesma, a cada ciclo', async () => {
      await eventually(
        () =>
          [...discord.messages.values()].some(
            (m) => m.channelId === STATUS_CHANNEL && m.edits >= 2,
          ),
        true,
      );

      const statusMessages = [...discord.messages.entries()].filter(
        ([, m]) => m.channelId === STATUS_CHANNEL,
      );
      expect(statusMessages).toHaveLength(1);
      expect(discord.calls(/POST .*messages$/)).toHaveLength(1);
      const body = statusMessages[0]?.[1].body as {
        embeds: { title: string; description: string }[];
      };
      const embed = body.embeds[0];
      expect(embed?.title).toBe('Servidores Carmine');
      expect(embed?.description).toContain('retake-teste');
      expect(embed?.description).toContain('offline');
    });

    it('se apagarem a mensagem, posta outra e volta a editar essa', async () => {
      const [id] = [...discord.messages.keys()];
      discord.messages.delete(String(id));

      await eventually(
        () =>
          [...discord.messages.values()].some(
            (m) => m.channelId === STATUS_CHANNEL && m.edits >= 1,
          ),
        true,
      );

      expect(discord.messages.has(String(id))).toBe(false);
      expect(
        [...discord.messages.values()].filter((m) => m.channelId === STATUS_CHANNEL),
      ).toHaveLength(1);
    });
  });

  describe('perfil', () => {
    it('a sessão (GET /api/me) segue sem nenhum dado do Discord', async () => {
      const p = await account();
      await link(p);

      const me = currentSessionSchema.parse((await p.call('GET', '/api/me')).json());

      expect(JSON.stringify(me).toLowerCase()).not.toContain('discord');
    });
  });
});

describe('Discord integrado (S15) desligado', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await startTestApp();
  }, 180_000);

  afterAll(async () => {
    await t?.stop();
  });

  it('sem as variáveis, a integração fica desligada sem erro: estado e vínculo respondem', async () => {
    const p = await signedInPlayer(t, 5000);

    expect(
      discordLinkStatusSchema.parse((await p.call('GET', '/api/discord/link')).json()),
    ).toEqual({
      enabled: false,
      link: null,
    });
    const session = await t.app.get(SessionStore).create(p.account.id);
    const start = await new Browser(t.app).get('/api/auth/discord/link?returnTo=/10001', {
      cookie: `${SESSION_COOKIE}=${session.id}`,
    });
    expect(start.statusCode).toBe(302);
    expect(new URL(String(start.headers.location)).searchParams.get('discord')).toBe('desligado');
    expect((await p.call('DELETE', '/api/discord/link')).statusCode).toBe(204);
  });
});
