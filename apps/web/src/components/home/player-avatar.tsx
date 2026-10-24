import { Avatar } from '@/components/avatar';
import { StatusDot } from '@/components/status-dot';
import { cn } from '@/lib/utils';

/**
 * O avatar padrão do site (foto da Steam ou as iniciais), sem moldura. Quem está jogando agora leva um pontinho
 * verde no canto (o texto "Jogando agora" vem ao lado, nunca só a cor).
 */
export function PlayerAvatar({
  src,
  name,
  size,
  playing = false,
  alt = '',
  className,
}: {
  src: string | null;
  name: string;
  size: number;
  playing?: boolean;
  /** O nome para o leitor de tela; vazio quando o nome já está escrito ao lado. */
  alt?: string;
  className?: string;
}) {
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      <Avatar src={src} name={name} size={size} alt={alt} />
      {playing ? (
        <span className="absolute -right-px -bottom-px grid place-items-center rounded-full bg-background p-[2px]">
          <StatusDot tone="online" pulse />
        </span>
      ) : null}
    </span>
  );
}
