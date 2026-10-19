import { reportStatusSchema, staffCan, staffReportPageSchema } from '@carmine/contracts';
import type { Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ReportQueue } from '@/components/staff/report-queue';
import { getServerSession, readStaff } from '@/lib/api-server';
import { cn } from '@/lib/utils';

type SearchParams = Promise<Record<'status', string | string[] | undefined>>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? '';

/**
 * Fila de Denúncias (S13): as abertas, das mais antigas (o prazo de 72 h corre desde a primeira),
 * com o chat do momento, o servidor e o round; arquivadas e punidas ficam em abas.
 */
export default async function StaffReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const server = await getServerSession();
  const role = server.status === 'authenticated' ? server.session.staffRole : null;
  if (!staffCan(role, 'reports.handle')) notFound();
  const parsed = reportStatusSchema.safeParse(first((await searchParams).status));
  const status = parsed.success ? parsed.data : 'open';
  const result = await readStaff(`/staff/reports?status=${status}`, staffReportPageSchema);
  if (result.status === 'forbidden' || result.status === 'anonymous') notFound();
  const t = await getTranslations('staff.reports');

  return (
    <section
      aria-labelledby="denuncias"
      className="grid animate-fade-up gap-5 [animation-delay:60ms]"
    >
      <div className="grid gap-1">
        <h2 id="denuncias" className="text-lg font-semibold">
          {t('title')}
        </h2>
        <p className="text-[13px] text-muted-foreground">
          {result.status === 'ok'
            ? t('subtitle', { count: result.data.openCount })
            : t('subtitleBare')}
        </p>
      </div>
      <nav aria-label={t('tabs.label')} className="-mx-3 flex gap-1 overflow-x-auto">
        {reportStatusSchema.options.map((option) => (
          <Link
            key={option}
            href={
              (option === 'open'
                ? '/staff/denuncias'
                : `/staff/denuncias?status=${option}`) as Route
            }
            aria-current={option === status ? 'page' : undefined}
            className={cn(
              'rounded-sm px-3 py-1.5 text-[13.5px] whitespace-nowrap hover:bg-surface-2',
              option === status ? 'bg-surface-2 font-semibold' : 'text-muted-foreground',
            )}
          >
            {t(`tabs.${option}`)}
          </Link>
        ))}
      </nav>
      {result.status === 'ok' ? (
        <ReportQueue key={status} initial={result.data} status={status} />
      ) : (
        <p role="alert" className="text-sm">
          {(await getTranslations('staff'))('unavailable')}
        </p>
      )}
    </section>
  );
}
