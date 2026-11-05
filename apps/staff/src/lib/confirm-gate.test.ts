import { describe, expect, it } from 'vitest';
import { arm, CONFIRM_DELAY_MS, disarm, IDLE, isArmed, mayConfirm } from './confirm-gate';

describe('a trava de confirmação das ações sem volta', () => {
  it('sem ter mostrado a confirmação, nada confirma', () => {
    expect(isArmed(IDLE)).toBe(false);
    expect(mayConfirm(IDLE, 10_000)).toBe(false);
  });

  it('o duplo clique (ou o Enter repetido) logo depois de mostrar a confirmação não confirma', () => {
    const gate = arm(1_000);
    expect(isArmed(gate)).toBe(true);
    expect(mayConfirm(gate, 1_000)).toBe(false);
    expect(mayConfirm(gate, 1_000 + CONFIRM_DELAY_MS - 1)).toBe(false);
  });

  it('um clique deliberado, passado o atraso, confirma', () => {
    expect(mayConfirm(arm(1_000), 1_000 + CONFIRM_DELAY_MS)).toBe(true);
  });

  it('editar o formulário depois de mostrar a confirmação desfaz tudo: o valor novo pede outra confirmação', () => {
    const gate = disarm();
    expect(isArmed(gate)).toBe(false);
    expect(mayConfirm(gate, 99_999)).toBe(false);
  });
});
