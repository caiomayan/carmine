'use client';

import { useReducedMotion } from 'motion/react';
import { useLocale } from 'next-intl';
import { useEffect, useState } from 'react';
import { SlidingNumber } from '@/components/animate-ui/primitives/texts/sliding-number';

/**
 * Contador que rola os dígitos quando o número muda (Sliding Number do Animate UI).
 * O leitor de tela ouve só o número formatado: os rolos de dígitos são decorativos. Antes da
 * hidratação e com movimento reduzido o número é texto simples.
 */
export function LiveCount({ value, className }: { value: number; className?: string }) {
  const locale = useLocale();
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const format = new Intl.NumberFormat(locale);
  const text = format.format(value);
  const group = format.formatToParts(1000).find((p) => p.type === 'group')?.value;

  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      {mounted && !reduced ? (
        <SlidingNumber
          aria-hidden="true"
          number={value}
          initiallyStable
          thousandSeparator={group}
        />
      ) : (
        <span aria-hidden="true">{text}</span>
      )}
    </span>
  );
}
