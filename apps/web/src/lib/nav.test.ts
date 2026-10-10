import { describe, expect, it } from 'vitest';
import { isCurrentPath } from './nav';

describe('isCurrentPath', () => {
  it('marca a home só na raiz', () => {
    expect(isCurrentPath('/', '/')).toBe(true);
    expect(isCurrentPath('/inventario', '/')).toBe(false);
  });

  it('marca a seção na própria rota e nas rotas filhas', () => {
    expect(isCurrentPath('/inventario', '/inventario')).toBe(true);
    expect(isCurrentPath('/inventario/123', '/inventario')).toBe(true);
  });

  it('não confunde rotas com o mesmo prefixo', () => {
    expect(isCurrentPath('/inventarios', '/inventario')).toBe(false);
    expect(isCurrentPath('/termos', '/inventario')).toBe(false);
  });
});
