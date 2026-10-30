import type { StaffAuditPage } from '@carmine/contracts';
import { staffAuditActionSchema, staffCan } from '@carmine/contracts/staff';
import { steamId64Schema } from '@carmine/contracts/steam';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AUDIT_ACTION_LABEL } from '@/components/audit/audit-entries';
import { AuditLog } from '@/components/audit/audit-log';
import { apiGet } from '@/lib/api';
import { getPanelSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Auditoria' };
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<'acao' | 'autor' | 'alvo', string | string[] | undefined>>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? '';

/** Log de auditoria inteiro (Admin e Dono), filtrável por ação, autor e alvo (SteamID64). */
export default async function AuditoriaPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await getPanelSession();
  if (session.status !== 'staff' || !staffCan(session.session.staffRole, 'audit.read')) notFound();

  const params = await searchParams;
  const parsedAction = staffAuditActionSchema.safeParse(first(params.acao));
  const actorRaw = first(params.autor);
  const targetRaw = first(params.alvo);
  const actorOk = steamId64Schema.safeParse(actorRaw).success;
  const targetOk = steamId64Schema.safeParse(targetRaw).success;
  const filters = {
    action: parsedAction.success ? parsedAction.data : null,
    actor: actorOk ? actorRaw : null,
    target: targetOk ? targetRaw : null,
  };
  const query = new URLSearchParams(
    Object.entries(filters).filter((entry): entry is [string, string] => entry[1] !== null),
  ).toString();
  const result = await apiGet<StaffAuditPage>(`/api/staff/audit${query ? `?${query}` : ''}`);

  return (
    <div className="stp-page" data-testid="stp-audit">
      <div className="stp-head">
        <div>
          <h1>Auditoria</h1>
          <p>Toda ação da Staff, da mais recente para a mais antiga.</p>
        </div>
      </div>

      <form action="/auditoria" method="get" aria-label="Filtros do log" className="stp-toolbar">
        <div className="stp-measure-field">
          <label className="stp-label" htmlFor="acao">
            Ação
          </label>
          <select
            id="acao"
            name="acao"
            className="stp-select"
            defaultValue={filters.action ?? ''}
            data-testid="audit-action"
          >
            <option value="">Todas as ações</option>
            {staffAuditActionSchema.options.map((value) => (
              <option key={value} value={value}>
                {AUDIT_ACTION_LABEL[value] ?? value}
              </option>
            ))}
          </select>
        </div>
        <div className="stp-measure-field">
          <label className="stp-label" htmlFor="autor">
            Autor (SteamID64)
          </label>
          <input
            id="autor"
            name="autor"
            className="stp-input stp-mono"
            inputMode="numeric"
            defaultValue={actorRaw}
            placeholder="7656119…"
            aria-invalid={actorRaw && !actorOk ? true : undefined}
            data-testid="audit-actor"
          />
          {actorRaw && !actorOk ? (
            <p className="stp-field-error">Use um SteamID64 (17 dígitos, começa com 7656119).</p>
          ) : null}
        </div>
        <div className="stp-measure-field">
          <label className="stp-label" htmlFor="alvo">
            Alvo (SteamID64)
          </label>
          <input
            id="alvo"
            name="alvo"
            className="stp-input stp-mono"
            inputMode="numeric"
            defaultValue={targetRaw}
            placeholder="7656119…"
            aria-invalid={targetRaw && !targetOk ? true : undefined}
            data-testid="audit-target"
          />
          {targetRaw && !targetOk ? (
            <p className="stp-field-error">Use um SteamID64 (17 dígitos, começa com 7656119).</p>
          ) : null}
        </div>
        <button type="submit" className="stp-btn" data-kind="primary">
          Filtrar
        </button>
      </form>

      <section className="stp-card" aria-label="Log de auditoria">
        {result.ok ? (
          <AuditLog key={query || 'all'} initial={result.data} filters={filters} />
        ) : (
          <div className="stp-empty" role="alert">
            <b>Sem dado: a API não respondeu</b>
            <span>Não deu para abrir o log agora. Tente de novo em instantes.</span>
          </div>
        )}
      </section>
    </div>
  );
}
