'use client';

import type { Cs2Item } from '@carmine/contracts';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { LoadoutApiError, useEquip } from '@/components/loadout/use-equip';
import { useLoadoutApi } from '@/components/loadout/use-loadout-api';
import { DynamicButton } from '@/components/vida/dynamic-button';
import { useInventory } from './inventory-provider';

/**
 * "Adicionar e equipar" em um passo (S05): o caminho mais curto até a primeira skin no jogo.
 * Adiciona o Item com os atributos de partida, equipa em todos os lados dele e leva ao Loadout,
 * com a instrução do `!ws` no aviso.
 */
export function QuickEquipButton({ item, name }: { item: Cs2Item; name: string }) {
  const t = useTranslations('inventory.empty');
  const tl = useTranslations('loadout');
  const api = useLoadoutApi();
  const { equip } = useEquip();
  const { notify } = useInventory();
  const router = useRouter();
  const [, setPending] = useState(false);

  async function run() {
    setPending(true);
    try {
      const uid = await api.addItem(item);
      await equip({ uid, name, names: () => undefined, inGameHint: true });
      router.push('/loadout');
    } catch (caught) {
      const code = caught instanceof LoadoutApiError ? caught.code : 'network';
      if (code !== 'session') notify(tl('notices.failed'));
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <DynamicButton
      variant="quiet"
      idle={t('quickEquip')}
      loading={t('quickEquipPending')}
      done="Equipado"
      ariaLabel={t('quickEquipLabel', { name })}
      onAction={run}
      loadingMs={1800}
      className="w-full"
      testId="quick-equip"
    />
  );
}
