/**
 * As rotas do site como o plano de eventos as nomeia (`rota` de `pagina_vista`, `destino` do login). Módulo sem Zod,
 * só funções e constantes: a API e o web (a contagem de páginas) importam daqui
 * (`@carmine/contracts/analytics-routes`) sem levar o resto do analytics.
 */
export const ANALYTICS_ROUTES = [
  'inicio',
  'perfil',
  'ranking',
  'inventario',
  'loadout',
  'entrar',
  'configuracoes',
  'vip',
  'minhas_compras',
  'regras',
  'termos',
  'privacidade',
  'reembolso',
  'contato',
  'outra',
] as const;

export type AnalyticsRoute = (typeof ANALYTICS_ROUTES)[number];

/** Um segmento só, com dígitos: o endereço de um Perfil (ID público ou SteamID64). */
const PROFILE = /^\/\d+$/;

/**
 * Primeiro segmento do endereço (em inglês) -> rota do plano de eventos, cujos nomes não mudam (o histórico do
 * PostHog continua). Valem também com subcaminhos.
 */
const BY_SEGMENT: Record<string, AnalyticsRoute> = {
  ranking: 'ranking',
  inventory: 'inventario',
  loadout: 'loadout',
  login: 'entrar',
  settings: 'configuracoes',
  plans: 'vip',
  rules: 'regras',
  terms: 'termos',
  privacy: 'privacidade',
  refunds: 'reembolso',
  contact: 'contato',
};

/**
 * A rota do plano para um caminho do site (sem origem, com ou sem `?consulta` e `#âncora`). Nunca devolve o caminho:
 * `/10016` vira `perfil`, e o que não é reconhecido vira `outra`. As compras (`/settings/purchases...`) são
 * `minhas_compras`, antes de `configuracoes`.
 */
export function analyticsRouteOf(path: string): AnalyticsRoute {
  const clean = path.split(/[?#]/, 1)[0] ?? '';
  const normalized = clean.length > 1 ? clean.replace(/\/+$/, '') : clean;
  if (normalized === '' || normalized === '/') return 'inicio';
  if (PROFILE.test(normalized)) return 'perfil';
  const [, first = '', second = ''] = normalized.split('/');
  if (first === 'settings' && second === 'purchases') return 'minhas_compras';
  return BY_SEGMENT[first] ?? 'outra';
}
