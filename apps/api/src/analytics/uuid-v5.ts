import { createHash } from 'node:crypto';

/**
 * UUID v5 (SHA-1 de namespace + nome): o mesmo fato dá sempre o mesmo UUID, então reenviar um evento com ID natural
 * (a Denúncia, o Período VIP, o evento do plugin) não o duplica no PostHog (plano de eventos, seção 1).
 */
export function uuidV5(name: string, namespace: string): string {
  const space = Buffer.from(namespace.replaceAll('-', ''), 'hex');
  const hash = createHash('sha1').update(space).update(name, 'utf8').digest();
  hash[6] = ((hash[6] as number) & 0x0f) | 0x50;
  hash[8] = ((hash[8] as number) & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
