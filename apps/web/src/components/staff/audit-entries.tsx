'use client';

import type { StaffActor, StaffAuditEntry } from '@carmine/contracts';
import type { Route } from 'next';
import Link from 'next/link';
import { useFormatter, useNow, useTranslations } from 'next-intl';

function ActorName({ actor }: { actor: StaffActor }) {
  if (actor.publicId === null) return <span className="tabular-nums">{actor.steamId}</span>;
  return (
    <Link
      href={`/staff/contas/${actor.publicId}` as Route}
      className="font-semibold underline decoration-line-strong underline-offset-[3px] hover:decoration-foreground"
    >
      {actor.displayName ?? `#${actor.publicId}`}
    </Link>
  );
}

/**
 * Linhas do log de auditoria: quando, quem, o quê, em quem e por quê. `showTarget` some na ficha
 * da Conta (o alvo é a própria Conta).
 */
export function AuditEntries({
  entries,
  showTarget = true,
}: {
  entries: StaffAuditEntry[];
  showTarget?: boolean;
}) {
  const t = useTranslations('staff.audit');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  return (
    <ol className="grid" data-testid="audit-entries">
      {entries.map((entry) => (
        <li
          key={entry.id}
          data-action={entry.action}
          className="grid gap-1 border-b border-line/60 py-3 text-[13.5px] last:border-b-0"
        >
          <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            <ActorName actor={entry.actor} />
            <span>{t(`actions.${entry.action}`)}</span>
            {showTarget && entry.targetAccount ? (
              entry.targetAccount.publicId !== null ? (
                <Link
                  href={`/staff/contas/${entry.targetAccount.publicId}` as Route}
                  className="font-semibold underline decoration-line-strong underline-offset-[3px] hover:decoration-foreground"
                >
                  {entry.targetAccount.displayName ?? `#${entry.targetAccount.publicId}`}
                </Link>
              ) : (
                <span className="text-muted-foreground">{t('deleted')}</span>
              )
            ) : null}
            {showTarget && entry.targetServer ? (
              <span className="font-semibold">{entry.targetServer.name}</span>
            ) : null}
            <time
              dateTime={entry.createdAt}
              title={format.dateTime(new Date(entry.createdAt), {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
              className="ml-auto text-[12px] whitespace-nowrap text-muted-foreground"
              suppressHydrationWarning
            >
              {format.relativeTime(new Date(entry.createdAt), now)}
            </time>
          </p>
          <p className="text-[13px] text-muted-foreground [overflow-wrap:anywhere]">
            {entry.reason}
          </p>
        </li>
      ))}
    </ol>
  );
}
