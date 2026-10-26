/**
 * A URL de cada tamanho da foto de perfil (ADR 0022). Fica num módulo próprio, sem Zod e sem as
 * regras do envio (`avatar-rules.ts`): o `Avatar` do web, que está em todas as páginas, importa só
 * daqui (`@carmine/contracts/avatar-url`), e o orçamento de JS não paga pelo resto.
 */

/** Os tamanhos (px) gerados de cada foto, em WebP: listas, menu, Perfil no celular e no desktop. */
export const AVATAR_SIZES = [64, 128, 256, 512] as const;
export type AvatarSize = (typeof AVATAR_SIZES)[number];

/** A URL pública da foto própria termina em `/avatars/<id>/<tamanho>.webp`. */
const AVATAR_URL = /\/avatars\/([0-9a-f-]{36})\/(\d+)\.webp$/;

/**
 * A URL de um tamanho da foto. A foto própria troca o sufixo pelo menor tamanho gerado que
 * cobre `px` (use o tamanho do elemento vezes a densidade de tela); a da Steam passa intacta.
 */
export function avatarVariantUrl(url: string, px: number): string {
  const match = AVATAR_URL.exec(url);
  if (!match) return url;
  const size = AVATAR_SIZES.find((candidate) => candidate >= px) ?? AVATAR_SIZES.at(-1);
  return url.replace(AVATAR_URL, `/avatars/${match[1]}/${size}.webp`);
}
