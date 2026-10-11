'use client';

import type { Route } from 'next';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect, useId, useRef, useState, useTransition } from 'react';
import { SearchIcon } from '@/components/icons/animated/search';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { Button } from '@/components/ui/button';
import { CATALOG_TYPES, type CatalogType, type Rarity } from '@/lib/catalog/types';
import { cn } from '@/lib/utils';

export type CatalogBrowserLabels = {
  search: string;
  searchPlaceholder: string;
  filters: string;
  type: string;
  allTypes: string;
  weapon: string;
  allWeapons: string;
  rarity: string;
  allRarities: string;
  collection: string;
  allCollections: string;
  clear: string;
  loading: string;
  types: Record<CatalogType, string>;
  rarities: Record<Rarity, string>;
};

type Facets = { weapons: string[]; collections: string[]; rarities: Rarity[] };

const SEARCH_DELAY_MS = 250;

/**
 * Busca e filtros do catálogo. O estado vive na URL (`?q=&tipo=&arma=&raridade=&colecao=`):
 * dá para voltar, compartilhar e recarregar. Os resultados vêm do servidor (`children`); aqui só
 * se troca a URL, e enquanto o servidor responde os resultados ficam esmaecidos.
 */
export function CatalogBrowser({
  labels,
  facets,
  children,
}: {
  labels: CatalogBrowserLabels;
  facets: Facets;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchId = useId();

  const type = (params.get('tipo') ?? '') as CatalogType | '';
  const weapon = params.get('arma') ?? '';
  const rarity = params.get('raridade') ?? '';
  const collection = params.get('colecao') ?? '';
  const filtered = !!(type || weapon || rarity || collection || params.get('q'));

  // Voltar e avançar no navegador trazem outra busca.
  useEffect(() => {
    setQuery(params.get('q') ?? '');
  }, [params]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function navigate(changes: Record<string, string | null>) {
    // Lê a URL da hora, não a da renderização: a busca com atraso não pode desfazer um filtro
    // escolhido enquanto ela esperava.
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    // Qualquer filtro novo volta à primeira página.
    next.delete('mostrar');
    const search = next.toString();
    startTransition(() => {
      router.replace(`${pathname}${search ? `?${search}` : ''}` as Route, { scroll: false });
    });
  }

  function onQuery(value: string) {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => navigate({ q: value.trim() || null }), SEARCH_DELAY_MS);
  }

  return (
    <div className="grid gap-5">
      <search className="grid gap-3" aria-label={labels.filters}>
        <div className="relative" data-icon-trigger>
          <label htmlFor={searchId} className="sr-only">
            {labels.search}
          </label>
          <AnimatedIcon
            icon={SearchIcon}
            size={16}
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder={labels.searchPlaceholder}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            data-testid="catalog-search"
            className="min-h-11 w-full rounded-lg bg-surface pr-4 pl-10 text-[14.5px] transition-colors duration-(--dur-fast) ease-std placeholder:text-muted-foreground hover:bg-surface-2 focus-visible:bg-surface-2"
          />
        </div>

        <fieldset className="flex flex-wrap items-center gap-1">
          <legend className="sr-only">{labels.type}</legend>
          <TypeButton active={!type} onClick={() => navigate({ tipo: null, arma: null })}>
            {labels.allTypes}
          </TypeButton>
          {CATALOG_TYPES.map((value) => (
            <TypeButton
              key={value}
              active={type === value}
              onClick={() => navigate({ tipo: value, arma: null, colecao: null })}
            >
              {labels.types[value]}
            </TypeButton>
          ))}
        </fieldset>

        <div className="grid grid-cols-3 gap-2 max-md:grid-cols-1">
          <FilterSelect
            label={labels.weapon}
            value={weapon}
            empty={labels.allWeapons}
            options={facets.weapons.map((w) => [w, w])}
            onChange={(value) => navigate({ arma: value || null, colecao: null })}
            disabled={facets.weapons.length === 0}
          />
          <FilterSelect
            label={labels.rarity}
            value={rarity}
            empty={labels.allRarities}
            options={facets.rarities.map((r) => [r, labels.rarities[r]])}
            onChange={(value) => navigate({ raridade: value || null })}
          />
          <FilterSelect
            label={labels.collection}
            value={collection}
            empty={labels.allCollections}
            options={facets.collections.map((c) => [c, c])}
            onChange={(value) => navigate({ colecao: value || null })}
            disabled={facets.collections.length === 0}
          />
        </div>

        {filtered ? (
          <Button
            variant="quiet"
            size="sm"
            className="justify-self-start animate-fade-up"
            onClick={() => {
              setQuery('');
              navigate({ q: null, tipo: null, arma: null, raridade: null, colecao: null });
            }}
          >
            {labels.clear}
          </Button>
        ) : null}
      </search>

      <div
        aria-busy={pending}
        data-pending={pending || undefined}
        className="transition-opacity duration-(--dur-base) ease-std data-pending:opacity-55"
      >
        {pending ? (
          <span className="sr-only" role="status">
            {labels.loading}
          </span>
        ) : null}
        {children}
      </div>
    </div>
  );
}

function TypeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'min-h-(--tap) rounded-md px-3.5 text-sm font-medium text-muted-foreground transition-colors duration-(--dur-fast) ease-std hover:bg-hover hover:text-foreground',
        'aria-pressed:bg-surface-2 aria-pressed:font-semibold aria-pressed:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function FilterSelect({
  label,
  value,
  empty,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  empty: string;
  options: [string, string][];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="label-caps text-[10px] text-muted-foreground">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="min-h-(--tap) w-full appearance-none truncate rounded-md bg-surface pr-9 pl-3 text-sm transition-colors duration-(--dur-fast) ease-std hover:bg-surface-2 focus-visible:bg-surface-2 disabled:text-faint disabled:hover:bg-surface"
        >
          <option value="">{empty}</option>
          {options.map(([optionValue, optionLabel]) => (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          ))}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
    </div>
  );
}
