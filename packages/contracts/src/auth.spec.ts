import { describe, expect, it } from 'vitest';
import { safeReturnPath } from './auth.js';

describe('safeReturnPath', () => {
  it.each([
    ['/', '/'],
    ['/10016', '/10016'],
    ['/inventory?arma=ak47#ct', '/inventory?arma=ak47#ct'],
    ['/perfil/editar', '/perfil/editar'],
  ])('mantém o caminho interno %s', (input, expected) => {
    expect(safeReturnPath(input)).toBe(expected);
  });

  it.each([
    ['https://evil.example/', 'URL absoluta'],
    ['//evil.example', 'URL relativa ao protocolo'],
    ['/\\evil.example', 'barra invertida que o navegador lê como //'],
    ['\\\\evil.example', 'só barras invertidas'],
    ['/%5Cevil.example', 'barra invertida codificada'],
    ['/%2F%2Fevil.example', 'barras codificadas'],
    ['/..//evil.example', 'segmento .. que vira //'],
    ['/%2e%2e//evil.example', 'segmento .. codificado'],
    ['/./inventario', 'segmento .'],
    ['javascript:alert(1)', 'esquema javascript'],
    ['inventario', 'sem barra inicial'],
    ['/\tevil', 'caractere de controle'],
    [' /inventory', 'espaço antes'],
    ['/api/auth/logout', 'rota da API'],
    [`/${'a'.repeat(600)}`, 'longo demais'],
    ['', 'vazio'],
    [undefined, 'ausente'],
  ])('troca %s pela home (%s)', (input, _reason) => {
    expect(safeReturnPath(input)).toBe('/');
  });
});
