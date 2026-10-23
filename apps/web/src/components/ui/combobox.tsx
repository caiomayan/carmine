'use client';

import { CheckIcon, ChevronsUpDownIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { fieldTriggerClass } from '@/components/ui/floating-label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { type SelectOption, selectTriggerClass } from '@/components/ui/select';
import { indexText, type SearchDoc, scoreDoc } from '@/lib/option-search';
import { cn } from '@/lib/utils';

/** Chave cmdk do item "vazio" (o cmdk não distingue bem um `value` vazio). */
const EMPTY_KEY = '__empty__';

/**
 * Select com busca para listas longas (Arma, Coleção, categorias de sticker): um botão que abre
 * um Popover com campo de busca e a lista filtrada, tudo por teclado (setas, Enter, Esc). A
 * busca ignora acentos e maiúsculas, aceita palavras parciais e erros de digitação, em qualquer
 * ordem, acha também os `keywords` da opção (o nome em inglês, o tipo) e ordena por relevância
 * (`lib/option-search.ts`). A lista abre na opção atual, destacada e à vista. O botão leva o
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
  variant = 'default',
  after,
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
  /** `field`: o botão na linguagem do Label Input (ver `floating-label.tsx`). */
  variant?: 'default' | 'field';
  /** Vem logo depois do botão, dentro do mesmo bloco: o rótulo flutuante do `variant="field"`. */
  after?: ReactNode;
  'aria-describedby'?: string;
}) {
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
            className={cn(
              variant === 'field' ? fieldTriggerClass : selectTriggerClass,
              triggerClassName,
            )}
          >
            <span className="truncate">{selected?.label ?? (value || placeholder)}</span>
            <ChevronsUpDownIcon
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground"
            />
          </button>
        </PopoverTrigger>
        {after}
        <PopoverContent className="w-(--radix-popover-trigger-width) min-w-56 p-0">
          <ComboboxPanel
            items={items}
            value={value}
            listId={listId}
            onPick={(next) => {
              onValueChange(next);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      {name && value !== '' ? <input type="hidden" name={name} value={value} /> : null}
    </div>
  );
}

/**
 * O painel aberto: busca e lista. Monta a cada abertura (o Popover desmonta ao fechar), então a
 * busca começa vazia e a opção atual vem destacada e à vista, em vez de a lista abrir no topo.
 */
function ComboboxPanel({
  items,
  value,
  listId,
  onPick,
}: {
  items: SelectOption[];
  value: string;
  listId: string;
  onPick: (value: string) => void;
}) {
  const t = useTranslations('common.combobox');
  const [active, setActive] = useState(value || EMPTY_KEY);
  const list = useRef<HTMLDivElement>(null);
  // O texto de cada opção é normalizado e quebrado em palavras uma vez por abertura, não a cada
  // tecla de cada opção (listas de centenas de Coleções e categorias).
  const docs = useMemo(() => {
    const byKey = new Map<string, SearchDoc>();
    for (const item of items) {
      byKey.set(item.value || EMPTY_KEY, indexText([item.label, ...(item.keywords ?? [])]));
    }
    return byKey;
  }, [items]);

  useEffect(() => {
    const current = list.current?.querySelector('[data-checked]');
    if (!list.current || !current) return;
    const box = list.current.getBoundingClientRect();
    const row = current.getBoundingClientRect();
    list.current.scrollTop += row.top - box.top - (list.current.clientHeight - row.height) / 2;
  }, []);

  return (
    <Command
      value={active}
      onValueChange={setActive}
      // Filtro nosso: o cmdk chaveia o item pelo valor, e a busca olha o rótulo e os outros nomes
      // (palavras parciais, sem acento, com erro de digitação). O número devolvido é a
      // relevância: o cmdk ordena por ele e esconde os de zero.
      filter={(key, search, keywords) =>
        scoreDoc(docs.get(key) ?? indexText(keywords ?? []), search)
      }
    >
      <CommandInput placeholder={t('search')} aria-label={t('search')} />
      <CommandList id={listId} ref={list}>
        <CommandEmpty>{t('empty')}</CommandEmpty>
        <CommandGroup>
          {items.map((item) => (
            <CommandItem
              key={item.value || EMPTY_KEY}
              value={item.value || EMPTY_KEY}
              keywords={[item.label, ...(item.keywords ?? [])]}
              data-testid={`option-${item.value || 'empty'}`}
              data-checked={item.value === value ? '' : undefined}
              onSelect={() => onPick(item.value)}
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
  );
}
