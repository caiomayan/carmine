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
 * atalho à vista, a partir de 1152 px (onde o container já tem os 1080 px e a coluna das ações
 * comporta o campo ao lado do tema e da Conta sem empurrar a navegação do centro); abaixo disso, e
 * no celular, vira só o ícone (alvo de 44 px no celular). O
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
        className="animate-fade-up min-[1152px]:min-h-8 min-[1152px]:w-40 min-[1152px]:justify-start min-[1152px]:gap-2 min-[1152px]:px-3 min-[1152px]:font-normal"
      >
        <SearchIcon
          aria-hidden="true"
          className="size-[18px] min-[1152px]:size-4 min-[1152px]:text-muted-foreground"
        />
        <span className="flex-1 text-left text-body-sm text-muted-foreground max-[1151px]:hidden">
          {t('label')}
        </span>
        <kbd
          suppressHydrationWarning
          className="rounded-sm bg-(--fill-rest) px-1.5 py-0.5 font-sans text-caption leading-none font-medium muted-on-fill max-[1151px]:hidden"
        >
          {mac ? t('keysMac') : t('keys')}
        </kbd>
      </Button>
      {Palette ? <Palette open={open} onOpenChange={setOpen} openerRef={opener} /> : null}
    </>
  );
}
