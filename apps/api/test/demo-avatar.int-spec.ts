import { staffAccountAvatarSchema } from '@carmine/contracts/avatar';
import { count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountsService } from '../src/accounts/accounts.service.js';
import { AvatarFiles } from '../src/avatars/avatar-files.js';
import { AvatarModeration } from '../src/avatars/avatar-moderation.js';
import { Avatars } from '../src/avatars/avatars.js';
import { Catalog } from '../src/catalog/catalog.js';
import { DATABASE } from '../src/database/database.module.js';
import { accountAvatars, accounts } from '../src/database/schema.js';
import { DEMO_PLAYERS } from '../src/demo/demo-cast.js';
import { type SeedServices, seedDemo } from '../src/demo/demo-seed.js';
import { GameServerRegistry } from '../src/game-servers/game-server-registry.js';
import { Inventory } from '../src/inventory/inventory.js';
import { Loadouts } from '../src/loadout/loadouts.js';
import { StaffRoles } from '../src/staff/staff-roles.js';
import { VipPeriods } from '../src/vip/vip-periods.js';
import { startTestApp, steamIdFor, type TestApp } from './support/app.js';
import { FakeMedia } from './support/fake-media.js';

const OWNER = steamIdFor(4243);
const settings = {
  secret: 'segredo-da-homologacao-'.padEnd(48, 'x'),
  ownerSteamId: OWNER,
  publicWebUrl: 'https://dev.stcarmine.com',
};

/** A Conta de demonstração com foto própria e uma remoção antiga (#286): o que o QA da #230 precisa ver. */
describe('Foto própria na demonstração da homologação (#286)', () => {
  let t: TestApp;
  let media: FakeMedia;
  let services: SeedServices;

  beforeAll(async () => {
    media = await FakeMedia.start();
    t = await startTestApp({
      R2_MEDIA_ENDPOINT: media.url,
      R2_MEDIA_ACCESS_KEY_ID: 'chave',
      R2_MEDIA_SECRET_ACCESS_KEY: 'segredo',
      R2_MEDIA_PUBLIC_BUCKET: 'carmine-media',
      R2_MEDIA_PRIVATE_BUCKET: 'carmine-media-removidas',
      MEDIA_PUBLIC_URL: 'https://img.test',
      MEDIA_SWEEP_SECONDS: '0',
    });
    services = {
      db: t.app.get(DATABASE),
      accounts: t.app.get(AccountsService),
      inventory: t.app.get(Inventory),
      loadouts: t.app.get(Loadouts),
      vip: t.app.get(VipPeriods),
      staffRoles: t.app.get(StaffRoles),
      catalog: t.app.get(Catalog),
      avatars: {
        files: t.app.get(AvatarFiles),
        moderation: t.app.get(AvatarModeration),
        enabled: t.app.get(Avatars).enabled,
      },
    };
    await t.app.get(GameServerRegistry).retire({ name: 'retake-teste' });
  });

  afterAll(async () => {
    await t?.stop();
    await media?.stop();
  });

  it('semeia a foto no ar, a remoção antiga com autor e o bloqueio, e não repete', async () => {
    await seedDemo(services, settings, new Date(), () => {});
    await seedDemo(services, settings, new Date(), () => {});

    const player = DEMO_PLAYERS[1];
    const [account] = await services.db
      .select({ id: accounts.id, publicId: accounts.publicId, source: accounts.avatarSource })
      .from(accounts)
      .where(eq(accounts.steamId, BigInt(player?.steamId ?? '0')));
    expect(account?.source).toBe('custom');
    const [rows] = await services.db
      .select({ n: count() })
      .from(accountAvatars)
      .where(eq(accountAvatars.accountId, account?.id as string));
    expect(rows?.n).toBe(2);

    const card = staffAccountAvatarSchema.parse(
      await t.app.get(AvatarModeration).accountAvatar(account?.publicId as number),
    );
    expect(card.current).not.toBeNull();
    expect(card.uploadBlockedUntil).not.toBeNull();
    expect(card.removals).toHaveLength(1);
    expect(card.removals[0]?.by.steamId).toBe(OWNER);
    expect(card.removals[0]?.note.length).toBeGreaterThan(0);
  });
});
