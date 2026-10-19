'use client';

import { useRouter } from 'next/navigation';
import { useId } from 'react';
import { Select } from '@/components/staff/fields';

export interface WeekOption {
  /** Segunda-feira (`YYYY-MM-DD`). */
  value: string;
  label: string;
  /** O endereço compartilhável dessa semana. */
  href: string;
}

/**
 * Seletor de semana: um `<select>` nativo (teclado e leitor de tela de graça) que troca a URL.
 * A semana escolhida fica no endereço, então o Ranking é compartilhável.
 */
export function WeekSelect({
  label,
  value,
  options,
}: {
  label: string;
  value: string;
  options: WeekOption[];
}) {
  const router = useRouter();
  const id = useId();
  return (
    <div className="flex items-center gap-2.5 max-md:w-full">
      <label htmlFor={id} className="label-caps text-[10.5px] text-muted-foreground">
        {label}
      </label>
      <Select
        className="min-w-0 max-md:flex-1 md:w-[240px]"
        id={id}
        value={value}
        data-testid="week-select"
        onChange={(event) => {
          const next = options.find((option) => option.value === event.target.value);
          if (next) router.push(next.href as '/ranking');
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </div>
  );
}
