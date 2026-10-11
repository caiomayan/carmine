'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { EmptyState } from '@/components/empty-state';
import { HistoryIcon } from '@/components/icons/animated/history';
import { Button } from '@/components/ui/button';

/** A API não respondeu: nunca um Inventário vazio, e sim o aviso e tentar de novo. */
export function InventoryUnavailable() {
  const t = useTranslations('inventory.unavailable');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div role="alert" className="rounded-xl bg-surface" data-testid="inventory-unavailable">
      <EmptyState
        icon={HistoryIcon}
        title={t('title')}
        body={t('body')}
        action={
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => startTransition(() => router.refresh())}
          >
            {t('retry')}
          </Button>
        }
      />
    </div>
  );
}
