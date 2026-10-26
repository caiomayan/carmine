import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import type { ReactNode } from 'react';

/** O protótipo usa o conector real (botão dinâmico e a instrução do console), que lê as mensagens dos Servidores. */
export default async function ServidorProtoLayout({ children }: { children: ReactNode }) {
  const { servers } = await getMessages();
  return <NextIntlClientProvider messages={{ servers }}>{children}</NextIntlClientProvider>;
}
