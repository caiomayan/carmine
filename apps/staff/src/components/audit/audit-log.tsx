'use client';

import type { StaffAuditEntry, StaffAuditPage } from '@carmine/contracts';
import { staffAuditPageSchema } from '@carmine/contracts/staff';
import { useState } from 'react';
import { staffGet } from '@/lib/staff-request';
import { AuditEntries } from './audit-entries';

/** O log inteiro, página a página (cursor `before`), mantendo os filtros. */
export function AuditLog({
  initial,
  filters,
}: {
  initial: StaffAuditPage;
  filters: { action: string | null; actor: string | null; target: string | null };
}) {
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
    const page = await staffGet(`/api/staff/audit?${params}`, (json) =>
      staffAuditPageSchema.parse(json),
    );
    setLoading(false);
    if (!page) {
      setFailed(true);
      return;
    }
    setEntries((current) => [...current, ...page.entries]);
    setCursor(page.nextCursor);
  };

  if (entries.length === 0) {
    return (
      <div className="stp-empty" data-testid="audit-empty">
        <b>Nenhuma ação registrada</b>
        <span>Nada com esses filtros.</span>
      </div>
    );
  }

  return (
    <div className="stp-panel-body">
      <AuditEntries entries={entries} />
      <div className="stp-inline" role="status">
        {cursor ? (
          <button
            type="button"
            className="stp-btn"
            onClick={loadMore}
            disabled={loading}
            aria-busy={loading || undefined}
            data-testid="audit-more"
          >
            Carregar mais
          </button>
        ) : (
          <p className="stp-muted">Fim do log.</p>
        )}
        {failed ? <p className="stp-field-error">Não deu para carregar mais agora.</p> : null}
      </div>
    </div>
  );
}
