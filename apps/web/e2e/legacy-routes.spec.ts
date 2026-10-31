import { expect, test } from './fixtures';

/** As rotas em português da S16b: cada uma responde 301 para a nova, com a consulta. */
const LEGACY: [from: string, to: string][] = [
  ['/entrar', '/login'],
  ['/entrar?erro=limite&voltar=%2Finventory', '/login?erro=limite&voltar=%2Finventory'],
  ['/configuracoes', '/settings'],
  ['/configuracoes/perfil', '/settings/profile'],
  ['/configuracoes/aparencia', '/settings/appearance'],
  ['/configuracoes/conexoes?discord=em-uso', '/settings/connections?discord=em-uso'],
  ['/configuracoes/compras', '/settings/purchases'],
  [
    '/configuracoes/compras/3b1f5e1c-8d0a-4a39-9a55-0f3a7a1c2b10',
    '/settings/purchases/3b1f5e1c-8d0a-4a39-9a55-0f3a7a1c2b10',
  ],
  ['/configuracoes/dados', '/settings/data'],
  ['/servidores/abc', '/servers/abc'],
  ['/inventario', '/inventory'],
  ['/inventario/adicionar?tipo=weapon&arma=AK-47', '/inventory/add?tipo=weapon&arma=AK-47'],
  ['/inventario/adicionar/222', '/inventory/add/222'],
  ['/inventario/aplicaveis?v=1', '/inventory/applicable?v=1'],
  [
    '/inventario/3b1f5e1c-8d0a-4a39-9a55-0f3a7a1c2b10',
    '/inventory/3b1f5e1c-8d0a-4a39-9a55-0f3a7a1c2b10',
  ],
  ['/vip', '/plans'],
  ['/vip/comprar?pacote=vip-3m', '/plans/checkout?pacote=vip-3m'],
  [
    '/vip/compra/3b1f5e1c-8d0a-4a39-9a55-0f3a7a1c2b10?retorno=cartao',
    '/plans/purchase/3b1f5e1c-8d0a-4a39-9a55-0f3a7a1c2b10?retorno=cartao',
  ],
  ['/regras', '/rules'],
  ['/termos', '/terms'],
  ['/privacidade', '/privacy'],
  ['/reembolso', '/refunds'],
  ['/contato', '/contact'],
  ['/atividade/recentes', '/activity/recent'],
  ['/vitrine/semana', '/showcase/week'],
  ['/busca/itens?q=ak', '/search/items?q=ak'],
];

for (const [from, to] of LEGACY) {
  test(`${from} redireciona para sempre (301) para ${to}`, async ({ request }) => {
    const response = await request.get(from, { maxRedirects: 0 });
    expect(response.status()).toBe(301);
    const location = new URL(response.headers().location ?? '', 'http://localhost');
    expect(`${location.pathname}${location.search}`).toBe(to);
  });
}

test('/regras#recurso chega em /rules#appeal e leva à seção de recurso', async ({ page }) => {
  await page.goto('/regras#recurso');
  await expect(page).toHaveURL('/rules#appeal');
  await expect(page.locator('#appeal')).toBeInViewport();
});
