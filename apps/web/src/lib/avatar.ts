/**
 * A foto de perfil própria no navegador (ADR 0022). Os schemas Zod do contrato vêm de
 * `@carmine/contracts/avatar` e só são baixados quando uma resposta da API precisa ser lida (a seção de
 * Configurações e as telas de denúncia); o `Avatar`, que está em toda página, usa só `avatar-url`.
 */

export const loadAvatarContracts = () => import('@carmine/contracts/avatar');

/** A foto própria termina em `/avatars/<id>/<tamanho>.webp` (a mesma regra de `avatar-url`); a da Steam, nunca. */
const CUSTOM_AVATAR = /\/avatars\/[0-9a-f-]{36}\/\d+\.webp$/;

/** O avatar efetivo de um Perfil é uma foto própria (e não a da Steam)? */
export function isCustomAvatarUrl(url: string | null | undefined): boolean {
  return !!url && CUSTOM_AVATAR.test(url);
}

/** O arquivo escolhido pode ter até este tamanho e esta área (o corpo à API é só o recorte, até 1 MiB). */
export const AVATAR_PICK_MAX_BYTES = 10 * 1024 * 1024;
export const AVATAR_PICK_MAX_PIXELS = 40_000_000;

/** Formatos aceitos na escolha do arquivo (os mesmos do envio). */
export const AVATAR_PICK_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type PickProblem = 'type' | 'bytes' | 'pixels';

/** Confere o arquivo escolhido antes de qualquer rede; o servidor confere de novo pelos bytes. */
export function pickProblem(
  file: { type: string; size: number },
  size?: { width: number; height: number },
): PickProblem | null {
  if (!(AVATAR_PICK_TYPES as readonly string[]).includes(file.type)) return 'type';
  if (file.size > AVATAR_PICK_MAX_BYTES) return 'bytes';
  if (size && size.width * size.height > AVATAR_PICK_MAX_PIXELS) return 'pixels';
  return null;
}

/** O recorte, na imagem original: o canto de cima à esquerda e o lado do quadrado (em px). */
export interface NaturalCrop {
  x: number;
  y: number;
  side: number;
}

/**
 * O recorte feito na tela (em px da imagem mostrada, já com o zoom aplicado ao redor do centro) vira o quadrado
 * na imagem original. `zoom` 1 é a imagem inteira dentro da caixa; maior que 1 aproxima.
 */
export function naturalCrop(
  crop: { x: number; y: number; width: number },
  shown: { width: number; height: number },
  natural: { width: number; height: number },
  zoom: number,
): NaturalCrop {
  const toNaturalX = natural.width / shown.width;
  const toNaturalY = natural.height / shown.height;
  const centerX = natural.width / 2;
  const centerY = natural.height / 2;
  return {
    x: centerX + (crop.x * toNaturalX - centerX) / zoom,
    y: centerY + (crop.y * toNaturalY - centerY) / zoom,
    side: (crop.width * toNaturalX) / zoom,
  };
}

/** Lado da foto enviada: até 512 px, e nunca acima do que o recorte tem de verdade; abaixo de `min`, não dá. */
export function outputSide(naturalSide: number, min: number, preferred = 512): number | null {
  const side = Math.floor(Math.min(naturalSide, preferred));
  return side >= min ? side : null;
}
