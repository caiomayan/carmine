'use client';

import {
  REPORT_REASON_LABELS,
  REPORT_REVIEW_DEADLINE_HOURS,
  type ReportStatus,
  type StaffReport,
  type StaffReportPage,
  staffReportPageSchema,
} from '@carmine/contracts/reports';
import { ExternalLinkIcon, GavelIcon, XIcon } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { ActionForm } from '@/components/queue/action-form';
import { Eta, StatusDot, stamp } from '@/components/queue/bits';
import { CaseBoard, type Column } from '@/components/queue/case-board';
import { DetailPane, useWide } from '@/components/queue/detail-pane';
import { staffGet, staffPost } from '@/lib/staff-request';
import { useNow } from '@/lib/use-now';

const HOURS = REPORT_REVIEW_DEADLINE_HOURS.game;

type Key = 'target' | 'reason' | 'where' | 'count' | 'deadline';

const TABS: { status: ReportStatus; label: string }[] = [
  { status: 'open', label: 'Abertas' },
  { status: 'archived', label: 'Arquivadas' },
  { status: 'sanctioned', label: 'Punidas' },
];

const EMPTY: Record<ReportStatus, string> = {
  open: 'Nenhuma Denúncia aberta. Quando alguém usar o !report no jogo, ela aparece aqui.',
  archived: 'Nenhuma Denúncia arquivada.',
  sanctioned: 'Nenhuma Denúncia virou Punição ainda.',
};

const where = (report: StaffReport) =>
  [report.server ? (report.server.code ?? report.server.name) : 'Servidor desconhecido', report.map]
    .filter(Boolean)
    .join(' · ');

const countLabel = (count: number) => `${count} ${count === 1 ? 'denúncia' : 'denúncias'}`;

/**
 * A fila de Denúncias do painel (S25): casos agrupados pela regra única (a mesma Conta, o mesmo motivo, o mesmo Mapa
 * jogado, ADR 0027), cada um com o seu prazo. As abas são os estados do ADR 0019 (Abertas, Arquivadas, Punidas). A
 * decisão (arquivar com motivo) vale para todas as Denúncias do caso; a Punição é aplicada na ficha da Conta.
 */
export function ReportsScreen({
  initial,
  status,
  serverNowMs,
  siteUrl,
  canArchive,
}: {
  initial: StaffReportPage;
  status: ReportStatus;
  serverNowMs: number;
  siteUrl: string;
  canArchive: boolean;
}) {
  const now = useNow(serverNowMs);
  const wide = useWide();
  const [reports, setReports] = useState<StaffReport[]>(initial.reports);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<StaffReport | null>(null);
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set());

  const open = status === 'open';

  const loadMore = async () => {
    if (!cursor) return;
    setLoading(true);
    setFailed(false);
    const params = new URLSearchParams({ status, before: cursor });
    const page = await staffGet(`/api/staff/reports?${params}`, (value) =>
      staffReportPageSchema.parse(value),
    );
    if (page) {
      setReports((current) => [...current, ...page.reports]);
      setCursor(page.nextCursor);
    } else {
      setFailed(true);
    }
    setLoading(false);
  };

  const archived = useCallback((id: string) => {
    setLeaving((current) => new Set(current).add(id));
    setTimeout(() => {
      setReports((current) => current.filter((report) => report.id !== id));
      setLeaving((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }, 260);
  }, []);

  const columns: Column<StaffReport, Key>[] = [
    {
      key: 'target',
      label: 'Denunciado',
      sortable: true,
      render: (report) => (
        <>
          <span className="stp-cell-main">{report.target.displayName}</span>
          <span className="stp-cell-sub">#{report.target.publicId}</span>
        </>
      ),
    },
    {
      key: 'reason',
      label: 'Motivo',
      sortable: true,
      render: (report) => REPORT_REASON_LABELS[report.reason],
    },
    { key: 'where', label: 'Servidor e mapa', sortable: true, render: where },
    {
      key: 'count',
      label: 'Denúncias',
      sortable: true,
      render: (report) => (
        <span className="stp-count-chip" data-many={report.count > 1 ? '' : undefined}>
          {countLabel(report.count)}
        </span>
      ),
    },
    open
      ? {
          key: 'deadline',
          label: 'Prazo',
          sortable: true,
          render: (report) => <Eta deadlineAt={report.deadlineAt} hours={HOURS} nowMs={now} />,
        }
      : {
          key: 'deadline',
          label: 'Decisão',
          sortable: true,
          render: (report) => (
            <StatusDot tone={report.status === 'sanctioned' ? 'danger' : 'ok'}>
              {report.status === 'sanctioned' ? 'Punida' : 'Arquivada'}
            </StatusDot>
          ),
        },
  ];

  const sortValue = (report: StaffReport, key: Key): string | number | null => {
    switch (key) {
      case 'target':
        return report.target.displayName.toLowerCase();
      case 'reason':
        return REPORT_REASON_LABELS[report.reason];
      case 'where':
        return where(report).toLowerCase();
      case 'count':
        return report.count;
      case 'deadline':
        return report.deadlineAt
          ? new Date(report.deadlineAt).getTime()
          : report.resolution
            ? -new Date(report.resolution.at).getTime()
            : null;
    }
  };

  return (
    <div className="stp-page" data-testid="stp-reports">
      <div className="stp-head">
        <div>
          <h1>Denúncias</h1>
          <p>
            {open
              ? `${initial.openCount} ${initial.openCount === 1 ? 'caso aberto' : 'casos abertos'}. A Staff analisa em até ${HOURS} h; as Denúncias contra a mesma Conta, pelo mesmo motivo, no mesmo mapa viram um caso só.`
              : 'As decididas, da mais recente para a mais antiga. Elas somem 90 dias depois de criadas.'}
          </p>
        </div>
      </div>

      <nav className="stp-tabs-pill" aria-label="Estado das Denúncias">
        {TABS.map((tab) => (
          <Link
            key={tab.status}
            href={tab.status === 'open' ? '/denuncias' : `/denuncias?status=${tab.status}`}
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
        <CaseBoard<StaffReport, Key>
          testId="stp-report-board"
          caption="Casos de Denúncia, ordenáveis pelo cabeçalho"
          items={reports}
          getId={(report) => report.id}
          searchText={(report) =>
            `${report.target.displayName} ${report.target.publicId} ${REPORT_REASON_LABELS[report.reason]} ${where(report)} ${report.members.map((m) => m.reporter?.displayName ?? '').join(' ')}`
          }
          searchPlaceholder="Buscar por jogador, ID, motivo ou servidor"
          reasonOf={(report) => report.reason}
          reasonOptions={Object.entries(REPORT_REASON_LABELS).map(([value, label]) => ({
            value,
            label,
          }))}
          columns={columns}
          sortValue={sortValue}
          defaultSort={{ key: 'deadline', dir: open ? 1 : -1 }}
          selectedId={selected?.id ?? null}
          onSelect={(id) => setSelected(reports.find((report) => report.id === id) ?? null)}
          renderCard={(report) => (
            <>
              <span className="stp-card-row-top">
                <b>{report.target.displayName}</b>
                {open ? (
                  <span className="stp-count-chip" data-many={report.count > 1 ? '' : undefined}>
                    {countLabel(report.count)}
                  </span>
                ) : (
                  <StatusDot tone={report.status === 'sanctioned' ? 'danger' : 'ok'}>
                    {report.status === 'sanctioned' ? 'Punida' : 'Arquivada'}
                  </StatusDot>
                )}
              </span>
              <span className="stp-card-row-meta">
                <span>{REPORT_REASON_LABELS[report.reason]}</span>
                <span>{where(report)}</span>
              </span>
              {open ? <Eta deadlineAt={report.deadlineAt} hours={HOURS} nowMs={now} /> : null}
            </>
          )}
          leaving={leaving}
          loadMore={{ available: cursor !== null, loading, failed, onLoad: loadMore }}
          emptyTitle={status === 'open' ? 'Fila em dia' : 'Nada por aqui'}
          emptyText={EMPTY[status]}
        />

        <DetailPane
          open={selected !== null}
          onClose={() => setSelected(null)}
          label={selected ? `Caso de Denúncia contra ${selected.target.displayName}` : 'Caso'}
        >
          {selected ? (
            <ReportDetail
              report={selected}
              nowMs={now}
              siteUrl={siteUrl}
              canArchive={canArchive}
              onClose={() => setSelected(null)}
              onArchived={archived}
            />
          ) : null}
        </DetailPane>
      </div>
    </div>
  );
}

function ReportDetail({
  report,
  nowMs,
  siteUrl,
  canArchive,
  onClose,
  onArchived,
}: {
  report: StaffReport;
  nowMs: number;
  siteUrl: string;
  canArchive: boolean;
  onClose: () => void;
  onArchived: (id: string) => void;
}) {
  const open = report.status === 'open';
  const account = `${siteUrl}/staff/contas/${report.target.publicId}`;
  const sanction = `${account}?denuncia=${report.id}&evidencia=${report.needsEvidence ? 1 : 0}#aplicar`;

  return (
    <>
      <div className="stp-detail-top">
        <h2 className="stp-detail-title">{report.target.displayName}</h2>
        <button type="button" className="stp-round" aria-label="Fechar o detalhe" onClick={onClose}>
          <XIcon size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="stp-tags">
        <span className="stp-dot">{REPORT_REASON_LABELS[report.reason]}</span>
        {report.count > 1 ? (
          <span className="stp-count-chip" data-many="" data-testid="stp-case-count">
            {countLabel(report.count)}
          </span>
        ) : null}
        {open && report.lowWeight ? (
          <span className="stp-dot" title="Todas as Denúncias abertas são de quem perdeu peso">
            sem prazo
          </span>
        ) : null}
        {!open ? (
          <StatusDot tone={report.status === 'sanctioned' ? 'danger' : 'ok'}>
            {report.status === 'sanctioned' ? 'Punida' : 'Arquivada'}
          </StatusDot>
        ) : null}
      </div>

      <dl className="stp-dl">
        <dt>Jogador</dt>
        <dd>
          {report.target.displayName} <span className="stp-muted">#{report.target.publicId}</span>
        </dd>
        <dt>Servidor</dt>
        <dd>{where(report) || 'Servidor desconhecido'}</dd>
        {report.round !== null ? (
          <>
            <dt>Round</dt>
            <dd>{report.round}</dd>
          </>
        ) : null}
        {open ? (
          <>
            <dt>Prazo</dt>
            <dd>
              <Eta deadlineAt={report.deadlineAt} hours={HOURS} nowMs={nowMs} />
            </dd>
          </>
        ) : null}
        {open && report.otherOpenAgainstTarget > 0 ? (
          <>
            <dt>Outros casos</dt>
            <dd data-testid="report-others">
              {report.otherOpenAgainstTarget === 1
                ? 'Mais 1 Denúncia aberta contra este jogador'
                : `Mais ${report.otherOpenAgainstTarget} Denúncias abertas contra este jogador`}
            </dd>
          </>
        ) : null}
      </dl>

      {report.needsEvidence ? (
        <p className="stp-quote" data-testid="report-evidence">
          Cheat e voz: sem demo, a Denúncia sozinha não gera Punição. Só com evidência adicional
          (testemunha ou clipe enviado no Discord).
        </p>
      ) : null}

      <section aria-labelledby="stp-tl-title">
        <h3 id="stp-tl-title" className="stp-section">
          Linha do tempo
        </h3>
        <ol className="stp-timeline" aria-label="Linha do tempo do caso">
          {report.members.map((member, index) => (
            <li className="stp-tl" key={member.id} data-testid="stp-member">
              <time dateTime={member.createdAt}>{stamp(member.createdAt)}</time>
              <div>
                <b>
                  {index === 0 ? 'Denúncia recebida' : 'Outra Denúncia'}
                  {member.reporter ? ` de ${member.reporter.displayName}` : ''}
                </b>
                <span>
                  {member.reporter
                    ? `#${member.reporter.publicId}`
                    : 'denunciante com os dados excluídos'}
                  {member.round !== null ? ` · round ${member.round}` : ''}
                  {open && member.lowWeight ? ' · peso baixo' : ''}
                </span>
              </div>
            </li>
          ))}
          {report.resolution ? (
            <li className="stp-tl">
              <time dateTime={report.resolution.at}>{stamp(report.resolution.at)}</time>
              <div>
                <b>{report.status === 'sanctioned' ? 'Virou Punição' : 'Arquivada'}</b>
                <span data-testid="report-resolution">
                  {report.resolution.by.displayName ?? '—'}
                  {report.resolution.reason ? `: ${report.resolution.reason}` : ''}
                </span>
              </div>
            </li>
          ) : report.deadlineAt ? (
            <li className="stp-tl" data-pending="">
              <time dateTime={report.deadlineAt}>{stamp(report.deadlineAt)}</time>
              <div>
                <b>Fim do prazo da Staff</b>
                <span>{HOURS} h depois da primeira Denúncia de peso normal</span>
              </div>
            </li>
          ) : null}
        </ol>
      </section>

      <section aria-labelledby="stp-chat-title">
        <h3 id="stp-chat-title" className="stp-section">
          Chat do momento ({report.chat.length})
        </h3>
        {report.chat.length === 0 ? (
          <p className="stp-muted">Nenhuma linha de chat nos 5 minutos antes da Denúncia.</p>
        ) : (
          <ol className="stp-chat" data-testid="report-chat">
            {report.chat.map((line, index) => (
              <li
                // O chat não tem ID próprio na cópia; a posição é estável.
                // biome-ignore lint/suspicious/noArrayIndexKey: lista fixa, sem reordenação
                key={index}
                data-from-target={line.fromTarget || undefined}
              >
                <time dateTime={line.at}>{stamp(line.at).slice(-5)}</time>
                <span>
                  <span className="stp-muted">
                    {line.teamChat ? '(time) ' : ''}
                    {line.displayName}:
                  </span>{' '}
                  {line.text}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {open ? (
        <div className="stp-detail-foot">
          {siteUrl ? (
            <>
              <a
                className="stp-btn"
                href={sanction}
                target="_blank"
                rel="noreferrer"
                data-kind="primary"
                data-testid="report-punish"
              >
                <GavelIcon size={14} aria-hidden="true" /> Aplicar Punição
                <ExternalLinkIcon size={13} aria-hidden="true" />
              </a>
              <a className="stp-btn" href={account} target="_blank" rel="noreferrer">
                Abrir a Conta
                <ExternalLinkIcon size={13} aria-hidden="true" />
              </a>
            </>
          ) : null}
          {canArchive ? (
            <ActionForm
              label="Arquivar com motivo"
              submitLabel="Arquivar o caso"
              doneLabel={`Caso arquivado${report.count > 1 ? ` (${countLabel(report.count)})` : ''}.`}
              testId="archive-report"
              onSubmit={(reason) =>
                staffPost(`/api/staff/reports/${report.id}/archive`, { reason }, () => undefined)
              }
              onDone={() => onArchived(report.id)}
            />
          ) : null}
        </div>
      ) : null}
    </>
  );
}
