import type { ViewerSelection } from './viewer-api.client';

/**
 * Qual sticker ou chaveiro o 3D deixa arrastar. O viewer só arrasta o que está selecionado
 * (clique no objeto arrasta; fora dele, gira a arma) e a seleção só muda por mensagem, então o
 * editor seleciona sozinho, sem botão de modo: o primeiro sticker ao ficar pronto, o da linha
 * que ganha o foco, o novo sticker; o chaveiro só enquanto a linha dele tem o foco; nada ao
 * sair do bloco de stickers e chaveiro (aí o arrasto só gira a arma).
 */

export type DragState =
  | { phase: 'initial' }
  | { phase: 'sticker'; index: number }
  | { phase: 'charm' }
  | { phase: 'left' };

export type DragAction =
  | { type: 'focus-sticker'; index: number }
  | { type: 'focus-charm' }
  | { type: 'leave' }
  | { type: 'sticker-added'; index: number }
  | { type: 'sticker-removed'; index: number }
  | { type: 'charm-removed' };

export const initialDragState: DragState = { phase: 'initial' };

export function dragReducer(state: DragState, action: DragAction): DragState {
  switch (action.type) {
    case 'focus-sticker':
    case 'sticker-added':
      return { phase: 'sticker', index: action.index };
    case 'focus-charm':
      return { phase: 'charm' };
    case 'leave':
      return { phase: 'left' };
    case 'sticker-removed':
      if (state.phase !== 'sticker') return state;
      if (action.index < state.index) return { phase: 'sticker', index: state.index - 1 };
      // O removido era o selecionado: a seleção fica no vizinho (o índice é fixado em
      // `selectionFor` ao último que sobrou).
      return state;
    case 'charm-removed':
      return state.phase === 'charm' ? { phase: 'left' } : state;
  }
}

/** O que mandar ao viewer (`setSelection`) para este estado. */
export function selectionFor(
  state: DragState,
  { ready, stickers, hasCharm }: { ready: boolean; stickers: number; hasCharm: boolean },
): ViewerSelection {
  if (!ready) return null;
  switch (state.phase) {
    case 'initial':
      return stickers > 0 ? { kind: 'sticker', index: 0 } : null;
    case 'sticker':
      if (state.index < stickers) return { kind: 'sticker', index: state.index };
      // Removeu o selecionado (o último da lista): cai no que ficou por último.
      return state.index === stickers && stickers > 0
        ? { kind: 'sticker', index: stickers - 1 }
        : null;
    case 'charm':
      return hasCharm ? { kind: 'keychain', index: 0 } : null;
    case 'left':
      return null;
  }
}
