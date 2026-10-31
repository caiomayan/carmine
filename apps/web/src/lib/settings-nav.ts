/**
 * As seções de /settings, na ordem do menu lateral (e da lista no celular). Os ids são as chaves das mensagens
 * (`settings.nav.<id>`); o trecho do endereço, em inglês, vem de `SETTINGS_SEGMENT`.
 */
export const SETTINGS_SECTIONS = ['perfil', 'compras', 'conexoes', 'aparencia', 'dados'] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/** O trecho do endereço de cada seção (`/settings/<trecho>`). */
export const SETTINGS_SEGMENT = {
  perfil: 'profile',
  compras: 'purchases',
  conexoes: 'connections',
  aparencia: 'appearance',
  dados: 'data',
} as const satisfies Record<SettingsSection, string>;

export const SETTINGS_BASE = '/settings';

export const settingsHref = (section: SettingsSection) =>
  `${SETTINGS_BASE}/${SETTINGS_SEGMENT[section]}` as const;

/**
 * A seção aberta, pelo caminho; `null` na raiz de /settings (no celular, a lista) e fora
 * dela. Aceita a barra final.
 */
export function activeSettingsSection(pathname: string): SettingsSection | null {
  const prefix = `${SETTINGS_BASE}/`;
  if (!pathname.startsWith(prefix)) return null;
  // Só o 1º trecho: o recibo (`purchases/<id>`) é da seção Compras.
  const segment = pathname.slice(prefix.length).split('/')[0] ?? '';
  return SETTINGS_SECTIONS.find((section) => SETTINGS_SEGMENT[section] === segment) ?? null;
}
