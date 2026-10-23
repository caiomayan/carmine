import { describe, expect, it } from 'vitest';
import { type DragState, dragReducer, initialDragState, selectionFor } from './drag-selection';

const ready = (state: DragState, stickers: number, hasCharm = false) =>
  selectionFor(state, { ready: true, stickers, hasCharm });

describe('seleção implícita do 3D', () => {
  it('ao ficar pronto, seleciona o primeiro sticker', () => {
    expect(ready(initialDragState, 3)).toEqual({ kind: 'sticker', index: 0 });
  });

  it('sem 3D pronto não seleciona nada', () => {
    expect(
      selectionFor(initialDragState, { ready: false, stickers: 3, hasCharm: true }),
    ).toBeNull();
  });

  it('sem stickers, o chaveiro só é selecionado enquanto a linha dele tem o foco', () => {
    expect(ready(initialDragState, 0, true)).toBeNull();
    const focused = dragReducer(initialDragState, { type: 'focus-charm' });
    expect(ready(focused, 0, true)).toEqual({ kind: 'keychain', index: 0 });
  });

  it('focar ou expandir outra linha re-seleciona o sticker dela', () => {
    const second = dragReducer(initialDragState, { type: 'focus-sticker', index: 1 });
    expect(ready(second, 3)).toEqual({ kind: 'sticker', index: 1 });
    const third = dragReducer(second, { type: 'focus-sticker', index: 2 });
    expect(ready(third, 3)).toEqual({ kind: 'sticker', index: 2 });
  });

  it('do chaveiro de volta a um sticker: o sticker volta a ser o selecionado', () => {
    const charm = dragReducer(initialDragState, { type: 'focus-charm' });
    const sticker = dragReducer(charm, { type: 'focus-sticker', index: 0 });
    expect(ready(sticker, 2, true)).toEqual({ kind: 'sticker', index: 0 });
  });

  it('sair do bloco manda a seleção nula, e voltar ao bloco seleciona de novo', () => {
    const left = dragReducer(dragReducer(initialDragState, { type: 'focus-sticker', index: 1 }), {
      type: 'leave',
    });
    expect(ready(left, 3)).toBeNull();
    const back = dragReducer(left, { type: 'focus-sticker', index: 1 });
    expect(ready(back, 3)).toEqual({ kind: 'sticker', index: 1 });
  });

  it('sair do bloco antes do 3D ficar pronto também vale', () => {
    const left = dragReducer(initialDragState, { type: 'leave' });
    expect(ready(left, 3)).toBeNull();
  });

  it('um sticker novo é selecionado, mesmo depois de sair do bloco', () => {
    const left = dragReducer(initialDragState, { type: 'leave' });
    const added = dragReducer(left, { type: 'sticker-added', index: 3 });
    expect(ready(added, 4)).toEqual({ kind: 'sticker', index: 3 });
  });

  it('o sticker removido deixa a seleção no vizinho; sem stickers, nula', () => {
    const last = dragReducer(initialDragState, { type: 'focus-sticker', index: 2 });
    const removed = dragReducer(last, { type: 'sticker-removed', index: 2 });
    expect(ready(removed, 2)).toEqual({ kind: 'sticker', index: 1 });
    const none = dragReducer(removed, { type: 'sticker-removed', index: 1 });
    expect(ready(none, 0)).toBeNull();
  });

  it('remover um sticker antes do selecionado mantém o mesmo sticker selecionado', () => {
    const third = dragReducer(initialDragState, { type: 'focus-sticker', index: 2 });
    const removed = dragReducer(third, { type: 'sticker-removed', index: 0 });
    expect(ready(removed, 2)).toEqual({ kind: 'sticker', index: 1 });
  });

  it('remover o chaveiro desfaz a seleção dele', () => {
    const charm = dragReducer(initialDragState, { type: 'focus-charm' });
    const removed = dragReducer(charm, { type: 'charm-removed' });
    expect(ready(removed, 0, false)).toBeNull();
  });

  it('um índice além do que existe (rascunho ou resposta atrasada) é ignorado', () => {
    const stale = dragReducer(initialDragState, { type: 'focus-sticker', index: 4 });
    expect(ready(stale, 2)).toBeNull();
  });
});
