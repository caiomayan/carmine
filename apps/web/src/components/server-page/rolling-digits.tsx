'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Número de dígitos rolando: cada dígito é uma fita de 0 a 9 (texto de um pseudo-elemento: 1 elemento, não 11) que sobe até o novo valor (como o odômetro de um
 * placar). Um dígito que nasce depois (de 9 para 10) entra rolando do 0. O texto de verdade, para o leitor de tela,
 * é o valor inteiro; com movimento reduzido a fita só troca (a transição fica em 0 no CSS).
 */
export function RollingDigits({ value, className }: { value: number; className?: string }) {
  const text = String(Math.max(0, Math.trunc(value)));
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
  }, []);
  // As colunas são contadas da direita (unidade, dezena...): trocar de 2 para 3 dígitos não remonta as antigas.
  const columns = text
    .split('')
    .map((char, index) => ({ digit: Number(char), place: text.length - 1 - index }));

  return (
    <>
      <span aria-hidden="true" className={cn('vs-digits', className)}>
        {columns.map(({ digit, place }) => (
          <Column key={place} digit={digit} rollIn={mounted.current} />
        ))}
      </span>
      <span className="sr-only">{value}</span>
    </>
  );
}

function Column({ digit, rollIn }: { digit: number; rollIn: boolean }) {
  const [shown, setShown] = useState(rollIn ? 0 : digit);
  useEffect(() => {
    if (shown === digit) return;
    const frame = requestAnimationFrame(() => setShown(digit));
    return () => cancelAnimationFrame(frame);
  }, [digit, shown]);

  return (
    <span className="vs-col">
      {/* A fita 0..9 é o ::before do .vs-strip (server-page.css): sem 10 elementos por dígito. */}
      <span className="vs-strip" style={{ transform: `translateY(${shown * -10}%)` }} />
    </span>
  );
}
