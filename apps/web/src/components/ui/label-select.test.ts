import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { fieldTriggerClass } from './floating-label';
import { LabelCombobox, LabelSelect } from './label-select';

const floating = readFileSync(new URL('./floating-label.tsx', import.meta.url), 'utf8');
const html = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);
/** O atributo no botão (a classe do rótulo também cita `data-placeholder`). */
const isPlaceholder = (markup: string) => /<button[^>]*data-placeholder=""/.test(markup);

const options = [
  { value: 'a', label: 'Alfa' },
  { value: 'b', label: 'Beta' },
];

describe('LabelSelect', () => {
  it('liga o rótulo ao botão (nome acessível) e põe o rótulo depois dele, para a variante peer', () => {
    const out = html(
      createElement(LabelSelect, { id: 'modo', label: 'Modo', options, defaultValue: 'a' }),
    );
    expect(out).toMatch(/<button[^>]*id="modo"/);
    expect(out).toMatch(/<label[^>]*for="modo"[^>]*>Modo<\/label>/);
    expect(out.indexOf('<button')).toBeLessThan(out.indexOf('<label'));
    expect(out).toContain('peer ');
  });

  it('com valor escolhido o botão não é placeholder; sem valor traz data-placeholder', () => {
    const withValue = html(
      createElement(LabelSelect, { id: 'm', label: 'M', options, defaultValue: 'b' }),
    );
    expect(isPlaceholder(withValue)).toBe(false);

    const empty = html(createElement(LabelSelect, { id: 'm', label: 'M', options }));
    expect(isPlaceholder(empty)).toBe(true);
  });

  it('com o texto de "vazio", o rótulo já fica no alto (há um valor à vista)', () => {
    const out = html(
      createElement(LabelSelect, { id: 'm', label: 'M', options, emptyLabel: 'Todas' }),
    );
    expect(isPlaceholder(out)).toBe(false);
  });

  it('o erro vence a dica e liga o aria-describedby e o aria-invalid', () => {
    const out = html(
      createElement(LabelSelect, { id: 'm', label: 'M', options, hint: 'Dica', error: 'Erro' }),
    );
    expect(out).toContain('aria-describedby="m-error"');
    expect(out).toContain('aria-invalid="true"');
    expect(out).not.toContain('id="m-hint"');
  });

  it('com name, o valor vai no formulário', () => {
    const out = html(
      createElement(LabelSelect, { id: 'm', label: 'M', options, name: 'modo', defaultValue: 'a' }),
    );
    expect(out).toContain('name="modo"');
  });
});

describe('LabelCombobox', () => {
  it('é um combobox com o rótulo flutuante logo depois do botão', () => {
    const out = html(
      createElement(LabelCombobox, {
        id: 'arma',
        label: 'Arma',
        options,
        value: 'a',
        onValueChange: () => {},
        hint: 'Dica',
      }),
    );
    expect(out).toMatch(
      /<button[^>]*role="combobox"[^>]*id="arma"|<button[^>]*id="arma"[^>]*role="combobox"/,
    );
    expect(out).toMatch(/<label[^>]*for="arma"/);
    expect(out.indexOf('<button')).toBeLessThan(out.indexOf('<label'));
    expect(out).toContain('aria-describedby="arma-hint"');
  });

  it('sem valor escolhido e sem texto de vazio, marca o botão como placeholder (o rótulo repousa)', () => {
    const out = html(
      createElement(LabelCombobox, {
        id: 'arma',
        label: 'Arma',
        options,
        value: '',
        onValueChange: () => {},
      }),
    );
    expect(isPlaceholder(out)).toBe(true);
  });
});

describe('estilo compartilhado (classes por extenso para o Tailwind)', () => {
  it('o botão usa os fundos --fill-*, o anel da marca no foco e na lista aberta, e o erro em perigo', () => {
    for (const token of [
      'bg-(--fill-rest)',
      'hover:bg-(--fill-hover)',
      'focus:outline-(--focus-ring)',
      'data-[state=open]:outline-(--focus-ring)',
      'aria-invalid:outline-status-danger',
      'min-h-(--tap)',
    ]) {
      expect(fieldTriggerClass, token).toContain(token);
    }
  });

  it('o rótulo repousa só sem valor, sem foco e com a lista fechada', () => {
    expect(floating).toContain(
      'peer-[[data-placeholder]:not(:focus):not([data-state=open])]:-translate-y-1/2',
    );
    expect(floating).toContain(
      'peer-[[data-placeholder]:not(:focus):not([data-state=open])]:scale-100',
    );
  });

  it('a transição é curta, nos tokens, e some com movimento reduzido', () => {
    expect(floating).toContain('transition-[translate,scale,color]');
    expect(floating).toContain('duration-(--dur-fast)');
    expect(floating).toContain('motion-reduce:transition-none');
  });
});
