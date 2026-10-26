import { eq } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { accountAvatars, avatarReports } from '../database/schema.js';
import { avatarDeletions } from './avatar-keys.js';
import { enqueueMediaDeletions } from './media-deletions.js';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * A foto de perfil na exclusão de dados (S08, ADR 0022), na transação da anonimização: enfileira
 * a remoção de **todos** os arquivos da Conta (no ar, em retenção e já trocados que ainda
 * esperam), apaga as fotos e as denúncias contra elas e solta a Conta das denúncias de foto que
 * fez (a denúncia fica, sem autor). Só o banco: vale também para o CLI, sem R2 configurado (a fila
 * apaga os arquivos quando houver armazenamento). Devolve quantas fotos saíram.
 */
export async function eraseAvatarsOf(tx: Transaction, accountId: string): Promise<number> {
  const photos = await tx
    .select({ id: accountAvatars.id })
    .from(accountAvatars)
    .where(eq(accountAvatars.accountId, accountId));
  await enqueueMediaDeletions(
    tx,
    photos.flatMap((photo) => avatarDeletions(photo.id)),
  );
  await tx
    .update(avatarReports)
    .set({ reporterAccountId: null })
    .where(eq(avatarReports.reporterAccountId, accountId));
  await tx.delete(accountAvatars).where(eq(accountAvatars.accountId, accountId));
  return photos.length;
}
