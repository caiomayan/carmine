import { describe, expect, it } from 'vitest';
import { sentryOptions } from './sentry-options.js';

describe('sentryOptions', () => {
  it('sem DSN fica desligado', () => {
    expect(sentryOptions({ dsn: null, environment: 'production', release: null })).toBeNull();
  });

  it('só erros, sem dados pessoais e com ambiente e release', () => {
    const options = sentryOptions({
      dsn: 'https://chave@o1.ingest.sentry.io/2',
      environment: 'production',
      release: 'abc123',
    });

    expect(options).toMatchObject({
      dsn: 'https://chave@o1.ingest.sentry.io/2',
      environment: 'production',
      release: 'abc123',
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
      },
    });
    expect(options).not.toHaveProperty('tracesSampleRate');
  });

  it('sem release, não manda o campo', () => {
    const options = sentryOptions({
      dsn: 'https://k@o1.ingest.sentry.io/2',
      environment: 'x',
      release: null,
    });

    expect(options).not.toHaveProperty('release');
  });
});
