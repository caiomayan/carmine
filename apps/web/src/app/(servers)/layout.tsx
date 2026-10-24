import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';

/** A home ao vivo é de cliente: recebe só as mensagens dos Servidores e da faixa de atividade. */
export default async function ServersLayout({ children }: { children: ReactNode }) {
  const { servers, activity } = await getMessages();
  return (
    <NextIntlClientProvider messages={{ servers, activity }}>{children}</NextIntlClientProvider>
  );
}
