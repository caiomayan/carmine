'use client';

import { type ComponentType, useCallback, useRef, useState } from 'react';
import { MainNav, type NavItem } from '@/components/main-nav';
import { loadHeaderView } from '@/lib/header-previews/client';
import { PANEL_MEDIA, panelOf } from '@/lib/header-previews/panels';
import type { PreviewNavItem } from './preview-nav';

/**
 * Os painéis de prévia carregam só quando a pessoa se aproxima do menu (primeiro hover ou foco): o
 * módulo (NavigationMenu do Radix, os painéis) e a leitura dos dados. Até lá, e para sempre no
 * celular, a navegação é a leve, que é a única coisa na primeira carga.
 */
type PreviewNavComponent = ComponentType<{
  label: string;
  items: PreviewNavItem[];
  className?: string;
  initial: { href: string | null; focus: boolean };
}>;

let previewModule: Promise<typeof import('./preview-nav')> | null = null;
const loadPreviewNav = () => {
  previewModule ??= import('./preview-nav');
  return previewModule;
};

export function HeaderNav({
  label,
  items,
  className,
}: {
  label: string;
  items: NavItem[];
  className?: string;
}) {
  const [Rich, setRich] = useState<PreviewNavComponent | null>(null);
  const [initial, setInitial] = useState<{ href: string | null; focus: boolean }>({
    href: null,
    focus: false,
  });
  const started = useRef(false);

  const onIntent = useCallback((href: string, source: 'pointer' | 'focus') => {
    if (started.current || !window.matchMedia(PANEL_MEDIA).matches || !panelOf(href)) return;
    started.current = true;
    // Aquece os dados junto com o módulo: o painel abre já com o que mostrar.
    void loadHeaderView();
    loadPreviewNav()
      .then((module) => {
        setInitial({ href, focus: source === 'focus' });
        setRich(() => module.PreviewNav);
      })
      .catch(() => {
        // O módulo não veio (rede): a navegação leve segue valendo, e a próxima aproximação tenta de novo.
        started.current = false;
      });
  }, []);

  if (Rich) return <Rich label={label} items={items} className={className} initial={initial} />;
  return <MainNav label={label} items={items} className={className} onIntent={onIntent} />;
}
