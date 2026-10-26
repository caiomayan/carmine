'use client';

import type { ReactNode } from 'react';

/**
 * O Spotlight Text (a ideia aprovada, reimplementada): o texto aparece apagado e um foco de luz, que segue o mouse ou
 * a rolagem, o ilumina. São duas camadas do mesmo texto: a de baixo, apagada e lida pelo leitor de tela, e a de cima,
 * clara e escondida do leitor de tela, recortada por uma máscara radial em `--sx`/`--sy`. Sem o filme (movimento
 * reduzido ou sem JS) só a de baixo aparece, inteira e legível. Quem move o foco é o `film.ts`.
 */
export function SpotlightText({ children }: { children: ReactNode }) {
  return (
    <p className="sb-spot-text" data-testid="spotlight">
      <span className="sb-spot-base">{children}</span>
      <span aria-hidden="true" className="sb-spot-lit">
        {children}
      </span>
    </p>
  );
}
