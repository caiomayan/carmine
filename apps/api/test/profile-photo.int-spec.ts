import { profileSchema } from '@carmine/contracts';
import {
  AVATAR_ERROR_STATUS,
  AVATAR_SIZES,
  AVATAR_UPLOADS_PER_DAY,
  type AvatarState,
  avatarErrorSchema,
  avatarStateSchema,
} from '@carmine/contracts/avatar';
import { eq, gt, lte } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AvatarRefresher } from '../src/accounts/avatar-refresher.js';
import { AvatarFiles } from '../src/avatars/avatar-files.js';
import { MediaDeletions } from '../src/avatars/media-deletions.js';
import { accountAvatars, accounts, mediaDeletions, staffAuditLog } from '../src/database/schema.js';
import { Sanctions } from '../src/moderation/sanctions.js';
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

/** Uma foto sólida quadrada nos formatos aceitos (com EXIF, se pedido). */
function photo(
  format: 'jpeg' | 'png' | 'webp' = 'png',
  size = 512,
  options: { exif?: boolean; height?: number } = {},
): Promise<Buffer> {
  let pipeline = sharp({
    create: {
      width: size,
      height: options.height ?? size,
      channels: 3,
      background: { r: 20, g: 120, b: 200 },
    },
  });
  if (options.exif) pipeline = pipeline.withExif({ IFD0: { Copyright: 'fotografo-secreto' } });
  return pipeline[format]().toBuffer();
}

/**
 * Foto de perfil própria (ADR 0022, F1): enviar publica na hora; voltar à Steam; a fila de remoção
 * de arquivos do R2; os primitivos que a moderação usa; e a exclusão da Conta. O R2 e a API de
 * purga da Cloudflare são de mentira (`FakeMedia`), falados pelo SDK de verdade.
 */
describe('Foto de perfil (F1)', () => {
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
      // A fila roda quando o teste manda (`drain`), não sozinha.
      MEDIA_SWEEP_SECONDS: '0',
    });
  });

  afterAll(async () => {
    await t?.stop();
    await media?.stop();
  });

  const drain = () => t.app.get(MediaDeletions).drain();

  /** Uma Conta que pode enviar: reivindicada, com mais de 24 h e com avatar da Steam. */
  async function eligible() {
    const player = await signedInPlayer(t, next++);
    await t.postgres.db
      .update(accounts)
      .set({
        createdAt: new Date(Date.now() - 2 * DAY_MS),
        steamAvatarUrl: STEAM_AVATAR,
        avatarUrl: STEAM_AVATAR,
      })
      .where(eq(accounts.id, player.account.id));
    return player;
  }

  type Player = Awaited<ReturnType<typeof eligible>>;

  const state = async (player: Player) => {
    const response = await player.call('GET', '/api/me/avatar');
    expect(response.statusCode, response.body).toBe(200);
    return avatarStateSchema.parse(response.json());
  };

  const send = (player: Player, body: Buffer, type = 'image/png') =>
    player.raw('POST', '/api/me/avatar', body, type);

  const sent = async (player: Player, body?: Buffer, type = 'image/png'): Promise<AvatarState> => {
    const response = await send(player, body ?? (await photo()), type);
    expect(response.statusCode, response.body).toBe(200);
    return avatarStateSchema.parse(response.json());
  };

  const refused = async (response: Awaited<ReturnType<typeof send>>) => {
    const error = avatarErrorSchema.parse(response.json());
    expect(response.statusCode).toBe(AVATAR_ERROR_STATUS[error.code]);
    return error;
  };

  const effectiveAvatar = async (publicId: number) =>
    profileSchema.parse((await t.app.inject({ url: `/api/profiles/${publicId}` })).json())
      .avatarUrl;

  const publicKeys = () => media.keys(PUBLIC);

  describe('enviar', () => {
    it('publica na hora: 4 tamanhos WebP sem EXIF, e o avatar efetivo passa a ser a foto', async () => {
      const player = await eligible();
      expect(await state(player)).toMatchObject({
        enabled: true,
        source: 'steam',
        steamAvatarUrl: STEAM_AVATAR,
        custom: null,
        canUpload: true,
      });

      const result = await sent(player, await photo('jpeg', 600, { exif: true }), 'image/jpeg');

      expect(result.source).toBe('custom');
      expect(result.custom).toMatchObject({ status: 'active' });
      const [row] = await t.postgres.db
        .select()
        .from(accountAvatars)
        .where(eq(accountAvatars.accountId, player.account.id));
      expect(row).toMatchObject({ status: 'active' });
      const id = row?.id as string;
      expect(result.custom?.url).toBe(`${ORIGIN}/avatars/${id}/512.webp`);
      // Quem lê o avatar (Perfil, Ranking, busca...) não muda: `avatarUrl` é o efetivo.
      expect(await effectiveAvatar(player.account.publicId)).toBe(result.custom?.url);
      expect(publicKeys()).toEqual(AVATAR_SIZES.map((size) => `avatars/${id}/${size}.webp`).sort());
      for (const size of AVATAR_SIZES) {
        const object = media.get(PUBLIC, `avatars/${id}/${size}.webp`);
        expect(object).toMatchObject({
          contentType: 'image/webp',
          cacheControl: 'public, max-age=31536000, immutable',
        });
        const meta = await sharp(object?.body).metadata();
        expect(meta).toMatchObject({ format: 'webp', width: size, height: size });
        expect(meta.exif).toBeUndefined();
        expect(object?.body.includes(Buffer.from('fotografo-secreto'))).toBe(false);
      }
    });

    it('sem sessão: 401 nas três rotas', async () => {
      const body = await photo();
      for (const method of ['GET', 'POST', 'DELETE'] as const) {
        const response = await t.app.inject({
          method,
          url: '/api/me/avatar',
          headers: { 'content-type': 'image/png' },
          ...(method === 'POST' && { payload: body }),
        });
        expect(response.statusCode, method).toBe(401);
      }
    });

    it('recusas de formato e tamanho têm o código do contrato e não deixam nada para trás', async () => {
      const player = await eligible();
      const before = publicKeys();
      const png = await photo();

      const cases: [string, Awaited<ReturnType<typeof send>>, number, string][] = [
        [
          'gif',
          await send(player, await sharp(png).gif().toBuffer(), 'image/gif'),
          415,
          'unsupported_type',
        ],
        ['tipo que não bate', await send(player, png, 'image/jpeg'), 415, 'unsupported_type'],
        [
          'retangular',
          await send(player, await photo('png', 512, { height: 400 })),
          422,
          'bad_dimensions',
        ],
        ['pequena', await send(player, await photo('png', 100)), 422, 'bad_dimensions'],
        [
          'bytes quebrados',
          await send(
            player,
            Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(80, 1)]),
            'image/jpeg',
          ),
          422,
          'invalid_image',
        ],
        ['grande demais', await send(player, Buffer.alloc(1024 * 1024 + 1, 7)), 413, 'too_large'],
      ];

      for (const [name, response, status, code] of cases) {
        const error = await refused(response);
        expect([name, response.statusCode, error.code]).toEqual([name, status, code]);
      }
      expect(publicKeys()).toEqual(before);
      expect(await state(player)).toMatchObject({ custom: null, source: 'steam' });
    });
  });

  describe('quem não pode enviar', () => {
    it('Conta com menos de 24 horas', async () => {
      const player = await signedInPlayer(t, next++);

      expect(await state(player)).toMatchObject({
        canUpload: false,
        cannotUploadReason: 'account_too_new',
      });
      const error = await refused(await send(player, await photo()));
      expect(error.code).toBe('account_too_new');
    });

    it('Conta com Punição ativa', async () => {
      const player = await eligible();
      await t.app
        .get(Sanctions)
        .apply(
          player.account.id,
          { actorSteamId: FOUNDER, reason: 'teste' },
          { category: 'offensive_chat', measures: [{ type: 'gag', durationMinutes: 60 }] },
        );

      expect(await state(player)).toMatchObject({
        canUpload: false,
        cannotUploadReason: 'punished',
      });
      expect((await refused(await send(player, await photo()))).code).toBe('punished');
    });

    it('envio bloqueado pela Staff: só um "indisponível" genérico, sem data nem motivo', async () => {
      const player = await eligible();
      await t.postgres.db
        .update(accounts)
        .set({ avatarUploadBlockedUntil: new Date(Date.now() + 7 * DAY_MS) })
        .where(eq(accounts.id, player.account.id));

      const result = await state(player);

      expect(result).toMatchObject({
        canUpload: false,
        cannotUploadReason: 'upload_blocked',
        retryAfter: null,
      });
      expect((await refused(await send(player, await photo()))).code).toBe('upload_blocked');
    });

    it('foto suspensa por denúncias: fora do ar, e nenhuma outra entra até a Staff decidir', async () => {
      const player = await eligible();
      await sent(player);
      await t.postgres.db
        .update(accountAvatars)
        .set({ status: 'suspended', takenDownAt: new Date() })
        .where(eq(accountAvatars.accountId, player.account.id));
      await t.postgres.db
        .update(accounts)
        .set({ avatarSource: 'steam', avatarUrl: STEAM_AVATAR })
        .where(eq(accounts.id, player.account.id));

      const result = await state(player);

      expect(result).toMatchObject({
        source: 'steam',
        custom: { status: 'suspended' },
        canUpload: false,
        cannotUploadReason: 'upload_blocked',
      });
      expect(await effectiveAvatar(player.account.publicId)).toBe(STEAM_AVATAR);
    });

    it('3 envios em 24 horas; o 4º diz quando libera', async () => {
      const player = await eligible();
      for (let i = 0; i < AVATAR_UPLOADS_PER_DAY; i++) await sent(player);
      const [oldest] = await t.postgres.db
        .select({ createdAt: accountAvatars.createdAt })
        .from(accountAvatars)
        .where(eq(accountAvatars.accountId, player.account.id))
        .orderBy(accountAvatars.createdAt)
        .limit(1);

      const error = await refused(await send(player, await photo()));

      expect(error.code).toBe('daily_limit');
      expect(error.retryAfter).toBe(
        new Date((oldest?.createdAt.getTime() ?? 0) + DAY_MS).toISOString(),
      );
      expect(await state(player)).toMatchObject({
        canUpload: false,
        cannotUploadReason: 'daily_limit',
        retryAfter: error.retryAfter,
      });
    });
  });

  describe('trocar e voltar à Steam', () => {
    it('um envio novo troca a foto; a anterior sai do R2 e da CDN pela fila', async () => {
      const player = await eligible();
      await sent(player);
      const [first] = await t.postgres.db
        .select()
        .from(accountAvatars)
        .where(eq(accountAvatars.accountId, player.account.id));
      const firstId = first?.id as string;

      const second = await sent(player);

      const rows = await t.postgres.db
        .select()
        .from(accountAvatars)
        .where(eq(accountAvatars.accountId, player.account.id))
        .orderBy(accountAvatars.createdAt);
      expect(rows.map((row) => row.status)).toEqual(['replaced', 'active']);
      expect(media.has(PUBLIC, `avatars/${firstId}/512.webp`)).toBe(true);

      await drain();

      expect(media.keys(PUBLIC).filter((key) => key.includes(firstId))).toEqual([]);
      expect(media.has(PUBLIC, `avatars/${rows[1]?.id}/512.webp`)).toBe(true);
      expect(second.custom?.url).toBe(`${ORIGIN}/avatars/${rows[1]?.id}/512.webp`);
      const purged = media.purges.flatMap((purge) => purge.files);
      expect(purged).toEqual(
        expect.arrayContaining(
          AVATAR_SIZES.map((size) => `${ORIGIN}/avatars/${firstId}/${size}.webp`),
        ),
      );
      expect(media.purges.at(-1)).toMatchObject({ zone: 'zona-1', token: 'token-1' });
    });

    it('voltar à foto da Steam é na hora, sem moderação, e apaga a foto própria', async () => {
      const player = await eligible();
      await sent(player);
      expect(await effectiveAvatar(player.account.publicId)).toMatch(/^https:\/\/img\.test\//);

      const response = await player.call('DELETE', '/api/me/avatar');

      expect(response.statusCode, response.body).toBe(200);
      expect(avatarStateSchema.parse(response.json())).toMatchObject({
        source: 'steam',
        custom: null,
        steamAvatarUrl: STEAM_AVATAR,
      });
      expect(await effectiveAvatar(player.account.publicId)).toBe(STEAM_AVATAR);
      const [row] = await t.postgres.db
        .select()
        .from(accountAvatars)
        .where(eq(accountAvatars.accountId, player.account.id));
      expect(row).toMatchObject({ status: 'reverted' });
      await drain();
      expect(media.keys(PUBLIC).filter((key) => key.includes(row?.id as string))).toEqual([]);
      // Idempotente: sem foto própria, não muda nada.
      expect((await player.call('DELETE', '/api/me/avatar')).statusCode).toBe(200);
    });

    it('o avatar novo da Steam atualiza só o guardado enquanto a foto própria está no ar', async () => {
      const player = await eligible();
      await sent(player);
      const url = await effectiveAvatar(player.account.publicId);
      const novo = 'https://avatars.steamstatic.com/novo_full.jpg';
      const refresher = new AvatarRefresher(t.postgres.db, {
        summaryOf: async () => ({ personaName: 'Fulano', avatarUrl: novo }),
      });

      refresher.refreshInBackground({
        steamId: player.steamId,
        steamAvatarUrl: STEAM_AVATAR,
        avatarFetchedAt: new Date(0),
      });
      await refresher.beforeApplicationShutdown();

      expect(await effectiveAvatar(player.account.publicId)).toBe(url);
      const reverted = avatarStateSchema.parse(
        (await player.call('DELETE', '/api/me/avatar')).json(),
      );
      expect(reverted.steamAvatarUrl).toBe(novo);
      expect(await effectiveAvatar(player.account.publicId)).toBe(novo);
    });
  });

  describe('primitivos da moderação (AvatarFiles)', () => {
    type Trx = Parameters<Parameters<TestApp['postgres']['db']['transaction']>[0]>[0];
    const tx = (work: (trx: Trx) => Promise<void>) => t.postgres.db.transaction(work);

    async function published() {
      const player = await eligible();
      await sent(player);
      const [row] = await t.postgres.db
        .select()
        .from(accountAvatars)
        .where(eq(accountAvatars.accountId, player.account.id));
      return { player, id: row?.id as string };
    }

    const keysOf = (id: string, bucket: string) => media.keys(bucket).filter((k) => k.includes(id));

    it('takeDown guarda no privado e tira do público; putBack devolve e limpa o privado', async () => {
      const { id } = await published();
      const files = t.app.get(AvatarFiles);

      await tx((trx) => files.takeDown(trx, id));
      expect(keysOf(id, PRIVATE)).toHaveLength(AVATAR_SIZES.length);
      // A foto só sai do público quando a fila roda; antes ela ainda responde.
      await drain();
      expect(keysOf(id, PUBLIC)).toEqual([]);
      expect(media.purges.flatMap((p) => p.files)).toContain(`${ORIGIN}/avatars/${id}/512.webp`);
      expect((await files.read(id))?.length).toBeGreaterThan(0);

      await tx((trx) => files.putBack(trx, id));
      expect(keysOf(id, PUBLIC)).toHaveLength(AVATAR_SIZES.length);
      await drain();
      expect(keysOf(id, PUBLIC)).toHaveLength(AVATAR_SIZES.length);
      expect(keysOf(id, PRIVATE)).toEqual([]);
    });

    it('putBack antes de a fila rodar cancela a remoção pendente (a foto não some)', async () => {
      const { id } = await published();
      const files = t.app.get(AvatarFiles);

      await tx((trx) => files.takeDown(trx, id));
      await tx((trx) => files.putBack(trx, id));
      await drain();

      expect(keysOf(id, PUBLIC)).toHaveLength(AVATAR_SIZES.length);
    });

    it('retain mantém o privado pelo prazo; discard apaga tudo na hora', async () => {
      const { id } = await published();
      const files = t.app.get(AvatarFiles);
      await tx((trx) => files.takeDown(trx, id));
      await tx((trx) => files.retain(trx, id, 30));

      await drain();
      expect(keysOf(id, PUBLIC)).toEqual([]);
      expect(keysOf(id, PRIVATE)).toHaveLength(AVATAR_SIZES.length);

      await tx((trx) => files.discard(trx, id));
      await drain();
      expect(keysOf(id, PRIVATE)).toEqual([]);
    });
  });

  describe('a fila de remoção', () => {
    const due = () =>
      t.postgres.db.select().from(mediaDeletions).where(lte(mediaDeletions.runAt, new Date()));
    const retried = () =>
      t.postgres.db.select().from(mediaDeletions).where(gt(mediaDeletions.attempts, 0));
    const makeDue = () =>
      t.postgres.db.update(mediaDeletions).set({ runAt: new Date(Date.now() - 1000) });

    it('com o R2 falhando, adia com espera crescente e não perde a linha; depois conclui', async () => {
      const player = await eligible();
      await sent(player);
      await sent(player);
      media.failDeletes = true;

      expect(await drain()).toBe(0);

      const rows = await retried();
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.attempts).toBe(1);
        expect(row.lastError).toBeTruthy();
        expect(row.runAt.getTime()).toBeGreaterThan(Date.now());
      }
      expect(await due()).toEqual([]);
      media.failDeletes = false;
      await makeDue();

      expect(await drain()).toBeGreaterThan(0);
      expect(await due()).toEqual([]);
      expect(await retried()).toEqual([]);
    });

    it('a purga da CDN que falha mantém a linha até dar certo', async () => {
      const player = await eligible();
      await sent(player);
      await player.call('DELETE', '/api/me/avatar');
      media.failPurge = true;

      await drain();

      const stuck = await retried();
      expect(stuck.length).toBeGreaterThan(0);
      expect(stuck.every((row) => row.purge)).toBe(true);
      media.failPurge = false;
      await makeDue();
      await drain();
      expect(await due()).toEqual([]);
      expect(await retried()).toEqual([]);
    });
  });

  describe('exclusão da Conta (S08)', () => {
    it('some a foto, as denúncias contra ela e os arquivos, e solta quem a denunciou', async () => {
      const owner = await signedInPlayer(t, next++);
      await t.app
        .get(StaffRoles)
        .set(owner.account.id, 'owner', { actorSteamId: FOUNDER, reason: 'teste' });
      const target = await eligible();
      await sent(target);
      const [photoRow] = await t.postgres.db
        .select()
        .from(accountAvatars)
        .where(eq(accountAvatars.accountId, target.account.id));
      const id = photoRow?.id as string;

      const response = await owner.call(
        'POST',
        `/api/staff/accounts/${target.account.publicId}/anonymize`,
        { reason: 'pedido de exclusão pelo contato, protocolo 9' },
      );

      expect(response.statusCode, response.body).toBe(200);
      expect(
        await t.postgres.db.select().from(accountAvatars).where(eq(accountAvatars.id, id)),
      ).toEqual([]);
      const [account] = await t.postgres.db
        .select()
        .from(accounts)
        .where(eq(accounts.id, target.account.id));
      expect(account).toMatchObject({
        avatarUrl: null,
        steamAvatarUrl: null,
        avatarSource: 'steam',
        avatarUploadBlockedUntil: null,
      });
      expect(media.keys(PUBLIC).filter((key) => key.includes(id))).toHaveLength(
        AVATAR_SIZES.length,
      );
      await drain();
      expect(media.keys(PUBLIC).filter((key) => key.includes(id))).toEqual([]);
      const [audit] = await t.postgres.db
        .select()
        .from(staffAuditLog)
        .where(eq(staffAuditLog.action, 'account_anonymize'))
        .orderBy(staffAuditLog.createdAt)
        .limit(1);
      expect(audit?.details).toMatchObject({ removed: { avatars: 1 } });
    });
  });
});

/** Sem as variáveis `R2_MEDIA_*`, a foto de perfil fica desligada e o resto do site não muda. */
describe('Foto de perfil desligada (padrão)', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await startTestApp();
  });

  afterAll(async () => {
    await t?.stop();
  });

  it('o estado diz enabled falso e o envio responde 503 disabled', async () => {
    const player = await signedInPlayer(t, 1);
    await t.postgres.db
      .update(accounts)
      .set({ createdAt: new Date(Date.now() - 2 * DAY_MS) })
      .where(eq(accounts.id, player.account.id));

    const state = avatarStateSchema.parse((await player.call('GET', '/api/me/avatar')).json());
    expect(state).toMatchObject({ enabled: false, canUpload: false, custom: null });
    const upload = await player.raw('POST', '/api/me/avatar', await photo(), 'image/png');

    expect(upload.statusCode).toBe(503);
    expect(avatarErrorSchema.parse(upload.json()).code).toBe('disabled');
    // Voltar à Steam continua valendo: não depende do R2.
    expect((await player.call('DELETE', '/api/me/avatar')).statusCode).toBe(200);
  });
});
