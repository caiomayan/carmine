import type { SanctionType, StaffRole } from '@carmine/contracts';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

const tagClass =
  'inline-flex min-h-5 shrink-0 items-center gap-1.5 rounded-xs px-1.5 text-[11px] font-semibold';

/** Papel de Staff: etiqueta neutra (papel não é estado, não ganha cor). */
export function RoleTag({ role, className }: { role: StaffRole; className?: string }) {
  const t = useTranslations('staff.roles');
  return (
    <span data-testid="role-tag" className={cn(tagClass, 'bg-surface-2', className)}>
      {t(role)}
    </span>
  );
}

/** Tipos das Punições em vigor (ban, mute, gag): o ponto de erro é o único sinal de cor. */
export function SanctionTypeTags({ types }: { types: SanctionType[] }) {
  const t = useTranslations('moderation.types');
  const unique = [...new Set(types)];
  if (unique.length === 0) return null;
  return (
    <>
      {unique.map((type) => (
        <span key={type} data-sanction={type} className={cn(tagClass, 'bg-status-danger/12')}>
          <span aria-hidden="true" className="size-1.5 rounded-full bg-status-danger" />
          {t(type)}
        </span>
      ))}
    </>
  );
}
