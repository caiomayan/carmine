'use client';

import {
  type StaffAuditEntry,
  type StaffAuditPage,
  staffAuditPageSchema,
} from '@carmine/contracts';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { AuditEntries } from './audit-entries';
import { FieldError } from './fields';

/** O log inteiro, página a página (cursor `before`), mantendo os filtros. */
export function AuditLog({
  initial,
  filters,
}: {
  initial: StaffAuditPage;
  filters: { action: string | null; actor: string | null; target: string | null };
}) {
  const t = useTranslations('staff.audit');
  const [entries, setEntries] = useState<StaffAuditEntry[]>(initial.entries);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const loadMore = async () => {
    if (!cursor) return;
    setLoading(true);
    setFailed(false);
    const params = new URLSearchParams({ before: cursor });
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    try {
      const response = await fetch(`/api/staff/audit?${params}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(String(response.status));
      const page = staffAuditPageSchema.parse(await response.json());
      setEntries((current) => [...current, ...page.entries]);
      setCursor(page.nextCursor);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  if (entries.length === 0)
    return <p className="text-body-sm text-muted-foreground">{t('empty')}</p>;

  return (
    <div className="grid gap-4">
      <AuditEntries entries={entries} />
      <div className="flex flex-wrap items-center gap-3" role="status">
        {cursor ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={loadMore}
            disabled={loading}
            aria-busy={loading || undefined}
            className="-ml-3"
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
