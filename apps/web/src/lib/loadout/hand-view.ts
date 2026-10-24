import type { LoadoutSide } from '@carmine/contracts';
import type { Rarity } from '../catalog/types';

/**
 * O que a mão de Presets recebe do servidor: cada Preset como uma carta, com a frente já
 * resolvida pelo catálogo (nome e imagem). Tipos sem dependência da cs2-lib, para o cliente.
 */

/** Uma peça da frente da carta: o Item equipado, ou a arma padrão do jogo (`uid` nulo). */
export type HandPiece = {
  uid: string | null;
  /** O nome inteiro, para o leitor de tela. */
  name: string;
  image: string;
  /** Nulo na arma padrão. */
  rarity: Rarity | null;
  statTrak: boolean;
};

/** A frente da carta num lado: a faca, as luvas e o rifle desse lado. */
export type HandFront = { knife: HandPiece; gloves: HandPiece; rifle: HandPiece };

export type HandCard = {
  id: string;
  name: string;
  main: boolean;
  active: boolean;
  readOnly: boolean;
  /** Slots com Item. */
  equippedCount: number;
  front: Record<LoadoutSide, HandFront>;
};
