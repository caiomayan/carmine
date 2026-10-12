import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';

/** A home ao vivo é de cliente: recebe só as mensagens dos Servidores. */
export default async function ServersLayout({ children }: { children: ReactNode }) {
  const { servers } = await getMessages();
  return <NextIntlClientProvider messages={{ servers }}>{children}</NextIntlClientProvider>;
}
