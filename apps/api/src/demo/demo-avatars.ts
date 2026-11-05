import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import type { AvatarFiles } from '../avatars/avatar-files.js';
import type { AvatarModeration } from '../avatars/avatar-moderation.js';
import { processAvatar } from '../avatars/avatar-processor.js';
import type { Database } from '../database/database.js';
import { accountAvatars, accounts } from '../database/schema.js';

export interface AvatarSeedServices {
  files: AvatarFiles;
  moderation: AvatarModeration;
  /** A funcionalidade está ligada (R2 de mídia configurado). */
  enabled: boolean;
}

const DAY_MS = 86_400_000;
const BLOCK_DAYS = 30;

/**
 * Uma imagem abstrata e determinística (gradiente com círculos), 512 px: sem rosto de pessoa real e sem
 * arquivo no repositório. Cada `hue` dá uma foto diferente.
 */
async function demoPhoto(hue: number): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="hsl(${hue},70%,45%)"/><stop offset="1" stop-color="hsl(${(hue + 70) % 360},75%,25%)"/>
  </linearGradient></defs>
  <rect width="512" height="512" fill="url(#g)"/>
  <circle cx="170" cy="190" r="120" fill="hsl(${(hue + 160) % 360},65%,60%)" fill-opacity="0.55"/>
  <circle cx="340" cy="330" r="150" fill="hsl(${(hue + 30) % 360},80%,70%)" fill-opacity="0.4"/>
  <circle cx="380" cy="130" r="60" fill="#fff" fill-opacity="0.5"/>
</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function publishPhoto(
  db: Database,
  files: AvatarFiles,
  accountId: string,
  hue: number,
  createdAt: Date,
): Promise<string> {
  const id = randomUUID();
  await files.publish(id, await processAvatar(await demoPhoto(hue), 'image/png'));
  await db.insert(accountAvatars).values({ id, accountId, createdAt });
  return id;
}

/**
 * Semeia uma Conta de demonstração com **foto própria no ar** e **uma remoção antiga** no histórico (motivo, data
 * e autor da Staff), mais o bloqueio de novos envios que a remoção aplicou: assim o cartão da foto, o bloqueio e as
 * "Remoções anteriores" aparecem na ficha da Conta, no painel. As fotos são imagens geradas, sem rosto. Idempotente
 * (não faz nada se a Conta já tem alguma foto) e só roda dentro do `seedDemo`, que já passou pela trava da
 * homologação. Sem o dono (a remoção precisa de um autor da Staff) ou com a mídia desligada, não semeia.
 */
export async function seedDemoAvatar(
  db: Database,
  services: AvatarSeedServices,
  target: { accountId: string; steamId: string },
  author: { accountId: string; steamId: string } | null,
  now: Date,
  log: (line: string) => void,
): Promise<void> {
  if (!services.enabled) return log('foto própria: mídia desligada, não semeou');
  if (author === null) return log('foto própria: sem DEMO_OWNER_STEAM_ID, não semeou');
  const existing = await db
    .select({ id: accountAvatars.id })
    .from(accountAvatars)
    .where(eq(accountAvatars.accountId, target.accountId))
    .limit(1);
  if (existing.length > 0) return;

  const [account] = await db
    .select({ publicId: accounts.publicId })
    .from(accounts)
    .where(eq(accounts.id, target.accountId));
  if (!account) throw new Error('Conta da foto de demonstração não existe');

  // A foto antiga, que a Staff removeu (pelo caminho de verdade: vai para o bucket privado, volta à Steam).
  const old = await publishPhoto(
    db,
    services.files,
    target.accountId,
    10,
    new Date(now.getTime() - 20 * DAY_MS),
  );
  await services.moderation.removeFromAccount(
    { accountId: author.accountId, steamId: author.steamId, role: 'owner' },
    account.publicId,
    {
      decision: 'remove',
      reason: 'other',
      note: 'Homologação: remoção de exemplo para o histórico',
      blockDays: BLOCK_DAYS,
    },
  );
  // A remoção foi há 12 dias: o bloqueio de 30 dias acaba em 18.
  const removedAt = new Date(now.getTime() - 12 * DAY_MS);
  await db
    .update(accountAvatars)
    .set({ decidedAt: removedAt, takenDownAt: removedAt, retiredAt: removedAt })
    .where(eq(accountAvatars.id, old));
  await db
    .update(accounts)
    .set({ avatarUploadBlockedUntil: new Date(removedAt.getTime() + BLOCK_DAYS * DAY_MS) })
    .where(eq(accounts.id, target.accountId));

  // A foto atual, aprovada (sem decisão contra ela), enviada depois da remoção.
  const current = await publishPhoto(
    db,
    services.files,
    target.accountId,
    200,
    new Date(now.getTime() - 5 * DAY_MS),
  );
  await db
    .update(accounts)
    .set({ avatarSource: 'custom', avatarUrl: services.files.url(current) })
    .where(eq(accounts.id, target.accountId));
  log('foto própria: 1 foto no ar, 1 remoção antiga e o bloqueio de novos envios');
}
