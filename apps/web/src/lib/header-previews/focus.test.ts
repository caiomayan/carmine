import { describe, expect, it } from 'vitest';
import { shouldRestoreFocus } from './focus';

const el = (name: string) => ({ name }) as unknown as Element;
const body = el('body');
const item = el('item');

describe('shouldRestoreFocus', () => {
  it('devolve o foco ao item quando ele caiu no <body> com a troca', () => {
    expect(shouldRestoreFocus(body, body, item)).toBe(true);
    expect(shouldRestoreFocus(null, body, item)).toBe(true);
  });

  it('mantém o foco que já está no próprio item', () => {
    expect(shouldRestoreFocus(item, body, item)).toBe(true);
  });

  it('não rouba o foco que a pessoa já levou a outro lugar (U4 L4)', () => {
    expect(shouldRestoreFocus(el('busca'), body, item)).toBe(false);
  });

  it('sem o item na nova navegação, não há para onde devolver', () => {
    expect(shouldRestoreFocus(body, body, null)).toBe(false);
  });
});
