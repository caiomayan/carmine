import { describe, expect, it } from 'vitest';
import { ClientIpResolver, parseTrustedProxies } from './client-ip.js';

describe('ClientIpResolver', () => {
  describe('sem proxies confiáveis (padrão, desenvolvimento)', () => {
    const resolver = new ClientIpResolver([]);

    it('usa o IP do socket', () => {
      expect(resolver.resolve('203.0.113.7', undefined)).toBe('203.0.113.7');
    });

    it('ignora um CF-Connecting-IP forjado', () => {
      expect(resolver.resolve('203.0.113.7', '198.51.100.1')).toBe('203.0.113.7');
    });

    it('lê um IPv4 mapeado em IPv6 como IPv4', () => {
      expect(resolver.resolve('::ffff:203.0.113.7', undefined)).toBe('203.0.113.7');
    });
  });

  describe('atrás do cloudflared', () => {
    const resolver = new ClientIpResolver(
      parseTrustedProxies('172.30.0.10, 10.8.0.0/16, fd00::/8'),
    );

    it('confia no CF-Connecting-IP quando o socket é um proxy confiável (endereço único)', () => {
      expect(resolver.resolve('172.30.0.10', '198.51.100.1')).toBe('198.51.100.1');
    });

    it('confia no CF-Connecting-IP quando o socket está numa rede confiável', () => {
      expect(resolver.resolve('10.8.3.4', '2001:db8::1')).toBe('2001:db8::1');
      expect(resolver.resolve('fd12::5', '198.51.100.2')).toBe('198.51.100.2');
    });

    it('reconhece o proxy confiável mesmo com o endereço mapeado em IPv6', () => {
      expect(resolver.resolve('::ffff:172.30.0.10', '198.51.100.1')).toBe('198.51.100.1');
    });

    it('ignora o CF-Connecting-IP vindo de fora da lista', () => {
      expect(resolver.resolve('172.30.0.11', '198.51.100.1')).toBe('172.30.0.11');
      expect(resolver.resolve('203.0.113.7', '198.51.100.1')).toBe('203.0.113.7');
    });

    it('fica com o IP do proxy quando o cabeçalho falta, vem repetido ou não é um IP', () => {
      expect(resolver.resolve('172.30.0.10', undefined)).toBe('172.30.0.10');
      expect(resolver.resolve('172.30.0.10', '198.51.100.1, 198.51.100.2')).toBe('172.30.0.10');
      expect(resolver.resolve('172.30.0.10', ['198.51.100.1', '198.51.100.2'])).toBe('172.30.0.10');
      expect(resolver.resolve('172.30.0.10', 'nao-e-ip')).toBe('172.30.0.10');
    });

    it('normaliza o IP do cabeçalho', () => {
      expect(resolver.resolve('172.30.0.10', ' 2001:DB8::A ')).toBe('2001:db8::a');
      expect(resolver.resolve('172.30.0.10', '::ffff:198.51.100.1')).toBe('198.51.100.1');
    });
  });

  it('sem IP do socket, devolve "unknown"', () => {
    expect(new ClientIpResolver([]).resolve(undefined, undefined)).toBe('unknown');
  });
});

describe('parseTrustedProxies', () => {
  it('aceita vazio, endereços e redes IPv4 e IPv6, separados por vírgula', () => {
    expect(parseTrustedProxies('')).toEqual([]);
    expect(parseTrustedProxies(' 172.30.0.10 ,10.0.0.0/8,,fd00::/8 ')).toEqual([
      '172.30.0.10',
      '10.0.0.0/8',
      'fd00::/8',
    ]);
  });

  it('recusa o que não é IP nem rede', () => {
    expect(() => parseTrustedProxies('cloudflared')).toThrow(/cloudflared/);
    expect(() => parseTrustedProxies('10.0.0.0/33')).toThrow(/10\.0\.0\.0\/33/);
    expect(() => parseTrustedProxies('fd00::/129')).toThrow(/fd00::\/129/);
    expect(() => parseTrustedProxies('10.0.0.0/')).toThrow();
  });

  it('recusa confiar em todo mundo', () => {
    expect(() => parseTrustedProxies('0.0.0.0/0')).toThrow(/0\.0\.0\.0\/0/);
    expect(() => parseTrustedProxies('::/0')).toThrow(/::\/0/);
  });
});
