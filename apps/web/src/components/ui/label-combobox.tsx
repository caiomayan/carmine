'use client';

import type { ComponentProps } from 'react';
import { Combobox } from '@/components/ui/combobox';
import { FloatingLabel, LABEL_COLOR } from '@/components/ui/floating-label';
import { describeField, FieldMessage } from '@/components/ui/label-input';
import type { FieldProps } from '@/components/ui/label-select';
import { cn } from '@/lib/utils';

/**
 * Combobox de formulário na linguagem do Label Input (rótulo flutuante, anel da marca, dica e erro).
 * Fica num arquivo à parte do `LabelSelect` de propósito: o Combobox leva o cmdk, o Popover e a
 * busca tolerante (~11 kB gz), e quem só precisa do Select (o editor do Item) não deve pagar por eles.
 */
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
