import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

/** Iniciais das duas primeiras palavras (ou dos primeiros caracteres de um nome sem espaço). */
function initials(name: string): string {
  const parts = name.replace(/[._-]+/g, ' ').trim().split(/\s+/);
  const letters = parts
    .slice(0, 2)
    .map((p) => Array.from(p)[0] ?? '')
    .join('');
  return letters.toLocaleUpperCase('pt-BR') || '?';
}

/**
 * Avatar do protótipo: um disco com a cor do jogador (matiz fixo por nome) e as iniciais. Os dados de
 * exemplo não têm foto da Steam; no produto entra o `Avatar` de verdade. `live` põe o anel de "jogando".
 */
export function Face({
  name,
  hue,
  size = 36,
  live = false,
  className,
}: {
  name: string;
  hue: number;
  size?: number;
  live?: boolean;
  className?: string;
}) {
  const style = {
    width: size,
    height: size,
    fontSize: size * 0.38,
    background: `linear-gradient(150deg, hsl(${hue} 78% 52%), hsl(${(hue + 38) % 360} 70% 32%))`,
  } as CSSProperties;
  return (
    <span
      aria-hidden="true"
      style={style}
      className={cn(
        'relative inline-grid shrink-0 place-items-center rounded-full font-bold text-white select-none',
        live && 'ring-2 ring-status-online ring-offset-2 ring-offset-(--surface)',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
