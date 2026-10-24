'use client';

import { type ReactNode, useEffect, useRef } from 'react';

/**
 * O header fica fixo no topo. Em repouso (scrollY = 0) é só o fundo da página, sem linha; ao rolar
 * ganha um fundo levemente mais claro e desfoque (o estilo está em `globals.css`, em
 * `[data-site-header][data-scrolled]`, com transição suave e sem ela com movimento reduzido).
 * Também avisa a altura dele em `--site-hdr-h`, para o que gruda logo abaixo (a barra do
 * Loadout, o sumário das páginas legais) e o `scroll-padding-top` saberem onde começa a tela útil.
 */
export function HeaderShell({ children, className }: { children: ReactNode; className?: string }) {
  const header = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = header.current;
    if (!element) return;
    const root = document.documentElement;
    const onScroll = () => element.toggleAttribute('data-scrolled', window.scrollY > 0);
    const measure = () => root.style.setProperty('--site-hdr-h', `${element.offsetHeight}px`);
    onScroll();
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
      root.style.removeProperty('--site-hdr-h');
    };
  }, []);

  return (
    <header ref={header} data-site-header className={className}>
      {children}
    </header>
  );
}
