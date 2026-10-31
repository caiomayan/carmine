'use client';

import { Button } from '@/components/ui/button';

/** Abre a impressão do navegador (que também salva em PDF); o recibo tem estilo próprio para o papel. */
export function PrintButton({ label }: { label: string }) {
  return (
    <Button variant="ghost" size="sm" onClick={() => window.print()} data-testid="receipt-print">
      {label}
    </Button>
  );
}
