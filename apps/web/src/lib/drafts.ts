/**
 * Rascunhos locais de edição (S03): enquanto a pessoa edita, o que ainda não foi salvo fica
 * no navegador. Se a sessão expirar no meio, o rascunho sobrevive ao novo login e volta para
 * o editor. Genérico: cada editor usa a própria chave (ex.: o editor de Item da S04).
 *
 * O rascunho pertence a uma Conta: outra pessoa entrando no mesmo navegador não o vê.
 */

type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Depois disso o rascunho é descartado: a edição já perdeu o contexto. */
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const PREFIX = 'carmine-draft:';
const VERSION = 1;

type StoredDraft = { v: typeof VERSION; accountId: number; savedAt: number; value: unknown };

export type Draft<T> = { value: T; savedAt: number };

/** Guarda o rascunho; devolve `false` se o navegador não deixou (modo privado, cota). */
export function saveDraft(
  storage: DraftStorage,
  key: string,
  accountId: number,
  value: unknown,
  now = Date.now(),
): boolean {
  const stored: StoredDraft = { v: VERSION, accountId, savedAt: now, value };
  try {
    storage.setItem(PREFIX + key, JSON.stringify(stored));
    return true;
  } catch {
    return false;
  }
}

export function loadDraft<T>(
  storage: DraftStorage,
  key: string,
  accountId: number,
  now = Date.now(),
): Draft<T> | null {
  let raw: string | null;
  try {
    raw = storage.getItem(PREFIX + key);
  } catch {
    return null;
  }
  if (raw === null) return null;

  let stored: Partial<StoredDraft>;
  try {
    stored = JSON.parse(raw);
  } catch {
    return null;
  }
  if (stored?.v !== VERSION || typeof stored.savedAt !== 'number') return null;
  if (now - stored.savedAt > DRAFT_MAX_AGE_MS) {
    clearDraft(storage, key);
    return null;
  }
  if (stored.accountId !== accountId) return null;
  return { value: stored.value as T, savedAt: stored.savedAt };
}

export function clearDraft(storage: DraftStorage, key: string): void {
  try {
    storage.removeItem(PREFIX + key);
  } catch {
    // armazenamento bloqueado: não havia rascunho a apagar
  }
}
