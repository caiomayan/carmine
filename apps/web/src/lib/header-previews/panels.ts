/** Os quatro painéis do header e a página de cada um (o item do menu leva a ela ao clicar). */
export const PANELS = ['play', 'loadout', 'inventory', 'ranking'] as const;
export type PanelId = (typeof PANELS)[number];

const PANEL_BY_HREF: Record<string, PanelId> = {
  '/': 'play',
  '/loadout': 'loadout',
  '/inventario': 'inventory',
  '/ranking': 'ranking',
};

/** O painel de um item do menu, pela página dele; nulo para um item sem painel. */
export const panelOf = (href: string | null | undefined): PanelId | null =>
  (href && PANEL_BY_HREF[href]) || null;

/** O painel só existe com espaço para ele (e com ponteiro): a partir de 1024 px, como no briefing. */
export const PANEL_MEDIA = '(min-width: 1024px)';
