import type { CSSProperties } from 'react';
import { Avatar } from '@/components/avatar';
import { cn } from '@/lib/utils';

/**
 * Presença ("jogando agora") nas telas: um pontinho no canto do avatar e, ao lado do nome, um chip
 * com o texto. Sem anel em volta do avatar: o ponto leva só um recorte na cor do fundo para se
 * separar da imagem. O estado sempre vem escrito (o chip, ou o texto só para leitor de tela do
 * ponto): a cor sozinha não diz nada.
 */

/** O avatar com o pontinho no canto de cima, à direita (na borda do círculo, a 45°). */
export function PresenceAvatar({
  playing,
  label,
  size,
  ...avatar
}: {
  playing: boolean;
  /** "Jogando agora": lido pelo leitor de tela quando o chip não está ao lado. */
  label: string;
  src: string | null;
  name: string;
  size: number;
  alt?: string;
  className?: string;
}) {
  if (!playing) return <Avatar size={size} {...avatar} />;
  const dot = Math.max(9, Math.round(size * 0.26));
  return (
    <span
      className="relative inline-flex shrink-0"
      style={{ '--presence-dot': `${dot}px` } as CSSProperties}
    >
      <Avatar size={size} {...avatar} />
      <span
        aria-hidden="true"
        className="absolute top-[7%] right-[7%] size-(--presence-dot) translate-x-1/3 -translate-y-1/3 rounded-full bg-status-online shadow-[0_0_0_2px_var(--bg)]"
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** O chip ao lado do nome: o ponto de presença e o texto. */
export function PresenceChip({ children, className }: { children: string; className?: string }) {
  return (
    <span
      data-testid="presence-chip"
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full bg-status-online/15 px-2 py-0.5 text-caption leading-tight font-semibold text-foreground',
        className,
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-status-online" />
      {children}
    </span>
  );
}
