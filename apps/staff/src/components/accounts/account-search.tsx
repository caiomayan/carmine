'use client';

import { STAFF_SEARCH_LIMIT, STAFF_SEARCH_MIN_LENGTH } from '@carmine/contracts/staff';
import { SearchIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

/**
 * A caixa de busca de Conta: um formulário GET comum (funciona sem JavaScript e a busca fica no endereço) que, com
 * JavaScript, busca enquanto a pessoa digita (a lista é do servidor: o endereço muda e a tela refaz só os resultados).
 */
export function AccountSearch({ initial }: { initial: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const first = useRef(true);
  const trimmed = value.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < STAFF_SEARCH_MIN_LENGTH;

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (tooShort) return;
    const timer = setTimeout(() => {
      startTransition(() => {
        router.replace(trimmed ? `/contas?q=${encodeURIComponent(trimmed)}` : '/contas', {
          scroll: false,
        });
      });
    }, 320);
    return () => clearTimeout(timer);
  }, [trimmed, tooShort, router]);

  return (
    <search aria-label="Buscar Conta">
      <form action="/contas" method="get" className="stp-toolbar">
        <label className="stp-field stp-search-wide" data-grow>
          <SearchIcon size={15} aria-hidden="true" />
          <span className="stp-sr">Buscar Conta</span>
          <input
            name="q"
            type="search"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="ID público, SteamID64, link da Steam ou nome"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            aria-describedby="stp-q-hint"
            aria-invalid={tooShort || undefined}
            data-testid="staff-search"
          />
        </label>
        <button type="submit" className="stp-btn" data-kind="primary">
          Buscar
        </button>
      </form>
      <p
        id="stp-q-hint"
        className={tooShort ? 'stp-field-error' : 'stp-muted'}
        aria-busy={pending || undefined}
      >
        {tooShort
          ? `Digite pelo menos ${STAFF_SEARCH_MIN_LENGTH} caracteres.`
          : `Pelo menos ${STAFF_SEARCH_MIN_LENGTH} caracteres. Mostramos até ${STAFF_SEARCH_LIMIT} Contas.`}
      </p>
    </search>
  );
}
