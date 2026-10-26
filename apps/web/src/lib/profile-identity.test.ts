import { describe, expect, it } from 'vitest';
import { memberSinceLabel } from './profile-identity';

describe('memberSinceLabel', () => {
  it('escreve o mês e o ano em português', () => {
    expect(memberSinceLabel('2026-10-14T15:00:00.000Z')).toBe('outubro de 2026');
  });

  it('o primeiro instante do mês em Brasília já é o mês novo', () => {
    expect(memberSinceLabel('2026-11-01T03:30:00.000Z')).toBe('novembro de 2026');
  });

  it('a virada do mês vale em Brasília, não em UTC', () => {
    // 1º de novembro às 01:00 UTC ainda é 31 de outubro às 22:00 em Brasília (UTC−3).
    expect(memberSinceLabel('2026-11-01T01:00:00.000Z')).toBe('outubro de 2026');
  });
});
