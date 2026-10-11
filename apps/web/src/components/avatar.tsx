import { cn } from '@/lib/utils';

function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '')
    .join('');
  return letters.toLocaleUpperCase('pt-BR') || '?';
}

/**
 * Avatar Steam da Conta num círculo de superfície. Sem avatar (a Steam ainda não respondeu),
 * as iniciais do Nome de exibição no mesmo círculo. `alt` vazio quando o nome já está ao lado.
 */
export function Avatar({
  src,
  name,
  size,
  alt = '',
  className,
}: {
  src: string | null;
  name: string;
  size: number;
  alt?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'relative inline-grid size-(--avatar-size) shrink-0 place-items-center overflow-hidden rounded-full bg-surface-2 font-semibold text-foreground select-none',
        className,
      )}
      // O tamanho vem por variável: uma classe (ex.: max-md:[--avatar-size:72px]!) ainda pode trocá-lo.
      style={
        {
          '--avatar-size': `${size}px`,
          fontSize: `calc(var(--avatar-size) * 0.38)`,
        } as React.CSSProperties
      }
    >
      {src ? (
        // Avatar da Steam: imagem pequena e externa, sem otimização (next.config: unoptimized).
        // biome-ignore lint/performance/noImgElement: o next/image não ganharia nada aqui.
        <img
          src={src}
          alt={alt}
          width={size}
          height={size}
          decoding="async"
          referrerPolicy="no-referrer"
          className="size-full object-cover"
        />
      ) : alt ? (
        <span role="img" aria-label={alt}>
          {initials(name)}
        </span>
      ) : (
        <span aria-hidden="true">{initials(name)}</span>
      )}
    </span>
  );
}
