'use client';

import type { ComponentProps, ReactNode } from 'react';
import { Combobox } from '@/components/ui/combobox';
import { FloatingLabel, LABEL_COLOR } from '@/components/ui/floating-label';
import { describeField, FieldMessage } from '@/components/ui/label-input';
import { SimpleSelect } from '@/components/ui/select';
import { cn } from '@/lib/utils';

/**
 * Select e Combobox de formulário na linguagem do Label Input: o rótulo flutua sobre o botão (fica no
 * alto com um valor escolhido, repousa dentro do botão sem valor), o fundo segue a escala `--fill-*` e o
 * foco, ou a lista aberta, ganha o anel fino da marca. Dica e erro vêm embaixo, ligados por
 * `aria-describedby`. Os filtros de listagem (catálogo, Ranking, Modo da home) usam o `SimpleSelect` e o
 * `Combobox` puros, sem rótulo flutuante.
 *
 * O rótulo é o `<label for>` do botão, então o nome acessível é o rótulo; por isso `id` é obrigatório.
 * Sem valor, o rótulo faz o papel do placeholder.
 */
type FieldProps = {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  containerClassName?: string;
};

export function LabelSelect({
  id,
  label,
  hint,
  error,
  containerClassName,
  'aria-describedby': describedByProp,
  'aria-invalid': invalid,
  ...props
}: FieldProps & Omit<ComponentProps<typeof SimpleSelect>, 'id' | 'placeholder' | 'variant'>) {
  return (
    <div className={cn('grid content-start gap-1.5', containerClassName)}>
      <div className={cn('relative', LABEL_COLOR)}>
        <SimpleSelect
          {...props}
          id={id}
          variant="field"
          aria-invalid={error ? true : invalid}
          aria-describedby={describeField(id, describedByProp, error, hint)}
        />
        <FloatingLabel htmlFor={id}>{label}</FloatingLabel>
      </div>
      <FieldMessage id={id} error={error} hint={hint} />
    </div>
  );
}

export function LabelCombobox({
  id,
  label,
  hint,
  error,
  containerClassName,
  className,
  'aria-describedby': describedByProp,
  ...props
}: FieldProps &
  Omit<ComponentProps<typeof Combobox>, 'id' | 'invalid' | 'placeholder' | 'variant' | 'after'>) {
  return (
    <div className={cn('grid content-start gap-1.5', containerClassName)}>
      <Combobox
        {...props}
        id={id}
        variant="field"
        invalid={!!error}
        className={cn('relative', LABEL_COLOR, className)}
        aria-describedby={describeField(id, describedByProp, error, hint)}
        after={<FloatingLabel htmlFor={id}>{label}</FloatingLabel>}
      />
      <FieldMessage id={id} error={error} hint={hint} />
    </div>
  );
}
