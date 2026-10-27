import { staffCan } from '@carmine/contracts/staff';
import { staffAvatarCasePageSchema } from '@carmine/contracts/avatar';
import type { Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AvatarQueue } from '@/components/staff/avatar-queue';
import { getServerSession, readStaff } from '@/lib/api-server';
import { cn } from '@/lib/utils';

type SearchParams = Promise<Record<'status', string | string[] | undefined>>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? '';

const STATUSES = ['open', 'decided'] as const;

/**
 * Fila de denúncias de foto de perfil (ADR 0022): as fotos em análise, das mais antigas (o prazo de 24 h corre desde
 * a primeira denúncia), com a imagem, os motivos e o histórico da Conta; manter ou remover; as decididas ficam em outra aba.
 */
export default async function StaffPhotosPage({ searchParams }: { searchParams: SearchParams }) {
  const server = await getServerSession();
  const role = server.status === 'authenticated' ? server.session.staffRole : null;
  if (!staffCan(role, 'avatars.moderate')) notFound();
  const requested = first((await searchParams).status);
  const status = requested === 'decided' ? 'decided' : 'open';
  const result = await readStaff(
    `/staff/avatar-reports?status=${status}`,
    staffAvatarCasePageSchema,
  );
  if (result.status === 'forbidden' || result.status === 'anonymous') notFound();
  const t = await getTranslations('staff.photos');

  return (
    <section aria-labelledby="fotos" className="grid animate-fade-up gap-5 [animation-delay:60ms]">
      <div className="grid gap-1">
        <h2 id="fotos" className="text-lg font-semibold">
          {t('title')}
        </h2>
        <p className="text-body-sm text-muted-foreground">
          {result.status === 'ok'
            ? t('subtitle', { count: result.data.openCount })
            : t('subtitleBare')}
        </p>
      </div>
      <nav aria-label={t('tabs.label')} className="-mx-3 flex gap-1 overflow-x-auto">
        {STATUSES.map((option) => (
          <Link
            key={option}
            href={(option === 'open' ? '/staff/fotos' : `/staff/fotos?status=${option}`) as Route}
            aria-current={option === status ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-(--tap) items-center rounded-md bg-(--fill-rest) px-3 text-body-sm whitespace-nowrap transition-colors duration-(--dur-fast) ease-std hover:bg-(--fill-hover)',
              option === status ? 'bg-(--fill-active) font-semibold' : 'text-muted-foreground',
            )}
          >
            {t(`tabs.${option}`)}
          </Link>
        ))}
      </nav>
      {result.status === 'ok' ? (
        <AvatarQueue key={status} initial={result.data} status={status} />
      ) : (
        <p role="alert" className="text-sm">
          {(await getTranslations('staff'))('unavailable')}
        </p>
      )}
    </section>
  );
}
