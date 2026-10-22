'use client';

import { SlidersHorizontalIcon } from 'lucide-react';
import type { Route } from 'next';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect, useId, useRef, useState, useTransition } from 'react';
import { SearchIcon } from '@/components/icons/animated/search';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { type SelectOption, SimpleSelect } from '@/components/ui/select';
import {
  CATALOG_TYPES,
  type CatalogType,
  type FacetOption,
  type Rarity,
} from '@/lib/catalog/types';
import { cn } from '@/lib/utils';

export type CatalogBrowserLabels = {
  search: string;
  searchPlaceholder: string;
  /** O nome da região de busca e filtros. */
  region: string;
  /** O botão que abre os filtros de Arma, Raridade e Coleção. */
  filters: string;
  /** O mesmo botão com filtros ligados: "Filtros ({count})", com o número trocado aqui. */
  filtersActive: string;
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

type Facets = { weapons: FacetOption[]; collections: FacetOption[]; rarities: Rarity[] };

const SEARCH_DELAY_MS = 250;

/**
 * Busca e filtros do catálogo: a busca e o tipo ficam à vista (o tipo é uma linha rolável, com as
 * bordas esmaecidas no celular) e Arma, Raridade e Coleção moram num Popover "Filtros (n)", para os
 * controles não passarem de 40% da primeira tela. O estado vive na URL (`?q=&tipo=&arma=&raridade=&colecao=`):
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
  // A última URL pedida e ainda não aplicada: o `router.replace` só muda a URL no fim da
  // transição, e um filtro escolhido antes disso não pode partir da URL velha.
  const requested = useRef<string | null>(null);
  const searchId = useId();

  const type = (params.get('tipo') ?? '') as CatalogType | '';
  const weapon = params.get('arma') ?? '';
  const rarity = params.get('raridade') ?? '';
  const collection = params.get('colecao') ?? '';
  const filtered = !!(type || weapon || rarity || collection || params.get('q'));
  // Só os três do Popover contam no botão: a busca e o tipo já estão à vista.
  const hiddenFilters = [weapon, rarity, collection].filter(Boolean).length;

  // Voltar e avançar no navegador trazem outra busca.
  useEffect(() => {
    setQuery(params.get('q') ?? '');
    if (requested.current === params.toString()) requested.current = null;
  }, [params]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function navigate(changes: Record<string, string | null>) {
    // Parte da última URL pedida (ou da URL da hora), não da renderização: a busca com atraso
    // não pode desfazer um filtro escolhido enquanto ela esperava, nem um filtro desfazer outro.
    const next = new URLSearchParams(requested.current ?? window.location.search);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    // Qualquer filtro novo volta à primeira página.
    next.delete('mostrar');
    const search = next.toString();
    requested.current = search;
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
      <search className="grid gap-3" aria-label={labels.region}>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1" data-icon-trigger>
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
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                data-testid="catalog-filters"
                className="min-h-11 shrink-0 gap-2 rounded-lg px-3.5"
              >
                <SlidersHorizontalIcon aria-hidden="true" className="size-4" />
                <span className="tabular-nums">
                  {hiddenFilters > 0
                    ? labels.filtersActive.replace('{count}', String(hiddenFilters))
                    : labels.filters}
                </span>
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              data-testid="catalog-filters-panel"
              className="grid w-[min(22rem,calc(100vw-2*var(--mx)))] gap-3 p-3"
            >
              <FilterCombobox
                label={labels.weapon}
                value={weapon}
                empty={labels.allWeapons}
                options={facets.weapons}
                onChange={(value) => navigate({ arma: value || null, colecao: null })}
                disabled={facets.weapons.length === 0}
              />
              <FilterSelect
                label={labels.rarity}
                value={rarity}
                empty={labels.allRarities}
                options={facets.rarities.map((r) => ({ value: r, label: labels.rarities[r] }))}
                onChange={(value) => navigate({ raridade: value || null })}
              />
              <FilterCombobox
                label={labels.collection}
                value={collection}
                empty={labels.allCollections}
                options={facets.collections}
                onChange={(value) => navigate({ colecao: value || null })}
                disabled={facets.collections.length === 0}
              />
            </PopoverContent>
          </Popover>
        </div>

        <fieldset className="flex min-w-0 flex-wrap items-center gap-1 max-md:-mx-(--mx) max-md:flex-nowrap max-md:overflow-x-auto max-md:px-(--mx) max-md:pb-1 max-md:[mask-image:linear-gradient(to_right,transparent,black_var(--mx),black_calc(100%-var(--mx)),transparent)] max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden">
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
        'min-h-(--tap) shrink-0 whitespace-nowrap rounded-md px-3.5 text-sm font-medium text-muted-foreground transition-colors duration-(--dur-fast) ease-std hover:bg-hover hover:text-foreground',
        'aria-pressed:bg-surface-2 aria-pressed:font-semibold aria-pressed:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

const labelClass = 'label-caps text-[11px] text-muted-foreground';

/** Filtro de lista curta (Raridade): Select. Valor vazio = sem filtro. */
function FilterSelect({
  label,
  value,
  empty,
  options,
  onChange,
}: {
  label: string;
  value: string;
  empty: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <SimpleSelect
        id={id}
        value={value}
        onValueChange={onChange}
        emptyLabel={empty}
        options={options}
      />
    </div>
  );
}

/** Filtro de lista longa (Arma, Coleção): Combobox com busca. Valor vazio = sem filtro. */
function FilterCombobox({
  label,
  value,
  empty,
  options,
  onChange,
  disabled,
  className,
}: {
  label: string;
  value: string;
  empty: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cn('grid gap-1.5', className)}>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <Combobox
        id={id}
        value={value}
        onValueChange={onChange}
        emptyLabel={empty}
        disabled={disabled}
        options={options}
      />
    </div>
  );
}
