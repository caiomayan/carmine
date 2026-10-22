import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LabelInput, LabelTextarea } from './label-input';

const source = readFileSync(new URL('./label-input.tsx', import.meta.url), 'utf8');
const html = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);

describe('LabelInput: marcação e acessibilidade', () => {
  it('liga o rótulo ao campo e deixa o placeholder em branco para o rótulo repousar', () => {
    const out = html(createElement(LabelInput, { id: 'nome', label: 'Novo nome' }));
    expect(out).toMatch(/<input[^>]*id="nome"/);
    expect(out).toMatch(/<label[^>]*for="nome"[^>]*>Novo nome<\/label>/);
    expect(out).toMatch(/placeholder=" "/);
  });

  it('o rótulo vem depois do campo (a variante peer precisa do irmão seguinte)', () => {
    const out = html(createElement(LabelInput, { id: 'nome', label: 'Novo nome' }));
    expect(out.indexOf('<input')).toBeLessThan(out.indexOf('<label'));
    expect(out).toContain('peer ');
  });

  it('a dica e o erro se ligam por aria-describedby, e o erro vence a dica', () => {
    const hint = html(createElement(LabelInput, { id: 'a', label: 'A', hint: 'Dica' }));
    expect(hint).toContain('aria-describedby="a-hint"');
    expect(hint).toContain('id="a-hint"');

    const error = html(
      createElement(LabelInput, { id: 'a', label: 'A', hint: 'Dica', error: 'Erro' }),
    );
    expect(error).toContain('aria-describedby="a-error"');
    expect(error).toContain('aria-invalid="true"');
    expect(error).not.toContain('id="a-hint"');
  });

  it('o aria-describedby do chamador se junta ao da dica; o aria-invalid do chamador vale sem erro', () => {
    const out = html(
      createElement(LabelInput, {
        id: 'a',
        label: 'A',
        hint: 'Dica',
        'aria-describedby': 'fora',
        'aria-invalid': true,
      }),
    );
    expect(out).toContain('aria-describedby="fora a-hint"');
    expect(out).toContain('aria-invalid="true"');
  });

  it('o placeholder de verdade é mantido (aparece só no foco)', () => {
    const out = html(createElement(LabelInput, { id: 'a', label: 'A', placeholder: 'Ex.: 7656…' }));
    expect(out).toContain('placeholder="Ex.: 7656…"');
  });

  it('o contador (aside) aparece no canto', () => {
    const out = html(createElement(LabelInput, { id: 'a', label: 'A', aside: '3/24' }));
    expect(out).toContain('3/24');
  });
});

describe('LabelInput: senha', () => {
  it('só campos de senha ganham o botão de mostrar, que começa oculto e tem nome', () => {
    const text = html(createElement(LabelInput, { id: 'a', label: 'A' }));
    expect(text).not.toContain('<button');

    const password = html(createElement(LabelInput, { id: 'p', label: 'Senha', type: 'password' }));
    expect(password).toContain('type="password"');
    expect(password).toMatch(
      /<button[^>]*type="button"[^>]*aria-label="Mostrar a senha"[^>]*aria-pressed="false"/,
    );
  });

  it('os textos do botão podem vir traduzidos', () => {
    const out = html(
      createElement(LabelInput, { id: 'p', label: 'Senha', type: 'password', showLabel: 'Show' }),
    );
    expect(out).toContain('aria-label="Show"');
  });
});

describe('LabelTextarea', () => {
  it('é um textarea ligado ao rótulo, com a dica e o erro iguais', () => {
    const out = html(createElement(LabelTextarea, { id: 'm', label: 'Motivo', error: 'Falta' }));
    expect(out).toMatch(/<textarea[^>]*id="m"/);
    expect(out).toMatch(/<label[^>]*for="m"/);
    expect(out).toContain('aria-describedby="m-error"');
  });
});

describe('estilo (o Tailwind só gera o que está escrito por extenso)', () => {
  it('o anel do foco usa o token da marca e vale também com o mouse', () => {
    expect(source).toContain('focus:outline-(--focus-ring)');
    expect(source).not.toContain('focus-visible:outline');
  });

  it('o erro mantém o anel de perigo mesmo em foco', () => {
    expect(source).toContain('aria-invalid:outline-status-danger');
    expect(source).toContain('aria-invalid:focus:outline-status-danger');
  });

  it('o rótulo repousa só com o campo vazio e sem foco, e flutua com texto ou foco', () => {
    expect(source).toContain('peer-[:placeholder-shown:not(:focus)]:-translate-y-1/2');
    expect(source).toContain('peer-[:placeholder-shown:not(:focus)]:scale-100');
    expect(source).toContain('peer-[:placeholder-shown:not(:focus)]:translate-y-0');
  });

  it('a transição é curta, usa os tokens de movimento e some com movimento reduzido', () => {
    expect(source).toContain('duration-(--dur-fast)');
    expect(source).toContain('ease-std');
    expect(source).toContain('motion-reduce:transition-none');
  });

  it('o alvo do campo e do botão de senha tem 44 px', () => {
    expect(source).toContain('min-h-(--tap)');
    expect(source).toContain('w-11');
  });
});
