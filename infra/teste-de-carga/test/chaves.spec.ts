import { describe, expect, it } from 'vitest';
import { chaveDoServidor, chavesDosServidores, nomeDoServidor } from '../lib/chaves.mjs';

describe('chaves dos servidores do teste de carga', () => {
  const segredo = 'segredo-de-teste-com-pelo-menos-32-caracteres';

  it('bate com a chave que o CLI da API grava (mesmo vetor de apps/api/src/game-servers/load-test-servers.spec.ts)', () => {
    expect(chaveDoServidor(segredo, 'carga-001')).toBe(
      'cmk_H4SHE0Tumj_a9RRA2bT7l5G0wy_lIaQ0h38nMjwgUUg',
    );
  });

  it('nomeia com três dígitos e deriva uma chave por servidor, na ordem', () => {
    expect(nomeDoServidor('carga-', 12)).toBe('carga-012');
    const chaves = chavesDosServidores(segredo, 3);
    expect(new Set(chaves).size).toBe(3);
    expect(chaves[1]).toBe(chaveDoServidor(segredo, 'carga-002'));
    expect(chaves.every((chave) => /^cmk_[A-Za-z0-9_-]{43}$/.test(chave))).toBe(true);
  });
});
