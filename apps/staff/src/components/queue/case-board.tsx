'use client';

import {
  ArrowUpDownIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  SearchIcon,
  XIcon,
} from 'lucide-react';
import { type ReactNode, useMemo, useRef, useState } from 'react';
import { matchesQuery, paginate, type SortState, sortCases } from '@/lib/queue';
import { useFlip } from './use-flip';

export type Column<T, K extends string> = {
  key: K;
  label: string;
  /** Sem `sortable`, o cabeçalho é só um rótulo. */
  sortable?: boolean;
  render: (item: T) => ReactNode;
};

export type LoadMore = {
  available: boolean;
  loading: boolean;
  failed: boolean;
  onLoad: () => void;
};

/**
 * A lista de casos de uma fila (Denúncias, Fotos): busca, filtro por motivo, ordenação pelo cabeçalho, paginação, a
 * linha selecionada em fundo suave e, no celular, a mesma lista como cartões. A ordem, o filtro e a página animam
 * (FLIP, só `transform`); quem acabou de ser decidido (`leaving`) sai deslizando. O detalhe é de quem usa.
 */
export function CaseBoard<T, K extends string>({
  testId,
  caption,
  items,
  getId,
  searchText,
  searchPlaceholder,
  reasonOf,
  reasonOptions,
  columns,
  sortValue,
  defaultSort,
  selectedId,
  onSelect,
  renderCard,
  leaving,
  loadMore,
  emptyTitle,
  emptyText,
  pageSize = 10,
  toolbarExtra,
}: {
  testId: string;
  caption: string;
  items: readonly T[];
  getId: (item: T) => string;
  searchText: (item: T) => string;
  searchPlaceholder: string;
  reasonOf?: (item: T) => string;
  reasonOptions?: { value: string; label: string }[];
  columns: Column<T, K>[];
  sortValue: (item: T, key: K) => string | number | null;
  defaultSort: SortState<K>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  renderCard: (item: T) => ReactNode;
  leaving: ReadonlySet<string>;
  loadMore: LoadMore;
  emptyTitle: string;
  emptyText: string;
  pageSize?: number;
  toolbarExtra?: ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [reason, setReason] = useState('all');
  const [sort, setSort] = useState<SortState<K>>(defaultSort);
  const [page, setPage] = useState(0);
  const surface = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => {
    const filtered = items.filter(
      (item) =>
        (reason === 'all' || !reasonOf || reasonOf(item) === reason) &&
        matchesQuery(searchText(item), query),
    );
    return sortCases(filtered, sortValue, sort);
  }, [items, query, reason, sort, reasonOf, searchText, sortValue]);

  const paged = paginate(rows, page, pageSize);
  const filtering = query !== '' || reason !== 'all';

  useFlip(
    surface,
    `${sort.key}${sort.dir}|${query}|${reason}|${paged.page}|${paged.slice.map(getId).join(',')}`,
  );

  const toggleSort = (key: K) => {
    setSort((current) =>
      current.key === key ? { key, dir: current.dir === 1 ? -1 : 1 } : { key, dir: 1 },
    );
    setPage(0);
  };

  const sortable = columns.filter((column) => column.sortable);

  return (
    <div className="stp-board" data-testid={testId}>
      <search className="stp-toolbar" aria-label="Filtrar a fila">
        <label className="stp-field" data-grow>
          <SearchIcon size={15} aria-hidden="true" />
          <span className="stp-sr">Buscar na fila</span>
          <input
            type="search"
            placeholder={searchPlaceholder}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
            data-testid="stp-query"
          />
        </label>
        {reasonOptions ? (
          <label className="stp-field">
            <span className="stp-sr">Motivo</span>
            <select
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setPage(0);
              }}
              data-testid="stp-reason"
            >
              <option value="all">Todos os motivos</option>
              {reasonOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {toolbarExtra}
        <label className="stp-field stp-sort-select">
          <span className="stp-sr">Ordenar por</span>
          <select
            value={sort.key}
            onChange={(event) => {
              setSort({ key: event.target.value as K, dir: 1 });
              setPage(0);
            }}
          >
            {sortable.map((column) => (
              <option key={column.key} value={column.key}>
                {column.label}
              </option>
            ))}
          </select>
        </label>
        {filtering ? (
          <button
            type="button"
            className="stp-chip"
            onClick={() => {
              setQuery('');
              setReason('all');
              setPage(0);
            }}
          >
            <XIcon size={14} aria-hidden="true" /> Limpar
          </button>
        ) : null}
      </search>

      <div className="stp-card stp-table-card" ref={surface}>
        <div className="stp-table-wrap">
          <table className="stp-table" data-testid={`${testId}-table`}>
            <caption className="stp-sr">{caption}</caption>
            <thead>
              <tr>
                {columns.map((column) => {
                  const active = sort.key === column.key;
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      aria-sort={
                        active && column.sortable
                          ? sort.dir === 1
                            ? 'ascending'
                            : 'descending'
                          : undefined
                      }
                    >
                      {column.sortable ? (
                        <button
                          type="button"
                          className="stp-th"
                          onClick={() => toggleSort(column.key)}
                        >
                          {column.label}
                          {active ? (
                            sort.dir === 1 ? (
                              <ChevronUpIcon size={13} aria-hidden="true" />
                            ) : (
                              <ChevronDownIcon size={13} aria-hidden="true" />
                            )
                          ) : (
                            <ArrowUpDownIcon
                              size={12}
                              aria-hidden="true"
                              style={{ opacity: 0.55 }}
                            />
                          )}
                        </button>
                      ) : (
                        <span className="stp-th">{column.label}</span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {paged.slice.map((item) => {
                const id = getId(item);
                return (
                  <tr
                    key={id}
                    data-flip-key={id}
                    data-testid="stp-row"
                    data-leaving={leaving.has(id) ? '' : undefined}
                    aria-selected={selectedId === id}
                    onClick={() => onSelect(id)}
                  >
                    {columns.map((column, index) => (
                      <td key={column.key}>
                        {index === 0 ? (
                          <button
                            type="button"
                            className="stp-cell-link"
                            onClick={(event) => {
                              event.stopPropagation();
                              onSelect(id);
                            }}
                          >
                            {column.render(item)}
                          </button>
                        ) : (
                          column.render(item)
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <ul className="stp-cards stp-list" data-testid={`${testId}-cards`} style={{ margin: 0 }}>
          {paged.slice.map((item) => {
            const id = getId(item);
            return (
              <li
                key={id}
                data-flip-key={`card-${id}`}
                data-leaving={leaving.has(id) ? '' : undefined}
              >
                <button type="button" className="stp-card-row" onClick={() => onSelect(id)}>
                  {renderCard(item)}
                </button>
              </li>
            );
          })}
        </ul>

        {rows.length === 0 ? (
          <div className="stp-empty" data-testid="stp-empty">
            <b>{filtering ? 'Nada com esses filtros' : emptyTitle}</b>
            <span>
              {filtering
                ? 'Tire um filtro ou limpe a busca para ver tudo que carregou.'
                : emptyText}
            </span>
          </div>
        ) : null}

        <div className="stp-pager">
          <span data-testid="stp-range">
            {paged.from}–{paged.to} de {paged.total}
          </span>
          <div>
            <button
              type="button"
              className="stp-round"
              disabled={paged.page === 0}
              onClick={() => setPage(paged.page - 1)}
              aria-label="Página anterior"
            >
              <ChevronLeftIcon size={15} aria-hidden="true" />
            </button>
            <span>
              {paged.page + 1} / {paged.pages}
            </span>
            <button
              type="button"
              className="stp-round"
              disabled={paged.page >= paged.pages - 1}
              onClick={() => setPage(paged.page + 1)}
              aria-label="Próxima página"
            >
              <ChevronRightIcon size={15} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div className="stp-more" role="status">
        {loadMore.available ? (
          <button
            type="button"
            className="stp-btn"
            onClick={loadMore.onLoad}
            disabled={loadMore.loading}
            aria-busy={loadMore.loading || undefined}
            data-testid="stp-load-more"
          >
            Carregar mais
          </button>
        ) : (
          <span className="stp-muted">Fim da fila.</span>
        )}
        {loadMore.failed ? (
          <span className="stp-field-error">Não deu para carregar mais agora.</span>
        ) : null}
      </div>
    </div>
  );
}
