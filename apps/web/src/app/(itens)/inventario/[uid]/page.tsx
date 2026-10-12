import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/empty-state';
import { BoxIcon } from '@/components/icons/animated/box';
import { EditorHeader } from '@/components/inventory/editor-header';
import { InventoryUnavailable } from '@/components/inventory/inventory-unavailable';
import { ItemEditor } from '@/components/inventory/item-editor';
import { Button } from '@/components/ui/button';
import { getInventory } from '@/lib/api-server';
import { signInHref } from '@/lib/auth-links';
import { itemSpec } from '@/lib/catalog/catalog';
import { attachmentLabels } from '@/lib/inventory/cards';

type Params = Promise<{ uid: string }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function findItem(uid: string) {
  const result = await getInventory();
  if (result.status !== 'ok') return { result, item: undefined };
  return { result, item: result.inventory.items.find((i) => i.uid === uid) };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { uid } = await params;
  const t = await getTranslations('itemEditor');
  const { item } = UUID.test(uid) ? await findItem(uid) : { item: undefined };
  const spec = item ? itemSpec(item.item.id) : undefined;
  return {
    title: spec ? t('metaEdit', { name: spec.entry.name }) : t('itemNotFound.title'),
    robots: { index: false },
  };
}

/** Editor de um Item do Inventário (S04): edita no lugar; Loadout e Presets referenciam o uid. */
export default async function EditItemPage({ params }: { params: Params }) {
  const { uid } = await params;
  const t = await getTranslations('itemEditor');
  const tc = await getTranslations('catalog');
  const { result, item } = UUID.test(uid)
    ? await findItem(uid)
    : { result: { status: 'ok' as const }, item: undefined };

  if (result.status === 'anonymous') redirect(signInHref(`/inventario/${uid}`) as never);
  if (result.status === 'unavailable') {
    return (
      <div className="container-page py-16">
        <InventoryUnavailable />
      </div>
    );
  }

  const spec = item ? itemSpec(item.item.id) : undefined;
  if (!item || !spec) {
    return (
      <div className="container-page py-16">
        <div className="rounded-xl bg-surface">
          <EmptyState
            icon={BoxIcon}
            title={t('itemNotFound.title')}
            body={t('itemNotFound.body')}
            action={
              <Button asChild variant="ghost">
                <Link href="/inventario">{t('itemNotFound.action')}</Link>
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
        back={{ href: '/inventario', label: t('backToInventory') }}
        rarityLabel={tc(`rarities.${spec.entry.rarity}`)}
        typeLabel={tc(`types.${spec.entry.type}`)}
      />
      <ItemEditor
        mode="edit"
        spec={spec}
        uid={item.uid}
        saved={item.item}
        labels={attachmentLabels(item.item)}
      />
    </div>
  );
}
