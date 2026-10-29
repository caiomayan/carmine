import {
  profileSchema,
  REPORT_DAILY_LIMIT,
  REPORTER_ARCHIVED_MIN,
  reportResultSchema,
  STAFF_ERROR_STATUS,
  staffErrorSchema,
  staffReportPageSchema,
} from '@carmine/contracts';
import {
  AVATAR_BLOCK_DAYS_MAX,
  AVATAR_BLOCK_DAYS_SUGGESTED,
  AVATAR_ERROR_STATUS,
  AVATAR_HISTORY_SIZE,
  AVATAR_REPORTS_PER_HOUR,
  AVATAR_SIZES,
  type AvatarReason,
  avatarErrorSchema,
  avatarReportReceivedSchema,
  avatarStateSchema,
  type StaffAvatarCase,
  staffAccountAvatarSchema,
  staffAvatarCasePageSchema,
  staffAvatarCaseSchema,
} from '@carmine/contracts/avatar';
import { and, eq, sql } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AvatarRetention } from '../src/avatars/avatar-retention.js';
import { MediaDeletions } from '../src/avatars/media-deletions.js';
import {
  accountAvatars,
  accounts,
  avatarReports,
  mediaDeletions,
  reports,
  staffAuditLog,
} from '../src/database/schema.js';
import { StaffRoles } from '../src/staff/staff-roles.js';
import { startTestApp, steamIdFor, type TestApp } from './support/app.js';
import { FakeMedia } from './support/fake-media.js';
import { signedInPlayer } from './support/player.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const PUBLIC = 'carmine-media';
const PRIVATE = 'carmine-media-removidas';
const ORIGIN = 'https://img.test';
const STEAM_AVATAR = 'https://avatars.steamstatic.com/abc_full.jpg';
const FOUNDER = steamIdFor(9999);

const photo = () =>
  sharp({
    create: { width: 512, height: 512, channels: 3, background: { r: 20, g: 120, b: 200 } },
  })
    .png()
    .toBuffer();

/**
 * Moderação da foto de perfil (ADR 0022 e 0025): a denúncia que só entra na fila, a imagem aprovada que fica
 * imune, o peso de quem denuncia, a fila e a decisão da Staff, a remoção em um clique com o bloqueio que a Staff
 * escolhe, a foto do histórico e a auditoria. O R2 e a purga da Cloudflare são de mentira (`FakeMedia`).
 */
describe('Moderação da foto de perfil (F2 e S18)', () => {
  let t: TestApp;
  let media: FakeMedia;
  let next = 1;

  beforeAll(async () => {
    media = await FakeMedia.start();
    t = await startTestApp({
      R2_MEDIA_ENDPOINT: media.url,
      R2_MEDIA_ACCESS_KEY_ID: 'chave',
      R2_MEDIA_SECRET_ACCESS_KEY: 'segredo',
      R2_MEDIA_PUBLIC_BUCKET: PUBLIC,
      R2_MEDIA_PRIVATE_BUCKET: PRIVATE,
      MEDIA_PUBLIC_URL: ORIGIN,
      CLOUDFLARE_ZONE_ID: 'zona-1',
      CLOUDFLARE_PURGE_TOKEN: 'token-1',
      CLOUDFLARE_API_URL: `${media.url}/client/v4`,
      MEDIA_SWEEP_SECONDS: '0',
    });
  });

  afterAll(async () => {
    await t?.stop();
    await media?.stop();
  });

  const drain = () => t.app.get(MediaDeletions).drain();
  const keysOf = (id: string, bucket: string) => media.keys(bucket).filter((k) => k.includes(id));

  /** Uma Conta que pode enviar (reivindicada, com a foto da Steam) e já com foto própria no ar. */
  async function withPhoto() {
    const player = await signedInPlayer(t, next++);
    await t.postgres.db
      .update(accounts)
      .set({ steamAvatarUrl: STEAM_AVATAR, avatarUrl: STEAM_AVATAR })
      .where(eq(accounts.id, player.account.id));
    const sent = await player.raw('POST', '/api/me/avatar', await photo(), 'image/png');
    expect(sent.statusCode, sent.body).toBe(200);
    const [row] = await t.postgres.db
      .select()
      .from(accountAvatars)
      .where(eq(accountAvatars.accountId, player.account.id));
    return { player, avatarId: row?.id as string };
  }

  type Owner = Awaited<ReturnType<typeof withPhoto>>['player'];

  /**
   * Um novo envio da Conta, com o tempo da janela de envios já passado (assim passa de 5 envios sem bater no
   * limite). Devolve o ID da foto que ficou no ar.
   */
  async function replaceWith(player: Owner): Promise<string> {
    await t.postgres.db
      .update(accountAvatars)
      .set({ createdAt: sql`${accountAvatars.createdAt} - interval '31 minutes'` })
      .where(eq(accountAvatars.accountId, player.account.id));
    const sent = await player.raw('POST', '/api/me/avatar', await photo(), 'image/png');
    expect(sent.statusCode, sent.body).toBe(200);
    const [active] = await t.postgres.db
      .select()
      .from(accountAvatars)
      .where(
        and(eq(accountAvatars.accountId, player.account.id), eq(accountAvatars.status, 'active')),
      );
    return active?.id as string;
  }

  /** Uma Conta comum, só para denunciar. */
  const reporter = () => signedInPlayer(t, next++);

  async function staff(role: 'owner' | 'admin' | 'moderator' = 'moderator') {
    const member = await signedInPlayer(t, next++);
    await t.app
      .get(StaffRoles)
      .set(member.account.id, role, { actorSteamId: FOUNDER, reason: 'teste' });
    return member;
  }

  const report = (who: Awaited<ReturnType<typeof reporter>>, target: Owner, reason = 'other') =>
    who.call('POST', `/api/profiles/${target.account.publicId}/avatar-report`, { reason });

  const stateOf = async (player: Owner) =>
    avatarStateSchema.parse((await player.call('GET', '/api/me/avatar')).json());

  const effectiveAvatar = async (player: Owner) =>
    profileSchema.parse(
      (await t.app.inject({ url: `/api/profiles/${player.account.publicId}` })).json(),
    ).avatarUrl;

  const row = async (avatarId: string) => {
    const [found] = await t.postgres.db
      .select()
      .from(accountAvatars)
      .where(eq(accountAvatars.id, avatarId));
    return found;
  };

  const blockedUntilOf = async (player: Owner) => {
    const [found] = await t.postgres.db
      .select({ until: accounts.avatarUploadBlockedUntil })
      .from(accounts)
      .where(eq(accounts.id, player.account.id));
    return found?.until ?? null;
  };

  const auditOf = (action: 'avatar_keep' | 'avatar_remove') =>
    t.postgres.db.select().from(staffAuditLog).where(eq(staffAuditLog.action, action));

  const decide = (member: Awaited<ReturnType<typeof staff>>, avatarId: string, body: object) =>
    member.call('POST', `/api/staff/avatars/${avatarId}/decision`, body);

  /** Toda a fila aberta, página a página (ela é compartilhada com os outros testes). */
  async function openCases(
    member: Awaited<ReturnType<typeof staff>>,
    limit = 20,
  ): Promise<StaffAvatarCase[]> {
    const cases: StaffAvatarCase[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const response = await member.call(
        'GET',
        `/api/staff/avatar-reports?limit=${limit}${cursor ? `&before=${cursor}` : ''}`,
      );
      expect(response.statusCode, response.body).toBe(200);
      const page = staffAvatarCasePageSchema.parse(response.json());
      cases.push(...page.cases);
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor && pages < 200);
    const ids = cases.map((c) => c.avatar.id);
    expect(new Set(ids).size, 'a paginação repetiu um caso').toBe(ids.length);
    return cases;
  }

  const openQueue = async (member: Awaited<ReturnType<typeof staff>>, limit = 20) =>
    (await openCases(member, limit)).map((c) => c.avatar.id);

  describe('denunciar', () => {
    it('uma denúncia entra na fila e a foto segue no ar; a resposta não diz mais nada', async () => {
      const { player, avatarId } = await withPhoto();
      const who = await reporter();

      const response = await report(who, player, 'sexual');

      expect(response.statusCode, response.body).toBe(200);
      expect(avatarReportReceivedSchema.parse(response.json())).toEqual({ received: true });
      expect((await row(avatarId))?.status).toBe('active');
      expect((await stateOf(player)).custom?.status).toBe('active');
      expect(await effectiveAvatar(player)).toContain(avatarId);
    });

    it('recusa sem sessão, a própria foto, Perfil sem foto, repetida e motivo inválido', async () => {
      const { player } = await withPhoto();
      const who = await reporter();
      const plain = await reporter();
      const code = async (response: Awaited<ReturnType<typeof report>>) => {
        const error = avatarErrorSchema.parse(response.json());
        expect(response.statusCode).toBe(AVATAR_ERROR_STATUS[error.code]);
        return error.code;
      };

      const anonymous = await t.app.inject({
        method: 'POST',
        url: `/api/profiles/${player.account.publicId}/avatar-report`,
        payload: { reason: 'other' },
      });
      expect([401, 403]).toContain(anonymous.statusCode);
      expect(await code(await report(player, player))).toBe('own_avatar');
      expect(await code(await report(who, plain))).toBe('no_custom_avatar');
      expect((await report(who, player)).statusCode).toBe(200);
      expect(await code(await report(who, player))).toBe('already_reported');
      const other = await reporter();
      expect(
        await code(
          await other.call('POST', `/api/profiles/${player.account.publicId}/avatar-report`, {
            reason: 'inventado',
          }),
        ),
      ).toBe('invalid_body');
    });

    it(`passou de ${AVATAR_REPORTS_PER_HOUR} denúncias por hora, a pessoa espera (report_limit)`, async () => {
      const who = await reporter();
      for (let i = 0; i < AVATAR_REPORTS_PER_HOUR; i += 1) {
        const { player } = await withPhoto();
        expect((await report(who, player)).statusCode).toBe(200);
      }
      const { player } = await withPhoto();

      const blocked = await report(who, player);

      expect(blocked.statusCode).toBe(429);
      const error = avatarErrorSchema.parse(blocked.json());
      expect(error.code).toBe('report_limit');
      expect(error.retryAfter).toBeTruthy();
    });
  });

  describe('a denúncia não tira nada do ar', () => {
    it('várias Contas diferentes denunciam e a foto segue no ar, no avatar efetivo e no bucket público', async () => {
      const { player, avatarId } = await withPhoto();

      for (let i = 0; i < 4; i += 1) {
        expect((await report(await reporter(), player, 'hate')).statusCode).toBe(200);
      }

      const found = await row(avatarId);
      expect(found).toMatchObject({ status: 'active', takenDownAt: null });
      expect(await effectiveAvatar(player)).toContain(avatarId);
      expect((await stateOf(player)).custom?.status).toBe('active');
      await drain();
      expect(keysOf(avatarId, PUBLIC)).toHaveLength(AVATAR_SIZES.length);
      expect(keysOf(avatarId, PRIVATE)).toEqual([]);
      // Todas entram na fila da Staff, que é quem decide.
      const moderator = await staff();
      expect((await openCases(moderator)).find((c) => c.avatar.id === avatarId)).toMatchObject({
        avatar: { status: 'active' },
        reports: { reporters: 4 },
      });
    });

    it('a mesma Conta denunciando duas vezes não conta como duas', async () => {
      const { player, avatarId } = await withPhoto();
      const who = await reporter();

      expect((await report(who, player)).statusCode).toBe(200);
      expect((await report(who, player)).statusCode).toBe(409);

      expect((await row(avatarId))?.status).toBe('active');
    });
  });

  describe('a fila da Staff', () => {
    it('lista o caso aberto com quem denunciou, os motivos e a imagem; só a Staff com a permissão vê', async () => {
      const { player, avatarId } = await withPhoto();
      await report(await reporter(), player, 'hate');
      await report(await reporter(), player, 'minor');
      const moderator = await staff('moderator');

      const response = await moderator.call('GET', '/api/staff/avatar-reports');

      expect(response.statusCode, response.body).toBe(200);
      const page = staffAvatarCasePageSchema.parse(response.json());
      const found = page.cases.find((c) => c.avatar.id === avatarId);
      expect(found).toMatchObject({
        avatar: { status: 'active', url: `${ORIGIN}/avatars/${avatarId}/512.webp` },
        account: { publicId: player.account.publicId },
        reports: { reporters: 2 },
        previousRemovals: 0,
        decision: null,
      });
      expect(found?.reports.byReason).toEqual([
        { reason: 'hate', count: 1 },
        { reason: 'minor', count: 1 },
      ]);
      // A foto segue no ar, então uma terceira pessoa ainda pode denunciar: a fila só soma.
      expect((await report(await reporter(), player, 'hate')).statusCode).toBe(200);
      expect(page.openCount).toBeGreaterThanOrEqual(1);

      const image = await moderator.call('GET', `/api/staff/avatars/${avatarId}/image`);
      expect(image.statusCode).toBe(200);
      expect(image.headers['content-type']).toBe('image/webp');
      expect(image.headers['cache-control']).toContain('no-store');
      expect((await sharp(image.rawPayload).metadata()).format).toBe('webp');

      const common = await reporter();
      expect((await common.call('GET', '/api/staff/avatar-reports')).statusCode).toBe(403);
      expect((await common.call('GET', `/api/staff/avatars/${avatarId}/image`)).statusCode).toBe(
        403,
      );
    });

    it('as abertas vêm das mais antigas; paginar não repete nem perde casos', async () => {
      const moderator = await staff('admin');
      const made: string[] = [];
      for (let i = 0; i < 3; i += 1) {
        const { player, avatarId } = await withPhoto();
        await report(await reporter(), player);
        made.push(avatarId);
      }

      // A fila é compartilhada com os outros testes: anda de duas em duas até acabar.
      const ids: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const response = await moderator.call(
          'GET',
          `/api/staff/avatar-reports?limit=2${cursor ? `&before=${cursor}` : ''}`,
        );
        expect(response.statusCode, response.body).toBe(200);
        const page = staffAvatarCasePageSchema.parse(response.json());
        expect(page.cases.length).toBeLessThanOrEqual(2);
        ids.push(...page.cases.map((c) => c.avatar.id));
        cursor = page.nextCursor;
        pages += 1;
      } while (cursor && pages < 50);
      expect(pages).toBeGreaterThan(1);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of made) expect(ids).toContain(id);
      // As mais antigas primeiro: a ordem em que foram denunciadas.
      expect(made.map((id) => ids.indexOf(id))).toEqual(
        [...made.map((id) => ids.indexOf(id))].sort((x, y) => x - y),
      );
      const invalid = await moderator.call('GET', '/api/staff/avatar-reports?before=lixo');
      expect(invalid.statusCode).toBe(400);
    });
  });

  describe('decidir', () => {
    it('manter: as denúncias são arquivadas, fica no log e a imagem aprovada fica imune; só uma imagem nova pode ser denunciada de novo', async () => {
      const { player, avatarId } = await withPhoto();
      const first = await reporter();
      await report(first, player);
      await report(await reporter(), player);
      const moderator = await staff();

      const response = await decide(moderator, avatarId, {
        decision: 'keep',
        note: 'Revisei: é uma arte, sem problema',
      });

      expect(response.statusCode, response.body).toBe(200);
      const decided = staffAvatarCaseSchema.parse(response.json());
      expect(decided.avatar.status).toBe('active');
      expect(decided.decision).toMatchObject({
        decision: 'keep',
        note: 'Revisei: é uma arte, sem problema',
        by: { steamId: moderator.steamId },
      });
      expect(await row(avatarId)).toMatchObject({ status: 'active', decision: 'keep' });
      expect(await effectiveAvatar(player)).toContain(avatarId);
      await drain();
      expect(keysOf(avatarId, PUBLIC)).toHaveLength(AVATAR_SIZES.length);
      expect(keysOf(avatarId, PRIVATE)).toEqual([]);
      const reports = await t.postgres.db
        .select()
        .from(avatarReports)
        .where(eq(avatarReports.avatarId, avatarId));
      expect(reports.every((r) => r.dismissedAt !== null)).toBe(true);
      const logged = (await auditOf('avatar_keep')).find(
        (a) => a.targetSteamId === BigInt(player.steamId),
      );
      expect(logged?.reason).toBe('Revisei: é uma arte, sem problema');
      // O caso sai da fila aberta e vai para as decididas.
      expect(await openQueue(moderator)).not.toContain(avatarId);
      const history = staffAvatarCasePageSchema.parse(
        (await moderator.call('GET', '/api/staff/avatar-reports?status=decided')).json(),
      );
      expect(history.cases.map((c) => c.avatar.id)).toContain(avatarId);

      // Imune: novas denúncias contra a mesma imagem são descartadas (a resposta é a mesma, inclusive para
      // quem já tinha denunciado), nada entra na fila e nada sai do ar.
      expect((await report(await reporter(), player, 'hate')).statusCode).toBe(200);
      expect((await report(first, player)).statusCode).toBe(200);
      const after = await t.postgres.db
        .select()
        .from(avatarReports)
        .where(eq(avatarReports.avatarId, avatarId));
      expect(after).toHaveLength(2);
      expect(await openQueue(moderator)).not.toContain(avatarId);
      expect((await row(avatarId))?.status).toBe('active');

      // Uma imagem nova não herda a imunidade: ela pode ser denunciada.
      const fresh = await replaceWith(player);
      expect((await report(await reporter(), player, 'hate')).statusCode).toBe(200);
      expect(await openQueue(moderator)).toContain(fresh);
    });

    it('remover: a Conta volta à Steam, a imagem fica guardada 30 dias, o envio é bloqueado pelos dias escolhidos e o dono vê o aviso', async () => {
      const { player, avatarId } = await withPhoto();
      await report(await reporter(), player, 'sexual');
      await report(await reporter(), player, 'sexual');
      const moderator = await staff('owner');
      const before = Date.now();

      const response = await decide(moderator, avatarId, {
        decision: 'remove',
        reason: 'sexual',
        note: 'Nudez confirmada na imagem',
        blockDays: AVATAR_BLOCK_DAYS_SUGGESTED,
      });

      expect(response.statusCode, response.body).toBe(200);
      expect(staffAvatarCaseSchema.parse(response.json()).decision).toMatchObject({
        decision: 'remove',
        reason: 'sexual',
      });
      expect(await row(avatarId)).toMatchObject({
        status: 'removed',
        decision: 'remove',
        decisionReason: 'sexual',
      });
      expect(await effectiveAvatar(player)).toBe(STEAM_AVATAR);
      const until = await blockedUntilOf(player);
      expect(until?.getTime()).toBeGreaterThan(
        before + (AVATAR_BLOCK_DAYS_SUGGESTED - 0.01) * DAY_MS,
      );
      expect(until?.getTime()).toBeLessThan(
        Date.now() + (AVATAR_BLOCK_DAYS_SUGGESTED + 0.01) * DAY_MS,
      );
      // Guardada em privado pelo prazo (a retenção está na fila para daqui a 30 dias).
      await drain();
      expect(keysOf(avatarId, PUBLIC)).toEqual([]);
      expect(keysOf(avatarId, PRIVATE)).toHaveLength(AVATAR_SIZES.length);
      const retained = await t.postgres.db
        .select()
        .from(mediaDeletions)
        .where(eq(mediaDeletions.bucket, 'private'));
      const mine = retained.filter((r) => r.key.includes(avatarId));
      expect(mine).toHaveLength(AVATAR_SIZES.length);
      expect(mine.every((r) => r.runAt.getTime() > Date.now() + 29 * DAY_MS)).toBe(true);
      // O dono só vê "indisponível" e o aviso da remoção, sem a data do bloqueio.
      const state = await stateOf(player);
      expect(state).toMatchObject({
        source: 'steam',
        custom: null,
        canUpload: false,
        cannotUploadReason: 'upload_blocked',
        removal: { reason: 'sexual' },
      });
      expect(JSON.stringify(state)).not.toContain(until?.toISOString() ?? 'nunca');
      const logged = (await auditOf('avatar_remove')).find(
        (a) => a.targetSteamId === BigInt(player.steamId),
      );
      expect(logged?.reason).toBe('Nudez confirmada na imagem');
      expect(logged?.details).toMatchObject({ avatarId, avatarReason: 'sexual', blockDays: 7 });
    });

    it('o bloqueio dura os dias que a Staff escolher; sem blockDays, ou com 0, não há bloqueio, nem escada automática', async () => {
      const { player, avatarId } = await withPhoto();
      const moderator = await staff();
      const remove = (id: string, extra: object = {}) =>
        decide(moderator, id, { decision: 'remove', reason: 'hate', note: 'nota', ...extra });
      const unblock = () =>
        t.postgres.db
          .update(accounts)
          .set({ avatarUploadBlockedUntil: null })
          .where(eq(accounts.id, player.account.id));

      // 1ª remoção, sem blockDays: não bloqueia, e a Conta já pode enviar outra foto.
      expect((await remove(avatarId)).statusCode).toBe(200);
      expect(await blockedUntilOf(player)).toBeNull();
      expect((await stateOf(player)).canUpload).toBe(true);

      // 2ª remoção (reincidência), com 30 dias: bloqueia 30 dias.
      const second = await replaceWith(player);
      const response = await remove(second, { blockDays: 30 });
      expect(response.statusCode, response.body).toBe(200);
      expect(staffAvatarCaseSchema.parse(response.json()).previousRemovals).toBe(1);
      const until = await blockedUntilOf(player);
      expect(until?.getTime()).toBeGreaterThan(Date.now() + (30 - 0.01) * DAY_MS);
      expect(until?.getTime()).toBeLessThan(Date.now() + (30 + 0.01) * DAY_MS);

      // 3ª remoção, sem blockDays: a reincidência não vira bloqueio sozinha (a escada de 7, 30 e 365 dias saiu).
      await unblock();
      const third = await replaceWith(player);
      expect((await remove(third)).statusCode).toBe(200);
      expect(await blockedUntilOf(player)).toBeNull();

      // 0 também não bloqueia; 365 é o teto e mais que isso é inválido.
      const fourth = await replaceWith(player);
      expect((await remove(fourth, { blockDays: 0 })).statusCode).toBe(200);
      expect(await blockedUntilOf(player)).toBeNull();
      const fifth = await replaceWith(player);
      const tooLong = await remove(fifth, { blockDays: AVATAR_BLOCK_DAYS_MAX + 1 });
      expect(tooLong.statusCode).toBe(400);
      expect((await row(fifth))?.status).toBe('active');
      expect((await remove(fifth, { blockDays: AVATAR_BLOCK_DAYS_MAX })).statusCode).toBe(200);
      expect((await blockedUntilOf(player))?.getTime()).toBeGreaterThan(
        Date.now() + (AVATAR_BLOCK_DAYS_MAX - 0.01) * DAY_MS,
      );
    });

    it('recusa decidir de novo (avatar_not_reviewable), foto inexistente e remover sem motivo', async () => {
      const { avatarId } = await withPhoto();
      const moderator = await staff();
      const error = async (response: Awaited<ReturnType<typeof decide>>) => {
        const body = staffErrorSchema.parse(response.json());
        expect(response.statusCode).toBe(STAFF_ERROR_STATUS[body.code]);
        return body.code;
      };

      expect(
        (await decide(moderator, avatarId, { decision: 'keep', note: 'sem problema' })).statusCode,
      ).toBe(200);
      // Mantida e ainda no ar: dá para decidir de novo; depois de removida, não.
      expect(
        (await decide(moderator, avatarId, { decision: 'remove', reason: 'other', note: 'mudei' }))
          .statusCode,
      ).toBe(200);
      expect(
        await error(await decide(moderator, avatarId, { decision: 'keep', note: 'tarde' })),
      ).toBe('avatar_not_reviewable');
      expect(
        await error(
          await decide(moderator, '00000000-0000-4000-8000-000000000000', {
            decision: 'keep',
            note: 'nada a fazer',
          }),
        ),
      ).toBe('avatar_not_found');
      expect(
        await error(await decide(moderator, avatarId, { decision: 'remove', note: 'sem motivo' })),
      ).toBe('invalid_body');
    });
  });

  describe('remoção em um clique pela ficha da Conta', () => {
    it('remove sem denúncia, devolve a ficha com o histórico e registra no log', async () => {
      const { player, avatarId } = await withPhoto();
      const moderator = await staff('admin');
      const path = `/api/staff/accounts/${player.account.publicId}/avatar`;

      const before = staffAccountAvatarSchema.parse((await moderator.call('GET', path)).json());
      expect(before).toMatchObject({
        source: 'custom',
        current: { id: avatarId, status: 'active' },
        uploadBlockedUntil: null,
        removals: [],
      });

      const response = await moderator.call('POST', `${path}/remove`, {
        decision: 'remove',
        reason: 'personal_data',
        note: 'Mostra o documento de outra pessoa',
        blockDays: AVATAR_BLOCK_DAYS_SUGGESTED,
      });

      expect(response.statusCode, response.body).toBe(200);
      const after = staffAccountAvatarSchema.parse(response.json());
      expect(after).toMatchObject({ source: 'steam', current: null });
      expect(after.uploadBlockedUntil).toBeTruthy();
      expect(after.removals).toHaveLength(1);
      expect(after.removals[0]).toMatchObject({
        avatarId,
        reason: 'personal_data',
        note: 'Mostra o documento de outra pessoa',
        by: { steamId: moderator.steamId },
      });
      expect(await effectiveAvatar(player)).toBe(STEAM_AVATAR);
      expect(
        (await auditOf('avatar_remove')).some((a) => a.targetSteamId === BigInt(player.steamId)),
      ).toBe(true);
    });

    it('recusa Conta sem foto própria, Conta inexistente, keep e quem não é da Staff', async () => {
      const plain = await signedInPlayer(t, next++);
      const moderator = await staff();
      const path = `/api/staff/accounts/${plain.account.publicId}/avatar/remove`;
      const code = async (response: Awaited<ReturnType<typeof moderator.call>>) =>
        staffErrorSchema.parse(response.json()).code;

      expect(
        await code(
          await moderator.call('POST', path, {
            decision: 'remove',
            reason: 'other',
            note: 'nota qualquer',
          }),
        ),
      ).toBe('no_custom_avatar');
      expect(
        await code(
          await moderator.call('POST', '/api/staff/accounts/999999999/avatar/remove', {
            decision: 'remove',
            reason: 'other',
            note: 'nota qualquer',
          }),
        ),
      ).toBe('account_not_found');
      const { player } = await withPhoto();
      expect(
        await code(
          await moderator.call(
            'POST',
            `/api/staff/accounts/${player.account.publicId}/avatar/remove`,
            {
              decision: 'keep',
              note: 'nota qualquer',
            },
          ),
        ),
      ).toBe('invalid_body');
      expect(
        (
          await plain.call('POST', `/api/staff/accounts/${player.account.publicId}/avatar/remove`, {
            decision: 'remove',
            reason: 'other',
            note: 'nota qualquer',
          })
        ).statusCode,
      ).toBe(403);
    });
  });

  describe('quem denuncia muito o que a Staff mantém perde peso', () => {
    /** Uma Conta que denunciou `kept` fotos que a Staff manteve e `upheld` que ela removeu. */
    async function reporterWith(
      moderator: Awaited<ReturnType<typeof staff>>,
      kept: number,
      upheld: number,
    ) {
      const who = await reporter();
      for (const decision of [...Array(kept).fill('keep'), ...Array(upheld).fill('remove')]) {
        const { player, avatarId } = await withPhoto();
        expect((await report(who, player)).statusCode).toBe(200);
        // Recua a denúncia: o limite de denúncias por hora não é o assunto aqui.
        await t.postgres.db
          .update(avatarReports)
          .set({ createdAt: sql`${avatarReports.createdAt} - interval '2 hours'` })
          .where(eq(avatarReports.reporterAccountId, who.account.id));
        const response = await decide(moderator, avatarId, {
          decision,
          ...(decision === 'remove' && { reason: 'other' }),
          note: 'Decisão de teste da fila',
        });
        expect(response.statusCode, response.body).toBe(200);
      }
      return who;
    }

    it(`com ${REPORTER_ARCHIVED_MIN} denúncias mantidas e mais mantidas que confirmadas, as denúncias da Conta vão para o fim da fila`, async () => {
      const moderator = await staff('admin');
      const noisy = await reporterWith(moderator, REPORTER_ARCHIVED_MIN, 0);
      // Denunciada primeiro, mas só por quem perdeu peso.
      const onlyNoisy = await withPhoto();
      await report(noisy, onlyNoisy.player);
      const normal = await withPhoto();
      await report(await reporter(), normal.player);
      // Com uma denúncia de peso normal junto, a foto fica no grupo normal.
      const both = await withPhoto();
      await report(noisy, both.player);
      await report(await reporter(), both.player);

      const ids = await openQueue(moderator, 2);

      expect(ids).toContain(onlyNoisy.avatarId);
      expect(ids.indexOf(normal.avatarId)).toBeLessThan(ids.indexOf(onlyNoisy.avatarId));
      expect(ids.indexOf(both.avatarId)).toBeLessThan(ids.indexOf(onlyNoisy.avatarId));
    });

    it('quem acerta tanto quanto erra, ou denuncia poucas mantidas, mantém o peso', async () => {
      const moderator = await staff('admin');
      const noisy = await reporterWith(moderator, REPORTER_ARCHIVED_MIN, 0);
      const mixed = await reporterWith(moderator, REPORTER_ARCHIVED_MIN, REPORTER_ARCHIVED_MIN);
      const few = await reporterWith(moderator, REPORTER_ARCHIVED_MIN - 1, 0);
      const older = await withPhoto();
      await report(noisy, older.player);
      const byMixed = await withPhoto();
      await report(mixed, byMixed.player);
      const byFew = await withPhoto();
      await report(few, byFew.player);

      const ids = await openQueue(moderator, 2);

      // O da Conta barulhenta é o mais antigo e mesmo assim fica depois dos outros dois.
      expect(ids.indexOf(byMixed.avatarId)).toBeLessThan(ids.indexOf(older.avatarId));
      expect(ids.indexOf(byFew.avatarId)).toBeLessThan(ids.indexOf(older.avatarId));
    });
  });

  describe('foto no histórico', () => {
    it('a denúncia segue na fila depois de a foto ser trocada; a Staff remove a do histórico, ela sai de lá para sempre e a atual segue no ar', async () => {
      const { player, avatarId } = await withPhoto();
      await report(await reporter(), player, 'sexual');
      const current = await replaceWith(player);
      const moderator = await staff();

      expect((await openCases(moderator)).find((c) => c.avatar.id === avatarId)).toMatchObject({
        avatar: { status: 'replaced' },
        reports: { reporters: 1 },
      });
      const image = await moderator.call('GET', `/api/staff/avatars/${avatarId}/image`);
      expect(image.statusCode).toBe(200);

      const response = await decide(moderator, avatarId, {
        decision: 'remove',
        reason: 'sexual',
        note: 'Nudez confirmada na imagem antiga',
        blockDays: 3,
      });

      expect(response.statusCode, response.body).toBe(200);
      expect(await row(avatarId)).toMatchObject({ status: 'removed', decision: 'remove' });
      // A atual não mexe: segue no ar e como avatar efetivo.
      expect(await row(current)).toMatchObject({ status: 'active' });
      expect(await effectiveAvatar(player)).toContain(current);
      await drain();
      expect(keysOf(avatarId, PUBLIC)).toEqual([]);
      expect(keysOf(avatarId, PRIVATE)).toHaveLength(AVATAR_SIZES.length);
      expect(keysOf(current, PUBLIC)).toHaveLength(AVATAR_SIZES.length);
      // Nunca mais volta ao histórico, nem depois do bloqueio.
      const state = await stateOf(player);
      expect(state.history.map((item) => item.id)).toEqual([current]);
      expect(state.canUseHistory).toBe(false);
      await t.postgres.db
        .update(accounts)
        .set({ avatarUploadBlockedUntil: null })
        .where(eq(accounts.id, player.account.id));
      const back = await player.call('POST', `/api/me/avatar/history/${avatarId}`);
      expect(back.statusCode).toBe(404);
      expect(avatarErrorSchema.parse(back.json()).code).toBe('not_in_history');
      for (let i = 0; i < AVATAR_HISTORY_SIZE + 1; i += 1) await replaceWith(player);
      expect((await stateOf(player)).history.map((item) => item.id)).not.toContain(avatarId);
    });

    it('apagar do histórico uma foto denunciada tira o caso da fila (nada mais a decidir)', async () => {
      const { player, avatarId } = await withPhoto();
      await report(await reporter(), player);
      await replaceWith(player);
      const moderator = await staff();
      expect(await openQueue(moderator)).toContain(avatarId);

      const erased = await player.call('DELETE', `/api/me/avatar/history/${avatarId}`);

      expect(erased.statusCode, erased.body).toBe(200);
      expect(await openQueue(moderator)).not.toContain(avatarId);
      const tooLate = await decide(moderator, avatarId, { decision: 'keep', note: 'tarde demais' });
      expect(staffErrorSchema.parse(tooLate.json()).code).toBe('avatar_not_reviewable');
    });
  });

  describe('retenção dos registros (90 dias)', () => {
    const setState = (
      avatarId: string,
      status: 'replaced' | 'reverted' | 'removed',
      daysAgo: number,
      options: { stillInHistory?: boolean } = {},
    ) =>
      t.postgres.db
        .update(accountAvatars)
        .set({
          status,
          retiredAt: new Date(Date.now() - daysAgo * DAY_MS),
          // Trocada ou devolvida só some do banco depois de sair do histórico (arquivos apagados).
          ...(status !== 'removed' && !options.stillInHistory && { deletedAt: new Date() }),
        })
        .where(eq(accountAvatars.id, avatarId));

    const reportsOf = (avatarId: string) =>
      t.postgres.db.select().from(avatarReports).where(eq(avatarReports.avatarId, avatarId));

    it('apaga a foto trocada, devolvida ou removida há mais de 90 dias e as denúncias dela; o resto fica', async () => {
      const [old, oldRemoved, recent, live] = [
        await withPhoto(),
        await withPhoto(),
        await withPhoto(),
        await withPhoto(),
      ];
      // Uma denúncia em cada (a fila de denúncias de uma foto que já saiu não conta, mas o registro existe).
      for (const target of [old, oldRemoved, recent, live]) {
        await report(await reporter(), target.player);
      }
      await setState(old.avatarId, 'replaced', 91);
      await setState(oldRemoved.avatarId, 'removed', 120);
      await setState(recent.avatarId, 'removed', 10);

      const result = await t.app.get(AvatarRetention).sweep();

      expect(result.avatars).toBeGreaterThanOrEqual(2);
      expect(result.reports).toBeGreaterThanOrEqual(2);
      expect(await row(old.avatarId)).toBeUndefined();
      expect(await row(oldRemoved.avatarId)).toBeUndefined();
      expect(await reportsOf(old.avatarId)).toEqual([]);
      expect(await reportsOf(oldRemoved.avatarId)).toEqual([]);
      // Recente (10 dias) e a foto no ar ficam, com as denúncias.
      expect((await row(recent.avatarId))?.status).toBe('removed');
      expect(await reportsOf(recent.avatarId)).toHaveLength(1);
      expect((await row(live.avatarId))?.status).toBe('active');
      expect(await reportsOf(live.avatarId)).toHaveLength(1);
      // Rodar de novo não apaga mais nada dessas.
      expect((await t.app.get(AvatarRetention).sweep()).avatars).toBe(0);
    });

    it('não toca a foto no ar, a suspensa (estado antigo) nem a que ainda está no histórico, mesmo antigas', async () => {
      const live = await withPhoto();
      const old = await withPhoto();
      const inHistory = await withPhoto();
      await report(await reporter(), inHistory.player);
      await t.postgres.db
        .update(accountAvatars)
        .set({ status: 'suspended', createdAt: new Date(Date.now() - 200 * DAY_MS) })
        .where(eq(accountAvatars.id, old.avatarId));
      await setState(inHistory.avatarId, 'replaced', 200, { stillInHistory: true });
      await t.postgres.db
        .update(accountAvatars)
        .set({ createdAt: new Date(Date.now() - 200 * DAY_MS) })
        .where(eq(accountAvatars.id, live.avatarId));

      await t.app.get(AvatarRetention).sweep();

      expect((await row(live.avatarId))?.status).toBe('active');
      expect((await row(old.avatarId))?.status).toBe('suspended');
      expect(await row(inHistory.avatarId)).toMatchObject({ status: 'replaced', deletedAt: null });
      expect(await reportsOf(inHistory.avatarId)).toHaveLength(1);
    });
  });

  /** A regra única de denúncia (ADR 0026) vista pela foto: prazo, peso de todos os tipos e teto por dia. */
  describe('a regra única de denúncia', () => {
    it('a foto tem prazo de 24 h, contado da denúncia mais antiga de peso normal', async () => {
      const { player, avatarId } = await withPhoto();
      const before = Date.now();
      await report(await reporter(), player);
      const moderator = await staff();

      const found = (await openCases(moderator)).find((c) => c.avatar.id === avatarId);

      expect(found).toMatchObject({ kind: 'avatar', lowWeight: false });
      const wait = Date.parse(found?.deadlineAt as string) - before;
      expect(wait).toBeGreaterThanOrEqual(24 * 3_600_000 - 1000);
      expect(wait).toBeLessThan(24 * 3_600_000 + 60_000);
    });

    it('o peso soma os tipos: 2 fotos mantidas e 1 Denúncia de jogo arquivada tiram o peso nas duas filas', async () => {
      const moderator = await staff('admin');
      const noisy = await reporter();
      for (let i = 0; i < REPORTER_ARCHIVED_MIN - 1; i += 1) {
        const kept = await withPhoto();
        await report(noisy, kept.player);
        await decide(moderator, kept.avatarId, { decision: 'keep', note: 'Pode ficar' });
      }
      const someone = await withPhoto();
      await t.postgres.db.insert(reports).values({
        reporterAccountId: noisy.account.id,
        targetAccountId: someone.player.account.id,
        reason: 'other',
        chatContext: [],
        status: 'archived',
        resolvedAt: new Date(),
        resolvedBySteamId: 1n,
        resolutionReason: 'Sem prova',
      });
      const gameTarget = await withPhoto();
      await t.postgres.db.insert(reports).values({
        reporterAccountId: noisy.account.id,
        targetAccountId: gameTarget.player.account.id,
        reason: 'other',
        chatContext: [],
      });
      const photoTarget = await withPhoto();
      await report(noisy, photoTarget.player);

      const photo = (await openCases(moderator)).find((c) => c.avatar.id === photoTarget.avatarId);
      const gameQueue = staffReportPageSchema.parse(
        (await moderator.call('GET', '/api/staff/reports?limit=100')).json(),
      );
      const game = gameQueue.reports.find(
        (r) => r.target.publicId === gameTarget.player.account.publicId,
      );

      expect(photo).toMatchObject({ lowWeight: true, deadlineAt: null });
      expect(game).toMatchObject({ lowWeight: true, deadlineAt: null });
    });

    it('o teto de 10 por dia soma fotos e jogo; a 11ª é recusada, no site sem o prefixo', async () => {
      const who = await reporter();
      for (let i = 0; i < AVATAR_REPORTS_PER_HOUR; i += 1) {
        const { player } = await withPhoto();
        expect((await report(who, player)).statusCode).toBe(200);
      }
      const server = (target: Owner) =>
        t.app.inject({
          method: 'POST',
          url: '/api/server/reports',
          headers: { authorization: `Bearer ${t.serverKey}` },
          payload: {
            reporterSteamId: who.steamId,
            targetSteamId: target.steamId,
            reason: 'other',
            round: null,
            map: null,
          },
        });
      for (let i = 0; i < REPORT_DAILY_LIMIT - AVATAR_REPORTS_PER_HOUR; i += 1) {
        const { player } = await withPhoto();
        const outcome = reportResultSchema.parse((await server(player)).json());
        expect(outcome.accepted, `denúncia de jogo ${i + 1}`).toBe(true);
      }
      const { player } = await withPhoto();

      const blocked = await report(who, player);

      expect(blocked.statusCode).toBe(429);
      const error = avatarErrorSchema.parse(blocked.json());
      expect(error).toMatchObject({
        code: 'report_daily_limit',
        message: 'Você já enviou 10 denúncias hoje. Tente amanhã.',
      });
      expect(error.retryAfter).toBeTruthy();
      // E a de jogo, da mesma Conta, também (a mensagem tem o prefixo da marca).
      expect(reportResultSchema.parse((await server(player)).json()).accepted).toBe(false);
    });

    it('a denúncia contra imagem aprovada também passa pelos limites, para a resposta ser sempre a mesma', async () => {
      const moderator = await staff();
      const { player, avatarId } = await withPhoto();
      await report(await reporter(), player);
      expect(
        (await decide(moderator, avatarId, { decision: 'keep', note: 'Pode ficar' })).statusCode,
      ).toBe(200);
      const who = await reporter();
      for (let i = 0; i < AVATAR_REPORTS_PER_HOUR; i += 1) {
        const other = await withPhoto();
        expect((await report(who, other.player)).statusCode).toBe(200);
      }

      const blocked = await report(who, player);

      expect(avatarErrorSchema.parse(blocked.json()).code).toBe('report_limit');
    });
  });
});

/** Sem as variáveis `R2_MEDIA_*`, denunciar responde 503 e a Staff continua vendo a fila (vazia). */
describe('Moderação da foto de perfil desligada (padrão)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await startTestApp();
  });

  afterAll(async () => {
    await t?.stop();
  });

  it('a denúncia responde 503 disabled e a fila está vazia', async () => {
    const target = await signedInPlayer(t, 1);
    const who = await signedInPlayer(t, 2);
    const owner = await signedInPlayer(t, 3);
    await t.app
      .get(StaffRoles)
      .set(owner.account.id, 'owner', { actorSteamId: FOUNDER, reason: 'teste' });

    const report = await who.call(
      'POST',
      `/api/profiles/${target.account.publicId}/avatar-report`,
      { reason: 'other' satisfies AvatarReason },
    );
    const queue = await owner.call('GET', '/api/staff/avatar-reports');

    expect(report.statusCode).toBe(503);
    expect(avatarErrorSchema.parse(report.json()).code).toBe('disabled');
    expect(queue.statusCode).toBe(200);
    expect(staffAvatarCasePageSchema.parse(queue.json())).toMatchObject({
      cases: [],
      openCount: 0,
    });
  });
});
