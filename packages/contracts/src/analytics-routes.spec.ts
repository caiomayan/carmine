import { describe, expect, it } from 'vitest';
import { ANALYTICS_ROUTES, analyticsRouteOf } from './analytics-routes.js';

describe('analyticsRouteOf', () => {
  it.each([
    ['/', 'inicio'],
    ['', 'inicio'],
    ['/?utm_source=discord', 'inicio'],
    ['/10016', 'perfil'],
    ['/76561198000000001', 'perfil'],
    ['/10016?visitante=1', 'perfil'],
    ['/ranking', 'ranking'],
    ['/ranking?modo=retake', 'ranking'],
    ['/inventory', 'inventario'],
    ['/inventory/add/222', 'inventario'],
    ['/loadout', 'loadout'],
    ['/login?erro=limite', 'entrar'],
    ['/settings', 'configuracoes'],
    ['/settings/profile#foto', 'configuracoes'],
    ['/settings/purchases', 'minhas_compras'],
    ['/settings/purchases/abc', 'minhas_compras'],
    ['/plans', 'vip'],
    ['/rules', 'regras'],
    ['/terms', 'termos'],
    ['/privacy', 'privacidade'],
    ['/refunds', 'reembolso'],
    ['/contact', 'contato'],
    ['/ranking/', 'ranking'],
    ['/nao-existe', 'outra'],
    ['/staff/denuncias', 'outra'],
    ['/dev/componentes', 'outra'],
    ['/avatars/x/512.webp', 'outra'],
  ])('%s -> %s', (path, route) => {
    expect(analyticsRouteOf(path)).toBe(route);
  });

  it('só devolve rotas da lista fechada, nunca o caminho', () => {
    for (const path of ['/10016', '/segredo/76561198000000001', '/ranking?nome=Lia']) {
      expect(ANALYTICS_ROUTES).toContain(analyticsRouteOf(path));
    }
  });
});
