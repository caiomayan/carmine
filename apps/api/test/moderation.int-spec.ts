import {
  type CurrentSession,
  currentSessionSchema,
  type GameSanction,
  liveServerListSchema,
  type Profile,
  playerConnectResultSchema,
  profileSchema,
  type StaffAccountDetail,
  type StaffRole,
  serverHeartbeatResultSchema,
  staffAccountDetailSchema,
  staffAccountSearchSchema,
  staffAuditPageSchema,
  staffErrorSchema,
  staffServerSchema,
} from '@carmine/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SessionStore } from '../src/auth/sessions.js';
import { GameServerRegistry } from '../src/game-servers/game-server-registry.js';
import { Sanctions } from '../src/moderation/sanctions.js';
import { StaffRoles } from '../src/staff/staff-roles.js';
import { VipPeriods } from '../src/vip/vip-periods.js';
import { startTestApp, steamIdFor, type TestApp } from './support/app.js';
import { signedInPlayer } from './support/player.js';

const HOUR = 60;
const DAY = 24 * HOUR;
/** Quem dá os papéis iniciais nos testes (como o CLI). */
const FOUNDER = steamIdFor(9999);

describe('Moderação (S07)', () => {
  let t: TestApp;
  let next = 1;
  let owner: Awaited<ReturnType<typeof staffMember>>;

  beforeAll(async () => {
    t = await startTestApp();
    owner = await staffMember('owner');
  });

  afterAll(async () => {
    await t?.stop();
  });

  /** Uma Conta reivindicada, com sessão, e com o papel de Staff dado direto (como o CLI). */
  async function staffMember(role: StaffRole | null) {
    const player = await signedInPlayer(t, next++);
    if (role) {
      await t.app
        .get(StaffRoles)
        .set(player.account.id, role, { actorSteamId: FOUNDER, reason: 'teste' });
    }
    return player;
  }

  async function connect(steamId: string, steamName = 'jogador') {
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/server/player-connects',
      headers: { authorization: `Bearer ${t.serverKey}` },
      payload: { steamId, steamName },
    });
    expect(response.statusCode, response.body).toBe(200);
    return playerConnectResultSchema.parse(response.json());
  }

  async function heartbeat(players: string[], key = t.serverKey) {
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/server/heartbeat',
      headers: { authorization: `Bearer ${key}` },
      payload: { map: 'de_mirage', players, maxPlayers: 9 },
    });
    expect(response.statusCode, response.body).toBe(200);
    return serverHeartbeatResultSchema.parse(response.json());
  }

  /** O Perfil como um visitante sem sessão o vê, ou como `viewer` (logado) o vê. */
  async function profileOf(publicId: number, viewer?: Staff): Promise<Profile> {
    const response = viewer
      ? await viewer.call('GET', `/api/profiles/${publicId}`)
      : await t.app.inject({ method: 'GET', url: `/api/profiles/${publicId}` });
    expect(response.statusCode, response.body).toBe(200);
    return profileSchema.parse(response.json());
  }

  async function me(player: { call: Awaited<ReturnType<typeof signedInPlayer>>['call'] }) {
    const response = await player.call('GET', '/api/me');
    return { status: response.statusCode, body: response.json() as CurrentSession };
  }

  type Staff = Awaited<ReturnType<typeof staffMember>>;

  async function punish(
    by: Staff,
    publicId: number,
    body: {
      category: string;
      reason: string;
      measures: { type: string; durationMinutes: number | null }[];
      witness?: string;
      evidenceUrl?: string;
    },
  ) {
    return by.call('POST', `/api/staff/accounts/${publicId}/sanctions`, body);
  }

  async function punished(by: Staff, publicId: number, body: Parameters<typeof punish>[2]) {
    const response = await punish(by, publicId, body);
    expect(response.statusCode, response.body).toBe(201);
    return staffAccountDetailSchema.parse(response.json());
  }

  const errorCode = (response: { json(): unknown }) => staffErrorSchema.parse(response.json()).code;

  const typesFor = (sanctions: GameSanction[], steamId: string) =>
    sanctions.filter((s) => s.steamId === steamId).map((s) => s.type);

  describe('papéis da Staff', () => {
    it('quem não é da Staff não usa o painel', async () => {
      const player = await staffMember(null);

      const response = await player.call('GET', '/api/staff/accounts?q=jog');

      expect(response.statusCode).toBe(403);
      expect(errorCode(response)).toBe('forbidden');
    });

    it('sem sessão, 401', async () => {
      const response = await t.app.inject({ method: 'GET', url: '/api/staff/accounts?q=jog' });

      expect(response.statusCode).toBe(401);
    });

    it('um Moderador não consegue alterar papéis de Staff', async () => {
      const moderator = await staffMember('moderator');
      const other = await staffMember(null);

      const response = await moderator.call(
        'PUT',
        `/api/staff/accounts/${other.account.publicId}/role`,
        { role: 'admin', reason: 'tentativa' },
      );

      expect(response.statusCode).toBe(403);
      expect(errorCode(response)).toBe('forbidden');
      expect(await t.app.get(StaffRoles).roleOf(other.account.id)).toBeNull();
    });

    it('o Dono dá e tira papéis, com auditoria, e /api/me mostra o papel', async () => {
      const other = await staffMember(null);

      const granted = await owner.call(
        'PUT',
        `/api/staff/accounts/${other.account.publicId}/role`,
        {
          role: 'admin',
          reason: 'novo admin',
        },
      );

      expect(granted.statusCode, granted.body).toBe(200);
      expect(staffAccountDetailSchema.parse(granted.json()).account.staffRole).toBe('admin');
      expect((await me(other)).body.staffRole).toBe('admin');

      const removed = await owner.call(
        'PUT',
        `/api/staff/accounts/${other.account.publicId}/role`,
        {
          role: null,
          reason: 'saiu',
        },
      );
      const detail = staffAccountDetailSchema.parse(removed.json());
      expect(detail.account.staffRole).toBeNull();
      expect(detail.audit.map((e) => e.action)).toEqual(['role_revoke', 'role_grant']);
      expect(detail.audit[1]).toMatchObject({
        actor: { steamId: owner.steamId, publicId: owner.account.publicId },
        reason: 'novo admin',
        details: { roleBefore: null, roleAfter: 'admin' },
      });
    });

    it('o último Dono não deixa de ser Dono', async () => {
      const roles = t.app.get(StaffRoles);
      const owners = (await roles.members()).filter((m) => m.role === 'owner');
      expect(owners).toHaveLength(1);

      const response = await owner.call(
        'PUT',
        `/api/staff/accounts/${owner.account.publicId}/role`,
        { role: 'admin', reason: 'teste' },
      );

      expect(response.statusCode).toBe(409);
      expect(errorCode(response)).toBe('last_owner');
    });

    it('papel só para Conta reivindicada', async () => {
      const steamId = steamIdFor(next++);
      await connect(steamId);
      const account = await t.accounts.findBySteamId(steamId);

      const response = await owner.call('PUT', `/api/staff/accounts/${account?.publicId}/role`, {
        role: 'moderator',
        reason: 'teste',
      });

      expect(response.statusCode).toBe(422);
      expect(errorCode(response)).toBe('account_not_claimed');
    });
  });

  describe('ban', () => {
    it('ban aplicado no site: o jogo derruba no próximo batimento e recusa o connect', async () => {
      const target = await staffMember(null);
      await connect(target.steamId);
      expect(typesFor((await heartbeat([target.steamId])).sanctions, target.steamId)).toEqual([]);

      await punished(owner, target.account.publicId, {
        category: 'griefing',
        reason: 'TK proposital em 3 rounds',
        measures: [{ type: 'ban', durationMinutes: 7 * DAY }],
      });

      const [ban] = (await heartbeat([target.steamId])).sanctions;
      expect(ban).toMatchObject({ steamId: target.steamId, type: 'ban', category: 'griefing' });
      expect(ban?.message).toMatch(
        /^Você está banido dos Servidores Carmine até \d{2}\/\d{2} às \d{2}:\d{2} \(Brasília\)\. Motivo: Griefing\. Para recorrer: localhost:3000\/regras#recurso$/,
      );
      expect(ban?.message).not.toContain('TK proposital');
      const reconnect = await connect(target.steamId);
      expect(reconnect.sanctions.map((s) => s.type)).toEqual(['ban']);
    });

    it('o ban derruba as sessões do site; num novo login, o site fica só leitura', async () => {
      const target = await staffMember(null);
      const store = t.app.get(SessionStore);
      const second = await store.create(target.account.id);
      expect((await me(target)).status).toBe(200);

      await punished(owner, target.account.publicId, {
        category: 'exploit',
        reason: 'bug de parede',
        measures: [{ type: 'ban', durationMinutes: DAY }],
      });

      expect((await me(target)).status).toBe(401);
      expect(await store.read(second.id)).toBeNull();

      const again = await signedInPlayer(t, Number(BigInt(target.steamId) - 76561198000000000n));
      const session = currentSessionSchema.parse((await again.call('GET', '/api/me')).json());
      expect(session.sanctions).toEqual([
        expect.objectContaining({ type: 'ban', category: 'exploit', reason: 'bug de parede' }),
      ]);
      const mutation = await again.call('POST', '/api/presets', { name: 'novo' });
      expect(mutation.statusCode).toBe(403);
      expect(mutation.json()).toMatchObject({ code: 'account_banned' });
      expect((await again.call('POST', '/api/auth/logout')).statusCode).toBe(204);
    });

    it('ban permanente por cheat encerra o VIP, com auditoria', async () => {
      const target = await signedInPlayer(t, next++, { vipUntil: Date.now() + 30 * 86_400_000 });

      const detail = await punished(owner, target.account.publicId, {
        category: 'cheat',
        reason: 'wallhack visto por 2 da Staff',
        measures: [{ type: 'ban', durationMinutes: null }],
        witness: 'Staff #10016 e #10019, no SP·1',
      });

      expect(detail.vip.active).toBe(false);
      // Mesmo instante: a ordem entre as duas não é garantida.
      expect(detail.audit.map((e) => e.action).sort()).toEqual(['sanction_apply', 'vip_revoke']);
    });

    it('ban por cheat sem testemunha nem evidência é recusado', async () => {
      const target = await staffMember(null);

      const response = await punish(owner, target.account.publicId, {
        category: 'cheat',
        reason: 'aimbot',
        measures: [{ type: 'ban', durationMinutes: null }],
      });

      expect(response.statusCode).toBe(400);
      expect(errorCode(response)).toBe('invalid_body');
      expect((await profileOf(target.account.publicId)).sanctions.active).toEqual([]);
    });

    it('cheat só com testemunha aparece como Violação das regras; com evidência, como Cheat', async () => {
      const witnessOnly = await staffMember(null);
      const withEvidence = await staffMember(null);
      const viewer = await staffMember(null);

      const detail = await punished(owner, witnessOnly.account.publicId, {
        category: 'cheat',
        reason: 'aimbot',
        measures: [{ type: 'ban', durationMinutes: null }],
        witness: 'fulano (Discord fulano#1), não joga aqui',
      });
      await punished(owner, withEvidence.account.publicId, {
        category: 'cheat',
        reason: 'aimbot',
        measures: [{ type: 'ban', durationMinutes: null }],
        evidenceUrl: 'https://youtu.be/demo123',
      });

      expect(detail.sanctions[0]).toMatchObject({
        category: 'cheat',
        witness: 'fulano (Discord fulano#1), não joga aqui',
        evidenceUrl: null,
      });
      expect(detail.audit[0]?.details).toMatchObject({
        witness: 'fulano (Discord fulano#1), não joga aqui',
      });
      const hidden = await profileOf(witnessOnly.account.publicId, viewer);
      expect(hidden.sanctions.active.map((s) => s.category)).toEqual(['rule_violation']);
      expect(hidden.sanctions.history?.map((s) => s.category)).toEqual(['rule_violation']);
      expect(JSON.stringify(hidden)).not.toContain('fulano');
      const shown = await profileOf(withEvidence.account.publicId, viewer);
      expect(shown.sanctions.active.map((s) => s.category)).toEqual(['cheat']);
      expect(JSON.stringify(shown)).not.toContain('youtu.be');
    });
  });

  describe('mute, gag, kick e aviso no jogo', () => {
    it('mute e gag aparecem no batimento e somem quando revogados', async () => {
      const target = await staffMember(null);
      const detail = await punished(owner, target.account.publicId, {
        category: 'discrimination',
        reason: 'ofensa racista no chat',
        measures: [
          { type: 'gag', durationMinutes: 7 * DAY },
          { type: 'mute', durationMinutes: HOUR },
        ],
      });

      expect(
        typesFor((await heartbeat([target.steamId])).sanctions, target.steamId).sort(),
      ).toEqual(['gag', 'mute']);

      const mute = detail.sanctions.find((s) => s.type === 'mute');
      const revoked = await owner.call('POST', `/api/staff/sanctions/${mute?.id}/revoke`, {
        reason: 'aplicado por engano',
        appealAccepted: false,
      });
      expect(revoked.statusCode, revoked.body).toBe(200);
      expect(typesFor((await heartbeat([target.steamId])).sanctions, target.steamId)).toEqual([
        'gag',
      ]);
    });

    it('kick e aviso vão nos batimentos por 60 s, para o plugin executar uma vez', async () => {
      const target = await staffMember(null);
      await punished(owner, target.account.publicId, {
        category: 'griefing',
        reason: 'AFK',
        measures: [{ type: 'kick', durationMinutes: null }],
      });
      await punished(owner, target.account.publicId, {
        category: 'offensive_chat',
        reason: 'ofensa direcionada',
        measures: [{ type: 'warning', durationMinutes: null }],
      });

      const sanctions = (await heartbeat([target.steamId])).sanctions;
      expect(typesFor(sanctions, target.steamId)).toEqual(['kick', 'warning']);
      const later = await t.app
        .get(Sanctions)
        .forGame([target.steamId], new Date(Date.now() + 61_000));
      expect(later).toEqual([]);
    });

    it('uma Punição temporária expira no horário, sem intervenção', async () => {
      const target = await staffMember(null);
      const now = new Date();
      await t.app
        .get(Sanctions)
        .apply(
          target.account.id,
          { actorSteamId: owner.steamId, reason: 'teste' },
          { category: 'offensive_chat', measures: [{ type: 'gag', durationMinutes: 60 }] },
          now,
        );
      const sanctions = t.app.get(Sanctions);
      const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000);

      expect((await sanctions.forGame([target.steamId], at(59))).map((s) => s.type)).toEqual([
        'gag',
      ]);
      expect(await sanctions.forGame([target.steamId], at(60))).toEqual([]);
      expect(
        (await sanctions.profileOf(target.account.id, { withHistory: true }, at(61))).active,
      ).toEqual([]);
    });
  });

  describe('regras do painel', () => {
    it('o Moderador pune temporário, mas não permanente nem um Admin', async () => {
      const moderator = await staffMember('moderator');
      const admin = await staffMember('admin');
      const target = await staffMember(null);

      const permanent = await punish(moderator, target.account.publicId, {
        category: 'cheat',
        reason: 'aimbot',
        measures: [{ type: 'ban', durationMinutes: null }],
        evidenceUrl: 'https://youtu.be/demo123',
      });
      expect(permanent.statusCode).toBe(403);
      expect(errorCode(permanent)).toBe('permanent_not_allowed');

      const onAdmin = await punish(moderator, admin.account.publicId, {
        category: 'griefing',
        reason: 'x'.repeat(5),
        measures: [{ type: 'kick', durationMinutes: null }],
      });
      expect(errorCode(onAdmin)).toBe('target_protected');

      const self = await punish(moderator, moderator.account.publicId, {
        category: 'griefing',
        reason: 'auto',
        measures: [{ type: 'kick', durationMinutes: null }],
      });
      expect(errorCode(self)).toBe('target_protected');
    });

    it('o Moderador só revoga o que aplicou; o Admin revoga qualquer uma', async () => {
      const moderator = await staffMember('moderator');
      const admin = await staffMember('admin');
      const target = await staffMember(null);
      const detail = await punished(owner, target.account.publicId, {
        category: 'griefing',
        reason: 'bloqueando o bomb',
        measures: [{ type: 'ban', durationMinutes: DAY }],
      });
      const id = detail.sanctions[0]?.id;

      const byModerator = await moderator.call('POST', `/api/staff/sanctions/${id}/revoke`, {
        reason: 'não',
        appealAccepted: false,
      });
      expect(errorCode(byModerator)).toBe('revoke_not_allowed');

      const byAdmin = await admin.call('POST', `/api/staff/sanctions/${id}/revoke`, {
        reason: 'recurso no Discord aceito',
        appealAccepted: true,
      });
      expect(byAdmin.statusCode, byAdmin.body).toBe(200);
      const again = await admin.call('POST', `/api/staff/sanctions/${id}/revoke`, {
        reason: 'de novo',
        appealAccepted: true,
      });
      expect(errorCode(again)).toBe('sanction_not_active');
    });

    it('sugere pela tabela de reincidência e registra a sugestão no log', async () => {
      const target = await staffMember(null);
      const first = await punished(owner, target.account.publicId, {
        category: 'offensive_chat',
        reason: 'primeira',
        measures: [{ type: 'warning', durationMinutes: null }],
      });
      expect(first.suggestions.find((s) => s.category === 'offensive_chat')).toEqual({
        category: 'offensive_chat',
        previousOffenses: 1,
        offense: 2,
        measures: [{ type: 'gag', durationMinutes: HOUR }],
      });

      const second = await punished(owner, target.account.publicId, {
        category: 'offensive_chat',
        reason: 'segunda, ajustada',
        measures: [{ type: 'gag', durationMinutes: 2 * HOUR }],
      });

      expect(second.suggestions.find((s) => s.category === 'offensive_chat')?.measures).toEqual([
        { type: 'gag', durationMinutes: DAY },
      ]);
      expect(second.audit[0]?.details).toMatchObject({
        category: 'offensive_chat',
        measures: [{ type: 'gag', durationMinutes: 2 * HOUR }],
        suggested: [{ type: 'gag', durationMinutes: HOUR }],
      });
    });

    it('busca por ID público, SteamID64, link Steam e parte do nome', async () => {
      const target = await staffMember(null);
      await connect(target.steamId, 'Zé Baiano');
      const search = async (q: string) => {
        const response = await owner.call('GET', `/api/staff/accounts?q=${encodeURIComponent(q)}`);
        expect(response.statusCode, response.body).toBe(200);
        return staffAccountSearchSchema.parse(response.json()).accounts.map((a) => a.publicId);
      };

      for (const q of [
        `#${target.account.publicId}`,
        target.steamId,
        `https://steamcommunity.com/profiles/${target.steamId}/`,
        'baian',
      ]) {
        expect(await search(q)).toContain(target.account.publicId);
      }
      expect(await search('%')).not.toContain(target.account.publicId);
    });
  });

  describe('Perfil público e /api/me', () => {
    it('mostra a ativa e o histórico sem avisos e sem o motivo; recurso aceito remove', async () => {
      const target = await staffMember(null);
      await punished(owner, target.account.publicId, {
        category: 'offensive_chat',
        reason: 'motivo interno sigiloso',
        measures: [{ type: 'warning', durationMinutes: null }],
      });
      const banned = await punished(owner, target.account.publicId, {
        category: 'griefing',
        reason: 'motivo interno sigiloso',
        measures: [{ type: 'ban', durationMinutes: DAY }],
      });

      const viewer = await staffMember(null);
      const profile = await profileOf(target.account.publicId, viewer);
      expect(profile.sanctions.active.map((s) => [s.type, s.category])).toEqual([
        ['ban', 'griefing'],
      ]);
      expect(profile.sanctions.history?.map((s) => s.type)).toEqual(['ban']);
      expect(JSON.stringify(profile)).not.toContain('sigiloso');

      const ban = banned.sanctions.find((s) => s.type === 'ban');
      await owner.call('POST', `/api/staff/sanctions/${ban?.id}/revoke`, {
        reason: 'recurso aceito',
        appealAccepted: true,
      });
      expect((await profileOf(target.account.publicId, viewer)).sanctions).toEqual({
        active: [],
        history: [],
      });
    });

    it('sem sessão, o Perfil mostra só o selo da Punição ativa, sem o histórico', async () => {
      const target = await staffMember(null);
      await punished(owner, target.account.publicId, {
        category: 'griefing',
        reason: 'bloqueando o bomb',
        measures: [{ type: 'ban', durationMinutes: DAY }],
      });

      const anonymous = await profileOf(target.account.publicId);

      expect(anonymous.sanctions.active.map((s) => s.type)).toEqual(['ban']);
      expect(anonymous.sanctions.history).toBeNull();
    });

    it('a própria Conta vê o motivo das Punições ativas em /api/me', async () => {
      const target = await staffMember(null);
      await punished(owner, target.account.publicId, {
        category: 'offensive_voice',
        reason: 'gravação no ticket 42',
        measures: [{ type: 'mute', durationMinutes: HOUR }],
      });

      const { body } = await me(target);
      expect(body.sanctions).toEqual([
        expect.objectContaining({ type: 'mute', reason: 'gravação no ticket 42' }),
      ]);
      expect(body.account.sanctions.active).toHaveLength(1);
    });
  });

  describe('VIP e Nome de exibição pelo painel', () => {
    it('concede e revoga VIP, com auditoria', async () => {
      const target = await staffMember(null);
      const granted = await owner.call(
        'POST',
        `/api/staff/accounts/${target.account.publicId}/vip/grant`,
        { days: 30, reason: 'beta' },
      );
      expect(staffAccountDetailSchema.parse(granted.json()).vip.active).toBe(true);

      const revoked = await owner.call(
        'POST',
        `/api/staff/accounts/${target.account.publicId}/vip/revoke`,
        { reason: 'fim do teste' },
      );
      const detail: StaffAccountDetail = staffAccountDetailSchema.parse(revoked.json());
      expect(detail.vip.active).toBe(false);
      expect(detail.audit.map((e) => e.action)).toEqual(['vip_revoke', 'vip_grant']);

      const again = await owner.call(
        'POST',
        `/api/staff/accounts/${target.account.publicId}/vip/revoke`,
        { reason: 'de novo' },
      );
      expect(errorCode(again)).toBe('no_vip_to_revoke');
    });

    it('um Moderador não mexe em VIP', async () => {
      const moderator = await staffMember('moderator');
      const target = await staffMember(null);

      const response = await moderator.call(
        'POST',
        `/api/staff/accounts/${target.account.publicId}/vip/grant`,
        { days: 30, reason: 'amigo' },
      );

      expect(errorCode(response)).toBe('forbidden');
      expect((await t.app.get(VipPeriods).statusOf(target.account.id)).active).toBe(false);
    });

    it('reset do nome: "Jogador #ID" enquanto o nome Steam não mudar', async () => {
      const steamId = steamIdFor(next++);
      await connect(steamId, 'nome horrível');
      const account = await t.accounts.findBySteamId(steamId);
      const publicId = account?.publicId ?? 0;

      const reset = await owner.call('POST', `/api/staff/accounts/${publicId}/display-name/reset`, {
        reason: 'nome ofensivo',
      });

      expect(reset.statusCode, reset.body).toBe(200);
      expect(staffAccountDetailSchema.parse(reset.json()).account.displayName).toBe(
        `Jogador #${publicId}`,
      );
      expect((await connect(steamId, 'nome horrível')).displayName).toBe(`Jogador #${publicId}`);
      expect((await connect(steamId, 'nome limpo')).displayName).toBe('nome limpo');
    });
  });

  describe('Servidores Carmine: nome de vitrine e código', () => {
    it('o hostname vai no batimento e o nome aparece na lista pública', async () => {
      const { server, key } = await t.app
        .get(GameServerRegistry)
        .register({ name: 'retake-vitrine', mode: 'retake', address: '127.0.0.1:27030' });

      expect((await heartbeat([], key)).hostname).toBeNull();
      const updated = await owner.call('PATCH', `/api/staff/servers/${server.id}`, {
        showcaseName: 'Retake · Rotação',
        code: 'SP·2',
        reason: 'lançamento',
      });

      expect(updated.statusCode, updated.body).toBe(200);
      expect(staffServerSchema.parse(updated.json()).hostname).toBe(
        'Carmine | Retake · Rotação | SP·2',
      );
      expect((await heartbeat([], key)).hostname).toBe('Carmine | Retake · Rotação | SP·2');
      const list = liveServerListSchema.parse(
        (await t.app.inject({ method: 'GET', url: '/api/servers' })).json(),
      );
      expect(list.servers.find((s) => s.id === server.id)).toMatchObject({
        showcaseName: 'Retake · Rotação',
        code: 'SP·2',
      });
    });

    it('código repetido é recusado; o Moderador não edita servidores', async () => {
      const registry = t.app.get(GameServerRegistry);
      const { server } = await registry.register({
        name: 'dm-vitrine',
        mode: 'deathmatch',
        address: '127.0.0.1:27031',
      });
      const body = { showcaseName: 'Deathmatch · Livre', code: 'SP·9', reason: 'lançamento' };
      expect((await owner.call('PATCH', `/api/staff/servers/${server.id}`, body)).statusCode).toBe(
        200,
      );
      const { server: other } = await registry.register({
        name: 'dm-vitrine-2',
        mode: 'deathmatch',
        address: '127.0.0.1:27032',
      });

      const taken = await owner.call('PATCH', `/api/staff/servers/${other.id}`, body);
      expect(taken.statusCode).toBe(409);
      expect(errorCode(taken)).toBe('server_code_taken');

      const moderator = await staffMember('moderator');
      const forbidden = await moderator.call('PATCH', `/api/staff/servers/${other.id}`, {
        ...body,
        code: 'SP·8',
      });
      expect(errorCode(forbidden)).toBe('forbidden');
    });
  });

  describe('log de auditoria', () => {
    it('toda ação de Staff aparece, com filtros e paginação', async () => {
      const admin = await staffMember('admin');
      const target = await staffMember(null);
      await punished(admin, target.account.publicId, {
        category: 'griefing',
        reason: 'AFK proposital',
        measures: [{ type: 'kick', durationMinutes: null }],
      });
      await admin.call('POST', `/api/staff/accounts/${target.account.publicId}/vip/grant`, {
        days: 3,
        reason: 'compensação',
      });
      await admin.call(
        'POST',
        `/api/staff/accounts/${target.account.publicId}/display-name/reset`,
        {
          reason: 'nome ofensivo',
        },
      );

      const page = async (query: string) => {
        const response = await owner.call('GET', `/api/staff/audit?${query}`);
        expect(response.statusCode, response.body).toBe(200);
        return staffAuditPageSchema.parse(response.json());
      };

      const byActor = await page(`actor=${admin.steamId}`);
      expect(byActor.entries.map((e) => e.action)).toEqual([
        'display_name_reset',
        'vip_grant',
        'sanction_apply',
      ]);
      expect(byActor.entries[2]).toMatchObject({
        actor: { steamId: admin.steamId },
        targetAccount: { steamId: target.steamId, publicId: target.account.publicId },
        reason: 'AFK proposital',
      });

      const first = await page(`target=${target.steamId}&limit=2`);
      expect(first.entries).toHaveLength(2);
      const second = await page(
        `target=${target.steamId}&limit=2&before=${encodeURIComponent(first.nextCursor ?? '')}`,
      );
      expect(second.entries.map((e) => e.action)).toEqual(['sanction_apply']);
      expect(second.nextCursor).toBeNull();

      const servers = await page('action=server_update');
      expect(servers.entries.length).toBeGreaterThan(0);
      expect(servers.entries[0]?.targetServer?.name).toMatch(/vitrine/);
    });

    it('o Moderador não lê o log inteiro', async () => {
      const moderator = await staffMember('moderator');

      expect(errorCode(await moderator.call('GET', '/api/staff/audit'))).toBe('forbidden');
    });
  });
});
