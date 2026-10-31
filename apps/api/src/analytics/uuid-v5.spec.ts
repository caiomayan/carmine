import { describe, expect, it } from 'vitest';
import { uuidV5 } from './uuid-v5.js';

/** O espaço de nomes DNS da RFC 4122. */
const DNS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

describe('uuidV5', () => {
  it('bate com o vetor conhecido (uuid5(DNS, "www.example.com"))', () => {
    expect(uuidV5('www.example.com', DNS)).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2');
  });

  it('é determinístico e a versão e a variante estão certas', () => {
    const id = uuidV5('denuncia_enviada:abc', DNS);

    expect(id).toBe(uuidV5('denuncia_enviada:abc', DNS));
    expect(id).not.toBe(uuidV5('denuncia_enviada:abd', DNS));
    expect(id[14]).toBe('5');
    expect('89ab').toContain(id[19]);
  });
});
