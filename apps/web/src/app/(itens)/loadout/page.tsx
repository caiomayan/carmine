import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { siSteam } from 'simple-icons';
import { EmptyState } from '@/components/empty-state';
import { BadgeAlertIcon } from '@/components/icons/animated/badge-alert';
import { BoxIcon } from '@/components/icons/animated/box';
import { BrandIcon } from '@/components/icons/brand-icon';
import { LoadoutScreen } from '@/components/loadout/loadout-screen';
import { PresetBar } from '@/components/loadout/preset-bar';
import { VipNotice } from '@/components/loadout/vip-notice';
import { PageHead } from '@/components/page-head';
import { Button } from '@/components/ui/button';
import { getInventory, getLoadout, getPresets, getServerSession } from '@/lib/api-server';
import { signInHref } from '@/lib/auth-links';
import { RARITIES } from '@/lib/catalog/types';
import { buildCandidates, buildLoadoutView } from '@/lib/loadout/build';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('loadout');
  return { title: t('title') };
}

/**
 * O Loadout (S05) tem rota própria, fora do Inventário: o Inventário é a coleção (o que você
 * montou), o Loadout é o que vai para o jogo agora (CONTEXT.md). Assim ele fica a um clique na
 * barra superior, tem endereço próprio para o Perfil e os Primeiros passos apontarem, e a grade
 * de Itens não disputa espaço com os slots.
 */
export default async function LoadoutPage() {
  const t = await getTranslations('loadout');
  const tc = await getTranslations('catalog');
  const [loadout, presets, inventory, session] = await Promise.all([
    getLoadout(),
    getPresets(),
    getInventory(),
    getServerSession(),
  ]);
  const subtitle = t.rich('subtitle', {
    cmd: (chunks) => (
      <code className="rounded-sm bg-surface px-1.5 py-0.5 font-mono text-[0.95em] font-semibold text-foreground">
        {chunks}
      </code>
    ),
  });

  if (loadout.status === 'anonymous') {
    return (
      <div className="container-page animate-fade-up pb-16">
        <PageHead title={t('title')} subtitle={subtitle} />
        <div className="rounded-xl bg-surface" data-testid="loadout-signed-out">
          <EmptyState
            icon={BoxIcon}
            title={t('signedOut.title')}
            body={t('signedOut.body')}
            action={
              <Button asChild>
                <Link href={signInHref('/loadout') as Route}>
                  <BrandIcon icon={siSteam} size={16} />
                  {t('signedOut.action')}
                </Link>
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  // Sem o Loadout ou sem o Inventário (de onde vêm os nomes), nunca um Loadout vazio.
  if (loadout.status !== 'ok' || inventory.status !== 'ok') {
    return (
      <div className="container-page animate-fade-up pb-16">
        <PageHead title={t('title')} subtitle={subtitle} />
        <div className="rounded-xl bg-surface" data-testid="loadout-unavailable">
          <EmptyState
            icon={BadgeAlertIcon}
            title={t('unavailable.title')}
            body={t('unavailable.body')}
          />
        </div>
      </div>
    );
  }

  const items = inventory.inventory.items;
  const vip = session.status === 'authenticated' ? session.session.vip : null;
  const rarityLabels = Object.fromEntries(RARITIES.map((r) => [r, tc(`rarities.${r}`)]));

  return (
    <div className="container-page animate-fade-up pb-16" data-testid="loadout">
      <LoadoutScreen
        view={buildLoadoutView(loadout.data, items)}
        candidates={buildCandidates(items)}
        rarityLabels={rarityLabels}
        subtitle={subtitle}
        notices={
          vip || items.length === 0 ? (
            <div className="mb-1 grid gap-2">
              {vip ? <VipNotice vip={vip} /> : null}
              {items.length === 0 ? (
                <p
                  className="flex max-w-[80ch] flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-surface px-3 py-2 text-body-sm"
                  data-testid="loadout-empty-inventory"
                >
                  <span>{t('emptyInventory.body')}</span>
                  <Link
                    href="/inventario"
                    className="font-semibold underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-foreground"
                  >
                    {t('emptyInventory.action')}
                  </Link>
                </p>
              ) : null}
            </div>
          ) : null
        }
        presets={
          presets.status === 'ok' ? (
            <PresetBar list={presets.data} vip={vip?.active ?? false} />
          ) : null
        }
      />
    </div>
  );
}
