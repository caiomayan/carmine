import type { Profile } from '@carmine/contracts';
import type { Metadata } from 'next';

/**
 * Nenhum Perfil vai para os buscadores (decisão do dono, 2026-10-13; Política de Privacidade,
 * seção 4); o link continua compartilhável, com a prévia do Open Graph.
 */
const NOINDEX: Metadata['robots'] = { index: false, follow: false };

/**
 * A prévia do link de um Perfil (Open Graph e Twitter): só nome, ID público e avatar, os mesmos
 * dados que o Perfil privado mantém públicos. Recebe apenas esses campos de propósito: as
 * Estatísticas (S12) não entram na prévia, e o Perfil privado jamais as mostraria. Se um dia a
 * prévia ganhar números, eles passam por `canSeeStats` da API (Perfil privado = sem números).
 */
export function profileMetadata(
  profile: Pick<Profile, 'publicId' | 'displayName' | 'avatarUrl' | 'isPrivate'>,
  description: string,
): Metadata {
  const title = `${profile.displayName} · #${profile.publicId}`;
  const images = profile.avatarUrl ? [{ url: profile.avatarUrl, alt: '' }] : undefined;
  return {
    title,
    description,
    robots: NOINDEX,
    alternates: { canonical: `/${profile.publicId}` },
    openGraph: { type: 'profile', title, description, images, siteName: 'Carmine' },
    twitter: { card: 'summary', title, description, images },
  };
}

export { NOINDEX };
