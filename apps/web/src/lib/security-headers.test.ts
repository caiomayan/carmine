import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildContentSecurityPolicy,
  generateNonce,
  NONCE_HEADER,
  staticSecurityHeaders,
} from './security-headers';

const directives = (csp: string) =>
  new Map(
    csp.split(';').map((part) => {
      const [name, ...values] = part.trim().split(/\s+/);
      return [name, values] as const;
    }),
  );

describe('buildContentSecurityPolicy', () => {
  afterEach(() => vi.unstubAllEnvs());

  const csp = directives(buildContentSecurityPolicy({ nonce: 'abc123', dev: false }));

  it('só executa script com o nonce da requisição (sem unsafe-inline nem eval)', () => {
    expect(csp.get('script-src')).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'"]);
  });

  it('em desenvolvimento libera o eval que o React usa para os erros de servidor', () => {
    const dev = directives(buildContentSecurityPolicy({ nonce: 'abc123', dev: true }));
    expect(dev.get('script-src')).toContain("'unsafe-eval'");
  });

  it('proíbe ser embutido, plugins, <base> alheio e formulários para fora', () => {
    expect(csp.get('frame-ancestors')).toEqual(["'none'"]);
    expect(csp.get('object-src')).toEqual(["'none'"]);
    expect(csp.get('base-uri')).toEqual(["'self'"]);
    expect(csp.get('form-action')).toEqual(["'self'"]);
  });

  it('só embute o viewer 3D do cstrike.app', () => {
    expect(csp.get('frame-src')).toEqual(['https://3d.cstrike.app']);
  });

  it('carrega imagens do CDN dos itens e dos avatares da Steam', () => {
    expect(csp.get('img-src')).toEqual([
      "'self'",
      'data:',
      'blob:',
      'https://cdn.cstrike.app',
      'https://*.steamstatic.com',
    ]);
  });

  it('com a foto de perfil ligada, libera também as imagens da origem pública dela (só ela)', () => {
    vi.stubEnv('MEDIA_PUBLIC_URL', 'https://img.stcarmine.com/');
    const withMedia = directives(buildContentSecurityPolicy({ nonce: 'abc123', dev: false }));

    expect(withMedia.get('img-src')).toEqual([
      "'self'",
      'data:',
      'blob:',
      'https://cdn.cstrike.app',
      'https://*.steamstatic.com',
      'https://img.stcarmine.com',
    ]);
    vi.stubEnv('MEDIA_PUBLIC_URL', 'isto não é uma URL');
    expect(
      directives(buildContentSecurityPolicy({ nonce: 'abc123', dev: false })).get('img-src'),
    ).toEqual(csp.get('img-src'));
  });

  it('com Sentry, o navegador também pode falar com a origem de ingestão do DSN', () => {
    const withSentry = directives(
      buildContentSecurityPolicy({
        nonce: 'abc123',
        dev: false,
        reportingOrigin: 'https://o1.ingest.sentry.io',
      }),
    );

    expect(withSentry.get('connect-src')).toEqual(["'self'", 'https://o1.ingest.sentry.io']);
  });

  it('fala só com a própria origem (API em /api, SSE)', () => {
    expect(csp.get('connect-src')).toEqual(["'self'"]);
    expect(csp.get('default-src')).toEqual(["'self'"]);
  });
});

describe('generateNonce', () => {
  it('é base64 e muda a cada chamada', () => {
    const a = generateNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(a).not.toBe(generateNonce());
  });
});

describe('staticSecurityHeaders', () => {
  const names = (production: boolean) =>
    Object.fromEntries(staticSecurityHeaders({ production }).map((h) => [h.key, h.value]));

  it('traz nosniff, referrer e permissions-policy em qualquer ambiente', () => {
    const headers = names(false);
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['Permissions-Policy']).toContain('camera=()');
    expect(headers['Strict-Transport-Security']).toBeUndefined();
  });

  it('HSTS só em produção', () => {
    expect(names(true)['Strict-Transport-Security']).toBe('max-age=31536000; includeSubDomains');
  });
});

it('o nonce viaja ao layout por um cabeçalho de requisição', () => {
  expect(NONCE_HEADER).toBe('x-nonce');
});
