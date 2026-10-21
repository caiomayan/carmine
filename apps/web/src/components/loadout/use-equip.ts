'use client';

import type { LoadoutChange, LoadoutSide, LoadoutSlot } from '@carmine/contracts';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { useInventory } from '@/components/inventory/inventory-provider';
import { sidesLabelKey } from '@/lib/team-sides';
import { LoadoutApiError, useLoadoutApi } from './use-loadout-api';

type Names = (uid: string) => string | undefined;

/**
 * Equipar e desequipar com o aviso do que mudou e o "Desfazer" por 8 s (S05). O Desfazer manda
 * o `previous` da resposta para `/assign`. Lança {@link LoadoutApiError} quando a API recusa;
 * quem chama decide onde mostrar.
 */
export function useEquip() {
  const t = useTranslations('loadout');
  const api = useLoadoutApi();
  const router = useRouter();
  const { offerAction, notify } = useInventory();

  const sidesText = useCallback(
    (sides: (LoadoutSide | null)[]) => t(`sidesShort.${sidesLabelKey(sides)}`),
    [t],
  );

  const offerUndoOf = useCallback(
    (change: LoadoutChange, message: string, presetId?: string) => {
      if (change.previous.length === 0) {
        notify(message);
        return;
      }
      offerAction({
        message,
        failure: t('notices.undoFailed'),
        labels: { undo: t('notices.undo'), undoing: t('notices.undoing') },
        undo: async () => {
          await api.assign({ assignments: change.previous, ...(presetId ? { presetId } : {}) });
          return { message: t('notices.undone') };
        },
      });
    },
    [api, notify, offerAction, t],
  );

  const equip = useCallback(
    async ({
      uid,
      name,
      sides,
      names,
      presetId,
      inGameHint = false,
    }: {
      uid: string;
      name: string;
      sides?: LoadoutSide[];
      names: Names;
      presetId?: string;
      /** Lembra o `!ws` (o primeiro Item no jogo, a partir do Inventário vazio). */
      inGameHint?: boolean;
    }) => {
      const change = await api.equip({
        uid,
        ...(sides ? { sides } : {}),
        ...(presetId ? { presetId } : {}),
      });
      const where = change.loadout.entries
        .filter((entry) => entry.uid === uid)
        .map((entry) => entry.side);
      const replaced = [
        ...new Set(
          change.previous
            .map((previous) => previous.uid)
            .filter((other): other is string => !!other && other !== uid),
        ),
      ]
        .map((other) => names(other))
        .filter((other): other is string => !!other);
      const message = inGameHint
        ? t('notices.inGame', { item: name, sides: sidesText(where) })
        : replaced.length > 0
          ? t('notices.replaced', {
              item: name,
              previous: replaced.join(', '),
              sides: sidesText(where),
            })
          : t('notices.equipped', { item: name, sides: sidesText(where) });
      offerUndoOf(change, message, presetId);
      router.refresh();
      return change;
    },
    [api, offerUndoOf, router, sidesText, t],
  );

  const unequip = useCallback(
    async ({
      slot,
      slotName,
      sides,
      presetId,
    }: {
      slot: LoadoutSlot;
      slotName: string;
      sides?: LoadoutSide[];
      presetId?: string;
    }) => {
      const change = await api.unequip({
        slot,
        ...(sides ? { sides } : {}),
        ...(presetId ? { presetId } : {}),
      });
      offerUndoOf(
        change,
        t('notices.unequipped', {
          slot: slotName,
          sides: sidesText(change.previous.map((previous) => previous.side)),
        }),
        presetId,
      );
      router.refresh();
      return change;
    },
    [api, offerUndoOf, router, sidesText, t],
  );

  return { equip, unequip, sidesText };
}

export { LoadoutApiError };
