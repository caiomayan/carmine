/**
 * Cosméticos do Perfil (protótipo "vida"): as 8 molduras de avatar e o formato do chaveiro escolhido.
 * Tudo local ao protótipo: a escolha mora no navegador (ver store.ts); no produto viria da Conta.
 */

export type FrameTier = 'free' | 'earned' | 'vip';

export type FrameId =
  | 'aco'
  | 'grafite'
  | 'fundador'
  | 'ouro'
  | 'fumaca'
  | 'molotov'
  | 'doppler'
  | 'c4';

export type FrameInfo = {
  id: FrameId;
  name: string;
  tier: FrameTier;
  /** Uma linha para a tela de escolha. */
  blurb: string;
  /** Conquistadas: como se ganha (aparece com o cadeado e depois de ganha). */
  unlock?: string;
};

export const FRAMES: readonly FrameInfo[] = [
  { id: 'aco', name: 'Aço escovado', tier: 'free', blurb: 'Metal escovado, discreto.' },
  { id: 'grafite', name: 'Grafite', tier: 'free', blurb: 'Placa escura com ranhuras.' },
  {
    id: 'fundador',
    name: 'Fundador do beta',
    tier: 'earned',
    blurb: 'Bronze com rebites e o β.',
    unlock: 'Quem entrou no beta do Carmine.',
  },
  {
    id: 'ouro',
    name: 'Ouro do top 1',
    tier: 'earned',
    blurb: 'Ouro com coroa, para o 1º da semana.',
    unlock: 'Fique em 1º no Ranking de uma semana.',
  },
  {
    id: 'fumaca',
    name: 'Fumaça de granada',
    tier: 'vip',
    blurb: 'Uma nuvem gira em volta da borda.',
  },
  {
    id: 'molotov',
    name: 'Molotov',
    tier: 'vip',
    blurb: 'Chamas lambem a borda.',
  },
  {
    id: 'doppler',
    name: 'Doppler Rubi e Safira',
    tier: 'vip',
    blurb: 'Acabamento metálico com brilho.',
  },
  {
    id: 'c4',
    name: 'C4',
    tier: 'vip',
    blurb: 'LED piscando e fios soltos.',
  },
];

export const FRAME_BY_ID = Object.fromEntries(FRAMES.map((frame) => [frame.id, frame])) as Record<
  FrameId,
  FrameInfo
>;

/** Um chaveiro do Inventário (a imagem vem do catálogo da cs2-lib). */
export type CharmPick = {
  id: number;
  name: string;
  image: string;
};

/** Escolha de uma pessoa: a moldura e o chaveiro (nulos = sem). */
export type Cosmetics = {
  frame: FrameId | null;
  charm: CharmPick | null;
};

/** As conquistadas que a Conta de exemplo já tem (o Ouro fica trancado para mostrar o cadeado). */
export const EARNED: readonly FrameId[] = ['fundador'];
