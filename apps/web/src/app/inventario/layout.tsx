import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';
import { InventoryProvider } from '@/components/inventory/inventory-provider';

/**
 * Páginas do Inventário (S04). Os componentes de cliente daqui (editor, remover, Desfazer)
 * recebem só as mensagens de que precisam; o resto do site segue sem mensagens no cliente.
 */
export default async function InventoryLayout({ children }: { children: ReactNode }) {
  const { common, inventory, itemEditor } = await getMessages();
  return (
    <NextIntlClientProvider messages={{ common, inventory, itemEditor }}>
      <InventoryProvider>{children}</InventoryProvider>
    </NextIntlClientProvider>
  );
}
