/**
 * Tokens de movimento para o Motion (framer-motion): os mesmos valores de `--ease-*` e
 * `--dur-*` de `app/tokens.css` e `app/globals.css`, que `motion.test.ts` confere. Em CSS,
 * use as variáveis; aqui, só onde o Motion anima (Dialog, Sheet, Dropdown, Tooltip, alturas).
 * Duração em segundos, como o Motion espera.
 */

/** Curvas, na ordem do Motion: `[x1, y1, x2, y2]` de um cubic-bezier. */
export const EASE = {
  /** Cor e fundo. */
  std: [0.2, 0, 0, 1],
  /** Chegadas (entrar, abrir). */
  out: [0.16, 1, 0.3, 1],
  /** Saídas (fechar, sair). */
  in: [0.7, 0, 0.84, 0],
  /** Tema e crossfade. */
  inOut: [0.65, 0, 0.35, 1],
  /** Movimento longo e contínuo (zoom, abrir). */
  soft: [0.33, 1, 0.68, 1],
} as const;

/** Durações, em segundos. */
export const DURATION = {
  /** Press. */
  instant: 0.09,
  /** Hover e cor. */
  fast: 0.14,
  /** Troca de estado: abrir, fechar, entrar. */
  base: 0.22,
  /** Troca de painel e tema. */
  slow: 0.36,
} as const;

/** Entrar: chegada suave. */
export const enterTransition = (duration: number = DURATION.base) =>
  ({ duration, ease: EASE.out }) as const;

/** Sair: mais curta que a entrada, para o que fecha não atrasar a pessoa. */
export const exitTransition = (duration: number = DURATION.fast) =>
  ({ duration, ease: EASE.in }) as const;

/** Abrir e fechar de altura (painéis, avisos) e troca de painel: o mesmo tempo em todo o site. */
export const heightTransition = enterTransition(DURATION.base);

/**
 * Abrir e fechar de altura (ajuda, formulário, aviso): a altura e a opacidade vão juntas em
 * `heightTransition`. Com `reduce` (movimento reduzido) a altura não anima, porque o conteúdo
 * de baixo pularia: fica um fade curto.
 */
export function revealMotion(reduce = false) {
  const hidden = reduce ? { opacity: 0 } : { height: 0, opacity: 0 };
  return {
    initial: hidden,
    animate: { height: 'auto', opacity: 1 },
    exit: hidden,
    transition: reduce ? enterTransition(DURATION.fast) : heightTransition,
  } as const;
}

/**
 * Painéis flutuantes (Dialog, menus, Tooltip): opacidade, deslocamento vertical e escala
 * pequenos. Só `opacity`, `y` e `scale`, nunca a chave `transform` bruta: o Motion só desliga
 * o que é transformação (`y`, `scale`) sob `prefers-reduced-motion`, e com a chave bruta o painel
 * continuava se mexendo; assim, sob movimento reduzido sobra a opacidade.
 */
export function floatingMotion({
  y = 8,
  scale = 0.98,
  enter = DURATION.base,
  exit = DURATION.fast,
}: {
  y?: number;
  scale?: number;
  enter?: number;
  exit?: number;
} = {}) {
  const hidden = { opacity: 0, y, scale };
  return {
    initial: hidden,
    animate: { opacity: 1, y: 0, scale: 1, transition: enterTransition(enter) },
    exit: { ...hidden, transition: exitTransition(exit) },
  } as const;
}

/** O Dialog: entra em `base`, sai em `fast`, 8 px abaixo e a 98%. */
export const dialogMotion = floatingMotion();
