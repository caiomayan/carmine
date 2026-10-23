/**
 * A geometria da mão de Presets do /loadout: cada Preset é uma carta, e a mão é um leque (as
 * cartas se sobrepõem para caber, inclinadas em arco) em telas largas ou uma fileira que rola
 * (celular, toque, ou muitas cartas para pouca largura). Passar o mouse folheia: a carta em foco
 * sobe e as vizinhas abrem espaço. Funções puras, sem DOM: a posição vem toda daqui.
 */

/** O tamanho de uma carta, em px. */
export const CARD = { width: 132, height: 184 } as const;

/**
 * A mão no desktop "espia" por baixo da borda: só os `peek` px de cima de cada carta aparecem em
 * repouso (nome, faca e peças), o resto fica recortado; a carta em foco sobe e se mostra inteira.
 * `lift` é o respiro em cima: cabem a carta ativa e a em foco (que sobe e cresce) sem encostar
 * no que vem antes da mão.
 */
export const HAND = { lift: 52, peek: 146 } as const;

/** Respiro entre cartas quando há largura de sobra e elas não precisam se sobrepor. */
const GAP = 12;
/** Passo mínimo entre duas cartas do leque: abaixo disso só se vê uma sombra de cada. */
const MIN_STEP = 34;
/** Abaixo desta largura a mão é sempre uma fileira (celular). */
const FAN_MIN_WIDTH = 640;

/** Inclinação máxima das pontas, em graus, e quanto elas descem no arco, em px. */
const MAX_TILT = 8;
const ARC = 10;
/** A carta ativa descansa um pouco acima; a em foco sobe o bastante para mostrar a carta inteira. */
const ACTIVE_LIFT = 14;
const FOCUS_LIFT = CARD.height - HAND.peek + 6;
const FOCUS_SCALE = 1.06;
/** Quanto das cartas sobrepostas as vizinhas da carta em foco abrem para os lados. */
const SPREAD_SHARE = 0.55;

export type HandMode = 'fan' | 'row';

/** Onde uma carta fica, em relação ao centro da mão. */
export interface Pose {
  x: number;
  y: number;
  rotate: number;
  scale: number;
  z: number;
}

/** Distância entre os centros de duas cartas vizinhas. */
export function stepFor(count: number, width: number): number {
  if (count <= 1) return 0;
  return Math.min(CARD.width + GAP, (width - CARD.width) / (count - 1));
}

/** Leque se cabe com sobreposição razoável; fileira que rola se não (e no celular). */
export function handMode(count: number, width: number): HandMode {
  if (count <= 1) return 'fan';
  return width < FAN_MIN_WIDTH || stepFor(count, width) < MIN_STEP ? 'row' : 'fan';
}

/** O centro de repouso da carta `index` (sem folhear), em relação ao centro da mão. */
export function restX(index: number, count: number, width: number): number {
  return (index - (count - 1) / 2) * stepFor(count, width);
}

/** A carta mais perto do ponteiro (`x` em relação ao centro da mão); nulo sem cartas. */
export function focusAt(x: number, count: number, width: number): number | null {
  if (count <= 0) return null;
  let best = 0;
  for (let index = 1; index < count; index++) {
    if (Math.abs(restX(index, count, width) - x) < Math.abs(restX(best, count, width) - x)) {
      best = index;
    }
  }
  return best;
}

/**
 * As poses da mão. `focused`: a carta que o ponteiro ou o teclado está folheando; `active`: a do
 * Preset ativo (descansa mais alta). Com `reduced` (movimento reduzido) nada se inclina, sobe,
 * cresce nem abre: a mão fica parada e só a carta em foco vem para cima das outras.
 */
export function handLayout({
  count,
  width,
  focused,
  active,
  reduced,
}: {
  count: number;
  width: number;
  focused: number | null;
  active: number | null;
  reduced: boolean;
}): Pose[] {
  const mid = (count - 1) / 2;
  const step = stepFor(count, width);
  const overlap = Math.max(0, CARD.width - step);
  const spread = reduced ? 0 : overlap * SPREAD_SHARE;
  const reference = focused ?? active ?? mid;
  const tilt = Math.min(MAX_TILT, 90 / Math.max(count, 1));

  return Array.from({ length: count }, (_, index) => {
    const offset = mid === 0 ? 0 : (index - mid) / mid;
    const isFocused = index === focused;
    const gap = focused === null || isFocused ? 0 : index - focused;
    const open = gap === 0 ? 0 : (Math.sign(gap) * spread) / (1 + (Math.abs(gap) - 1) * 0.5);
    const lifted = reduced ? 0 : isFocused ? FOCUS_LIFT : index === active ? ACTIVE_LIFT : 0;
    return {
      x: (index - mid) * step + open,
      y: reduced ? 0 : offset ** 2 * ARC - lifted,
      rotate: reduced || isFocused ? 0 : offset * tilt,
      scale: reduced || !isFocused ? 1 : FOCUS_SCALE,
      z: isFocused ? 1000 : 100 - Math.abs(index - reference),
    };
  });
}
