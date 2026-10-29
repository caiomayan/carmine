import { SETTINGS_BASE } from '../settings-nav';
import type { PaletteGroup } from './palette';

/**
 * As páginas e ações fixas da paleta de comandos (Ctrl+K, U3d), e quem vê cada uma. Sem textos:
 * o rótulo e as palavras-chave vêm das mensagens (`search.entries.<id>`), pelo `id`.
 */

export type EntryId =
  | 'servers'
  | 'inventory'
  | 'loadout'
  | 'ranking'
  | 'profile'
  | 'settings'
  | 'staff'
  | 'theme'
  | 'firstSteps'
  | 'signOut'
  | 'signIn';

export type StaticEntry =
  | { id: EntryId; group: PaletteGroup; kind: 'link'; href: string }
  | { id: EntryId; group: PaletteGroup; kind: 'action' };

/** Quem está olhando: a Conta da sessão (nula para o visitante) e se é da Staff. */
export type EntryContext = { account: { publicId: number } | null; staff: boolean };

/** A ordem é a da paleta sem busca. */
export function staticEntries({ account, staff }: EntryContext): StaticEntry[] {
  const entries: StaticEntry[] = [
    { id: 'servers', group: 'pages', kind: 'link', href: '/' },
    { id: 'inventory', group: 'pages', kind: 'link', href: '/inventory' },
    { id: 'loadout', group: 'pages', kind: 'link', href: '/loadout' },
    { id: 'ranking', group: 'pages', kind: 'link', href: '/ranking' },
  ];
  if (account) {
    entries.push({ id: 'profile', group: 'pages', kind: 'link', href: `/${account.publicId}` });
  }
  entries.push({ id: 'settings', group: 'pages', kind: 'link', href: SETTINGS_BASE });
  if (staff) entries.push({ id: 'staff', group: 'pages', kind: 'link', href: '/staff' });
  entries.push({ id: 'theme', group: 'actions', kind: 'action' });
  if (account) {
    entries.push(
      { id: 'firstSteps', group: 'actions', kind: 'action' },
      { id: 'signOut', group: 'actions', kind: 'action' },
    );
  } else {
    // O destino leva a página de origem; quem monta o link (com o pathname atual) é o componente.
    entries.push({ id: 'signIn', group: 'actions', kind: 'link', href: '/login' });
  }
  return entries;
}
