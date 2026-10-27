'use client';

import {
  AVATAR_REASON_LABELS,
  AVATAR_REVIEW_DEADLINE_HOURS,
  type StaffAvatarCase,
  type StaffAvatarCasePage,
  staffAvatarCasePageSchema,
} from '@carmine/contracts/avatar';
import type { Route } from 'next';
import Link from 'next/link';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { KeepAvatarForm, RemoveAvatarForm } from './avatar-decision';
import { FieldError } from './fields';

const personLink =
  'font-semibold underline decoration-line-strong underline-offset-(--underline-offset) hover:decoration-foreground';

const HOUR_MS = 60 * 60 * 1000;

/** A fila de denúncias de foto de perfil, de página em página (cursor `before`). */
export function AvatarQueue({
  initial,
  status,
}: {
  initial: StaffAvatarCasePage;
  status: 'open' | 'decided';
}) {
  const t = useTranslations('staff.photos');
  const [cases, setCases] = useState<StaffAvatarCase[]>(initial.cases);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const loadMore = async () => {
    if (!cursor) return;
    setLoading(true);
    setFailed(false);
    try {
      const response = await fetch(
        `/api/staff/avatar-reports?${new URLSearchParams({ status, before: cursor })}`,
        { cache: 'no-store' },
      );
      if (!response.ok) throw new Error(String(response.status));
      const page = staffAvatarCasePageSchema.parse(await response.json());
      setCases((current) => [...current, ...page.cases]);
      setCursor(page.nextCursor);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  if (cases.length === 0) {
    return (
      <p className="text-body-sm text-muted-foreground" data-testid="photos-empty">
        {t(`empty.${status}`)}
      </p>
    );
  }

  return (
    <div className="grid gap-5">
      <ol className="grid gap-5" data-testid="photo-queue">
        {cases.map((item) => (
          <li key={item.avatar.id}>
            <AvatarCase
              item={item}
              onDecided={(id) => setCases((current) => current.filter((c) => c.avatar.id !== id))}
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

function AvatarCase({
  item,
  onDecided,
}: {
  item: StaffAvatarCase;
  onDecided: (id: string) => void;
}) {
  const t = useTranslations('staff.photos');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const { avatar, account, reports, decision } = item;
  const open = decision === null;
  const first = new Date(reports.firstAt);
  const deadline = first.getTime() + AVATAR_REVIEW_DEADLINE_HOURS * HOUR_MS;
  const hoursLeft = Math.floor((deadline - now.getTime()) / HOUR_MS);

  return (
    <article
      aria-label={t('cardLabel', { name: account.displayName })}
      data-avatar-id={avatar.id}
      data-status={avatar.status}
      className="grid gap-4 rounded-xl bg-surface p-4 sm:grid-cols-[auto_minmax(0,1fr)]"
    >
      {/* A imagem vem da rota da Staff (nunca em cache), tenha ou não saído do ar. */}
      {/* biome-ignore lint/performance/noImgElement: a imagem é privada e não pode passar pelo otimizador. */}
      <img
        src={`/api/staff/avatars/${avatar.id}/image`}
        alt={t('imageAlt', { name: account.displayName })}
        width={160}
        height={160}
        loading="lazy"
        className="size-40 rounded-xl bg-surface-2 object-cover max-sm:size-32"
        data-testid="photo-image"
      />
      <div className="grid min-w-0 content-start gap-3">
        <header className="grid gap-1">
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="inline-flex min-h-5 items-center rounded-xs bg-surface-2 px-1.5 text-[11px] font-semibold">
              {t(`state.${avatar.status}`)}
            </span>
            <Link href={`/staff/contas/${account.publicId}` as Route} className={personLink}>
              {account.displayName}
            </Link>
            <span className="text-body-sm text-muted-foreground tabular-nums">
              #{account.publicId}
            </span>
          </p>
          <p className="text-body-sm text-muted-foreground">
            {t('reporters', { count: reports.reporters })} ·{' '}
            {reports.byReason
              .map((entry) => `${AVATAR_REASON_LABELS[entry.reason]} (${entry.count})`)
              .join(', ')}
          </p>
          <p className="text-body-sm text-muted-foreground">
            <time
              dateTime={reports.firstAt}
              title={format.dateTime(first, { dateStyle: 'medium', timeStyle: 'short' })}
              suppressHydrationWarning
            >
              {t('firstReport', { when: format.relativeTime(first, now) })}
            </time>
            {open ? (
              <>
                {' · '}
                <span className={hoursLeft < 0 ? 'font-semibold text-foreground' : undefined}>
                  {hoursLeft >= 0
                    ? t('deadline.left', { hours: hoursLeft })
                    : t('deadline.over', { hours: -hoursLeft })}
                </span>
              </>
            ) : null}
          </p>
          {item.previousRemovals > 0 ? (
            <p className="text-body-sm font-semibold" data-testid="photo-previous">
              {t('previous', { count: item.previousRemovals })}
            </p>
          ) : null}
        </header>

        {open ? (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="ghost" size="sm">
                <Link href={`/staff/contas/${account.publicId}` as Route}>{t('openAccount')}</Link>
              </Button>
            </div>
            <KeepAvatarForm avatarId={avatar.id} onDone={() => onDecided(avatar.id)} />
            <RemoveAvatarForm avatarId={avatar.id} onDone={() => onDecided(avatar.id)} />
          </div>
        ) : (
          <p className="text-body-sm text-muted-foreground" data-testid="photo-decision">
            {decision.decision === 'keep'
              ? t('decision.keep', { name: decision.by.displayName ?? '—', note: decision.note })
              : t('decision.remove', {
                  name: decision.by.displayName ?? '—',
                  reason: decision.reason ? AVATAR_REASON_LABELS[decision.reason] : '—',
                  note: decision.note,
                })}
          </p>
        )}
      </div>
    </article>
  );
}
