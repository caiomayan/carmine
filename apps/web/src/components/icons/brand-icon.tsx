import type { SimpleIcon } from 'simple-icons';
import { cn } from '@/lib/utils';

/**
 * Marca do Simple Icons (CC0 como desenho; o uso segue as diretrizes de cada empresa).
 * Monocromática em currentColor: a Liberty não usa as cores das marcas.
 */
export function BrandIcon({
  icon,
  size = 16,
  className,
}: {
  icon: SimpleIcon;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={cn('shrink-0', className)}
    >
      <path d={icon.path} />
    </svg>
  );
}
