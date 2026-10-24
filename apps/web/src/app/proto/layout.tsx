import type { Metadata } from 'next';
import { type ReactNode, Suspense } from 'react';
import '@/components/cosmetics/cosmetics.css';
import { demoCharms } from '@/components/cosmetics/charms.server';
import { CosmeticsProvider } from '@/components/cosmetics/cosmetic-avatar';
import { ProtoBar } from '@/components/vida/proto-bar';

/*
 * Protótipo "vida" (branch proto/vida, sem merge): Home em /proto e Perfil em /proto/perfil, com dados de
 * exemplo fixos. A marca é P&B duro (tokens em app/tokens.css); o display é a Big Shoulders (app/layout.tsx).
 */
export const metadata: Metadata = {
  title: 'Protótipo Vida',
  robots: { index: false, follow: false },
};

export default function ProtoLayout({ children }: { children: ReactNode }) {
  return (
    <CosmeticsProvider charms={demoCharms()}>
      {children}
      <Suspense fallback={null}>
        <ProtoBar />
      </Suspense>
    </CosmeticsProvider>
  );
}
