'use client';

import type { ItemUsages } from '@carmine/contracts';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/animate-ui/components/radix/dialog';
import { useSession } from '@/components/session/session-provider';
import { Button } from '@/components/ui/button';
import { loadContracts } from '@/lib/contracts-schemas';
import { useInventory } from './inventory-provider';

type Usages =
  | { status: 'loading' }
  | { status: 'ready'; usages: ItemUsages }
  | { status: 'failed' };

/**
 * Remover um Item (S04): antes de confirmar, mostra onde ele está em uso (Loadout atual e
 * Presets, que voltam à Arma padrão). Depois de remover, o "Desfazer" fica 8 s na tela.
 */
export function RemoveItemDialog({
  uid,
  name,
  weaponName,
  open,
  onOpenChange,
  onRemoved,
}: {
  uid: string;
  name: string;
  /** Nome da arma do Item ("AK-47"), para dizer o slot do Loadout em uso. */
  weaponName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRemoved?: () => void;
}) {
  const t = useTranslations('inventory.remove');
  const tl = useTranslations('loadout.slots');
  const slotLabel = (slot: string) =>
    slot.startsWith('weapon_') ? weaponName : tl(slot as 'knife' | 'gloves' | 'agent' | 'musicKit');
  const tc = useTranslations('common');
  const { mutate } = useSession();
  const { offerUndo } = useInventory();
  const [usages, setUsages] = useState<Usages>({ status: 'loading' });
  const [removing, setRemoving] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUsages({ status: 'loading' });
    setFailed(false);
    const controller = new AbortController();
    fetch(`/api/inventory/items/${uid}/usages`, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const { itemUsagesSchema } = await loadContracts();
        setUsages({ status: 'ready', usages: itemUsagesSchema.parse(await response.json()) });
      })
      .catch(() => {
        if (!controller.signal.aborted) setUsages({ status: 'failed' });
      });
    return () => controller.abort();
  }, [open, uid]);

  async function confirm() {
    setRemoving(true);
    setFailed(false);
    try {
      const response = await mutate(`/api/inventory/items/${uid}`, { method: 'DELETE' });
      if (response.status === 401) return;
      if (!response.ok) throw new Error(String(response.status));
      onOpenChange(false);
      offerUndo(uid, name);
      onRemoved?.();
    } catch {
      setFailed(true);
    } finally {
      setRemoving(false);
    }
  }

  const ready = usages.status === 'ready' ? usages.usages : null;
  const inUse = ready ? ready.loadout.length + ready.presets.length > 0 : false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={tc('close')}
        className="gap-5 sm:max-w-md"
        data-testid="remove-dialog"
      >
        <div className="grid gap-2 pr-8">
          <DialogTitle>{t('title', { name })}</DialogTitle>
          <DialogDescription asChild>
            <div className="grid gap-2 text-body-sm leading-[1.55]" aria-live="polite">
              {usages.status === 'loading' ? (
                <p className="inline-flex items-center gap-2">
                  <span aria-hidden="true" className="shimmer h-1 w-10 rounded-full" />
                  {t('checking')}
                </p>
              ) : usages.status === 'failed' ? (
                <p>{t('usagesFailed')}</p>
              ) : inUse && ready ? (
                <>
                  <p className="text-foreground">{t('inUse')}</p>
                  <ul className="grid gap-1 pl-1" data-testid="item-usages">
                    {ready.loadout.map((use) => (
                      <li key={`${use.slot}-${use.side}`} className="flex items-center gap-2">
                        <span aria-hidden="true" className="size-1 rounded-full bg-foreground" />
                        {t('loadout', {
                          slot: slotLabel(use.slot),
                          side: t(`sides.${use.side ?? 'all'}`),
                        })}
                      </li>
                    ))}
                    {ready.presets.map((preset) => (
                      <li key={preset.id} className="flex items-center gap-2">
                        <span aria-hidden="true" className="size-1 rounded-full bg-foreground" />
                        {t('preset', { name: preset.name })}
                      </li>
                    ))}
                  </ul>
                  <p>{t('affected')}</p>
                </>
              ) : (
                <p data-testid="item-usages-none">{t('notInUse')}</p>
              )}
              <p>{t('undoHint')}</p>
            </div>
          </DialogDescription>
        </div>
        {failed ? (
          <p role="alert" className="flex items-start gap-2 text-body-sm">
            <span
              aria-hidden="true"
              className="mt-1.5 size-1.5 shrink-0 rounded-full bg-status-danger"
            />
            {t('failed')}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            onClick={confirm}
            disabled={removing || usages.status === 'loading'}
            data-testid="confirm-remove"
          >
            {t('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
