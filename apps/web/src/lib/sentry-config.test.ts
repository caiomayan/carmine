import { describe, expect, it } from 'vitest';
import { SENTRY_DATA_COLLECTION, sentryIngestOrigin, sentryWebConfig } from './sentry-config';

describe('sentryWebConfig', () => {
  it('sem DSN (ou inválido) fica desligado', () => {
    expect(sentryWebConfig({})).toBeNull();
    expect(sentryWebConfig({ SENTRY_DSN: '  ' })).toBeNull();
    expect(sentryWebConfig({ SENTRY_DSN: 'não é url' })).toBeNull();
  });

  it('lê DSN, ambiente e release', () => {
    const config = sentryWebConfig({
      SENTRY_DSN: 'https://chave@o1.ingest.sentry.io/2',
      SENTRY_ENVIRONMENT: 'production',
      SENTRY_RELEASE: 'abc123',
    });

    expect(config).toEqual({
      dsn: 'https://chave@o1.ingest.sentry.io/2',
      environment: 'production',
      release: 'abc123',
    });
  });

  it('o ambiente cai no NODE_ENV e a release é opcional', () => {
    expect(
      sentryWebConfig({ SENTRY_DSN: 'https://k@o1.ingest.sentry.io/2', NODE_ENV: 'staging' }),
    ).toEqual({
      dsn: 'https://k@o1.ingest.sentry.io/2',
      environment: 'staging',
      release: undefined,
    });
  });

  it('a origem de ingestão vem do DSN, para o connect-src', () => {
    const config = sentryWebConfig({ SENTRY_DSN: 'https://k@o1.ingest.sentry.io/2' });

    expect(sentryIngestOrigin(config)).toBe('https://o1.ingest.sentry.io');
    expect(sentryIngestOrigin(null)).toBeNull();
  });

  it('não coleta dados pessoais', () => {
    expect(SENTRY_DATA_COLLECTION).toMatchObject({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      urlQueryParams: false,
    });
  });
});
