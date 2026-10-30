'use client';

import type { ReportStatus, StaffReport, StaffReportPage } from '@carmine/contracts';
import { REPORT_REASON_LABELS, staffReportPageSchema } from '@carmine/contracts/reports';
import type { Route } from 'next';
import Link from 'next/link';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ActionForm } from './action-form';
import { FieldError } from './fields';
import { useStaffRequest } from './use-staff-request';

const personLink =
  'font-semibold underline decoration-line-strong underline-offset-(--underline-offset) hover:decoration-foreground';

/** A fila de Denúncias, de página em página (cursor `before`). */
export function ReportQueue({
  initial,
  status,
}: {
  initial: StaffReportPage;
  status: ReportStatus;
}) {
  const t = useTranslations('staff.reports');
  const [reports, setReports] = useState<StaffReport[]>(initial.reports);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const loadMore = async () => {
    if (!cursor) return;
    setLoading(true);
    setFailed(false);
    try {
      const response = await fetch(
        `/api/staff/reports?${new URLSearchParams({ status, before: cursor })}`,
        { cache: 'no-store' },
      );
      if (!response.ok) throw new Error(String(response.status));
      const page = staffReportPageSchema.parse(await response.json());
      setReports((current) => [...current, ...page.reports]);
      setCursor(page.nextCursor);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  if (reports.length === 0) {
    return (
      <p className="text-body-sm text-muted-foreground" data-testid="reports-empty">
        {t(`empty.${status}`)}
      </p>
    );
  }

  return (
    <div className="grid gap-5">
      <ol className="grid gap-5" data-testid="report-queue">
        {reports.map((report) => (
          <li key={report.id}>
            <ReportCard
              report={report}
              onArchived={(id) => setReports((current) => current.filter((r) => r.id !== id))}
            />
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-3" role="status">
        {cursor ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={loadMore}
            disabled={loading}
            aria-busy={loading || undefined}
          >
            {t('loadMore')}
          </Button>
        ) : (
          <p className="text-body-sm text-muted-foreground">{t('end')}</p>
        )}
        {failed ? <FieldError>{t('loadFailed')}</FieldError> : null}
      </div>
    </div>
  );
}

function ReportCard({
  report,
  onArchived,
}: {
  report: StaffReport;
  onArchived: (id: string) => void;
}) {
  const t = useTranslations('staff.reports');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const { request } = useStaffRequest();
  const at = new Date(report.createdAt);
  const open = report.status === 'open';

  return (
    <article
      aria-label={t('cardLabel', { name: report.target.displayName })}
      data-report-id={report.id}
      data-reason={report.reason}
      className="grid gap-4 rounded-xl bg-surface p-4"
    >
      <header className="grid gap-1">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="inline-flex min-h-5 items-center rounded-xs bg-surface-2 px-1.5 text-[11px] font-semibold">
            {REPORT_REASON_LABELS[report.reason]}
          </span>
          {report.count > 1 ? (
            <span className="inline-flex min-h-5 items-center rounded-xs bg-surface-2 px-1.5 text-[11px] font-semibold">
              {t('caseCount', { count: report.count })}
            </span>
          ) : null}
          <Link href={`/staff/contas/${report.target.publicId}` as Route} className={personLink}>
            {report.target.displayName}
          </Link>
          <span className="text-body-sm text-muted-foreground tabular-nums">
            #{report.target.publicId}
          </span>
          <time
            dateTime={report.createdAt}
            title={format.dateTime(at, { dateStyle: 'medium', timeStyle: 'short' })}
            className="ml-auto text-caption whitespace-nowrap text-muted-foreground"
            suppressHydrationWarning
          >
            {format.relativeTime(at, now)}
          </time>
        </p>
        <p className="text-body-sm text-muted-foreground">
          {[
            report.server ? (report.server.code ?? report.server.name) : t('serverUnknown'),
            report.map,
            report.round === null ? null : t('round', { round: report.round }),
          ]
            .filter(Boolean)
            .join(' · ')}
          {' · '}
          {report.reporter ? (
            <>
              {t('reportedBy')}{' '}
              <Link
                href={`/staff/contas/${report.reporter.publicId}` as Route}
                className={personLink}
              >
                {report.reporter.displayName}
              </Link>
            </>
          ) : (
            t('reporterGone')
          )}
        </p>
        {open && report.otherOpenAgainstTarget > 0 ? (
          <p className="text-body-sm font-semibold" data-testid="report-others">
            {t('others', { count: report.otherOpenAgainstTarget })}
          </p>
        ) : null}
      </header>

      {report.needsEvidence ? (
        <p className="rounded-xl bg-surface-2 px-3 py-2 text-body-sm" data-testid="report-evidence">
          {t('needsEvidence')}
        </p>
      ) : null}

      <ReportChat report={report} />

      {open ? (
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href={`/staff/contas/${report.target.publicId}` as Route}>
                {t('openAccount')}
              </Link>
            </Button>
            <Button asChild variant="primary" size="sm">
              <Link
                href={
                  `/staff/contas/${report.target.publicId}?denuncia=${report.id}&evidencia=${report.needsEvidence ? 1 : 0}#aplicar` as Route
                }
              >
                {t('sanction')}
              </Link>
            </Button>
          </div>
          <ActionForm
            collapsed
            label={t('archive.open')}
            submitLabel={t('archive.submit')}
            doneLabel={t('archive.done')}
            testId="archive-report"
            onSubmit={async (reason) => {
              const result = await request(
                `/api/staff/reports/${report.id}/archive`,
                'POST',
                { reason },
                { parse: () => undefined },
              );
              if (result.ok) onArchived(report.id);
              return result;
            }}
          />
        </div>
      ) : report.resolution ? (
        <p className="text-body-sm text-muted-foreground" data-testid="report-resolution">
          {report.status === 'sanctioned'
            ? t('resolution.sanctioned', { name: report.resolution.by.displayName ?? '—' })
            : t('resolution.archived', {
                name: report.resolution.by.displayName ?? '—',
                reason: report.resolution.reason ?? '',
              })}
        </p>
      ) : null}
    </article>
  );
}

/** O chat do momento: as linhas do denunciado em destaque, o resto como contexto. */
function ReportChat({ report }: { report: StaffReport }) {
  const t = useTranslations('staff.reports');
  const format = useFormatter();
  if (report.chat.length === 0) {
    return <p className="text-body-sm text-muted-foreground">{t('chat.empty')}</p>;
  }
  return (
    <div className="grid gap-1.5">
      <h3 className="text-caption font-semibold tracking-wide text-muted-foreground uppercase">
        {t('chat.title', { count: report.chat.length })}
      </h3>
      <ol
        className="grid max-h-64 gap-0.5 overflow-y-auto rounded-xl bg-surface-2 p-2 text-body-sm"
        data-testid="report-chat"
      >
        {report.chat.map((line, index) => (
          <li
            // O chat não tem ID próprio na cópia; a posição é estável.
            // biome-ignore lint/suspicious/noArrayIndexKey: lista fixa, sem reordenação
            key={index}
            data-from-target={line.fromTarget || undefined}
            className={cn(
              'grid grid-cols-[auto_minmax(0,1fr)] gap-x-2',
              line.fromTarget && 'font-semibold',
            )}
          >
            <time
              dateTime={line.at}
              className="text-[11.5px] font-normal text-muted-foreground tabular-nums"
              suppressHydrationWarning
            >
              {format.dateTime(new Date(line.at), { timeStyle: 'medium' })}
            </time>
            <span className="[overflow-wrap:anywhere]">
              <span className="text-muted-foreground">
                {line.teamChat ? `(${t('chat.team')}) ` : ''}
                {line.displayName}:
              </span>{' '}
              {line.text}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
