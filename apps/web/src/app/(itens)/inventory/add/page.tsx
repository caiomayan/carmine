import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/empty-state';
import { SearchIcon } from '@/components/icons/animated/search';
import { BackLink } from '@/components/inventory/back-link';
import { CatalogBrowser } from '@/components/inventory/catalog-browser';
import { CatalogGrid } from '@/components/inventory/catalog-grid';
import { PageHead } from '@/components/page-head';
import { Button } from '@/components/ui/button';
import { CATALOG_PAGE_SIZE, parseCatalogFilters, searchCatalog } from '@/lib/catalog/catalog';
import { CATALOG_TYPES, RARITIES } from '@/lib/catalog/types';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('catalog');
  return { title: t('title') };
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Catálogo de Itens para adicionar ao Inventário (S04): busca e filtros na URL. */
export default async function CatalogPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const filters = parseCatalogFilters(params);
  const page = searchCatalog(filters);
  const t = await getTranslations('catalog');

  const shown = page.items.length;
  const moreParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && key !== 'mostrar') moreParams.set(key, value);
  }
  moreParams.set('mostrar', String(shown + CATALOG_PAGE_SIZE));

  return (
    <div className="container-page pb-16">
      <div className="animate-fade-up pt-8 max-md:pt-5">
        <BackLink href="/inventory">{t('back')}</BackLink>
      </div>
      <PageHead
        title={t('title')}
        subtitle={t('subtitle')}
        className="animate-fade-up pt-2 max-md:pt-1"
      />
      <CatalogBrowser
        facets={page.facets}
        labels={{
          search: t('search'),
          searchPlaceholder: t('searchPlaceholder'),
          region: t('region'),
          filters: t('filters'),
          filtersActive: t('filtersActive', { count: '{count}' }),
          type: t('type'),
          allTypes: t('allTypes'),
          weapon: t('weapon'),
          allWeapons: t('allWeapons'),
          rarity: t('rarity'),
          allRarities: t('allRarities'),
          collection: t('collection'),
          allCollections: t('allCollections'),
          clear: t('clear'),
          loading: t('loading'),
          types: Object.fromEntries(
            CATALOG_TYPES.map((type) => [type, t(`types.${type}`)]),
          ) as Record<(typeof CATALOG_TYPES)[number], string>,
          rarities: Object.fromEntries(RARITIES.map((r) => [r, t(`rarities.${r}`)])) as Record<
            (typeof RARITIES)[number],
            string
          >,
        }}
      >
        <p role="status" className="pb-3 text-body-sm text-muted-foreground">
          {t('results', { total: page.total })}
        </p>
        {page.total === 0 ? (
          <div className="rounded-xl bg-surface">
            <EmptyState icon={SearchIcon} title={t('empty.title')} body={t('empty.body')} />
          </div>
        ) : (
          <>
            <CatalogGrid
              entries={page.items}
              rarityLabels={Object.fromEntries(RARITIES.map((r) => [r, t(`rarities.${r}`)]))}
              vipLabel={t('vip')}
              vipHint={t('vipHint')}
            />
            {shown < page.total ? (
              <div className="grid justify-items-center gap-2 pt-6">
                <p role="status" className="text-body-sm text-muted-foreground">
                  {t('showing', { shown, total: page.total })}
                </p>
                <Button asChild variant="ghost" className="px-6">
                  <Link href={`/inventory/add?${moreParams}` as Route} scroll={false}>
                    {t('showMore')}
                  </Link>
                </Button>
              </div>
            ) : null}
          </>
        )}
      </CatalogBrowser>
    </div>
  );
}
