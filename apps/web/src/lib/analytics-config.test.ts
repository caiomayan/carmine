import { describe, expect, it } from 'vitest';
import { analyticsIngestOrigin, analyticsWebConfig } from './analytics-config';

describe('analyticsWebConfig', () => {
  it('sem POSTHOG_API_KEY (ou em branco) está desligado e a CSP não muda', () => {
    expect(analyticsWebConfig({})).toBeNull();
    expect(analyticsWebConfig({ POSTHOG_API_KEY: '   ' })).toBeNull();
    expect(analyticsIngestOrigin(analyticsWebConfig({}))).toBeNull();
  });

  it('com a chave usa o PostHog da UE por padrão, em produção', () => {
    const config = analyticsWebConfig({ POSTHOG_API_KEY: ' phc_abc ' });

    expect(config).toEqual({
      key: 'phc_abc',
      host: 'https://eu.i.posthog.com',
      environment: 'producao',
    });
    expect(analyticsIngestOrigin(config)).toBe('https://eu.i.posthog.com');
  });

  it('o host é a origem (sem a barra final) e o ambiente staging vem do ANALYTICS_ENVIRONMENT', () => {
    expect(
      analyticsWebConfig({
        POSTHOG_API_KEY: 'phc_abc',
        POSTHOG_HOST: 'https://eu.i.posthog.com/',
        ANALYTICS_ENVIRONMENT: 'staging',
      }),
    ).toEqual({ key: 'phc_abc', host: 'https://eu.i.posthog.com', environment: 'staging' });
  });

  it('o adaptador de log (a homologação) ganha da chave: o navegador também não envia nada', () => {
    expect(analyticsWebConfig({ POSTHOG_API_KEY: 'phc_abc', ANALYTICS_DRIVER: 'log' })).toBeNull();
  });

  it('um host que não é URL http(s) desliga em vez de abrir a CSP', () => {
    expect(
      analyticsWebConfig({ POSTHOG_API_KEY: 'phc_abc', POSTHOG_HOST: 'não é url' }),
    ).toBeNull();
    expect(
      analyticsWebConfig({ POSTHOG_API_KEY: 'phc_abc', POSTHOG_HOST: 'javascript:alert(1)' }),
    ).toBeNull();
  });
});
