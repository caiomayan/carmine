'use client';

import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import { Select as SelectPrimitive } from 'radix-ui';
import { type ComponentProps, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Select do shadcn/ui (Radix) na linguagem Liberty: sem borda, fundo de superfície que clareia
 * no hover e aberto, painel no mesmo degrau do menu da Conta. Para listas longas, use o Combobox.
 * O Radix não aceita `value=""` num item: quem precisa de "Todos" usa um valor próprio.
 */
const Select = SelectPrimitive.Root;
const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

/** Visual do botão de Select e de Combobox: um só vocabulário para os dois. */
export const selectTriggerClass = [
  'group flex min-h-(--tap) w-full items-center justify-between gap-2 rounded-md bg-surface px-3 text-left text-sm transition-colors duration-(--dur-fast) ease-std',
  'hover:bg-surface-2 data-[state=open]:bg-surface-2 data-[placeholder]:text-muted-foreground',
  // Parece um campo, então foca como um (anel fino e suave, só no teclado), não com o anel de 2 px.
  'focus-visible:bg-surface-2 focus-visible:outline-none focus-visible:[box-shadow:var(--focus-field)]',
  'disabled:pointer-events-none disabled:text-faint aria-invalid:outline-1 aria-invalid:outline-status-danger',
  '*:data-[slot=select-value]:truncate [&_svg]:pointer-events-none [&_svg]:shrink-0',
].join(' ');

function SelectTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(selectTriggerClass, className)}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon
          aria-hidden="true"
          className="size-4 text-muted-foreground transition-transform duration-(--dur-fast) ease-std group-data-[state=open]:rotate-180 motion-reduce:transition-none"
        />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  position = 'popper',
  sideOffset = 4,
  ...props
}: ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        position={position}
        sideOffset={sideOffset}
        className={cn(
          'relative z-50 max-h-[min(20rem,var(--radix-select-content-available-height))] min-w-[8rem] origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground [scrollbar-color:var(--line-strong)_transparent] [scrollbar-width:thin] shadow-[0_24px_64px_-24px_var(--shadow),0_0_0_1px_var(--line)]',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 motion-reduce:animate-none',
          position === 'popper' && 'w-(--radix-select-trigger-width)',
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({ className, ...props }: ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn('label-caps px-2.5 py-1.5 text-[11px] text-muted-foreground', className)}
      {...props}
    />
  );
}

function SelectItem({
  className,
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        'relative flex min-h-9 w-full cursor-default items-center rounded-md py-1.5 pr-8 pl-2.5 text-sm outline-hidden select-none max-md:min-h-(--tap)',
        'data-[highlighted]:bg-accent data-[state=checked]:font-semibold data-[disabled]:pointer-events-none data-[disabled]:text-faint',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-2.5 grid place-items-center">
        <CheckIcon aria-hidden="true" className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({
  className,
  ...props
}: ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn('-mx-1 my-1 h-px bg-line', className)}
      {...props}
    />
  );
}

/** `keywords`: outros nomes que a busca do Combobox acha (o original em inglês, o tipo). */
export type SelectOption = { value: string; label: string; keywords?: string[] };

/** Valor interno do item "vazio": o Radix não aceita `value=""` num item. */
const EMPTY = '__empty__';

/**
 * O caso comum do Select, por lista de opções. O valor vazio (`''`) é "nada escolhido": com
 * `emptyLabel` vira um item que desfaz a escolha ("Todas"); sem ele, o botão mostra o
 * `placeholder`. Aceita controlado (`value`) e não controlado (`defaultValue`); com `name`, o
 * valor vai no formulário (e nada vai enquanto estiver vazio). `className` e o resto das
 * props vão para o botão.
 */
function SimpleSelect({
  value,
  defaultValue = '',
  onValueChange,
  options,
  emptyLabel,
  placeholder,
  name,
  disabled,
  ...triggerProps
}: Omit<ComponentProps<typeof SelectTrigger>, 'value' | 'defaultValue' | 'children' | 'name'> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  options: SelectOption[];
  emptyLabel?: string;
  placeholder?: string;
  name?: string;
}) {
  const [inner, setInner] = useState(defaultValue);
  const current = value ?? inner;
  return (
    <>
      <Select
        value={current === '' && emptyLabel ? EMPTY : current}
        onValueChange={(next) => {
          const resolved = next === EMPTY ? '' : next;
          if (value === undefined) setInner(resolved);
          onValueChange?.(resolved);
        }}
        disabled={disabled}
      >
        <SelectTrigger {...triggerProps}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {emptyLabel ? (
            <SelectItem value={EMPTY} data-testid="option-empty">
              {emptyLabel}
            </SelectItem>
          ) : null}
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              data-testid={`option-${option.value}`}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {name && current !== '' ? <input type="hidden" name={name} value={current} /> : null}
    </>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  SimpleSelect,
};
