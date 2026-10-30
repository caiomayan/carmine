'use client';

import type { StaffAccountDetail, StaffSanction } from '@carmine/contracts';
import { staffAccountDetailSchema, staffCan } from '@carmine/contracts/staff';
import { ArrowLeftIcon, CheckIcon, CopyIcon, ExternalLinkIcon } from 'lucide-react';
import Link from 'next/link';
import { useId, useState } from 'react';
import { AuditEntries } from '@/components/audit/audit-entries';
import { ActionForm } from '@/components/queue/action-form';
import { stamp } from '@/components/queue/bits';
import { categoryLabel, SANCTION_TYPE_LABEL, sanctionMeasureLabel } from '@/lib/moderation';
import { staffPost } from '@/lib/staff-request';
import {
  canRevoke,
  SANCTION_STATE_LABEL,
  type StaffViewer,
  sanctionGuard,
  sanctionState,
} from '@/lib/staff-rules';
import { ApplySanctionForm, type ReportOrigin } from './apply-sanction-form';

const ROLE_LABEL = { owner: 'Dono', admin: 'Admin', moderator: 'Moderador' } as const;

const actorName = (actor: StaffSanction['appliedBy']) =>
  actor.displayName ?? (actor.publicId ? `#${actor.publicId}` : actor.steamId);

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';

const sinceText = (iso: string | null) => (iso ? `Último connect ${stamp(iso)}` : 'Nunca conectou');

/**
 * A ficha de uma Conta no painel (S25): quem é, o que vale agora, aplicar Punição com a sugestão da tabela, o histórico
 * completo (com o motivo interno), o reset do Nome de exibição e as ações da Staff sobre ela. Cada mutação devolve a ficha
 * atualizada. VIP, Ranking, papel e a exclusão de dados ainda ficam na ficha do site.
 */
export function AccountFile({
  initial,
  viewer,
  report,
  siteUrl,
}: {
  initial: StaffAccountDetail;
  viewer: StaffViewer;
  /** A Denúncia da fila que originou a visita (S13): a Punição aplicada fecha o caso. */
  report?: ReportOrigin;
  siteUrl: string;
}) {
  const [detail, setDetail] = useState(initial);
  const { account } = detail;
  const guard = sanctionGuard(viewer, account);

  return (
    <div className="stp-page" data-testid="account-file" data-public-id={account.publicId}>
      <div>
        <Link href="/contas" prefetch={false} className="stp-btn">
          <ArrowLeftIcon size={14} aria-hidden="true" /> Voltar à busca
        </Link>
      </div>

      <FileHeader detail={detail} siteUrl={siteUrl} />

      <div className="stp-file-grid">
        <div className="stp-col">
          <section className="stp-card" aria-labelledby="aplicar-title" id="aplicar">
            <h2 id="aplicar-title" className="stp-card-h">
              Aplicar punição
            </h2>
            {guard === 'ok' ? (
              <ApplySanctionForm
                detail={detail}
                viewer={viewer}
                onApplied={setDetail}
                {...(report && { report })}
              />
            ) : (
              <p className="stp-muted" data-testid="sanction-guard">
                {guard === 'self'
                  ? 'Esta é a sua Conta: você não pode se punir.'
                  : 'Esta Conta é da Staff com papel igual ou maior que o seu: você não pode puni-la.'}
              </p>
            )}
          </section>

          <section className="stp-card" aria-labelledby="historico">
            <h2 id="historico" className="stp-card-h">
              Histórico de punições
            </h2>
            {detail.sanctions.length > 0 ? (
              <ol className="stp-sanctions" data-testid="staff-sanctions">
                {detail.sanctions.map((sanction) => (
                  <SanctionItem
                    key={sanction.id}
                    sanction={sanction}
                    revocable={canRevoke(viewer, sanction)}
                    onRevoked={setDetail}
                  />
                ))}
              </ol>
            ) : (
              <p className="stp-muted">Nenhuma punição registrada.</p>
            )}
          </section>
        </div>

        <div className="stp-col">
          {staffCan(viewer.role, 'displayName.reset') ? (
            <DisplayNamePanel detail={detail} onChange={setDetail} />
          ) : null}

          <section className="stp-card" aria-labelledby="auditoria-conta">
            <h2 id="auditoria-conta" className="stp-card-h">
              Ações da Staff nesta Conta
            </h2>
            {detail.audit.length > 0 ? (
              <AuditEntries entries={detail.audit} showTarget={false} />
            ) : (
              <p className="stp-muted">Nenhuma ação registrada.</p>
            )}
          </section>

          {siteUrl ? (
            <p className="stp-muted stp-transition">
              VIP, Ranking, papel e a exclusão de dados desta Conta ainda ficam na{' '}
              <a
                href={`${siteUrl}/staff/contas/${account.publicId}`}
                target="_blank"
                rel="noreferrer"
              >
                ficha do site
              </a>
              .
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function FileHeader({ detail, siteUrl }: { detail: StaffAccountDetail; siteUrl: string }) {
  const { account, vip } = detail;
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(account.steamId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Sem permissão de área de transferência: a pessoa seleciona o texto.
    }
  };

  return (
    <header className="stp-file-head">
      {account.avatarUrl ? (
        // biome-ignore lint/performance/noImgElement: avatar da Steam ou do bucket de fotos, sem otimização do Next.
        <img className="stp-avatar-lg" src={account.avatarUrl} alt="" width={64} height={64} />
      ) : (
        <span className="stp-avatar-lg" aria-hidden="true">
          {initials(account.displayName)}
        </span>
      )}
      <div className="stp-file-id">
        <h1>
          <span data-testid="file-name">{account.displayName}</span>{' '}
          <span className="stp-muted">#{account.publicId}</span>
          {account.staffRole ? (
            <span className="stp-count-chip">{ROLE_LABEL[account.staffRole]}</span>
          ) : null}
        </h1>
        <p className="stp-muted">
          Nome Steam: {account.steamName} · {account.claimed ? 'Reivindicada' : 'Não reivindicada'}{' '}
          · {sinceText(account.lastConnectedAt)}
        </p>
        <div className="stp-inline">
          <button type="button" className="stp-btn" onClick={copy} aria-label="Copiar SteamID64">
            {copied ? (
              <CheckIcon size={14} aria-hidden="true" />
            ) : (
              <CopyIcon size={14} aria-hidden="true" />
            )}
            <span className="stp-mono">{account.steamId}</span>
          </button>
          {siteUrl ? (
            <a
              className="stp-btn"
              href={`${siteUrl}/${account.publicId}`}
              target="_blank"
              rel="noreferrer"
            >
              Perfil público <ExternalLinkIcon size={13} aria-hidden="true" />
            </a>
          ) : null}
          <a
            className="stp-btn"
            href={`https://steamcommunity.com/profiles/${account.steamId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Steam <ExternalLinkIcon size={13} aria-hidden="true" />
          </a>
        </div>
        <div className="stp-tags" data-testid="file-status">
          {account.activeSanctions.length > 0 ? (
            account.activeSanctions.map((type) => (
              <span key={type} className="stp-dot" data-tone="danger">
                {SANCTION_TYPE_LABEL[type]}
              </span>
            ))
          ) : (
            <span className="stp-muted">Nenhuma punição em vigor</span>
          )}
          <span className="stp-muted" aria-hidden="true">
            ·
          </span>
          <span className={vip.active ? undefined : 'stp-muted'}>
            {vip.active && vip.endsAt ? `VIP até ${stamp(vip.endsAt).slice(0, 5)}` : 'Sem VIP'}
          </span>
        </div>
      </div>
    </header>
  );
}

function SanctionItem({
  sanction,
  revocable,
  onRevoked,
}: {
  sanction: StaffSanction;
  revocable: boolean;
  onRevoked: (detail: StaffAccountDetail) => void;
}) {
  const appealId = useId();
  const [appeal, setAppeal] = useState(false);
  const state = sanctionState(sanction);

  return (
    <li data-testid="staff-sanction" data-type={sanction.type} data-state={state}>
      <div className="stp-sanction-top">
        <b>{sanctionMeasureLabel(sanction)}</b>
        <span className="stp-muted">{categoryLabel(sanction.category)}</span>
        <span className="stp-dot" data-tone={state === 'active' ? 'danger' : undefined}>
          {SANCTION_STATE_LABEL[state]}
        </span>
      </div>
      <p data-testid="sanction-reason">{sanction.reason}</p>
      {sanction.witness || sanction.evidenceUrl ? (
        <p className="stp-muted stp-proof" data-testid="sanction-proof">
          {sanction.witness ? <span>Testemunha: {sanction.witness}</span> : null}
          {sanction.evidenceUrl ? (
            <a href={sanction.evidenceUrl} target="_blank" rel="noopener noreferrer nofollow">
              Evidência anexada <ExternalLinkIcon size={12} aria-hidden="true" />
            </a>
          ) : null}
        </p>
      ) : null}
      <p className="stp-muted">
        {stamp(sanction.startsAt)}
        {sanction.endsAt ? ` · até ${stamp(sanction.endsAt)}` : ''} · por{' '}
        {actorName(sanction.appliedBy)}
      </p>
      {sanction.revocation ? (
        <p className="stp-muted">
          Revogada por {actorName(sanction.revocation.by)} {stamp(sanction.revocation.at)}:{' '}
          {sanction.revocation.reason}
        </p>
      ) : null}
      {revocable && (state === 'active' || state === 'instant') ? (
        <ActionForm
          label="Revogar"
          submitLabel="Revogar punição"
          doneLabel="Punição revogada."
          testId="revoke-form"
          onSubmit={(reason) =>
            staffPost(
              `/api/staff/sanctions/${sanction.id}/revoke`,
              { reason, appealAccepted: appeal },
              (value) => staffAccountDetailSchema.parse(value),
            )
          }
          onSuccess={onRevoked}
        >
          <label className="stp-check" htmlFor={appealId}>
            <input
              id={appealId}
              type="checkbox"
              checked={appeal}
              onChange={(event) => setAppeal(event.target.checked)}
              data-testid="revoke-appeal"
            />
            <span>
              Recurso aceito
              <span className="stp-muted">
                {' '}
                Some do Perfil público e não conta na reincidência.
              </span>
            </span>
          </label>
        </ActionForm>
      ) : null}
    </li>
  );
}

function DisplayNamePanel({
  detail,
  onChange,
}: {
  detail: StaffAccountDetail;
  onChange: (detail: StaffAccountDetail) => void;
}) {
  const { account } = detail;
  return (
    <section className="stp-card" aria-labelledby="nome">
      <h2 id="nome" className="stp-card-h">
        Nome de exibição
      </h2>
      <p>Atual: {account.displayName}</p>
      <p className="stp-muted">
        Com nome próprio, ele é apagado e vale o nome Steam; o prazo de 7 dias para trocar recomeça.
        Sem nome próprio, vira um nome fictício fixo (como “Alfredo”) enquanto a Conta mantiver o
        mesmo nome Steam. Vale no jogo no próximo connect.
      </p>
      <ActionForm
        label="Resetar nome"
        submitLabel="Resetar nome"
        doneLabel="Nome de exibição resetado."
        testId="name-reset"
        onSubmit={(reason) =>
          staffPost(
            `/api/staff/accounts/${account.publicId}/display-name/reset`,
            { reason },
            (value) => staffAccountDetailSchema.parse(value),
          )
        }
        onSuccess={onChange}
      />
    </section>
  );
}
