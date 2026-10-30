'use client';

import NumberFlow from '@number-flow/react';

/**
 * Um número que muda: ao mudar (a atualização automática do Início), os dígitos rolam em vez de trocar de repente.
 * O NumberFlow anima com `transform` e `opacity` e respeita `prefers-reduced-motion`. O primeiro valor já vem
 * pintado pelo servidor, então nunca aparece um número que não é o da API.
 */
export function Num({ value }: { value: number }) {
  return <NumberFlow value={value} locales="pt-BR" />;
}
