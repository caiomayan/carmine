import { PAYMENT_STATUSES } from '@carmine/contracts/payments';
import { staffCan } from '@carmine/contracts/staff';
import {
  staffCompensationOverviewSchema,
  staffPaymentPageSchema,
} from '@carmine/contracts/staff-payments';
import type { Route } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PaymentList } from '@/components/staff/payment-list';
import { PaymentOperations } from '@/components/staff/payment-operations';
import { getServerSession, readStaff } from '@/lib/api-server';
import { cn } from '@/lib/utils';

type SearchParams = Promise<Record<'status', string | string[] | undefined>>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? '';

const FILTERS = ['all', ...PAYMENT_STATUSES] as const;
type Filter = (typeof FILTERS)[number];

/** `queda-2026-10-27`: a chave sugerida para a compensação de hoje (data de Brasília). */
const suggestedKey = () =>
  `queda-${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())}`;

/**
 * Pagamentos da Staff (S14): a lista com filtro por estado (abas com a contagem de cada um), a ficha de
 * cada pagamento e as operações em lote (conciliar e compensar por indisponibilidade). Só o Dono e o Admin.
 */
export default async function StaffPaymentsPage({ searchParams }: { searchParams: SearchParams }) {
  const server = await getServerSession();
  const role = server.status === 'authenticated' ? server.session.staffRole : null;
  if (!staffCan(role, 'payments.manage')) notFound();
  const requested = first((await searchParams).status);
  const filter: Filter = (FILTERS as readonly string[]).includes(requested)
    ? (requested as Filter)
    : 'all';

  const [page, overview] = await Promise.all([
    readStaff(`/staff/payments?status=${filter}`, staffPaymentPageSchema),
    readStaff('/staff/payments/compensation', staffCompensationOverviewSchema),
  ]);
  if (page.status === 'forbidden' || page.status === 'anonymous') notFound();
  const t = await getTranslations('staff.payments');

  const total =
    page.status === 'ok' ? Object.values(page.data.counts).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="grid gap-10">
      <section
        aria-labelledby="pagamentos"
        className="grid animate-fade-up gap-5 [animation-delay:60ms]"
      >
        <div className="grid gap-1">
          <h2 id="pagamentos" className="text-lg font-semibold">
            {t('title')}
          </h2>
          <p className="text-body-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <nav aria-label={t('tabs.label')} className="-mx-3 flex gap-1 overflow-x-auto">
          {FILTERS.map((option) => {
            const count =
              page.status !== 'ok'
                ? null
                : option === 'all'
                  ? total
                  : (page.data.counts[option] ?? 0);
            return (
              <Link
                key={option}
                href={
                  (option === 'all'
                    ? '/staff/pagamentos'
                    : `/staff/pagamentos?status=${option}`) as Route
                }
                aria-current={option === filter ? 'page' : undefined}
                data-filter={option}
                className={cn(
                  'inline-flex min-h-(--tap) items-center gap-1.5 rounded-md bg-(--fill-rest) px-3 text-body-sm whitespace-nowrap transition-colors duration-(--dur-fast) ease-std hover:bg-(--fill-hover) motion-reduce:transition-none',
                  option === filter ? 'bg-(--fill-active) font-semibold' : 'text-muted-foreground',
                )}
              >
                {t(`tabs.${option}`)}
                {count !== null ? <span className="text-caption tabular-nums">{count}</span> : null}
              </Link>
            );
          })}
        </nav>
        {page.status === 'ok' ? (
          <PaymentList key={filter} initial={page.data} filter={filter} />
        ) : (
          <p role="alert" className="text-sm">
            {t('unavailable')}
          </p>
        )}
      </section>
      {overview.status === 'ok' ? (
        <PaymentOperations overview={overview.data} defaultKey={suggestedKey()} />
      ) : null}
    </div>
  );
}
