import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import './tokens.css';
import './globals.css';

// A mesma Inter do site: a tipografia do painel é a do Carmine.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Painel da Staff · Carmine', template: '%s · Painel da Staff' },
  robots: { index: false, follow: false },
};

/** O tema vem de um cookie (lido no servidor), então a primeira pintura já é a certa, sem script inline. */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = (await cookies()).get('stp-theme')?.value === 'light' ? 'light' : 'dark';
  return (
    <html lang="pt-BR" data-theme={theme} className={inter.variable} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
