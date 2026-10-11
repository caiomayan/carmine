import { describe, expect, it } from 'vitest';
import { parseLoginError, parseProfileSegment, signInHref, steamLoginHref } from './auth-links';

describe('steamLoginHref', () => {
  it('começa o login na API com a página de origem', () => {
    expect(steamLoginHref('/10016')).toBe('/api/auth/steam/login?returnTo=%2F10016');
  });

  it('mantém a busca da página de origem', () => {
    expect(steamLoginHref('/inventario?aba=facas')).toBe(
      '/api/auth/steam/login?returnTo=%2Finventario%3Faba%3Dfacas',
    );
  });

  it('troca destinos externos ou da API pela home', () => {
    for (const unsafe of ['https://evil.example', '//evil.example', '/api/me', '/\\evil', null]) {
      expect(steamLoginHref(unsafe)).toBe('/api/auth/steam/login?returnTo=%2F');
    }
  });

  it('nunca volta para a própria página de entrar', () => {
    expect(steamLoginHref('/entrar?erro=cancelado')).toBe('/api/auth/steam/login?returnTo=%2F');
  });
});

describe('signInHref', () => {
  it('leva a página atual em ?voltar=', () => {
    expect(signInHref('/10016')).toBe('/entrar?voltar=%2F10016');
  });

  it('sem ?voltar= quando a origem é a home ou a própria página de entrar', () => {
    expect(signInHref('/')).toBe('/entrar');
    expect(signInHref('/entrar')).toBe('/entrar');
    expect(signInHref('/entrar?voltar=%2Fx')).toBe('/entrar');
  });

  it('acrescenta o motivo quando a sessão expirou', () => {
    expect(signInHref('/inventario', 'sessao-expirada')).toBe(
      '/entrar?voltar=%2Finventario&motivo=sessao-expirada',
    );
  });
});

describe('parseLoginError', () => {
  it('reconhece os motivos que a API manda', () => {
    expect(parseLoginError('cancelado')).toBe('cancelado');
    expect(parseLoginError('invalido')).toBe('invalido');
    expect(parseLoginError('indisponivel')).toBe('indisponivel');
    expect(parseLoginError('limite')).toBe('limite');
  });

  it('ignora o resto', () => {
    expect(parseLoginError(undefined)).toBeNull();
    expect(parseLoginError('<script>')).toBeNull();
    expect(parseLoginError(['cancelado', 'x'])).toBe('cancelado');
  });
});

describe('parseProfileSegment', () => {
  it('reconhece um ID público', () => {
    expect(parseProfileSegment('10016')).toEqual({ kind: 'publicId', publicId: 10016 });
    expect(parseProfileSegment('7')).toEqual({ kind: 'publicId', publicId: 7 });
  });

  it('reconhece um SteamID64 de conta individual', () => {
    expect(parseProfileSegment('76561198000000001')).toEqual({
      kind: 'steamId',
      steamId: '76561198000000001',
    });
  });

  it('recusa o que não é nem um nem outro', () => {
    for (const segment of ['0', '012', 'abc', '10016a', '1234567890123456', '99999999999999999']) {
      expect(parseProfileSegment(segment)).toEqual({ kind: 'invalid' });
    }
  });
});
