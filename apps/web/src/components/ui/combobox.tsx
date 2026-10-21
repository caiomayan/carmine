'use client';

import { CheckIcon, ChevronsUpDownIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { matchesSearch } from '@/lib/option-search';
import { cn } from '@/lib/utils';

export type ComboboxOption = { value: string; label: string };

/**
 * Select com busca para listas longas (Arma, Coleção, categorias de sticker): um botão que abre
 * um Popover com campo de busca e a lista filtrada, tudo por teclado (setas, Enter, Esc). A
 * busca ignora acentos e maiúsculas e aceita as palavras em qualquer ordem. O botão leva o
 * `id` (para o `<label htmlFor>`) e, com `name`, o valor vai no formulário como num `<select>`.
 */
export function Combobox({
  id,
  name,
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  invalid,
  className,
  triggerClassName,
  'aria-describedby': describedBy,
}: {
  id?: string;
  name?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: ComboboxOption[];
  /** Texto do botão quando o valor não está na lista (ex.: "Todas"). */
  placeholder: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  triggerClassName?: string;
  'aria-describedby'?: string;
}) {
  const t = useTranslations('common.combobox');
  const [open, setOpen] = useState(false);
  const listId = useId();
  const selected = options.find((option) => option.value === value);

  return (
    <div className={className}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            id={id}
            role="combobox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            disabled={disabled}
            data-placeholder={selected ? undefined : ''}
            className={cn(
              'group flex min-h-(--tap) w-full items-center justify-between gap-2 rounded-md bg-surface px-3 text-left text-sm transition-colors duration-(--dur-fast) ease-std',
              'hover:bg-surface-2 data-[state=open]:bg-surface-2 data-[placeholder]:text-muted-foreground',
              'disabled:pointer-events-none disabled:text-faint aria-invalid:outline-1 aria-invalid:outline-status-danger',
              triggerClassName,
            )}
          >
            <span className="truncate">{selected?.label ?? placeholder}</span>
            <ChevronsUpDownIcon
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground"
            />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) min-w-56 p-0">
          <Command
            // O filtro é nosso (cmdk: valor = rótulo): acento, caixa e ordem das palavras.
            filter={(optionLabel, search) => (matchesSearch(optionLabel, search) ? 1 : 0)}
          >
            <CommandInput placeholder={t('search')} aria-label={t('search')} />
            <CommandList id={listId}>
              <CommandEmpty>{t('empty')}</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    // `value` é o que o cmdk filtra e devolve: o rótulo, único dentro da lista.
                    value={option.label}
                    data-checked={option.value === value ? '' : undefined}
                    onSelect={() => {
                      onValueChange(option.value);
                      setOpen(false);
                    }}
                    className="justify-between data-[checked]:font-semibold"
                  >
                    <span className="truncate">{option.label}</span>
                    {option.value === value ? (
                      <CheckIcon aria-hidden="true" className="size-4 shrink-0" />
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {name ? <input type="hidden" name={name} value={value} /> : null}
    </div>
  );
}
