'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { clearDraft, loadDraft, saveDraft } from '@/lib/drafts';
import { useSession } from './session-provider';

const SAVE_DELAY_MS = 300;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Estado de um editor que sobrevive à expiração da sessão (S03). Cada mudança vai para um
 * rascunho local da Conta logada; depois do novo login, o editor volta com ele e `restored`
 * avisa a interface. `commit()` (depois de salvar na API) e `discard()` apagam o rascunho.
 *
 *   const draft = useDraft('item-editor', initialItem);
 *   <input value={draft.value.nametag} onChange={(e) => draft.set({ ...draft.value, nametag: e.target.value })} />
 */
export function useDraft<T>(key: string, initial: T) {
  const { account } = useSession();
  const accountId = account?.publicId ?? null;
  const [value, setValue] = useState(initial);
  const [restored, setRestored] = useState(false);
  const initialRef = useRef(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ accountId: number; value: T } | null>(null);

  // Rascunho guardado só aparece no cliente, depois da hidratação.
  useEffect(() => {
    const store = storage();
    if (accountId === null || !store) return;
    const draft = loadDraft<T>(store, key, accountId);
    if (draft) {
      setValue(draft.value);
      setRestored(true);
    }
  }, [key, accountId]);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const store = storage();
    if (pending.current && store) {
      saveDraft(store, key, pending.current.accountId, pending.current.value);
    }
    pending.current = null;
  }, [key]);

  // Guarda o que estiver pendente se a pessoa sair da página antes do atraso.
  useEffect(() => {
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);

  const set = useCallback(
    (next: T) => {
      setValue(next);
      if (accountId === null) return;
      pending.current = { accountId, value: next };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_DELAY_MS);
    },
    [accountId, flush],
  );

  const forget = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
    const store = storage();
    if (store) clearDraft(store, key);
    setRestored(false);
  }, [key]);

  /** Salvo na API: o rascunho não é mais necessário. */
  const commit = forget;

  /** Desiste das mudanças: volta ao valor inicial e apaga o rascunho. */
  const discard = useCallback(() => {
    forget();
    setValue(initialRef.current);
  }, [forget]);

  /** Grava já o que está pendente (antes de uma mutação que pode dar 401). */
  const persist = flush;

  return { value, set, restored, commit, discard, persist };
}
