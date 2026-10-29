'use client';

import {
  ArrowUpDownIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  GavelIcon,
  SearchIcon,
  XIcon,
} from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useMemo, useState, useSyncExternalStore } from 'react';
import {
  CATEGORY_LABEL,
  type Deadline,
  deadlineOf,
  type Report,
  type ReportCategory,
  type ReportStatus,
  STATUS_LABEL,
  stamp,
  timelineOf,
} from './data';

const PAGE_SIZE = 8;

type SortKey = 'id' | 'reported' | 'category' | 'server' | 'status' | 'deadline';
type StatusFilter = ReportStatus | 'all';

const STATUS_TONE: Record<ReportStatus, 'danger' | 'warn' | 'ok'> = {
  open: 'danger',
  review: 'warn',
  done: 'ok',
};
const STATUS_ORDER: Record<ReportStatus, number> = { open: 0, review: 1, done: 2 };

/** O prazo só corre enquanto a denúncia não foi resolvida. */
function liveDeadline(report: Report, nowMs: number): Deadline | null {
  return report.status === 'done' ? null : deadlineOf(report.createdAt, nowMs);
}

/** O detalhe fica ao lado da tabela em tela larga e sobe como folha nas outras. */
const WIDE = '(min-width: 1281px)';
const subscribeWide = (callback: () => void) => {
  const query = window.matchMedia(WIDE);
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
};
const useWide = () =>
  useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE).matches,
    () => false,
  );

export function StatusTag({ status }: { status: ReportStatus }) {
  return (
    <span className="stp-dot" data-tone={STATUS_TONE[status]}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Eta({ deadline }: { deadline: Deadline | null }) {
  if (!deadline)
    return (
      <span className="stp-eta" data-tone="ok">
        -
      </span>
    );
  return (
    <span className="stp-eta" data-tone={deadline.tone}>
      {deadline.label}
      <span className="stp-bar" aria-hidden="true">
        <i style={{ width: `${Math.round((1 - deadline.spent) * 100)}%` }} />
      </span>
    </span>
  );
}

function Detail({
  report,
  nowMs,
  onStatus,
  onClose,
  as: Title,
}: {
  report: Report;
  nowMs: number;
  onStatus: (id: string, status: ReportStatus, message: string) => void;
  onClose: () => void;
  as: typeof Dialog.Title | 'h2';
}) {
  return (
    <>
      <div className="stp-detail-top">
        <Title className="stp-detail-title" style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
          <span className="stp-mono">{report.id}</span> · {report.reported}
        </Title>
        <button type="button" className="stp-round" aria-label="Fechar o detalhe" onClick={onClose}>
          <XIcon size={16} aria-hidden="true" />
        </button>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <StatusTag status={report.status} />
        <span className="stp-dot">{CATEGORY_LABEL[report.category]}</span>
      </div>
      <dl className="stp-dl">
        <dt>SteamID</dt>
        <dd className="stp-mono">{report.steamId}</dd>
        <dt>Denunciante</dt>
        <dd>{report.reporter}</dd>
        <dt>Servidor</dt>
        <dd>{report.server}</dd>
        <dt>Prazo</dt>
        <dd>
          <Eta deadline={liveDeadline(report, nowMs)} />
        </dd>
      </dl>
      <p className="stp-quote">{report.note}</p>
      <ol className="stp-timeline" aria-label="Linha do tempo da denúncia">
        {timelineOf(report).map((event) => (
          <li className="stp-tl" key={event.title} data-pending={event.done ? undefined : ''}>
            <time>{event.at ? stamp(event.at) : ''}</time>
            <div>
              <b>{event.title}</b>
              <span>{event.sub}</span>
            </div>
          </li>
        ))}
      </ol>
      <div className="stp-detail-foot">
        {report.status === 'open' ? (
          <button
            type="button"
            className="stp-btn"
            onClick={() => onStatus(report.id, 'review', `${report.id} em análise`)}
          >
            Assumir
          </button>
        ) : null}
        {report.status !== 'done' ? (
          <>
            <button
              type="button"
              className="stp-btn"
              data-kind="primary"
              onClick={() => {
                onStatus(report.id, 'done', `${report.id} resolvida`);
                onClose();
              }}
            >
              Resolver
            </button>
            <button type="button" className="stp-btn" data-kind="danger" disabled>
              <GavelIcon size={14} aria-hidden="true" /> Punir
            </button>
          </>
        ) : (
          <button
            type="button"
            className="stp-btn"
            onClick={() => onStatus(report.id, 'open', `${report.id} reaberta`)}
          >
            Reabrir
          </button>
        )}
      </div>
    </>
  );
}

export function Reports({
  reports,
  nowMs,
  onStatus,
  urgentOnly,
  onUrgentOnly,
  portal,
}: {
  reports: Report[];
  nowMs: number;
  onStatus: (id: string, status: ReportStatus, message: string) => void;
  urgentOnly: boolean;
  onUrgentOnly: (value: boolean) => void;
  /** O painel (`.stp`): os diálogos montam dentro dele para herdar o tema. */
  portal: HTMLElement | null;
}) {
  const wide = useWide();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [category, setCategory] = useState<ReportCategory | 'all'>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'deadline', dir: 1 });
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = reports.filter((r) => {
      if (status !== 'all' && r.status !== status) return false;
      if (category !== 'all' && r.category !== category) return false;
      if (urgentOnly) {
        const d = liveDeadline(r, nowMs);
        if (!d || d.leftMin >= 180) return false;
      }
      if (!q) return true;
      return [r.id, r.reported, r.reporter, r.server].some((v) => v.toLowerCase().includes(q));
    });
    const value = (r: Report): string | number => {
      switch (sort.key) {
        case 'id':
          return r.createdAt;
        case 'reported':
          return r.reported.toLowerCase();
        case 'category':
          return CATEGORY_LABEL[r.category];
        case 'server':
          return r.server;
        case 'status':
          return STATUS_ORDER[r.status];
        case 'deadline':
          // resolvidas no fim, as mais perto de vencer (ou vencidas) primeiro
          return liveDeadline(r, nowMs)?.leftMin ?? Number.MAX_SAFE_INTEGER;
      }
    };
    return [...filtered].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [reports, query, status, category, urgentOnly, sort, nowMs]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const slice = rows.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  const from = rows.length ? current * PAGE_SIZE + 1 : 0;
  const to = current * PAGE_SIZE + slice.length;

  const counts = useMemo(() => {
    const open = reports.filter((r) => r.status === 'open').length;
    const review = reports.filter((r) => r.status === 'review').length;
    const soon = reports.filter((r) => {
      const d = liveDeadline(r, nowMs);
      return d && d.leftMin < 180;
    }).length;
    return { open, review, soon, done: reports.length - open - review };
  }, [reports, nowMs]);

  const reset = () => setPage(0);
  const toggleSort = (key: SortKey) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
    reset();
  };
  const selected = reports.find((r) => r.id === openId) ?? null;
  const filtering = query !== '' || category !== 'all' || urgentOnly;
  const close = () => setOpenId(null);

  const tab = (value: StatusFilter, label: string, count: number) => (
    <button
      key={value}
      type="button"
      className="stp-pilltab"
      aria-pressed={status === value}
      data-testid={`stp-tab-${value}`}
      onClick={() => {
        setStatus(value);
        reset();
      }}
    >
      {label}
      <small>{count}</small>
    </button>
  );

  const column = (key: SortKey, label: string) => {
    const active = sort.key === key;
    return (
      <th
        scope="col"
        aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}
      >
        <button type="button" className="stp-th" onClick={() => toggleSort(key)}>
          {label}
          {active ? (
            sort.dir === 1 ? (
              <ChevronUpIcon size={13} aria-hidden="true" />
            ) : (
              <ChevronDownIcon size={13} aria-hidden="true" />
            )
          ) : (
            <ArrowUpDownIcon size={12} aria-hidden="true" style={{ opacity: 0.55 }} />
          )}
        </button>
      </th>
    );
  };

  return (
    <div className="stp-page" data-testid="stp-reports">
      <div className="stp-head">
        <div>
          <h1>Denúncias</h1>
          <p>Cada denúncia tem 24 h para ser revisada.</p>
        </div>
      </div>

      <div className="stp-grid" data-cols="3">
        <section className="stp-card" aria-label="Esperando">
          <div className="stp-card-sub" style={{ margin: 0 }}>
            Esperando revisão
          </div>
          <div className="stp-big">{counts.open + counts.review}</div>
        </section>
        <section
          className="stp-card"
          aria-label="Vencem em menos de 3 horas"
          data-hl={counts.soon ? '' : undefined}
        >
          <div className="stp-card-sub" style={{ margin: 0 }}>
            Vencem em menos de 3 h
          </div>
          <div className="stp-big">{counts.soon}</div>
        </section>
        <section className="stp-card" aria-label="Resolvidas">
          <div className="stp-card-sub" style={{ margin: 0 }}>
            Resolvidas
          </div>
          <div className="stp-big">{counts.done}</div>
        </section>
      </div>

      <search className="stp-toolbar" aria-label="Filtrar denúncias">
        <fieldset className="stp-tabs-pill">
          <legend className="stp-sr">Status</legend>
          {tab('all', 'Todas', reports.length)}
          {tab('open', 'Abertas', counts.open)}
          {tab('review', 'Em análise', counts.review)}
          {tab('done', 'Resolvidas', counts.done)}
        </fieldset>
        <label className="stp-field" data-grow>
          <SearchIcon size={15} aria-hidden="true" />
          <span className="stp-sr">Buscar denúncia, jogador ou servidor</span>
          <input
            type="search"
            placeholder="Buscar por ID, jogador ou servidor"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              reset();
            }}
            data-testid="stp-query"
          />
        </label>
        <label className="stp-field">
          <span className="stp-sr">Categoria</span>
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as ReportCategory | 'all');
              reset();
            }}
          >
            <option value="all">Todas as categorias</option>
            {(Object.keys(CATEGORY_LABEL) as ReportCategory[]).map((key) => (
              <option key={key} value={key}>
                {CATEGORY_LABEL[key]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="stp-chip"
          aria-pressed={urgentOnly}
          onClick={() => {
            onUrgentOnly(!urgentOnly);
            reset();
          }}
          data-testid="stp-urgent"
        >
          Vencem em 3 h
        </button>
        <label className="stp-field stp-sort-select">
          <span className="stp-sr">Ordenar por</span>
          <select
            value={sort.key}
            onChange={(e) => {
              setSort({ key: e.target.value as SortKey, dir: 1 });
              reset();
            }}
          >
            <option value="deadline">Prazo (mais perto de vencer)</option>
            <option value="id">Mais recentes</option>
            <option value="reported">Denunciado (A-Z)</option>
            <option value="category">Categoria</option>
            <option value="status">Status</option>
          </select>
        </label>
        {filtering ? (
          <button
            type="button"
            className="stp-chip"
            onClick={() => {
              setQuery('');
              setCategory('all');
              onUrgentOnly(false);
              reset();
            }}
          >
            <XIcon size={14} aria-hidden="true" /> Limpar
          </button>
        ) : null}
      </search>

      <div className="stp-layout" data-detail={wide && selected ? '' : undefined}>
        <div className="stp-card stp-table-card">
          <div className="stp-table-wrap">
            <table className="stp-table" data-testid="stp-table">
              <caption className="stp-sr">Denúncias, ordenáveis pelo cabeçalho</caption>
              <thead>
                <tr>
                  {column('id', 'Denúncia')}
                  {column('reported', 'Denunciado')}
                  {column('category', 'Categoria')}
                  {column('server', 'Servidor')}
                  {column('status', 'Status')}
                  {column('deadline', 'Prazo')}
                </tr>
              </thead>
              <tbody>
                {slice.map((r) => (
                  <tr
                    key={r.id}
                    aria-selected={openId === r.id}
                    onClick={() => setOpenId(r.id)}
                    data-testid="stp-row"
                  >
                    <td>
                      <button
                        type="button"
                        className="stp-cell-link stp-mono"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenId(r.id);
                        }}
                      >
                        {r.id}
                      </button>
                    </td>
                    <td>{r.reported}</td>
                    <td>{CATEGORY_LABEL[r.category]}</td>
                    <td>{r.server}</td>
                    <td>
                      <StatusTag status={r.status} />
                    </td>
                    <td>
                      <Eta deadline={liveDeadline(r, nowMs)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="stp-cards stp-list" data-testid="stp-cards" style={{ margin: 0 }}>
            {slice.map((r) => (
              <li key={r.id}>
                <button type="button" className="stp-card-row" onClick={() => setOpenId(r.id)}>
                  <span className="stp-card-row-top">
                    <b>{r.reported}</b>
                    <StatusTag status={r.status} />
                  </span>
                  <span className="stp-card-row-meta">
                    <span className="stp-mono">{r.id}</span>
                    <span>{CATEGORY_LABEL[r.category]}</span>
                    <span>{r.server}</span>
                  </span>
                  <Eta deadline={liveDeadline(r, nowMs)} />
                </button>
              </li>
            ))}
          </ul>

          {rows.length === 0 ? (
            <div className="stp-empty" data-testid="stp-empty">
              <b>Nenhuma denúncia com esses filtros</b>
              <span>Tire um filtro ou limpe a busca para ver a fila inteira.</span>
            </div>
          ) : null}

          <div className="stp-pager">
            <span data-testid="stp-range">
              {from}–{to} de {rows.length}
            </span>
            <div>
              <button
                type="button"
                className="stp-round"
                disabled={current === 0}
                onClick={() => setPage(current - 1)}
                aria-label="Página anterior"
              >
                <ChevronLeftIcon size={15} aria-hidden="true" />
              </button>
              <span>
                {current + 1} / {pages}
              </span>
              <button
                type="button"
                className="stp-round"
                disabled={current >= pages - 1}
                onClick={() => setPage(current + 1)}
                aria-label="Próxima página"
              >
                <ChevronRightIcon size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        {wide && selected ? (
          <aside
            className="stp-card stp-detail"
            data-testid="stp-detail"
            aria-label="Detalhe da denúncia"
          >
            <Detail report={selected} nowMs={nowMs} onStatus={onStatus} onClose={close} as="h2" />
          </aside>
        ) : null}
      </div>

      {!wide ? (
        <Dialog.Root open={selected !== null} onOpenChange={(open) => !open && close()}>
          <Dialog.Portal container={portal}>
            <Dialog.Overlay className="stp-overlay" />
            {selected ? (
              <Dialog.Content
                className="stp-drawer stp-detail"
                data-testid="stp-detail"
                aria-describedby={undefined}
              >
                <Detail
                  report={selected}
                  nowMs={nowMs}
                  onStatus={onStatus}
                  onClose={close}
                  as={Dialog.Title}
                />
              </Dialog.Content>
            ) : null}
          </Dialog.Portal>
        </Dialog.Root>
      ) : null}
    </div>
  );
}
