import { AVATAR_SIZES, type AvatarSize } from '@carmine/contracts';

/** Chave de um tamanho no bucket público (servido pela CDN). */
export const avatarPublicKey = (id: string, size: AvatarSize): string =>
  `avatars/${id}/${size}.webp`;

/** Chave de um tamanho no bucket privado, onde fica a foto que saiu do ar. */
export const avatarPrivateKey = (id: string, size: AvatarSize): string =>
  `removed/${id}/${size}.webp`;

/** Todos os arquivos de uma foto, para apagar de vez (públicos com purga da CDN, privados sem). */
export function avatarDeletions(id: string) {
  return [
    ...AVATAR_SIZES.map((size) => ({
      bucket: 'public' as const,
      key: avatarPublicKey(id, size),
      purge: true,
    })),
    ...AVATAR_SIZES.map((size) => ({
      bucket: 'private' as const,
      key: avatarPrivateKey(id, size),
      purge: false,
    })),
  ];
}
