'use client';

import { useEffect } from 'react';

/**
 * O fragmento nunca chega ao servidor, então o redirecionamento 301 de `/regras#recurso` termina em
 * `/rules#recurso`. Aqui o endereço antigo vira o novo (`#recurso` -> `#appeal`) e a seção entra na tela.
 */
export function LegacyAnchors({ aliases }: { aliases: Readonly<Record<string, string>> }) {
  useEffect(() => {
    const target = aliases[window.location.hash];
    if (!target) return;
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.search}${target}`,
    );
    document.getElementById(target.slice(1))?.scrollIntoView();
  }, [aliases]);
  return null;
}
