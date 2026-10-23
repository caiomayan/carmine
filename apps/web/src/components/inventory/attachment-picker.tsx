'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/animate-ui/components/radix/dialog';
import { SearchIcon } from '@/components/icons/animated/search';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import type { AttachmentEntry, AttachmentPage } from '@/lib/catalog/catalog';
import {
  ATTACHMENTS_PAYLOAD_VERSION,
  type AttachmentType,
  CATALOG_PAGE_SIZE,
} from '@/lib/catalog/types';
import type { AttachmentLabel } from '@/lib/inventory/item-form';
import { RarityDot } from './item-tile';

const SEARCH_DELAY_MS = 220;
const SKELETONS = Array.from({ length: 12 }, (_, i) => `s${i}`);

type Status = 'loading' | 'ready' | 'failed';

/**
 * Escolher um sticker ou um charm para aplicar. A busca roda no servidor do web
 * (`/inventario/aplicaveis`), sobre o catálogo da cs2-lib; os resultados chegam aos poucos.
 */
export function AttachmentPicker({
  type,
  open,
  onOpenChange,
  onPick,
}: {
  type: AttachmentType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (label: AttachmentLabel) => void;
}) {
  const t = useTranslations('itemEditor.picker');
  const tc = useTranslations('common');
  const searchId = useId();
  const categoryId = useId();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [category, setCategory] = useState('');
  const [limit, setLimit] = useState(CATALOG_PAGE_SIZE);
  const [page, setPage] = useState<AttachmentPage | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` refaz a mesma busca.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const params = new URLSearchParams({
      tipo: type,
      mostrar: String(limit),
      v: ATTACHMENTS_PAYLOAD_VERSION,
    });
    if (debounced) params.set('q', debounced);
    if (category) params.set('categoria', category);
    setStatus('loading');
    fetch(`/inventario/aplicaveis?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        setPage((await response.json()) as AttachmentPage);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          console.warn('busca de aplicáveis falhou', error);
          setStatus('failed');
        }
      });
    return () => controller.abort();
  }, [open, type, debounced, category, limit, attempt]);

  // Nova busca volta para a primeira página.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reage só à troca de busca.
  useEffect(() => setLimit(CATALOG_PAGE_SIZE), [debounced, category]);

  const items = page?.items ?? [];
  const showSkeleton = status === 'loading' && items.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={tc('close')}
        className="max-h-[min(86dvh,760px)] grid-rows-[auto_auto_minmax(0,1fr)] gap-4 p-5 sm:max-w-[720px] max-md:p-4"
        data-testid={`picker-${type}`}
      >
        <div className="grid gap-1 pr-10">
          <DialogTitle>{type === 'sticker' ? t('sticker') : t('charm')}</DialogTitle>
          <DialogDescription aria-live="polite">
            {status === 'ready' && page ? t('results', { total: page.total }) : t('loading')}
          </DialogDescription>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,14rem)] gap-2 max-md:grid-cols-1">
          <div className="relative" data-icon-trigger>
            <label htmlFor={searchId} className="sr-only">
              {t('search')}
            </label>
            <AnimatedIcon
              icon={SearchIcon}
              size={15}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
            />
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                type === 'sticker' ? t('searchPlaceholderSticker') : t('searchPlaceholderCharm')
              }
              autoComplete="off"
              spellCheck={false}
              data-testid="picker-search"
              className="min-h-(--tap) w-full rounded-md bg-surface-2 pr-3 pl-9 text-body placeholder:text-muted-foreground"
            />
          </div>
          {type === 'sticker' && page && page.facets.categories.length > 0 ? (
            <div>
              <label htmlFor={categoryId} className="sr-only">
                {t('category')}
              </label>
              <Combobox
                id={categoryId}
                value={category}
                onValueChange={setCategory}
                emptyLabel={t('allCategories')}
                triggerClassName="bg-surface-2 text-body hover:bg-line"
                options={page.facets.categories}
              />
            </div>
          ) : null}
        </div>

        <div className="-mx-1 min-h-48 overflow-y-auto overscroll-contain px-1 pb-1">
          {status === 'failed' ? (
            <div role="alert" className="grid justify-items-center gap-3 py-10 text-center">
              <p className="text-body-sm">{t('failed')}</p>
              <Button variant="ghost" size="sm" onClick={() => setAttempt((n) => n + 1)}>
                {t('retry')}
              </Button>
            </div>
          ) : showSkeleton ? (
            <ul aria-hidden="true" className="grid grid-cols-4 gap-2 max-md:grid-cols-3">
              {SKELETONS.map((key) => (
                <li key={key} className="shimmer aspect-square rounded-lg" />
              ))}
            </ul>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-body-sm text-muted-foreground">{t('empty')}</p>
          ) : (
            <>
              <ul className="grid grid-cols-4 gap-2 max-md:grid-cols-3">
                {items.map((entry) => (
                  <li key={entry.id} className="grid">
                    <PickButton
                      entry={entry}
                      label={t('choose', { name: entry.name })}
                      onPick={() => {
                        onPick({ id: entry.id, name: entry.name, image: entry.image });
                        onOpenChange(false);
                      }}
                    />
                  </li>
                ))}
              </ul>
              {page && items.length < page.total ? (
                <div className="grid justify-items-center pt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={status === 'loading'}
                    onClick={() => setLimit((n) => n + CATALOG_PAGE_SIZE)}
                  >
                    {t('more')}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PickButton({
  entry,
  label,
  onPick,
}: {
  entry: AttachmentEntry;
  label: string;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={label}
      title={entry.name}
      className="grid content-start gap-1.5 rounded-lg bg-surface-2/60 p-2 text-left transition-colors duration-(--dur-fast) ease-std hover:bg-surface-2"
    >
      {/* biome-ignore lint/performance/noImgElement: CDN da cs2-lib. */}
      <img
        src={entry.image}
        alt=""
        width={128}
        height={96}
        loading="lazy"
        decoding="async"
        className="aspect-4/3 w-full object-contain"
      />
      <span className="flex min-w-0 items-center gap-1.5 text-[11.5px] leading-tight text-muted-foreground">
        <RarityDot rarity={entry.rarity} label="" />
        <span className="line-clamp-2">{entry.name.replace(/^(Adesivo|Chaveiro) \| /, '')}</span>
      </span>
    </button>
  );
}
