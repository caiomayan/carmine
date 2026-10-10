import { type SimpleIcon, siDiscord, siInstagram, siX, siYoutube } from 'simple-icons';

export type SocialId = 'discord' | 'instagram' | 'x' | 'youtube';
export type SocialLink = { id: SocialId; icon: SimpleIcon; href: string };

type Env = Partial<Record<string, string | undefined>>;

/** Ordem do rodapé: o Discord é o canal da comunidade, as redes vêm depois. */
const NETWORKS: readonly { id: SocialId; icon: SimpleIcon; envKey: string }[] = [
  { id: 'discord', icon: siDiscord, envKey: 'NEXT_PUBLIC_DISCORD_URL' },
  { id: 'instagram', icon: siInstagram, envKey: 'NEXT_PUBLIC_INSTAGRAM_URL' },
  { id: 'x', icon: siX, envKey: 'NEXT_PUBLIC_X_URL' },
  { id: 'youtube', icon: siYoutube, envKey: 'NEXT_PUBLIC_YOUTUBE_URL' },
];

function httpsUrl(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' ? url.href.replace(/\/$/, '') : null;
  } catch {
    return null;
  }
}

/**
 * Redes da Carmine com endereço configurado (NEXT_PUBLIC_*_URL, lidas no build).
 * Rede sem endereço https válido não aparece: nunca há link morto no rodapé.
 */
export function socialLinks(env: Env): SocialLink[] {
  return NETWORKS.flatMap(({ id, icon, envKey }) => {
    const href = httpsUrl(env[envKey]);
    return href ? [{ id, icon, href }] : [];
  });
}

/** As redes do build atual. O Next só embute NEXT_PUBLIC_* lidas por nome literal. */
export const SOCIAL_LINKS = socialLinks({
  NEXT_PUBLIC_DISCORD_URL: process.env.NEXT_PUBLIC_DISCORD_URL,
  NEXT_PUBLIC_INSTAGRAM_URL: process.env.NEXT_PUBLIC_INSTAGRAM_URL,
  NEXT_PUBLIC_X_URL: process.env.NEXT_PUBLIC_X_URL,
  NEXT_PUBLIC_YOUTUBE_URL: process.env.NEXT_PUBLIC_YOUTUBE_URL,
});
