import type { Transition } from 'framer-motion';

/**
 * Tokens de movimento para o Motion (framer-motion): os mesmos valores de `--ease-*` e
 * `--dur-*` de `app/tokens.css` e `app/globals.css`, que `motion.test.ts` confere (os valores
 * de repouso; sob `prefers-reduced-motion` o CSS encurta `--dur-base` e `--dur-slow`, e aqui o
 * movimento reduzido tira o deslocamento e a escala e deixa só a opacidade, ou o fade curto de
 * `revealMotion`). Em CSS, use as variáveis; aqui, só onde o Motion anima (Dialog, Sheet,
 * Dropdown, Tooltip, alturas). Duração em segundos, como o Motion espera.
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

/**
 * Altura de um contêiner que muda sozinha (abas de altura variável): sobe e desce no mesmo
 * tempo, sem a assimetria de entrar e sair.
 */
export const heightTransition = enterTransition(DURATION.base);

/**
 * Abrir e fechar de altura (ajuda, formulário, aviso): a altura e a opacidade vão juntas; abre
 * em `base` (curva de chegada) e fecha em `fast` (curva de saída). Com `reduce` (movimento
 * reduzido) a altura não anima, porque o conteúdo de baixo pularia: fica um fade curto.
 */
export function revealMotion(reduce = false) {
  const hidden = reduce ? { opacity: 0 } : { height: 0, opacity: 0 };
  return {
    initial: hidden,
    animate: {
      height: 'auto',
      opacity: 1,
      transition: reduce ? enterTransition(DURATION.fast) : enterTransition(),
    },
    exit: { ...hidden, transition: exitTransition() },
  } as const;
}

/**
 * Painéis que só mudam de opacidade e de escala (menus, Tooltip). Só `opacity` e `scale`: a
 * escala é transformação, e o Motion a desliga sob `prefers-reduced-motion` (sobra a opacidade).
 */
export function scaleMotion({
  scale = 0.96,
  enter = DURATION.base,
  exit = DURATION.fast,
}: {
  scale?: number;
  enter?: number;
  exit?: number;
} = {}) {
  const hidden = { opacity: 0, scale };
  return {
    initial: hidden,
    animate: { opacity: 1, scale: 1, transition: enterTransition(enter) },
    exit: { ...hidden, transition: exitTransition(exit) },
  } as const;
}

/**
 * Painéis flutuantes (Dialog): opacidade, deslocamento vertical e escala pequenos. Só `opacity`,
 * `y` e `scale`, nunca a chave `transform` bruta: o Motion só desliga o que é transformação
 * (`y`, `scale`) sob `prefers-reduced-motion`, e com a chave bruta o painel continuava se
 * mexendo; assim, sob movimento reduzido sobra a opacidade.
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
  const base = scaleMotion({ scale, enter, exit });
  return {
    initial: { ...base.initial, y },
    animate: { ...base.animate, y: 0 },
    exit: { ...base.exit, y },
  } as const;
}

/** O Dialog: entra em `base`, sai em `fast`, 8 px abaixo e a 98%. */
export const dialogMotion = floatingMotion();

/** O fundo escurecido atrás do Dialog e do Sheet: entra em `base`, sai em `fast`. */
export const overlayMotion = {
  initial: { opacity: 0, filter: 'blur(4px)' },
  animate: { opacity: 1, filter: 'blur(0px)', transition: enterTransition() },
  exit: { opacity: 0, filter: 'blur(4px)', transition: exitTransition() },
} as const;

/**
 * Troca o tempo de entrada e de saída pelo que quem usa o componente passou em `transition`:
 * no Motion, a `transition` dentro do alvo (`animate`, `exit`) vence a da propriedade, então
 * sem isto o `transition` do componente não faria nada.
 */
export function withTransition<T extends { animate: object; exit: object }>(
  motion: T,
  transition?: Transition,
): T {
  if (!transition) return motion;
  return {
    ...motion,
    animate: { ...motion.animate, transition },
    exit: { ...motion.exit, transition },
  };
}
