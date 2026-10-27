import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * A assinatura do webhook do Mercado Pago (cabeçalho `x-signature: ts=<ms>,v1=<hex>`): HMAC-SHA256,
 * com o segredo do app, do manifesto `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`, em que o
 * `data.id` vem da query da URL (em minúsculas quando é alfanumérico) e uma parte ausente sai do
 * manifesto. O adaptador falso assina do mesmo jeito, então o caminho de verificação é um só.
 */

/** O quanto o `ts` pode estar longe do relógio daqui (anti-replay). */
export const WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000;

export interface SignatureParts {
  dataId: string | null;
  requestId: string | null;
  ts: string;
}

export function manifestOf({ dataId, requestId, ts }: SignatureParts): string {
  const id = dataId === null ? '' : /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  return [
    id === '' ? '' : `id:${id};`,
    requestId === null || requestId === '' ? '' : `request-id:${requestId};`,
    `ts:${ts};`,
  ].join('');
}

export function signWebhook(secret: string, parts: SignatureParts): string {
  return createHmac('sha256', secret).update(manifestOf(parts)).digest('hex');
}

/** O cabeçalho pronto: `ts=<ms>,v1=<hex>`. */
export function signatureHeader(
  secret: string,
  parts: Omit<SignatureParts, 'ts'>,
  ts: number,
): string {
  return `ts=${ts},v1=${signWebhook(secret, { ...parts, ts: String(ts) })}`;
}

export type SignatureResult = { valid: true } | { valid: false; reason: string };

export function verifyWebhookSignature(input: {
  secret: string;
  header: string | undefined;
  dataId: string | null;
  requestId: string | null;
  now: Date;
}): SignatureResult {
  if (!input.header) return { valid: false, reason: 'sem x-signature' };
  const fields = new Map(
    input.header.split(',').map((part): [string, string] => {
      const [key, ...rest] = part.trim().split('=');
      return [key ?? '', rest.join('=')];
    }),
  );
  const ts = fields.get('ts');
  const given = fields.get('v1');
  if (!ts || !given || !/^\d+$/.test(ts)) return { valid: false, reason: 'x-signature malformado' };
  const stamp = Number(ts) < 1e12 ? Number(ts) * 1000 : Number(ts);
  if (Math.abs(input.now.getTime() - stamp) > WEBHOOK_TOLERANCE_MS) {
    return { valid: false, reason: 'ts fora da tolerância' };
  }
  const expected = signWebhook(input.secret, {
    dataId: input.dataId,
    requestId: input.requestId,
    ts,
  });
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(given, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b)
    ? { valid: true }
    : { valid: false, reason: 'assinatura não confere' };
}
