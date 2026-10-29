import { describe, expect, it } from 'vitest';
import { isCurrentPath } from './nav';

describe('isCurrentPath', () => {
  it('marca a home só na raiz', () => {
    expect(isCurrentPath('/', '/')).toBe(true);
    expect(isCurrentPath('/inventory', '/')).toBe(false);
  });

  it('marca a seção na própria rota e nas rotas filhas', () => {
    expect(isCurrentPath('/inventory', '/inventory')).toBe(true);
    expect(isCurrentPath('/inventory/123', '/inventory')).toBe(true);
  });

  it('não confunde rotas com o mesmo prefixo', () => {
    expect(isCurrentPath('/inventory-old', '/inventory')).toBe(false);
    expect(isCurrentPath('/terms', '/inventory')).toBe(false);
  });
});
