'use client';

import {
  AVATAR_BLOCK_DAYS_MAX,
  AVATAR_BLOCK_DAYS_SUGGESTED,
  AVATAR_REASON_LABELS,
  AVATAR_REASONS,
  AVATAR_REVIEW_DEADLINE_HOURS,
  type AvatarReason,
  type StaffAvatarCase,
  type StaffAvatarCasePage,
  staffAvatarCasePageSchema,
} from '@carmine/contracts/avatar';
import { ExternalLinkIcon, XIcon } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useId, useState } from 'react';
import { ActionForm } from '@/components/queue/action-form';
import { Eta, StatusDot, stamp } from '@/components/queue/bits';
import { CaseBoard, type Column } from '@/components/queue/case-board';
import { DetailPane, useWide } from '@/components/queue/detail-pane';
import { staffGet, staffPost } from '@/lib/staff-request';
import { useNow } from '@/lib/use-now';

const HOURS = AVATAR_REVIEW_DEADLINE_HOURS;

type Key = 'account' | 'reason' | 'reporters' | 'removals' | 'deadline';
type Tab = 'open' | 'decided';

const TABS: { status: Tab; label: string }[] = [
  { status: 'open', label: 'Abertas' },
  { status: 'decided', label: 'Decididas' },
];

const imageOf = (avatarId: string) => `/api/staff/avatars/${avatarId}/image`;

const reasonsOf = (item: StaffAvatarCase) =>
  item.reports.byReason
    .map((r) => `${AVATAR_REASON_LABELS[r.reason]}${r.count > 1 ? ` (${r.count})` : ''}`)
    .join(', ');

const mainReason = (item: StaffAvatarCase): AvatarReason =>
  item.reports.byReason[0]?.reason ?? 'other';

const decidedTone = (item: StaffAvatarCase) =>
  item.decision?.decision === 'remove' ? 'danger' : 'ok';
const decidedLabel = (item: StaffAvatarCase) =>
  item.decision?.decision === 'remove' ? 'Removida' : 'Mantida';

/**
 * A fila de fotos denunciadas (S25): a foto fica no ar até a Staff decidir (pós-moderação, ADR 0022 e 0025); cada caso
 * é uma imagem, com o prazo de 24 h da regra única (ADR 0027). Manter arquiva as denúncias e a imagem fica imune a
 * novas; remover tira do ar, volta a foto da Steam e bloqueia novos envios pelos dias escolhidos.
 */
export function PhotosScreen({
  initial,
  status,
  serverNowMs,
  siteUrl,
}: {
  initial: StaffAvatarCasePage;
  status: Tab;
  serverNowMs: number;
  siteUrl: string;
}) {
  const now = useNow(serverNowMs);
  const wide = useWide();
  const [cases, setCases] = useState<StaffAvatarCase[]>(initial.cases);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<StaffAvatarCase | null>(null);
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set());
  const open = status === 'open';

  const loadMore = async () => {
    if (!cursor) return;
    setLoading(true);
    setFailed(false);
    const params = new URLSearchParams({ status, before: cursor });
    const page = await staffGet(`/api/staff/avatar-reports?${params}`, (value) =>
      staffAvatarCasePageSchema.parse(value),
    );
    if (page) {
      setCases((current) => [...current, ...page.cases]);
      setCursor(page.nextCursor);
    } else {
      setFailed(true);
    }
    setLoading(false);
  };

  const decided = useCallback((avatarId: string) => {
    // O aviso de que deu certo fica à vista um instante; depois o detalhe fecha e a foto sai da fila.
    setTimeout(
      () => setSelected((current) => (current?.avatar.id === avatarId ? null : current)),
      900,
    );
    setLeaving((current) => new Set(current).add(avatarId));
    setTimeout(() => {
      setCases((current) => current.filter((item) => item.avatar.id !== avatarId));
      setLeaving((current) => {
        const next = new Set(current);
        next.delete(avatarId);
        return next;
      });
    }, 260);
  }, []);

  const columns: Column<StaffAvatarCase, Key>[] = [
    {
      key: 'account',
      label: 'Foto de',
      sortable: true,
      render: (item) => (
        <span className="stp-photo-cell">
          {/* biome-ignore lint/performance/noImgElement: a foto vem da API do painel (rota autenticada), sem otimização do Next. */}
          <img
            className="stp-thumb"
            src={imageOf(item.avatar.id)}
            alt=""
            width={40}
            height={40}
            loading="lazy"
          />
          <span>
            <span className="stp-cell-main">{item.account.displayName}</span>
            <span className="stp-cell-sub">#{item.account.publicId}</span>
          </span>
        </span>
      ),
    },
    { key: 'reason', label: 'Motivo', sortable: true, render: reasonsOf },
    {
      key: 'reporters',
      label: 'Contas que denunciaram',
      sortable: true,
      render: (item) => (
        <span className="stp-count-chip" data-many={item.reports.reporters > 1 ? '' : undefined}>
          {item.reports.reporters}
        </span>
      ),
    },
    {
      key: 'removals',
      label: 'Remoções antes',
      sortable: true,
      render: (item) => item.previousRemovals,
    },
    open
      ? {
          key: 'deadline',
          label: 'Prazo',
          sortable: true,
          render: (item) => <Eta deadlineAt={item.deadlineAt} hours={HOURS} nowMs={now} />,
        }
      : {
          key: 'deadline',
          label: 'Decisão',
          sortable: true,
          render: (item) => <StatusDot tone={decidedTone(item)}>{decidedLabel(item)}</StatusDot>,
        },
  ];

  const sortValue = (item: StaffAvatarCase, key: Key): string | number | null => {
    switch (key) {
      case 'account':
        return item.account.displayName.toLowerCase();
      case 'reason':
        return AVATAR_REASON_LABELS[mainReason(item)];
      case 'reporters':
        return item.reports.reporters;
      case 'removals':
        return item.previousRemovals;
      case 'deadline':
        return item.deadlineAt
          ? new Date(item.deadlineAt).getTime()
          : item.decision
            ? -new Date(item.decision.at).getTime()
            : null;
    }
  };

  return (
    <div className="stp-page" data-testid="stp-photos">
      <div className="stp-head">
        <div>
          <h1>Fotos denunciadas</h1>
          <p>
            {open
              ? `${initial.openCount} ${initial.openCount === 1 ? 'foto esperando' : 'fotos esperando'} decisão. A foto fica no ar até a Staff decidir; o prazo é de ${HOURS} h.`
              : 'As fotos já decididas, da mais recente para a mais antiga.'}
          </p>
        </div>
      </div>

      <nav className="stp-tabs-pill" aria-label="Estado das fotos">
        {TABS.map((tab) => (
          <Link
            key={tab.status}
            href={tab.status === 'open' ? '/fotos' : `/fotos?status=${tab.status}`}
            prefetch={false}
            className="stp-pilltab"
            aria-current={tab.status === status ? 'page' : undefined}
            data-testid={`stp-tab-${tab.status}`}
          >
            {tab.label}
            {tab.status === 'open' ? <small>{initial.openCount}</small> : null}
          </Link>
        ))}
      </nav>

      <div className="stp-layout" data-detail={wide && selected ? '' : undefined}>
        <CaseBoard<StaffAvatarCase, Key>
          testId="stp-photo-board"
          caption="Fotos denunciadas, ordenáveis pelo cabeçalho"
          items={cases}
          getId={(item) => item.avatar.id}
          searchText={(item) =>
            `${item.account.displayName} ${item.account.publicId} ${reasonsOf(item)}`
          }
          searchPlaceholder="Buscar por jogador, ID ou motivo"
          reasonOf={mainReason}
          reasonOptions={AVATAR_REASONS.map((value) => ({
            value,
            label: AVATAR_REASON_LABELS[value],
          }))}
          columns={columns}
          sortValue={sortValue}
          defaultSort={{ key: 'deadline', dir: open ? 1 : -1 }}
          selectedId={selected?.avatar.id ?? null}
          onSelect={(id) => setSelected(cases.find((item) => item.avatar.id === id) ?? null)}
          renderCard={(item) => (
            <>
              <span className="stp-card-row-top">
                <span className="stp-photo-cell">
                  {/* biome-ignore lint/performance/noImgElement: a foto vem da API do painel (rota autenticada). */}
                  <img
                    className="stp-thumb"
                    src={imageOf(item.avatar.id)}
                    alt=""
                    width={40}
                    height={40}
                    loading="lazy"
                  />
                  <b>{item.account.displayName}</b>
                </span>
                {open ? (
                  <span
                    className="stp-count-chip"
                    data-many={item.reports.reporters > 1 ? '' : undefined}
                  >
                    {item.reports.reporters} {item.reports.reporters === 1 ? 'conta' : 'contas'}
                  </span>
                ) : (
                  <StatusDot tone={decidedTone(item)}>{decidedLabel(item)}</StatusDot>
                )}
              </span>
              <span className="stp-card-row-meta">
                <span>{reasonsOf(item)}</span>
              </span>
              {open ? <Eta deadlineAt={item.deadlineAt} hours={HOURS} nowMs={now} /> : null}
            </>
          )}
          leaving={leaving}
          loadMore={{ available: cursor !== null, loading, failed, onLoad: loadMore }}
          emptyTitle={open ? 'Fila de fotos em dia' : 'Nada por aqui'}
          emptyText={
            open
              ? 'As fotos denunciadas aparecem aqui, com até 24 h de prazo cada.'
              : 'Nenhuma foto decidida ainda.'
          }
        />

        <DetailPane
          open={selected !== null}
          onClose={() => setSelected(null)}
          label={selected ? `Foto denunciada de ${selected.account.displayName}` : 'Foto'}
        >
          {selected ? (
            <PhotoDetail
              key={selected.avatar.id}
              item={selected}
              nowMs={now}
              siteUrl={siteUrl}
              onClose={() => setSelected(null)}
              onDecided={decided}
            />
          ) : null}
        </DetailPane>
      </div>
    </div>
  );
}

function PhotoDetail({
  item,
  nowMs,
  siteUrl,
  onClose,
  onDecided,
}: {
  item: StaffAvatarCase;
  nowMs: number;
  siteUrl: string;
  onClose: () => void;
  onDecided: (avatarId: string) => void;
}) {
  const id = useId();
  const [reason, setReason] = useState<AvatarReason | ''>('');
  const [blockDays, setBlockDays] = useState(String(AVATAR_BLOCK_DAYS_SUGGESTED));
  const openCase = item.decision === null;
  const path = `/api/staff/avatars/${item.avatar.id}/decision` as const;

  // Em branco vale 0: sem bloqueio.
  const days = blockDays.trim() === '' ? 0 : Number(blockDays);
  const validateRemoval = () => {
    if (!reason) return 'Escolha o motivo da remoção.';
    if (!(Number.isInteger(days) && days >= 0 && days <= AVATAR_BLOCK_DAYS_MAX)) {
      return `O bloqueio vai de 0 a ${AVATAR_BLOCK_DAYS_MAX} dias.`;
    }
    return null;
  };

  return (
    <>
      <div className="stp-detail-top">
        <h2 className="stp-detail-title">{item.account.displayName}</h2>
        <button type="button" className="stp-round" aria-label="Fechar o detalhe" onClick={onClose}>
          <XIcon size={16} aria-hidden="true" />
        </button>
      </div>

      {/* biome-ignore lint/performance/noImgElement: a foto vem da API do painel (rota autenticada). */}
      <img
        className="stp-photo-large"
        src={imageOf(item.avatar.id)}
        alt={`Foto de perfil de ${item.account.displayName}, denunciada`}
        width={320}
        height={320}
      />

      <dl className="stp-dl">
        <dt>Jogador</dt>
        <dd>
          {item.account.displayName} <span className="stp-muted">#{item.account.publicId}</span>
        </dd>
        <dt>Denúncias</dt>
        <dd data-testid="photo-reporters">
          {item.reports.reporters} {item.reports.reporters === 1 ? 'Conta' : 'Contas'}:{' '}
          {reasonsOf(item)}
        </dd>
        <dt>Enviada</dt>
        <dd>{stamp(item.avatar.uploadedAt)}</dd>
        <dt>Remoções antes</dt>
        <dd>{item.previousRemovals}</dd>
        {openCase ? (
          <>
            <dt>Prazo</dt>
            <dd>
              <Eta deadlineAt={item.deadlineAt} hours={HOURS} nowMs={nowMs} />
            </dd>
          </>
        ) : null}
      </dl>

      <section aria-labelledby={`${id}-tl`}>
        <h3 id={`${id}-tl`} className="stp-section">
          Linha do tempo
        </h3>
        <ol className="stp-timeline" aria-label="Linha do tempo da foto">
          <li className="stp-tl">
            <time dateTime={item.avatar.uploadedAt}>{stamp(item.avatar.uploadedAt)}</time>
            <div>
              <b>Foto no ar</b>
              <span>enviada pela Conta</span>
            </div>
          </li>
          <li className="stp-tl">
            <time dateTime={item.reports.firstAt}>{stamp(item.reports.firstAt)}</time>
            <div>
              <b>Primeira denúncia</b>
              <span>
                {item.reports.reporters}{' '}
                {item.reports.reporters === 1 ? 'Conta denunciou' : 'Contas denunciaram'}
              </span>
            </div>
          </li>
          {item.reports.lastAt !== item.reports.firstAt ? (
            <li className="stp-tl">
              <time dateTime={item.reports.lastAt}>{stamp(item.reports.lastAt)}</time>
              <div>
                <b>Última denúncia</b>
                <span>&nbsp;</span>
              </div>
            </li>
          ) : null}
          {item.decision ? (
            <li className="stp-tl">
              <time dateTime={item.decision.at}>{stamp(item.decision.at)}</time>
              <div>
                <b>{item.decision.decision === 'remove' ? 'Foto removida' : 'Foto mantida'}</b>
                <span data-testid="photo-decision">
                  {item.decision.by.displayName ?? '—'}
                  {item.decision.reason ? ` · ${AVATAR_REASON_LABELS[item.decision.reason]}` : ''}
                  {item.decision.note ? `: ${item.decision.note}` : ''}
                </span>
              </div>
            </li>
          ) : item.deadlineAt ? (
            <li className="stp-tl" data-pending="">
              <time dateTime={item.deadlineAt}>{stamp(item.deadlineAt)}</time>
              <div>
                <b>Fim do prazo da Staff</b>
                <span>{HOURS} h depois da primeira denúncia de peso normal</span>
              </div>
            </li>
          ) : null}
        </ol>
      </section>

      {openCase ? (
        <div className="stp-detail-foot">
          {siteUrl ? (
            <a
              className="stp-btn"
              href={`${siteUrl}/staff/contas/${item.account.publicId}`}
              target="_blank"
              rel="noreferrer"
            >
              Abrir a Conta
              <ExternalLinkIcon size={13} aria-hidden="true" />
            </a>
          ) : null}
          <ActionForm
            label="Manter a foto"
            submitLabel="Manter a foto"
            doneLabel="Foto mantida: as denúncias foram arquivadas."
            reasonLabel="Nota (vai para o log de auditoria)"
            testId="keep-avatar"
            onSubmit={(note) => staffPost(path, { decision: 'keep', note }, () => undefined)}
            onDone={() => onDecided(item.avatar.id)}
          />
          <ActionForm
            label="Remover a foto"
            submitLabel="Remover a foto"
            doneLabel="Foto removida: a Conta voltou à foto da Steam."
            reasonLabel="Nota (vai para o log de auditoria)"
            testId="remove-avatar"
            kind="danger"
            validate={validateRemoval}
            onSubmit={(note) =>
              staffPost(
                path,
                { decision: 'remove', reason, note, blockDays: days },
                () => undefined,
              )
            }
            onDone={() => onDecided(item.avatar.id)}
          >
            <label className="stp-label" htmlFor={`${id}-reason`}>
              Motivo da remoção
            </label>
            <select
              id={`${id}-reason`}
              className="stp-select"
              value={reason}
              onChange={(event) => setReason(event.target.value as AvatarReason)}
              data-testid="avatar-remove-reason"
            >
              <option value="">Escolha um motivo</option>
              {AVATAR_REASONS.map((value) => (
                <option key={value} value={value}>
                  {AVATAR_REASON_LABELS[value]}
                </option>
              ))}
            </select>
            <label className="stp-label" htmlFor={`${id}-days`}>
              Dias sem poder enviar outra foto
              <span className="stp-label-count">
                0 não bloqueia; sugerido {AVATAR_BLOCK_DAYS_SUGGESTED}
              </span>
            </label>
            <input
              id={`${id}-days`}
              className="stp-input"
              type="number"
              inputMode="numeric"
              min={0}
              max={AVATAR_BLOCK_DAYS_MAX}
              step={1}
              value={blockDays}
              onChange={(event) => setBlockDays(event.target.value)}
              data-testid="avatar-remove-days"
            />
          </ActionForm>
        </div>
      ) : null}
    </>
  );
}
