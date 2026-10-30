import type { StaffActor, StaffAuditEntry } from '@carmine/contracts';
import Link from 'next/link';
import { stamp } from '@/components/queue/bits';

/** O que cada ação do log quer dizer, em uma frase (os mesmos textos do site). */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  vip_grant: 'Concedeu VIP',
  vip_revoke: 'Revogou VIP',
  sanction_apply: 'Aplicou punição',
  sanction_revoke: 'Revogou punição',
  role_grant: 'Deu papel',
  role_revoke: 'Tirou papel',
  display_name_reset: 'Resetou o nome',
  server_update: 'Editou servidor',
  account_anonymize: 'Anonimizou a Conta',
  account_reserved_id: 'Trocou o ID por um ID reservado',
  ranking_entry_remove: 'Removeu do Ranking',
  report_archive: 'Arquivou uma Denúncia',
  avatar_keep: 'Manteve uma foto de perfil denunciada',
  avatar_remove: 'Removeu uma foto de perfil',
  payment_refund: 'Reembolsou um pagamento',
  purchase_unblock: 'Liberou as compras de uma Conta',
  vip_compensation: 'Compensou dias de VIP por indisponibilidade',
};

function ActorName({ actor }: { actor: StaffActor }) {
  if (actor.publicId === null) return <span className="stp-mono">{actor.steamId}</span>;
  return (
    <Link href={`/contas/${actor.publicId}`} prefetch={false} className="stp-link">
      {actor.displayName ?? `#${actor.publicId}`}
    </Link>
  );
}

/**
 * Linhas do log de auditoria: quando, quem, o quê, em quem e por quê. `showTarget` some na ficha da Conta (o alvo é a
 * própria Conta).
 */
export function AuditEntries({
  entries,
  showTarget = true,
}: {
  entries: StaffAuditEntry[];
  showTarget?: boolean;
}) {
  return (
    <ol className="stp-audit" data-testid="audit-entries">
      {entries.map((entry) => (
        <li key={entry.id} data-action={entry.action}>
          <p className="stp-audit-line">
            <ActorName actor={entry.actor} />
            <span>{AUDIT_ACTION_LABEL[entry.action] ?? entry.action}</span>
            {showTarget && entry.targetAccount ? (
              entry.targetAccount.publicId !== null ? (
                <Link
                  href={`/contas/${entry.targetAccount.publicId}`}
                  prefetch={false}
                  className="stp-link"
                >
                  {entry.targetAccount.displayName ?? `#${entry.targetAccount.publicId}`}
                </Link>
              ) : (
                <span className="stp-muted">Conta anonimizada</span>
              )
            ) : null}
            {showTarget && entry.targetServer ? <b>{entry.targetServer.name}</b> : null}
            <time dateTime={entry.createdAt}>{stamp(entry.createdAt)}</time>
          </p>
          <p className="stp-muted">{entry.reason}</p>
        </li>
      ))}
    </ol>
  );
}
