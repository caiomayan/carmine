import { SEARCH_MIN_LENGTH } from '@carmine/contracts/rules';
import { normalizeSearch } from '../option-search';

/**
 * Histórico das últimas buscas da paleta (U3d): fica no navegador (localStorage), uma lista por
 * pessoa (pelo ID público da Conta; o visitante tem a sua). Todo acesso ao armazenamento tem
 * try/catch: bloqueado (aba privada, política do navegador), a paleta funciona sem o histórico.
 */

export const RECENT_MAX = 6;

export const recentKey = (publicId: number | null) =>
  `carmine-search-recent:${publicId ?? 'visitante'}`;

const clean = (text: string) => text.replace(/\s+/g, ' ').trim();

/** Põe a busca no começo da lista, sem repetir (ignora maiúsculas, acento e espaços). */
export function addRecent(list: readonly string[], query: string): string[] {
  const text = clean(query);
  if (text.length < SEARCH_MIN_LENGTH) return [...list];
  const key = normalizeSearch(text);
  return [text, ...list.filter((entry) => normalizeSearch(entry) !== key)].slice(0, RECENT_MAX);
}

/** Lê o que foi guardado; qualquer coisa fora do formato vira lista vazia. */
export function parseRecent(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value
      .filter((entry): entry is string => typeof entry === 'string' && clean(entry) !== '')
      .map(clean)
      .slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

export function loadRecent(publicId: number | null): string[] {
  try {
    return parseRecent(localStorage.getItem(recentKey(publicId)));
  } catch {
    return [];
  }
}

export function saveRecent(publicId: number | null, list: readonly string[]): void {
  try {
    localStorage.setItem(recentKey(publicId), JSON.stringify(list));
  } catch {
    // armazenamento bloqueado: o histórico vale só nesta visita
  }
}

export function clearRecent(publicId: number | null): void {
  try {
    localStorage.removeItem(recentKey(publicId));
  } catch {
    // idem
  }
}
