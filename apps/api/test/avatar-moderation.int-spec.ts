import {
  AVATAR_BLOCK_DAYS_FIRST,
  AVATAR_BLOCK_DAYS_REPEAT,
  AVATAR_ERROR_STATUS,
  AVATAR_REPORTS_PER_HOUR,
  AVATAR_SIZES,
  type AvatarReason,
  avatarErrorSchema,
  avatarReportReceivedSchema,
  avatarStateSchema,
  profileSchema,
  STAFF_ERROR_STATUS,
  staffAccountAvatarSchema,
  staffAvatarCasePageSchema,
  staffAvatarCaseSchema,
  staffErrorSchema,
} from '@carmine/contracts';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MediaDeletions } from '../src/avatars/media-deletions.js';
import {
  accountAvatars,
  accounts,
  avatarReports,
  mediaDeletions,
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
 * Moderação da foto de perfil (ADR 0022, F2): a denúncia, a suspensão automática com duas Contas
 * diferentes, a fila e a decisão da Staff, a remoção em um clique, o bloqueio de reincidente e a
 * auditoria. O R2 e a purga da Cloudflare são de mentira (`FakeMedia`).
 */
describe('Moderação da foto de perfil (F2)', () => {
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

  /** Uma Conta que pode enviar (reivindicada, com mais de 24 h e foto da Steam) e já com foto própria no ar. */
  async function withPhoto() {
    const player = await signedInPlayer(t, next++);
    await t.postgres.db
      .update(accounts)
      .set({
        createdAt: new Date(Date.now() - 2 * DAY_MS),
        steamAvatarUrl: STEAM_AVATAR,
        avatarUrl: STEAM_AVATAR,
      })
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

  describe('suspensão automática (duas Contas diferentes)', () => {
    it('sai do ar sozinha: volta o avatar da Steam, o privado guarda a imagem, o público é apagado e purgado', async () => {
      const { player, avatarId } = await withPhoto();
      expect(await effectiveAvatar(player)).toContain(avatarId);

      expect((await report(await reporter(), player, 'hate')).statusCode).toBe(200);
      expect((await row(avatarId))?.status).toBe('active');
      expect((await report(await reporter(), player, 'hate')).statusCode).toBe(200);

      const suspended = await row(avatarId);
      expect(suspended?.status).toBe('suspended');
      expect(suspended?.takenDownAt).toBeTruthy();
      expect(await effectiveAvatar(player)).toBe(STEAM_AVATAR);
      expect(keysOf(avatarId, PRIVATE)).toHaveLength(AVATAR_SIZES.length);
      await drain();
      expect(keysOf(avatarId, PUBLIC)).toEqual([]);
      expect(media.purges.flatMap((p) => p.files)).toContain(
        `${ORIGIN}/avatars/${avatarId}/512.webp`,
      );
      // O dono é avisado ("em análise") e não envia outra por cima até a Staff decidir.
      const state = await stateOf(player);
      expect(state.custom?.status).toBe('suspended');
      expect(state.cannotUploadReason).toBe('upload_blocked');
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
      await report(await reporter(), player, 'hate');
      await report(await reporter(), player, 'minor');
      const moderator = await staff('moderator');

      const response = await moderator.call('GET', '/api/staff/avatar-reports');

      expect(response.statusCode, response.body).toBe(200);
      const page = staffAvatarCasePageSchema.parse(response.json());
      const found = page.cases.find((c) => c.avatar.id === avatarId);
      expect(found).toMatchObject({
        avatar: { status: 'suspended', url: null },
        account: { publicId: player.account.publicId },
        reports: { reporters: 3 },
        previousRemovals: 0,
        decision: null,
      });
      expect(found?.reports.byReason).toEqual([
        { reason: 'hate', count: 2 },
        { reason: 'minor', count: 1 },
      ]);
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

      const first = staffAvatarCasePageSchema.parse(
        (await moderator.call('GET', '/api/staff/avatar-reports?limit=2')).json(),
      );
      expect(first.cases).toHaveLength(2);
      expect(first.nextCursor).toBeTruthy();
      const second = staffAvatarCasePageSchema.parse(
        (
          await moderator.call(
            'GET',
            `/api/staff/avatar-reports?limit=2&before=${first.nextCursor}`,
          )
        ).json(),
      );
      const ids = [...first.cases, ...second.cases].map((c) => c.avatar.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of made) expect(ids).toContain(id);
      const invalid = await moderator.call('GET', '/api/staff/avatar-reports?before=lixo');
      expect(invalid.statusCode).toBe(400);
    });
  });

  describe('decidir', () => {
    it('manter: a foto suspensa volta ao ar, as denúncias são arquivadas e fica no log', async () => {
      const { player, avatarId } = await withPhoto();
      await report(await reporter(), player);
      await report(await reporter(), player);
      await drain();
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
      const back = await row(avatarId);
      expect(back).toMatchObject({ status: 'active', takenDownAt: null });
      expect(await effectiveAvatar(player)).toContain(avatarId);
      expect(keysOf(avatarId, PUBLIC)).toHaveLength(AVATAR_SIZES.length);
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
      const open = staffAvatarCasePageSchema.parse(
        (await moderator.call('GET', '/api/staff/avatar-reports')).json(),
      );
      expect(open.cases.map((c) => c.avatar.id)).not.toContain(avatarId);
      const history = staffAvatarCasePageSchema.parse(
        (await moderator.call('GET', '/api/staff/avatar-reports?status=decided')).json(),
      );
      expect(history.cases.map((c) => c.avatar.id)).toContain(avatarId);
      // Reabrir exige denúncias novas: duas Contas novas tiram do ar de novo.
      await report(await reporter(), player);
      await report(await reporter(), player);
      expect((await row(avatarId))?.status).toBe('suspended');
    });

    it('remover: a Conta volta à Steam, a imagem fica guardada 30 dias, o envio é bloqueado 7 dias e o dono vê o aviso', async () => {
      const { player, avatarId } = await withPhoto();
      await report(await reporter(), player, 'sexual');
      await report(await reporter(), player, 'sexual');
      const moderator = await staff('owner');
      const before = Date.now();

      const response = await decide(moderator, avatarId, {
        decision: 'remove',
        reason: 'sexual',
        note: 'Nudez confirmada na imagem',
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
      expect(until?.getTime()).toBeGreaterThan(before + (AVATAR_BLOCK_DAYS_FIRST - 0.01) * DAY_MS);
      expect(until?.getTime()).toBeLessThan(Date.now() + (AVATAR_BLOCK_DAYS_FIRST + 0.01) * DAY_MS);
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

    it('a reincidência em 90 dias bloqueia 30 dias; blockDays troca a regra (0 não bloqueia)', async () => {
      const { player, avatarId } = await withPhoto();
      const moderator = await staff();
      await decide(moderator, avatarId, { decision: 'remove', reason: 'hate', note: 'primeira' });
      // Liberado o bloqueio, a pessoa envia outra foto e a Staff remove de novo.
      await t.postgres.db
        .update(accounts)
        .set({ avatarUploadBlockedUntil: null })
        .where(eq(accounts.id, player.account.id));
      const second = await player.raw('POST', '/api/me/avatar', await photo(), 'image/png');
      expect(second.statusCode, second.body).toBe(200);
      const secondId = (
        await t.postgres.db
          .select()
          .from(accountAvatars)
          .where(eq(accountAvatars.accountId, player.account.id))
      ).find((a) => a.status === 'active')?.id as string;

      const response = await decide(moderator, secondId, {
        decision: 'remove',
        reason: 'hate',
        note: 'de novo',
      });

      expect(response.statusCode, response.body).toBe(200);
      expect(staffAvatarCaseSchema.parse(response.json()).previousRemovals).toBe(1);
      const until = await blockedUntilOf(player);
      expect(until?.getTime()).toBeGreaterThan(
        Date.now() + (AVATAR_BLOCK_DAYS_REPEAT - 0.01) * DAY_MS,
      );

      // Override: 0 não bloqueia (o bloqueio anterior segue como estava) e 365 é o teto.
      await t.postgres.db
        .update(accounts)
        .set({ avatarUploadBlockedUntil: null })
        .where(eq(accounts.id, player.account.id));
      const third = await player.raw('POST', '/api/me/avatar', await photo(), 'image/png');
      expect(third.statusCode, third.body).toBe(200);
      const thirdId = (
        await t.postgres.db
          .select()
          .from(accountAvatars)
          .where(eq(accountAvatars.accountId, player.account.id))
      ).find((a) => a.status === 'active')?.id as string;
      await decide(moderator, thirdId, {
        decision: 'remove',
        reason: 'other',
        note: 'sem bloqueio',
        blockDays: 0,
      });
      expect(await blockedUntilOf(player)).toBeNull();
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
