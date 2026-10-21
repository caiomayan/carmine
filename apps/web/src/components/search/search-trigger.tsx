'use client';

import { SearchIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * A paleta de comandos fica de fora da primeira carga: o módulo (cmdk, Dialog, a lógica de
 * resultados) só é importado quando a pessoa abre a busca ou aproxima o ponteiro do botão.
 */
type PaletteModule = typeof import('./search-palette');
let paletteModule: Promise<PaletteModule> | null = null;
const loadPalette = () => {
  paletteModule ??= import('./search-palette');
  return paletteModule;
};

/** Campo de texto, editor ou seletor: ali o "/" é uma letra, não um atalho. */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
    ['textbox', 'combobox', 'searchbox'].includes(target.getAttribute('role') ?? '')
  );
}

/** Há outro Dialog aberto (a paleta não disputa o foco com ele). */
const anotherDialogOpen = () =>
  document.querySelector(
    '[role="dialog"][data-state="open"]:not([data-testid="search-palette"]), [role="alertdialog"][data-state="open"]',
  ) !== null;

/**
 * O campo de busca do cabeçalho (U3d): abre a paleta de comandos. No desktop é um campo com o
 * atalho à vista; no celular (e em telas estreitas) vira só o ícone, num alvo de 44 px. O
 * atalho vale em qualquer página: Ctrl+K (⌘K no Mac) e "/" quando nenhum campo está em foco.
 */
export function SearchTrigger() {
  const t = useTranslations('search.trigger');
  const [open, setOpen] = useState(false);
  const [Palette, setPalette] = useState<PaletteModule['SearchPalette'] | null>(null);
  const [pending, setPending] = useState(false);
  const [mac, setMac] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  // Quem tinha o foco ao abrir: é para onde ele volta ao fechar.
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
  }, []);

  const show = useCallback(() => {
    const active = document.activeElement;
    opener.current =
      active instanceof HTMLElement && active !== document.body ? active : button.current;
    if (Palette) {
      setOpen(true);
      return;
    }
    setPending(true);
    loadPalette()
      .then((module) => {
        setPalette(() => module.SearchPalette);
        setOpen(true);
      })
      .finally(() => setPending(false));
  }, [Palette]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      const plain = !event.ctrlKey && !event.metaKey && !event.altKey;
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === 'k'
      ) {
        if (!open && anotherDialogOpen()) return;
        event.preventDefault();
        if (open) setOpen(false);
        else show();
      } else if (
        event.key === '/' &&
        plain &&
        !open &&
        !isEditable(event.target) &&
        !anotherDialogOpen()
      ) {
        event.preventDefault();
        show();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, show]);

  return (
    <>
      <Button
        ref={button}
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t('aria')}
        aria-haspopup="dialog"
        aria-keyshortcuts="Control+K Meta+K"
        aria-busy={pending || undefined}
        title={mac ? t('shortcutMac') : t('shortcut')}
        data-testid="search-trigger"
        onClick={show}
        onPointerEnter={loadPalette}
        onFocus={loadPalette}
        className="animate-fade-up lg:min-h-8 lg:w-44 lg:justify-start lg:gap-2 lg:px-3 lg:font-normal"
      >
        <SearchIcon aria-hidden="true" className="size-[18px] lg:size-4 lg:text-muted-foreground" />
        <span className="flex-1 text-left text-sm text-muted-foreground max-lg:hidden">
          {t('label')}
        </span>
        <kbd
          suppressHydrationWarning
          className="rounded-sm bg-(--fill-rest) px-1.5 py-0.5 font-sans text-[11px] leading-none font-medium text-[color-mix(in_srgb,var(--text)_72%,var(--muted))] max-lg:hidden"
        >
          {mac ? '⌘K' : 'Ctrl K'}
        </kbd>
      </Button>
      {Palette ? <Palette open={open} onOpenChange={setOpen} openerRef={opener} /> : null}
    </>
  );
}
