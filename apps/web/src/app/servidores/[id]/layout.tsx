import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';

/** A página do servidor é de cliente (ao vivo): recebe só as mensagens dos Servidores e as dela. */
export default async function ServerPageLayout({ children }: { children: ReactNode }) {
  const { servers, serverPage } = await getMessages();
  return (
    <NextIntlClientProvider messages={{ servers, serverPage }}>{children}</NextIntlClientProvider>
  );
}
