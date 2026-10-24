import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';

/** A home ao vivo é de cliente: recebe só as mensagens dos Servidores, da atividade e da própria Home. */
export default async function ServersLayout({ children }: { children: ReactNode }) {
  const { servers, activity, home } = await getMessages();
  return (
    <NextIntlClientProvider messages={{ servers, activity, home }}>
      {children}
    </NextIntlClientProvider>
  );
}
