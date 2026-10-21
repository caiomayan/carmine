'use client';

import { useRouter } from 'next/navigation';
import { useId } from 'react';
import { SimpleSelect } from '@/components/ui/select';

export interface WeekOption {
  /** Segunda-feira (`YYYY-MM-DD`). */
  value: string;
  label: string;
  /** O endereço compartilhável dessa semana. */
  href: string;
}

/**
 * Seletor de semana: um Select que troca a URL; a semana escolhida fica no endereço, então o
 * Ranking é compartilhável. Com uma semana só não há o que escolher, e vira texto.
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
  if (options.length <= 1) {
    return (
      <p className="flex items-center gap-2.5 text-sm" data-testid="week-label">
        <span className="label-caps text-[10.5px] text-muted-foreground">{label}</span>
        {options.find((option) => option.value === value)?.label ?? options[0]?.label}
      </p>
    );
  }
  return (
    <div className="flex items-center gap-2.5 max-md:w-full">
      <label htmlFor={id} className="label-caps text-[10.5px] text-muted-foreground">
        {label}
      </label>
      <SimpleSelect
        className="min-w-0 max-md:flex-1 md:w-[240px]"
        id={id}
        value={value}
        data-testid="week-select"
        onValueChange={(selected) => {
          const next = options.find((option) => option.value === selected);
          if (next) router.push(next.href as '/ranking');
        }}
        options={options.map((option) => ({ value: option.value, label: option.label }))}
      />
    </div>
  );
}
