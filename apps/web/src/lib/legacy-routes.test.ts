import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEGACY_REDIRECT_STATUS, LEGACY_ROUTES } from './legacy-routes';

const APP_DIR = path.join(import.meta.dirname, '../app');

/** Casa um caminho com um `source` (`:param` vale um segmento) e devolve o destino, como o Next faz. */
function redirectOf(pathname: string): string | null {
  for (const { source, destination } of LEGACY_ROUTES) {
    const pattern = new RegExp(`^${source.replace(/:\w+/g, '([^/]+)')}$`);
    const match = pattern.exec(pathname);
    if (!match) continue;
    let index = 0;
    return destination.replace(/:\w+/g, () => match[++index] as string);
  }
  return null;
}

describe('rotas antigas (S16b)', () => {
  it('redirecionam com 301, o código permanente que o Google e os links antigos esperam', () => {
    expect(LEGACY_REDIRECT_STATUS).toBe(301);
  });

  it.each([
    ['/entrar', '/login'],
    ['/configuracoes', '/settings'],
    ['/configuracoes/perfil', '/settings/profile'],
    ['/configuracoes/aparencia', '/settings/appearance'],
    ['/configuracoes/conexoes', '/settings/connections'],
    ['/configuracoes/compras', '/settings/purchases'],
    ['/configuracoes/compras/3f9c8b1e', '/settings/purchases/3f9c8b1e'],
    ['/configuracoes/dados', '/settings/data'],
    ['/servidores/abc', '/servers/abc'],
    ['/inventario', '/inventory'],
    ['/inventario/adicionar', '/inventory/add'],
    ['/inventario/adicionar/222', '/inventory/add/222'],
    ['/inventario/aplicaveis', '/inventory/applicable'],
    ['/inventario/0b9f8c1e', '/inventory/0b9f8c1e'],
    ['/vip', '/plans'],
    ['/vip/comprar', '/plans/checkout'],
    ['/vip/compra/3f9c8b1e', '/plans/purchase/3f9c8b1e'],
    ['/regras', '/rules'],
    ['/termos', '/terms'],
    ['/privacidade', '/privacy'],
    ['/reembolso', '/refunds'],
    ['/contato', '/contact'],
    ['/atividade/recentes', '/activity/recent'],
    ['/vitrine/semana', '/showcase/week'],
    ['/busca/itens', '/search/items'],
  ])('%s vai para %s', (from, to) => {
    expect(redirectOf(from)).toBe(to);
  });

  it('não encosta nas rotas que não mudaram nem nas novas', () => {
    for (const path of [
      '/',
      '/ranking',
      '/loadout',
      '/10016',
      '/login',
      '/inventory',
      '/staff/servidores',
    ]) {
      expect(redirectOf(path)).toBeNull();
    }
  });

  it('cada destino é uma página (ou rota) que existe no app', () => {
    for (const { destination } of LEGACY_ROUTES) {
      // O segmento dinâmico vira o nome da pasta: `/servers/:id` -> `servers/[id]`.
      const segments = destination.slice(1).split('/');
      const hasPage = (base: string, rest: string[]): boolean => {
        if (rest.length === 0) {
          return ['page.tsx', 'route.ts'].some((file) => existsSync(path.join(base, file)));
        }
        const [head, ...tail] = rest as [string, ...string[]];
        const candidates = head.startsWith(':') ? [`[${head.slice(1)}]`] : [head];
        // Os grupos de rota `(itens)` e `(servers)` não entram no endereço.
        const groups = ['', '(itens)', '(servers)'];
        return candidates.some((name) =>
          groups.some((group) => hasPage(path.join(base, group, name), tail)),
        );
      };
      expect(hasPage(APP_DIR, segments), destination).toBe(true);
    }
  });
});
