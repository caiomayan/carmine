import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DURATION,
  dialogMotion,
  EASE,
  enterTransition,
  exitTransition,
  floatingMotion,
  heightTransition,
  overlayMotion,
  revealMotion,
  scaleMotion,
  withTransition,
} from './motion';

const css = (file: string) => readFileSync(new URL(`../app/${file}`, import.meta.url), 'utf8');
const tokens = css('tokens.css');
const globals = css('globals.css');

/** O valor de uma variável CSS (`--nome: valor;`), sem o comentário que vem depois. */
const variable = (source: string, name: string) => {
  const start = source.indexOf(`${name}:`);
  if (start < 0) return undefined;
  return source.slice(start + name.length + 1, source.indexOf(';', start)).trim();
};
const bezier = (name: string) => {
  const value = variable(globals, `--ease-${name}`);
  return value
    ?.slice(value.indexOf('(') + 1, value.indexOf(')'))
    .split(',')
    .map(Number);
};
const milliseconds = (name: string) => {
  const value = variable(tokens, `--dur-${name}`);
  return value?.endsWith('ms') ? Number.parseInt(value, 10) / 1000 : undefined;
};

describe('tokens de movimento', () => {
  it('as curvas são as de --ease-* do CSS', () => {
    for (const [name, curve] of Object.entries(EASE)) {
      const cssName = name === 'inOut' ? 'in-out' : name;
      expect(bezier(cssName), `--ease-${cssName}`).toEqual([...curve]);
    }
  });

  it('as durações são as de --dur-* do CSS', () => {
    for (const [name, seconds] of Object.entries(DURATION)) {
      expect(milliseconds(name), `--dur-${name}`).toBe(seconds);
    }
  });
});

describe('transições', () => {
  it('entra com a curva de chegada e sai, mais curto, com a de saída', () => {
    expect(enterTransition()).toEqual({ duration: DURATION.base, ease: EASE.out });
    expect(exitTransition()).toEqual({ duration: DURATION.fast, ease: EASE.in });
    expect(exitTransition().duration).toBeLessThan(enterTransition().duration);
  });

  it('abrir e fechar de altura usa a duração de troca de estado', () => {
    expect(heightTransition.duration).toBe(DURATION.base);
  });
});

describe('abrir e fechar de altura', () => {
  it('anima a altura e a opacidade em conjunto, no tempo de troca de estado', () => {
    const reveal = revealMotion();

    expect(reveal.initial).toEqual({ height: 0, opacity: 0 });
    expect(reveal.animate).toMatchObject({ height: 'auto', opacity: 1 });
    expect(reveal.exit).toMatchObject({ height: 0, opacity: 0 });
    expect(reveal.animate.transition.duration).toBe(DURATION.base);
    expect(reveal.animate.transition.ease).toEqual(EASE.out);
  });

  it('fecha mais depressa que abre, com a curva de saída', () => {
    const reveal = revealMotion();

    expect(reveal.exit.transition).toEqual(exitTransition());
    expect(reveal.exit.transition.duration).toBeLessThan(reveal.animate.transition.duration);
  });

  it('com movimento reduzido não anima a altura: só um fade, mais curto', () => {
    const reveal = revealMotion(true);

    expect(reveal.initial).toEqual({ opacity: 0 });
    expect(reveal.exit).toMatchObject({ opacity: 0 });
    expect(Object.keys(reveal.exit)).not.toContain('height');
    expect(reveal.animate.transition.duration).toBe(DURATION.fast);
  });
});

describe('painel flutuante (Dialog, menus, Tooltip)', () => {
  it('o Dialog entra de 8 px abaixo e a 98%, até o repouso, e sai pelo mesmo caminho', () => {
    expect(dialogMotion.initial).toEqual({ opacity: 0, y: 8, scale: 0.98 });
    expect(dialogMotion.animate).toMatchObject({ opacity: 1, y: 0, scale: 1 });
    expect(dialogMotion.exit).toMatchObject({ opacity: 0, y: 8, scale: 0.98 });
    expect(dialogMotion.animate.transition.duration).toBe(DURATION.base);
    expect(dialogMotion.exit.transition.duration).toBe(DURATION.fast);
  });

  it('nunca usa a chave transform bruta nem rotação: o movimento reduzido não a cobriria', () => {
    for (const state of [dialogMotion.initial, dialogMotion.animate, dialogMotion.exit]) {
      expect(Object.keys(state)).not.toContain('transform');
      expect(Object.keys(state).some((key) => key.startsWith('rotate'))).toBe(false);
    }
  });

  it('aceita outros deslocamentos e tempos (menu, tooltip)', () => {
    const tooltip = floatingMotion({
      y: 0,
      scale: 0.92,
      enter: DURATION.fast,
      exit: DURATION.instant,
    });

    expect(tooltip.initial).toEqual({ opacity: 0, y: 0, scale: 0.92 });
    expect(tooltip.animate.transition.duration).toBe(DURATION.fast);
    expect(tooltip.exit.transition.duration).toBe(DURATION.instant);
  });
});

describe('menus e Tooltip (só opacidade e escala)', () => {
  it('não têm deslocamento: o Tooltip que segue o cursor usa o y por conta própria', () => {
    const menu = scaleMotion({ scale: 0.96 });

    expect(menu.initial).toEqual({ opacity: 0, scale: 0.96 });
    expect(Object.keys(menu.animate)).not.toContain('y');
    expect(menu.exit.transition.duration).toBeLessThan(menu.animate.transition.duration);
  });
});

describe('fundo escurecido', () => {
  it('entra em base e sai em fast, como o painel', () => {
    expect(overlayMotion.animate.transition.duration).toBe(DURATION.base);
    expect(overlayMotion.exit.transition.duration).toBe(DURATION.fast);
    expect(overlayMotion.animate.transition.duration).toBe(
      dialogMotion.animate.transition.duration,
    );
  });
});

describe('withTransition (o transition passado ao componente vale)', () => {
  it('sem override devolve o movimento como está', () => {
    expect(withTransition(dialogMotion)).toBe(dialogMotion);
  });

  it('com override troca o tempo de entrar e de sair, sem mexer nos estados', () => {
    const spring = { type: 'spring', stiffness: 200 } as const;
    const custom = withTransition(dialogMotion, spring);

    expect(custom.animate.transition).toEqual(spring);
    expect(custom.exit.transition).toEqual(spring);
    expect(custom.initial).toBe(dialogMotion.initial);
    expect(custom.animate).toMatchObject({ opacity: 1, y: 0, scale: 1 });
    expect(custom.exit).toMatchObject({ opacity: 0, y: 8, scale: 0.98 });
  });
});
