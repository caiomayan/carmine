import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';

/** A vitrine usa a página de verdade, que lê as mensagens dos Servidores e as dela. */
export default async function ServerGalleryLayout({ children }: { children: ReactNode }) {
  const { servers, serverPage } = await getMessages();
  return (
    <NextIntlClientProvider messages={{ servers, serverPage }}>{children}</NextIntlClientProvider>
  );
}
