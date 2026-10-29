import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/empty-state';
import { BoxIcon } from '@/components/icons/animated/box';
import { EditorHeader } from '@/components/inventory/editor-header';
import { ItemEditor } from '@/components/inventory/item-editor';
import { Button } from '@/components/ui/button';
import { itemSpec } from '@/lib/catalog/catalog';
import { slotOfItem } from '@/lib/loadout/slots';

type Params = Promise<{ itemId: string }>;

const specOf = (itemId: string) =>
  /^\d{1,6}$/.test(itemId) ? itemSpec(Number(itemId)) : undefined;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const spec = specOf((await params).itemId);
  const t = await getTranslations('itemEditor');
  return { title: spec ? t('metaNew', { name: spec.entry.name }) : t('notFound.title') };
}

/** Editor de um Item novo, a partir do catálogo (S04). Sem sessão, o botão leva a entrar. */
export default async function NewItemPage({ params }: { params: Params }) {
  const spec = specOf((await params).itemId);
  const t = await getTranslations('itemEditor');
  const tc = await getTranslations('catalog');

  if (!spec) {
    return (
      <div className="container-page py-16">
        <div className="rounded-xl bg-surface">
          <EmptyState
            icon={BoxIcon}
            title={t('notFound.title')}
            body={t('notFound.body')}
            action={
              <Button asChild variant="ghost">
                <Link href="/inventory/add">{t('notFound.action')}</Link>
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="container-page pb-10">
      <EditorHeader
        entry={spec.entry}
        back={{ href: '/inventory/add', label: t('backToCatalog') }}
        rarityLabel={tc(`rarities.${spec.entry.rarity}`)}
        typeLabel={tc(`types.${spec.entry.type}`)}
      />
      <ItemEditor mode="new" spec={spec} equippable={slotOfItem(spec.entry.id) !== null} />
    </div>
  );
}
