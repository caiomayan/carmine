import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';
import { InventoryProvider } from '@/components/inventory/inventory-provider';

/**
 * Página do Loadout (S05). O aviso com "Desfazer" é o mesmo do Inventário: equipar e
 * desequipar oferecem desfazer por 8 s.
 */
export default async function LoadoutLayout({ children }: { children: ReactNode }) {
  const { common, inventory, loadout } = await getMessages();
  return (
    <NextIntlClientProvider messages={{ common, inventory, loadout }}>
      <InventoryProvider>{children}</InventoryProvider>
    </NextIntlClientProvider>
  );
}
