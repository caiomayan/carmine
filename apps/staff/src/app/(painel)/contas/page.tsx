import type { StaffAccountSummary } from '@carmine/contracts';
import { STAFF_SEARCH_MIN_LENGTH, type StaffMember, staffCan } from '@carmine/contracts/staff';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AccountSearch } from '@/components/accounts/account-search';
import { stamp } from '@/components/queue/bits';
import { apiGet } from '@/lib/api';
import { SANCTION_TYPE_LABEL } from '@/lib/moderation';
import { getPanelSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Contas' };
export const dynamic = 'force-dynamic';

const ROLE_LABEL = { owner: 'Dono', admin: 'Admin', moderator: 'Moderador' } as const;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';

function Avatar({ src, name }: { src: string | null; name: string }) {
  return src ? (
    // biome-ignore lint/performance/noImgElement: avatar da Steam ou do bucket de fotos, sem otimização do Next.
    <img className="stp-thumb" src={src} alt="" width={40} height={40} loading="lazy" />
  ) : (
    <span className="stp-thumb stp-thumb-initials" aria-hidden="true">
      {initials(name)}
    </span>
  );
}

function ResultRow({ account }: { account: StaffAccountSummary }) {
  return (
    <li>
      <Link
        href={`/contas/${account.publicId}`}
        prefetch={false}
        className="stp-result"
        aria-label={`Abrir ficha de ${account.displayName}`}
        data-testid="staff-account-result"
      >
        <Avatar src={account.avatarUrl} name={account.displayName} />
        <span className="stp-result-main">
          <span className="stp-cell-main">
            {account.displayName} <span className="stp-muted">#{account.publicId}</span>
            {account.staffRole ? (
              <span className="stp-count-chip">{ROLE_LABEL[account.staffRole]}</span>
            ) : null}
          </span>
          <span className="stp-cell-sub">
            {account.steamName} · {account.claimed ? 'Reivindicada' : 'Não reivindicada'} ·{' '}
            {account.lastConnectedAt ? `Jogou ${stamp(account.lastConnectedAt)}` : 'Nunca jogou'}
          </span>
        </span>
        <span className="stp-result-flags">
          {account.activeSanctions.map((type) => (
            <span key={type} className="stp-dot" data-tone="danger">
              {SANCTION_TYPE_LABEL[type]}
            </span>
          ))}
        </span>
      </Link>
    </li>
  );
}

/**
 * Contas (S25): a busca por ID público, SteamID64, link do perfil Steam ou nome, e, sem busca, quem é da Staff. Cada
 * resultado leva à ficha, onde a Punição é aplicada.
 */
export default async function ContasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const session = await getPanelSession();
  if (session.status !== 'staff' || !staffCan(session.session.staffRole, 'accounts.read'))
    notFound();

  const raw = (await searchParams).q;
  const query = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? '';
  const searching = query.length >= STAFF_SEARCH_MIN_LENGTH;

  const [search, members] = await Promise.all([
    searching
      ? apiGet<{ accounts: StaffAccountSummary[] }>(
          `/api/staff/accounts?q=${encodeURIComponent(query)}`,
        )
      : null,
    query ? null : apiGet<{ members: StaffMember[] }>('/api/staff/members'),
  ]);

  return (
    <div className="stp-page" data-testid="stp-accounts">
      <div className="stp-head">
        <div>
          <h1>Contas</h1>
          <p>Busque uma Conta para ver a ficha, aplicar ou revogar punições e resetar o nome.</p>
        </div>
      </div>

      <AccountSearch initial={query} />

      {search ? (
        search.ok ? (
          search.data.accounts.length > 0 ? (
            <section className="stp-card" aria-label="Resultados da busca" key={query}>
              <p className="stp-muted" role="status">
                {search.data.accounts.length === 1
                  ? '1 Conta'
                  : `${search.data.accounts.length} Contas`}
              </p>
              <ul className="stp-results" data-testid="staff-results">
                {search.data.accounts.map((account) => (
                  <ResultRow key={account.publicId} account={account} />
                ))}
              </ul>
            </section>
          ) : (
            <div className="stp-card" key={query}>
              <div className="stp-empty" data-testid="staff-no-results">
                <b>Nenhuma Conta com esse termo</b>
                <span>Tente o ID público (#10016), o SteamID64 ou o link do perfil Steam.</span>
              </div>
            </div>
          )
        ) : (
          <div className="stp-card">
            <div className="stp-empty" role="alert">
              <b>Sem dado: a API não respondeu</b>
              <span>Não deu para buscar agora. Tente de novo em instantes.</span>
            </div>
          </div>
        )
      ) : null}

      {members?.ok ? (
        <section className="stp-card" aria-labelledby="staff-members">
          <h2 id="staff-members" className="stp-card-h">
            Staff
          </h2>
          <ul className="stp-results" data-testid="staff-members">
            {members.data.members.map((member) => (
              <li key={member.publicId}>
                <Link
                  href={`/contas/${member.publicId}`}
                  prefetch={false}
                  className="stp-result"
                  aria-label={`Abrir ficha de ${member.displayName}`}
                >
                  <Avatar src={member.avatarUrl} name={member.displayName} />
                  <span className="stp-result-main">
                    <span className="stp-cell-main">
                      {member.displayName} <span className="stp-muted">#{member.publicId}</span>
                      <span className="stp-count-chip">{ROLE_LABEL[member.role]}</span>
                    </span>
                    <span className="stp-cell-sub">desde {stamp(member.since).slice(0, 5)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
