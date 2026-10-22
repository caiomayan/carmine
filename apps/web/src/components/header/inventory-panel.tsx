'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { steamLoginHref } from '@/lib/auth-links';
import type { InventoryView } from '@/lib/header-previews/view';
import { BlockTitle, ItemImage, PanelFooterLink, WithView } from './preview-parts';

/**
 * O painel "Inventário": os 4 últimos Itens adicionados (cada um leva ao editor), o total e
 * "Adicionar skin". Sem sessão, o convite para entrar.
 */
export function InventoryPanel() {
  return (
    <WithView>
      {(view) => (view.inventory ? <InventoryContent inventory={view.inventory} /> : <SignedOut />)}
    </WithView>
  );
}

function InventoryContent({ inventory }: { inventory: InventoryView }) {
  const t = useTranslations('headerPreviews.inventory');
  return (
    <div className="grid gap-3" data-testid="preview-inventory">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <BlockTitle>{t('latest')}</BlockTitle>
        <p className="text-body-sm text-muted-foreground tabular-nums" data-testid="preview-total">
          {t('total', { total: inventory.total, limit: inventory.limit })}
        </p>
      </div>

      {inventory.latest.length > 0 ? (
        <ul className="grid grid-cols-4 gap-2">
          {inventory.latest.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                data-testid="preview-item"
                className="grid h-full content-start gap-1.5 rounded-lg bg-(--fill-rest) p-2 transition-colors duration-(--dur-fast) ease-std hover:bg-(--fill-hover)"
              >
                <ItemImage src={item.image} />
                <span className="grid gap-0.5">
                  <span className="line-clamp-2 text-caption leading-snug font-medium">
                    {item.title}
                  </span>
                  <span className="truncate text-caption text-muted-foreground">
                    {[item.statTrak ? t('statTrak') : null, item.caption]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="grid gap-1 px-1" data-testid="preview-inventory-empty">
          <p className="text-body-sm font-medium">{t('empty')}</p>
          <p className="text-body-sm text-muted-foreground">{t('emptyHint')}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
        <Button asChild size="sm">
          <Link href="/inventario/adicionar" data-testid="preview-add">
            {t('add')}
          </Link>
        </Button>
        <PanelFooterLink href="/inventario">{t('open')}</PanelFooterLink>
      </div>
    </div>
  );
}

function SignedOut() {
  const t = useTranslations('headerPreviews.inventory');
  return (
    <div className="grid gap-3" data-testid="preview-inventory-signed-out">
      <div className="grid gap-1 px-1">
        <p className="text-body-sm font-semibold">{t('signInTitle')}</p>
        <p className="text-body-sm text-muted-foreground">{t('signInBody')}</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2">
        <Button asChild size="sm">
          <a href={steamLoginHref('/inventario')} data-testid="preview-sign-in">
            {t('signIn')}
          </a>
        </Button>
        <PanelFooterLink href="/inventario/adicionar">{t('browse')}</PanelFooterLink>
      </div>
    </div>
  );
}
