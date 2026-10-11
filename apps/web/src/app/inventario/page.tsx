import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { siSteam } from 'simple-icons';
import { EmptyState } from '@/components/empty-state';
import { BoxIcon } from '@/components/icons/animated/box';
import { PlusIcon } from '@/components/icons/animated/plus';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { BrandIcon } from '@/components/icons/brand-icon';
import { CatalogGrid } from '@/components/inventory/catalog-grid';
import { InventoryGrid } from '@/components/inventory/inventory-grid';
import { InventoryUnavailable } from '@/components/inventory/inventory-unavailable';
import { QuickEquipButton } from '@/components/inventory/quick-equip';
import { PageHead } from '@/components/page-head';
import { SectionTitle } from '@/components/section-title';
import { Button } from '@/components/ui/button';
import { getInventory, getLoadout, getServerSession } from '@/lib/api-server';
import { signInHref } from '@/lib/auth-links';
import { type CatalogEntry, catalogEntry, itemSpec } from '@/lib/catalog/catalog';
import { RARITIES } from '@/lib/catalog/types';
import { defaultItem } from '@/lib/inventory/item-form';
import { buildCandidates, buildLoadoutView } from '@/lib/loadout/build';
import { equippedSides } from '@/lib/loadout/view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('inventory');
  return { title: t('title') };
}

/**
 * Sugestões do Inventário vazio: skins populares (ids da cs2-lib): AK-47 Linhas Vermelhas,
 * AWP Asiimov, M4A1-S Cadeia de Caracteres, USP-S Vítima Confirmada, Glock-18 Degradê e
 * Karambit Degradê.
 */
const SUGGESTIONS = [222, 306, 1115, 1139, 171, 1327];

/** Inventário da Conta reivindicada (S04). Sem sessão, convida a entrar; nunca mostra vazio por falha. */
export default async function InventoryPage() {
  const t = await getTranslations('inventory');
  const tc = await getTranslations('catalog');
  const rarityLabels = Object.fromEntries(RARITIES.map((r) => [r, tc(`rarities.${r}`)]));
  const [result, session, loadout] = await Promise.all([
    getInventory(),
    getServerSession(),
    getLoadout(),
  ]);

  if (result.status === 'anonymous') {
    return (
      <div className="container-page animate-fade-up pb-16">
        <PageHead title={t('title')} subtitle={t('subtitle')} />
        <div className="rounded-xl bg-surface" data-testid="inventory-signed-out">
          <EmptyState
            icon={BoxIcon}
            title={t('signedOut.title')}
            body={t('signedOut.body')}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild>
                  <Link href={signInHref('/inventario') as Route}>
                    <BrandIcon icon={siSteam} size={16} />
                    {t('signedOut.action')}
                  </Link>
                </Button>
                <Button asChild variant="ghost">
                  <Link href="/inventario/adicionar">{t('signedOut.browse')}</Link>
                </Button>
              </div>
            }
          />
        </div>
      </div>
    );
  }

  if (result.status === 'unavailable') {
    return (
      <div className="container-page animate-fade-up pb-16">
        <PageHead title={t('title')} subtitle={t('subtitle')} />
        <InventoryUnavailable />
      </div>
    );
  }

  const { items, limit } = result.inventory;
  const full = items.length >= limit;
  const vipActive = session.status === 'authenticated' && session.session.vip.active;
  const addButton = full ? (
    <Button disabled>{t('add')}</Button>
  ) : (
    <Button asChild>
      <Link href="/inventario/adicionar" data-testid="add-item">
        <AnimatedIcon icon={PlusIcon} size={16} />
        {t('add')}
      </Link>
    </Button>
  );

  if (items.length === 0) {
    const suggestions = SUGGESTIONS.map(catalogEntry).filter(
      (entry): entry is CatalogEntry => !!entry,
    );
    return (
      <div className="container-page animate-fade-up pb-16">
        <PageHead title={t('title')} subtitle={t('subtitle')} aside={addButton} />
        <section
          aria-labelledby="inventario-vazio"
          className="grid gap-8 rounded-xl bg-surface p-6 max-md:p-4"
          data-testid="inventory-empty"
        >
          <div className="grid max-w-[56ch] gap-2">
            <h2 id="inventario-vazio" className="text-lg font-semibold">
              {t('empty.title')}
            </h2>
            <p className="text-[13.5px] text-muted-foreground">{t('empty.body')}</p>
          </div>

          <div className="grid gap-3">
            <h3 className="sr-only">{t('empty.suggestions')}</h3>
            <CatalogGrid
              entries={suggestions}
              rarityLabels={rarityLabels}
              vipLabel={tc('vip')}
              vipHint={tc('vipHint')}
              tileClassName="bg-surface-2/60 hover:bg-surface-2"
              className="grid-cols-3"
              action={(entry) => {
                const spec = itemSpec(entry.id);
                return spec ? (
                  <QuickEquipButton item={defaultItem(spec)} name={entry.name} />
                ) : null;
              }}
            />
            <Button asChild variant="ghost" className="justify-self-start">
              <Link href="/inventario/adicionar">{t('empty.browse')}</Link>
            </Button>
          </div>

          <div className="grid gap-3">
            <h3 className="label-caps text-[10.5px]">{t('empty.pathTitle')}</h3>
            <ol className="grid grid-cols-3 gap-2.5 max-md:grid-cols-1">
              {(['step1', 'step2', 'step3'] as const).map((step, index) => (
                <li
                  key={step}
                  className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-lg bg-surface-2/60 p-4 text-[13.5px] leading-[1.55]"
                >
                  <span
                    aria-hidden="true"
                    className="grid size-6 place-items-center rounded-full bg-background text-[12px] font-semibold"
                  >
                    {index + 1}
                  </span>
                  <span>
                    {t.rich(`empty.${step}`, {
                      cmd: (chunks) => (
                        <code className="rounded-sm bg-background px-1.5 py-0.5 font-mono text-[0.95em] font-semibold">
                          {chunks}
                        </code>
                      ),
                    })}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="container-page animate-fade-up pb-16">
      <PageHead title={t('title')} subtitle={t('subtitle')} aside={addButton} />
      <section aria-labelledby="seus-itens" className="pt-2">
        <SectionTitle
          id="seus-itens"
          aside={
            <span
              className="text-[12.5px] text-muted-foreground tabular-nums"
              data-testid="inventory-count"
            >
              {t('count', { count: items.length, limit })}
            </span>
          }
        >
          {t('section')}
        </SectionTitle>
        {full ? (
          <p role="status" className="mb-3 rounded-lg bg-surface px-4 py-3 text-[13px]">
            {t('full', { limit })}
          </p>
        ) : null}
        <InventoryGrid
          cards={buildCandidates(items)}
          equipped={
            loadout.status === 'ok'
              ? Object.fromEntries(equippedSides(buildLoadoutView(loadout.data, items).slots))
              : {}
          }
          rarityLabels={rarityLabels}
          vip={{ label: tc('vip'), hint: tc('vipHint'), active: vipActive }}
        />
      </section>
    </div>
  );
}
