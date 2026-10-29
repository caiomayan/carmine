import { createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VIP_PACKAGES } from '@carmine/contracts';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config/config.js';
import {
  decryptDocument,
  digitsOf,
  encryptDocument,
  last3Of,
  maskDocument,
} from './payer-document.js';
import {
  manifestOf,
  signatureHeader,
  signWebhook,
  verifyWebhookSignature,
  WEBHOOK_TOLERANCE_MS,
} from './webhook-signature.js';

const NOW = new Date('2026-10-27T18:00:00Z');
const SECRET = 'segredo-do-app';

describe('a assinatura do webhook (x-signature)', () => {
  it('monta o manifesto do jeito do Mercado Pago, em minúsculas e sem o que falta', () => {
    expect(manifestOf({ dataId: 'ABC123', requestId: 'req-1', ts: '1700000000000' })).toBe(
      'id:abc123;request-id:req-1;ts:1700000000000;',
    );
    expect(manifestOf({ dataId: null, requestId: null, ts: '1' })).toBe('ts:1;');
    // data.id não alfanumérico segue como veio.
    expect(manifestOf({ dataId: 'a-b', requestId: 'r', ts: '2' })).toBe(
      'id:a-b;request-id:r;ts:2;',
    );
  });

  it('o HMAC é o SHA-256 do manifesto com o segredo', () => {
    const parts = { dataId: '12345', requestId: 'abc', ts: '1700000000000' };
    const expected = createHmac('sha256', SECRET)
      .update('id:12345;request-id:abc;ts:1700000000000;')
      .digest('hex');
    expect(signWebhook(SECRET, parts)).toBe(expected);
  });

  const header = (over: { dataId?: string; ts?: number } = {}) =>
    signatureHeader(
      SECRET,
      { dataId: over.dataId ?? '999', requestId: 'req' },
      over.ts ?? NOW.getTime(),
    );
  const verify = (headerValue: string | undefined, dataId = '999', now = NOW) =>
    verifyWebhookSignature({ secret: SECRET, header: headerValue, dataId, requestId: 'req', now });

  it('aceita a assinatura certa, também com o ts em segundos', () => {
    expect(verify(header())).toEqual({ valid: true });
    expect(verify(header({ ts: Math.floor(NOW.getTime() / 1000) }))).toEqual({ valid: true });
  });

  it('recusa assinatura errada, de outro recurso, sem cabeçalho ou malformada', () => {
    expect(verify(header(), '1000')).toMatchObject({ valid: false });
    expect(verify(undefined)).toMatchObject({ valid: false, reason: 'sem x-signature' });
    expect(verify('lixo')).toMatchObject({ valid: false });
    expect(verify('ts=abc,v1=123')).toMatchObject({ valid: false });
    expect(verify(`ts=${NOW.getTime()},v1=${'0'.repeat(64)}`)).toMatchObject({ valid: false });
    expect(
      verifyWebhookSignature({
        secret: 'outro-segredo',
        header: header(),
        dataId: '999',
        requestId: 'req',
        now: NOW,
      }),
    ).toMatchObject({ valid: false });
  });

  it('recusa o ts velho ou do futuro além da tolerância (anti-replay)', () => {
    const old = NOW.getTime() - WEBHOOK_TOLERANCE_MS - 1000;
    const future = NOW.getTime() + WEBHOOK_TOLERANCE_MS + 1000;
    expect(verify(header({ ts: old }))).toMatchObject({
      valid: false,
      reason: 'ts fora da tolerância',
    });
    expect(verify(header({ ts: future }))).toMatchObject({ valid: false });
    expect(verify(header({ ts: NOW.getTime() - WEBHOOK_TOLERANCE_MS + 1000 }))).toEqual({
      valid: true,
    });
  });
});

describe('o CPF do Pagador', () => {
  const key = randomBytes(32);

  it('cifra e decifra, e o texto cifrado não deixa o CPF à vista', () => {
    const stored = encryptDocument(key, '123.456.789-09');
    expect(stored.startsWith('v1.')).toBe(true);
    expect(stored).not.toContain('12345678909');
    expect(decryptDocument(key, stored)).toBe('12345678909');
    // Cada cifra é nova (IV aleatório).
    expect(encryptDocument(key, '12345678909')).not.toBe(stored);
  });

  it('com outra chave ou adulterado, não decifra', () => {
    const stored = encryptDocument(key, '12345678909');
    expect(() => decryptDocument(randomBytes(32), stored)).toThrow();
    const [v, iv, tag, body] = stored.split('.');
    expect(() => decryptDocument(key, [v, iv, tag, `${body}x`].join('.'))).toThrow();
    expect(() => decryptDocument(key, 'lixo')).toThrow();
  });

  it('só os 3 últimos dígitos ficam legíveis, e só de um CPF', () => {
    expect(digitsOf('123.456.789-09')).toBe('12345678909');
    expect(last3Of('123.456.789-09')).toBe('909');
    expect(last3Of('1234')).toBeNull();
    expect(maskDocument('909')).toBe('***.***.**9-09');
    expect(maskDocument(null)).toBeNull();
  });
});

describe('os Pacotes VIP', () => {
  it('são 1, 3 e 6 meses de 30 dias, com os preços da spec', () => {
    expect(VIP_PACKAGES.map((p) => [p.id, p.days, p.priceCents])).toEqual([
      ['vip-1m', 30, 990],
      ['vip-3m', 90, 2690],
      ['vip-6m', 180, 4990],
    ]);
  });
});

describe('a configuração dos pagamentos', () => {
  const base = {
    DATABASE_URL: 'postgres://u:p@localhost:5432/db',
    VALKEY_URL: 'redis://localhost:6379',
  };
  const key = randomBytes(32).toString('base64');

  it('nasce desligada e sem provedor', () => {
    expect(loadConfig(base).payments).toMatchObject({
      enabled: false,
      provider: null,
      mercadopago: null,
    });
  });

  it('o provedor falso só roda em host de homologação', () => {
    expect(
      loadConfig({
        ...base,
        PAYMENTS_PROVIDER: 'fake',
        PUBLIC_WEB_URL: 'https://dev.stcarmine.com',
      }).payments.provider,
    ).toBe('fake');
    expect(loadConfig({ ...base, PAYMENTS_PROVIDER: 'fake' }).payments.provider).toBe('fake');
    for (const url of [
      'https://stcarmine.com',
      'https://www.stcarmine.com',
      'https://dev.stcarmine.com.evil.example',
    ]) {
      expect(
        () => loadConfig({ ...base, PAYMENTS_PROVIDER: 'fake', PUBLIC_WEB_URL: url }),
        url,
      ).toThrow(/PAYMENTS_PROVIDER/);
    }
    expect(() =>
      loadConfig({ ...base, PAYMENTS_PROVIDER: 'fake', SENTRY_ENVIRONMENT: 'production' }),
    ).toThrow(/PAYMENTS_PROVIDER/);
  });

  it('ligada, exige provedor e chave de dados; o Mercado Pago, token e segredo', () => {
    expect(() => loadConfig({ ...base, PAYMENTS_ENABLED: 'true' })).toThrow(/PAYMENTS_PROVIDER/);
    expect(() =>
      loadConfig({ ...base, PAYMENTS_ENABLED: 'true', PAYMENTS_PROVIDER: 'fake' }),
    ).toThrow(/PAYMENTS_DATA_KEY/);
    expect(
      loadConfig({
        ...base,
        PAYMENTS_ENABLED: 'true',
        PAYMENTS_PROVIDER: 'fake',
        PAYMENTS_DATA_KEY: key,
      }).payments,
    ).toMatchObject({ enabled: true, provider: 'fake' });
    expect(() =>
      loadConfig({
        ...base,
        PAYMENTS_ENABLED: 'true',
        PAYMENTS_PROVIDER: 'mercadopago',
        PAYMENTS_DATA_KEY: key,
      }),
    ).toThrow(/MERCADOPAGO/);
    expect(
      loadConfig({
        ...base,
        PUBLIC_WEB_URL: 'https://stcarmine.com',
        PAYMENTS_ENABLED: 'true',
        PAYMENTS_PROVIDER: 'mercadopago',
        PAYMENTS_DATA_KEY: key,
        MERCADOPAGO_ACCESS_TOKEN: 'APP_USR-1',
        MERCADOPAGO_WEBHOOK_SECRET: 'segredo',
      }).payments.mercadopago,
    ).toEqual({ accessToken: 'APP_USR-1', webhookSecret: 'segredo' });
  });

  it('a chave de dados precisa ter 32 bytes', () => {
    expect(() => loadConfig({ ...base, PAYMENTS_DATA_KEY: 'curta' })).toThrow(/PAYMENTS_DATA_KEY/);
  });

  it('a chave de dados pode vir de um arquivo (a homologação a sorteia sozinha), sem repeti-la no erro', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'carmine-key-')), 'payments-data-key');
    writeFileSync(
      file,
      `${key}
`,
    );
    const fromFile = {
      ...base,
      PAYMENTS_ENABLED: 'true',
      PAYMENTS_PROVIDER: 'fake',
      PAYMENTS_DATA_KEY_FILE: file,
    };
    expect(loadConfig(fromFile).payments.dataKey?.toString('base64')).toBe(key);
    // A variável, se houver, vale mais que o arquivo.
    const other = randomBytes(32).toString('base64');
    expect(
      loadConfig({ ...fromFile, PAYMENTS_DATA_KEY: other }).payments.dataKey?.toString('base64'),
    ).toBe(other);
    // Arquivo que não existe: erro claro, sem chave.
    expect(() => loadConfig({ ...fromFile, PAYMENTS_DATA_KEY_FILE: `${file}.nao-existe` })).toThrow(
      /PAYMENTS_DATA_KEY_FILE: não consegui ler/,
    );
  });
});
