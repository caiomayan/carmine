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
import { type SelectOption, selectTriggerClass } from '@/components/ui/select';
import { searchScore } from '@/lib/option-search';
import { cn } from '@/lib/utils';

/** Chave cmdk do item "vazio" (o cmdk não distingue bem um `value` vazio). */
const EMPTY_KEY = '__empty__';

/**
 * Select com busca para listas longas (Arma, Coleção, categorias de sticker): um botão que abre
 * um Popover com campo de busca e a lista filtrada, tudo por teclado (setas, Enter, Esc). A
 * busca ignora acentos e maiúsculas, aceita palavras parciais e erros de digitação, em qualquer
 * ordem, e ordena por relevância (`lib/option-search.ts`). O botão leva o
 * `id` (para o `<label htmlFor>`) e, com `name`, o valor vai no formulário (e nada vai enquanto
 * estiver vazio), como no `SimpleSelect`. O valor vazio (`''`) é "nada escolhido": com
 * `emptyLabel` vira o primeiro item da lista ("Todas").
 *
 * Os textos de busca vêm de `common.combobox`: a rota precisa entregar o namespace `common` às
 * mensagens do cliente (como fazem os layouts de `(itens)` e `staff`).
 */
export function Combobox({
  id,
  name,
  value,
  onValueChange,
  options,
  emptyLabel,
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
  options: SelectOption[];
  emptyLabel?: string;
  /** Texto do botão quando o valor não está na lista e não há `emptyLabel`. */
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  triggerClassName?: string;
  'aria-describedby'?: string;
}) {
  const t = useTranslations('common.combobox');
  const [open, setOpen] = useState(false);
  const listId = useId();
  const items = emptyLabel ? [{ value: '', label: emptyLabel }, ...options] : options;
  const selected = items.find((item) => item.value === value);

  return (
    <div className={className}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            id={id}
            role="combobox"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            disabled={disabled}
            data-placeholder={selected ? undefined : ''}
            className={cn(selectTriggerClass, triggerClassName)}
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
            // Filtro nosso: o cmdk chaveia o item pelo valor, e a busca olha o rótulo (palavras
            // parciais, sem acento, com erro de digitação). O número devolvido é a relevância: o
            // cmdk ordena por ele e esconde os de zero.
            filter={(_key, search, keywords) => searchScore((keywords ?? []).join(' '), search)}
          >
            <CommandInput placeholder={t('search')} aria-label={t('search')} />
            <CommandList id={listId}>
              <CommandEmpty>{t('empty')}</CommandEmpty>
              <CommandGroup>
                {items.map((item) => (
                  <CommandItem
                    key={item.value || EMPTY_KEY}
                    value={item.value || EMPTY_KEY}
                    keywords={[item.label]}
                    data-testid={`option-${item.value || 'empty'}`}
                    data-checked={item.value === value ? '' : undefined}
                    onSelect={() => {
                      onValueChange(item.value);
                      setOpen(false);
                    }}
                    className="justify-between data-[checked]:font-semibold"
                  >
                    <span className="truncate">{item.label}</span>
                    {item.value === value ? (
                      <CheckIcon aria-hidden="true" className="size-4 shrink-0" />
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {name && value !== '' ? <input type="hidden" name={name} value={value} /> : null}
    </div>
  );
}
