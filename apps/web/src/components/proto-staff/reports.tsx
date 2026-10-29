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
import { useMemo, useState } from 'react';
import {
  CATEGORY_LABEL,
  type Deadline,
  deadlineOf,
  type Report,
  type ReportCategory,
  type ReportStatus,
  STATUS_LABEL,
} from './data';

const PAGE_SIZE = 8;

type SortKey = 'id' | 'reported' | 'category' | 'server' | 'status' | 'deadline';
type StatusFilter = ReportStatus | 'all';

const STATUS_TONE: Record<ReportStatus, 'danger' | 'accent' | 'ok'> = {
  open: 'danger',
  review: 'accent',
  done: 'ok',
};
const STATUS_ORDER: Record<ReportStatus, number> = { open: 0, review: 1, done: 2 };

/** O prazo só corre enquanto a denúncia não foi resolvida. */
function liveDeadline(report: Report, nowMs: number): Deadline | null {
  return report.status === 'done' ? null : deadlineOf(report.createdAt, nowMs);
}

export function StatusTag({ status }: { status: ReportStatus }) {
  return (
    <span className="stp-tag" data-tone={STATUS_TONE[status]}>
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
        <i style={{ width: `${Math.round(deadline.spent * 100)}%` }} />
      </span>
    </span>
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
  const filtering = query !== '' || status !== 'all' || category !== 'all' || urgentOnly;

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

      <div className="stp-stats" data-cols="4">
        <div className="stp-stat">
          <span className="stp-stat-label">Abertas</span>
          <span className="stp-stat-value">{counts.open}</span>
        </div>
        <div className="stp-stat">
          <span className="stp-stat-label">Em análise</span>
          <span className="stp-stat-value">{counts.review}</span>
        </div>
        <div className="stp-stat">
          <span className="stp-stat-label">Vencem em menos de 3 h</span>
          <span className="stp-stat-value">{counts.soon}</span>
          <span className="stp-stat-note" data-tone={counts.soon ? 'danger' : undefined}>
            {counts.soon ? 'fila prioritária' : 'tudo no prazo'}
          </span>
        </div>
        <div className="stp-stat">
          <span className="stp-stat-label">Resolvidas</span>
          <span className="stp-stat-value">{counts.done}</span>
        </div>
      </div>

      <search className="stp-toolbar" aria-label="Filtrar denúncias">
        <label className="stp-field" data-grow>
          <SearchIcon size={14} aria-hidden="true" />
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
          <span className="stp-sr">Status</span>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as StatusFilter);
              reset();
            }}
            data-testid="stp-status"
          >
            <option value="all">Todos os status</option>
            <option value="open">Abertas</option>
            <option value="review">Em análise</option>
            <option value="done">Resolvidas</option>
          </select>
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
              setStatus('all');
              setCategory('all');
              onUrgentOnly(false);
              reset();
            }}
          >
            <XIcon size={13} aria-hidden="true" /> Limpar
          </button>
        ) : null}
      </search>

      <div className="stp-card">
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
                  <td className="stp-mono">
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

        <ul className="stp-cards stp-list" data-testid="stp-cards">
          {slice.map((r) => {
            const d = liveDeadline(r, nowMs);
            return (
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
                  <Eta deadline={d} />
                </button>
              </li>
            );
          })}
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
              className="stp-btn"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
              aria-label="Página anterior"
            >
              <ChevronLeftIcon size={14} aria-hidden="true" />
            </button>
            <span style={{ alignSelf: 'center' }} className="num">
              {current + 1} / {pages}
            </span>
            <button
              type="button"
              className="stp-btn"
              disabled={current >= pages - 1}
              onClick={() => setPage(current + 1)}
              aria-label="Próxima página"
            >
              <ChevronRightIcon size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <Dialog.Root open={selected !== null} onOpenChange={(open) => !open && setOpenId(null)}>
        <Dialog.Portal container={portal}>
          <Dialog.Overlay className="stp-overlay" />
          {selected ? (
            <Dialog.Content className="stp-drawer" data-testid="stp-detail">
              <div className="stp-card-head" style={{ minHeight: 48 }}>
                <Dialog.Title style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
                  <span className="stp-mono">{selected.id}</span> · {selected.reported}
                </Dialog.Title>
                <Dialog.Close className="stp-icon-btn" aria-label="Fechar">
                  <XIcon size={16} aria-hidden="true" />
                </Dialog.Close>
              </div>
              <Dialog.Description className="stp-sr">
                Detalhes da denúncia e ações da Staff.
              </Dialog.Description>
              <div className="stp-drawer-body">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <StatusTag status={selected.status} />
                  <span className="stp-tag">{CATEGORY_LABEL[selected.category]}</span>
                </div>
                <dl className="stp-dl">
                  <dt>Denunciado</dt>
                  <dd>{selected.reported}</dd>
                  <dt>SteamID</dt>
                  <dd className="stp-mono">{selected.steamId}</dd>
                  <dt>Denunciante</dt>
                  <dd>{selected.reporter}</dd>
                  <dt>Servidor</dt>
                  <dd>{selected.server}</dd>
                  <dt>Prazo</dt>
                  <dd>
                    <Eta deadline={liveDeadline(selected, nowMs)} />
                  </dd>
                </dl>
                <p className="stp-quote">{selected.note}</p>
              </div>
              <div className="stp-drawer-foot">
                {selected.status === 'open' ? (
                  <button
                    type="button"
                    className="stp-btn"
                    onClick={() => onStatus(selected.id, 'review', `${selected.id} em análise`)}
                  >
                    Assumir
                  </button>
                ) : null}
                {selected.status !== 'done' ? (
                  <>
                    <button
                      type="button"
                      className="stp-btn"
                      data-kind="primary"
                      onClick={() => {
                        onStatus(selected.id, 'done', `${selected.id} resolvida`);
                        setOpenId(null);
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
                    onClick={() => onStatus(selected.id, 'open', `${selected.id} reaberta`)}
                  >
                    Reabrir
                  </button>
                )}
              </div>
            </Dialog.Content>
          ) : null}
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
