/** As seções de /configuracoes, na ordem do menu lateral (e da lista no celular). */
export const SETTINGS_SECTIONS = ['perfil', 'conexoes', 'aparencia', 'dados'] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const SETTINGS_BASE = '/configuracoes';

export const settingsHref = (section: SettingsSection) => `${SETTINGS_BASE}/${section}` as const;

/**
 * A seção aberta, pelo caminho; `null` na raiz de /configuracoes (no celular, a lista) e fora
 * dela. Aceita a barra final.
 */
export function activeSettingsSection(pathname: string): SettingsSection | null {
  const prefix = `${SETTINGS_BASE}/`;
  if (!pathname.startsWith(prefix)) return null;
  const section = pathname.slice(prefix.length).replace(/\/+$/, '');
  return (SETTINGS_SECTIONS as readonly string[]).includes(section)
    ? (section as SettingsSection)
    : null;
}
