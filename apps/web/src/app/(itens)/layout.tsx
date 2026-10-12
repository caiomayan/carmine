import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';
import { InventoryProvider } from '@/components/inventory/inventory-provider';

/**
 * Páginas do Inventário (S04) e do Loadout (S05), num grupo de rotas só para dividirem o mesmo
 * aviso com "Desfazer": "adicionar e equipar" sai do Inventário e o aviso continua no Loadout.
 * Os componentes de cliente daqui recebem só as mensagens de que precisam; o resto do site
 * segue sem mensagens no cliente.
 */
export default async function ItemsLayout({ children }: { children: ReactNode }) {
  const { common, inventory, itemEditor, loadout } = await getMessages();
  return (
    <NextIntlClientProvider messages={{ common, inventory, itemEditor, loadout }}>
      <InventoryProvider>{children}</InventoryProvider>
    </NextIntlClientProvider>
  );
}
