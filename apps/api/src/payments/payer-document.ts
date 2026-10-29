import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * O CPF do Pagador (S14, ADR 0011): vem do provedor, fica cifrado em repouso (AES-256-GCM, chave
 * `PAYMENTS_DATA_KEY`) e só os 3 últimos dígitos ficam legíveis. Em tela e em log só a máscara.
 */

const VERSION = 'v1';

/** Só os dígitos. */
export function digitsOf(document: string): string {
  return document.replace(/\D/g, '');
}

/** `v1.iv.tag.texto`, em base64url. */
export function encryptDocument(key: Buffer, document: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(digitsOf(document), 'utf8'), cipher.final()]);
  return [
    VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    body.toString('base64url'),
  ].join('.');
}

export function decryptDocument(key: Buffer, stored: string): string {
  const [version, iv, tag, body] = stored.split('.');
  if (version !== VERSION || !iv || !tag || !body) {
    throw new Error('CPF cifrado em formato desconhecido');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(body, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/** Os 3 últimos dígitos (o que fica legível), ou nulo se não parece um CPF. */
export function last3Of(document: string): string | null {
  const digits = digitsOf(document);
  return digits.length === 11 ? digits.slice(-3) : null;
}

/**
 * `***.***.**1-23`: o recibo e "Minhas compras" mostram só isto. Os 3 últimos dígitos do CPF ficam na posição de
 * origem: o 9º fecha o terceiro grupo e os dois verificadores vêm depois do hífen (ADR 0023).
 */
export function maskDocument(last3: string | null): string | null {
  return last3 === null ? null : `***.***.**${last3.slice(0, 1)}-${last3.slice(1)}`;
}
