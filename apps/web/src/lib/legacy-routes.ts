/**
 * As rotas em português que existiram antes da S16b e o endereço de cada uma hoje. Todas redirecionam para sempre
 * (301, não o 308 de `permanent`), com a consulta, para que nenhum link compartilhado, nenhuma mensagem do plugin já
 * impressa e nenhum resultado do Google quebre. O fragmento (`#recurso`) não chega ao servidor: o navegador o mantém,
 * e o que mudou de nome (`#recurso` -> `#appeal`) o cliente corrige (`LegacyAnchors`).
 *
 * A ordem importa: vale a primeira que casa. Módulo sem dependências, porque o `next.config.ts` o importa.
 */
export const LEGACY_ROUTES = [
  { source: '/entrar', destination: '/login' },
  { source: '/configuracoes', destination: '/settings' },
  { source: '/configuracoes/perfil', destination: '/settings/profile' },
  { source: '/configuracoes/aparencia', destination: '/settings/appearance' },
  { source: '/configuracoes/conexoes', destination: '/settings/connections' },
  { source: '/configuracoes/compras', destination: '/settings/purchases' },
  { source: '/configuracoes/compras/:id', destination: '/settings/purchases/:id' },
  { source: '/configuracoes/dados', destination: '/settings/data' },
  { source: '/servidores/:id', destination: '/servers/:id' },
  { source: '/inventario', destination: '/inventory' },
  { source: '/inventario/adicionar', destination: '/inventory/add' },
  { source: '/inventario/adicionar/:itemId', destination: '/inventory/add/:itemId' },
  { source: '/inventario/aplicaveis', destination: '/inventory/applicable' },
  { source: '/inventario/:uid', destination: '/inventory/:uid' },
  { source: '/vip', destination: '/plans' },
  { source: '/vip/comprar', destination: '/plans/checkout' },
  { source: '/vip/compra/:id', destination: '/plans/purchase/:id' },
  { source: '/regras', destination: '/rules' },
  { source: '/termos', destination: '/terms' },
  { source: '/privacidade', destination: '/privacy' },
  { source: '/reembolso', destination: '/refunds' },
  { source: '/contato', destination: '/contact' },
  { source: '/atividade/recentes', destination: '/activity/recent' },
  { source: '/vitrine/semana', destination: '/showcase/week' },
  { source: '/busca/itens', destination: '/search/items' },
] as const;

export const LEGACY_REDIRECT_STATUS = 301;
