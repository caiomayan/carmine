import { describe, expect, it } from 'vitest';
import {
  loadTestServerAddress,
  loadTestServerKey,
  loadTestServerName,
} from './load-test-servers.js';

describe('servidores do teste de carga', () => {
  it('nomeia com três dígitos e endereça fora da internet (RFC 5737), sem repetir', () => {
    expect(loadTestServerName('carga-', 1)).toBe('carga-001');
    expect(loadTestServerName('carga-', 200)).toBe('carga-200');
    expect(loadTestServerAddress(1)).toBe('203.0.113.1:27015');
    expect(loadTestServerAddress(250)).toBe('203.0.113.250:27015');
    expect(loadTestServerAddress(251)).toBe('203.0.113.1:27016');
    const addresses = new Set(Array.from({ length: 500 }, (_, i) => loadTestServerAddress(i + 1)));
    expect(addresses.size).toBe(500);
  });

  it('deriva a chave do segredo e do nome (vetor fixo, igual ao do gerador de carga)', () => {
    const secret = 'segredo-de-teste-com-pelo-menos-32-caracteres';
    expect(loadTestServerKey(secret, 'carga-001')).toBe(
      'cmk_H4SHE0Tumj_a9RRA2bT7l5G0wy_lIaQ0h38nMjwgUUg',
    );
    expect(loadTestServerKey(secret, 'carga-001')).not.toBe(loadTestServerKey(secret, 'carga-002'));
    expect(loadTestServerKey(secret, 'carga-001')).toMatch(/^cmk_[A-Za-z0-9_-]{43}$/);
  });
});
