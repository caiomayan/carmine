'use client';

import type { LiveServer, PlayerSearchHit } from '@carmine/contracts';
import { SEARCH_MIN_LENGTH } from '@carmine/contracts/rules';
import {
  CompassIcon,
  CrosshairIcon,
  HistoryIcon,
  LogInIcon,
  LogOutIcon,
  type LucideIcon,
  PackageIcon,
  ServerIcon,
  ShieldIcon,
  SlidersHorizontalIcon,
  SunMoonIcon,
  TrophyIcon,
  UserIcon,
  XIcon,
} from 'lucide-react';
import type { Route } from 'next';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Dialog } from 'radix-ui';
import { type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from '@/components/avatar';
import { RARITY_COLOR } from '@/components/inventory/item-tile';
import { useSession } from '@/components/session/session-provider';
import { StatusDot } from '@/components/status-dot';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useTheme } from '@/hooks/use-theme';
import { signInHref } from '@/lib/auth-links';
import { serverHref } from '@/lib/live-servers';
import { mapDisplayName } from '@/lib/map-art';
import { searchScore } from '@/lib/option-search';
import { type EntryId, type StaticEntry, staticEntries } from '@/lib/search/entries';
import { addRecent, clearRecent, loadRecent, saveRecent } from '@/lib/search/history';
import type { ItemHit } from '@/lib/search/items';
import {
  groupResults,
  type Hit,
  type PaletteGroup,
  rankStatic,
  type Searchable,
  scoreServer,
} from '@/lib/search/palette';
import { oppositeTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { usePaletteData } from './use-palette-data';

type Entry = StaticEntry & Searchable;

type Row =
  | { type: 'entry'; entry: Entry }
  | { type: 'item'; source: 'inventory' | 'catalog'; hit: ItemHit }
  | { type: 'player'; hit: PlayerSearchHit }
  | { type: 'server'; server: LiveServer };

const ENTRY_ICON: Record<EntryId, LucideIcon> = {
  servers: ServerIcon,
  inventory: PackageIcon,
  loadout: CrosshairIcon,
  ranking: TrophyIcon,
  profile: UserIcon,
  settings: SlidersHorizontalIcon,
  staff: ShieldIcon,
  theme: SunMoonIcon,
  firstSteps: CompassIcon,
  signOut: LogOutIcon,
  signIn: LogInIcon,
};

function rowKey(row: Row): string {
  switch (row.type) {
    case 'entry':
      return `entry:${row.entry.id}`;
    case 'item':
      return row.source === 'inventory' ? `inventory:${row.hit.uid}` : `catalog:${row.hit.id}`;
    case 'player':
      return `player:${row.hit.publicId}`;
    case 'server':
      return `server:${row.server.id}`;
  }
}

/** Painel: tela cheia no celular; no desktop, uma folha centrada perto do alto. */
const PANEL = cn(
  'palette-panel fixed z-50 flex flex-col bg-popover text-popover-foreground outline-none',
  'max-md:inset-0',
  'md:inset-x-0 md:top-[10vh] md:mx-auto md:max-h-[min(36rem,78dvh)] md:w-[min(40rem,calc(100vw-2rem))] md:rounded-xl',
  'md:shadow-[0_28px_72px_-24px_var(--shadow)]',
);

const GROUP_HEADING =
  '[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-[0.14em] [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase';

const ROW =
  'min-h-12 gap-3 px-2.5 transition-colors duration-(--dur-fast) ease-std data-[selected=true]:bg-(--fill-active) max-md:min-h-14';

/**
 * A paleta de comandos (Ctrl+K, U3d). Carrega só ao abrir (o botão do cabeçalho a importa sob
 * demanda): a primeira carga do site não paga por ela. Fica montada depois da primeira abertura
 * para o Dialog poder animar a saída; o corpo (busca, dados) monta a cada abertura, então cada
 * abertura começa limpa e só então consulta a API.
 */
export function SearchPalette({
  open,
  onOpenChange,
  openerRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  openerRef: RefObject<HTMLElement | null>;
}) {
  const t = useTranslations('search.palette');
  // O Primeiros passos leva o foco para o Dialog dele: a paleta não pode devolvê-lo ao botão.
  const [keepFocus, setKeepFocus] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="palette-overlay fixed inset-0 z-50 bg-black/50 light:bg-black/25" />
        <Dialog.Content
          className={PANEL}
          data-testid="search-palette"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!keepFocus) openerRef.current?.focus();
            setKeepFocus(false);
          }}
        >
          <Dialog.Title className="sr-only">{t('title')}</Dialog.Title>
          <Dialog.Description className="sr-only">{t('description')}</Dialog.Description>
          <PaletteBody
            openerRef={openerRef}
            onClose={() => onOpenChange(false)}
            onKeepFocus={() => setKeepFocus(true)}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PaletteBody({
  openerRef,
  onClose,
  onKeepFocus,
}: {
  openerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onKeepFocus: () => void;
}) {
  const t = useTranslations('search');
  const router = useRouter();
  const pathname = usePathname();
  const { account, staffRole, signOut, firstSteps } = useSession();
  const { theme, setTheme } = useTheme();
  const publicId = account?.publicId ?? null;

  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  // A pessoa moveu a seleção (setas ou ponteiro) para fora do primeiro resultado.
  const moved = useRef(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const data = usePaletteData(query);
  const text = query.trim();

  useEffect(() => setRecent(loadRecent(publicId)), [publicId]);

  const entries = useMemo<Entry[]>(
    () =>
      staticEntries({ account, staff: staffRole !== null }).map((entry) => {
        // O tema mostra o destino da troca, como o botão da barra.
        const key =
          entry.id === 'theme' ? (theme === 'light' ? 'themeToDark' : 'themeToLight') : entry.id;
        return {
          ...entry,
          label: t(`entries.${key}.label`),
          keywords: [t(`entries.${key}.keywords`)],
        };
      }),
    [account, staffRole, theme, t],
  );

  const hits = useMemo<Hit<Row>[]>(() => {
    const list: Hit<Row>[] = rankStatic(entries, text).map(({ item, score }) => ({
      group: item.group,
      score,
      item: { type: 'entry', entry: item },
    }));
    if (!data.searching) return list;
    for (const hit of data.items.data.inventory) {
      list.push({
        group: 'inventory',
        score: hit.score,
        item: { type: 'item', source: 'inventory', hit },
      });
    }
    for (const hit of data.items.data.catalog) {
      list.push({
        group: 'catalog',
        score: hit.score,
        item: { type: 'item', source: 'catalog', hit },
      });
    }
    for (const hit of data.players.data) {
      // A API já filtrou; a relevância só ordena (o piso evita que o nome com acento some).
      const score = Math.max(searchScore(hit.displayName, text), 0.1);
      list.push({ group: 'players', score, item: { type: 'player', hit } });
    }
    for (const server of data.servers.data) {
      const score = scoreServer(server, text);
      if (score > 0) list.push({ group: 'servers', score, item: { type: 'server', server } });
    }
    return list;
  }, [entries, text, data.searching, data.items.data, data.players.data, data.servers.data]);

  const groups = useMemo(() => groupResults(hits), [hits]);
  const showRecent = text === '' && recent.length > 0;
  const keys = useMemo(
    () => [
      ...(showRecent ? recent.map((entry) => `recent:${entry}`) : []),
      ...groups.flatMap((group) => group.hits.map((hit) => rowKey(hit.item))),
    ],
    [showRecent, recent, groups],
  );
  const firstKey = keys[0] ?? '';

  // A seleção volta ao primeiro resultado quando o topo muda (nova busca, resposta que chegou),
  // a menos que a pessoa já tenha andado pela lista: a resposta lenta não troca o que ela escolheu.
  // biome-ignore lint/correctness/useExhaustiveDependencies: só o topo da lista reposiciona a seleção
  useEffect(() => {
    if (!moved.current || !keys.includes(selected)) {
      moved.current = false;
      setSelected(firstKey);
    }
  }, [firstKey]);

  const total = groups.reduce((sum, group) => sum + group.hits.length, 0);
  const loading =
    data.searching && (data.items.status === 'loading' || data.players.status === 'loading');
  // Com resultados da busca anterior na tela, a lista só se atenua até a nova chegar.
  const hasRemote = hits.some((hit) => hit.group !== 'pages' && hit.group !== 'actions');
  const sources = [data.items, data.players, data.servers];
  const failed = data.searching && sources.some((source) => source.status === 'error');
  // Nenhuma fonte ainda por responder (os servidores contam: o vazio não pode piscar antes deles).
  const settled = data.searching && sources.every((source) => source.status !== 'loading');

  function remember() {
    if (text.length < SEARCH_MIN_LENGTH) return;
    const next = addRecent(recent, text);
    setRecent(next);
    saveRecent(publicId, next);
  }

  function go(href: string) {
    remember();
    onClose();
    router.push(href as Route);
  }

  /**
   * Link com âncora: o realce do cartão (`:target`) só acompanha a navegação do navegador, não o
   * `pushState` do roteador. Na própria home é só trocar o fragmento; vindo de fora, carrega a home.
   */
  function goToAnchor(href: string) {
    remember();
    onClose();
    window.location.assign(href);
  }

  async function choose(row: Row) {
    switch (row.type) {
      case 'entry': {
        const { entry } = row;
        if (entry.kind === 'link') {
          go(entry.id === 'signIn' ? signInHref(pathname) : entry.href);
        } else if (entry.id === 'theme') {
          remember();
          onClose();
          setTheme(oppositeTheme(theme ?? 'dark'));
        } else if (entry.id === 'firstSteps') {
          remember();
          onKeepFocus();
          onClose();
          firstSteps.openDialog(openerRef.current);
        } else if (entry.id === 'signOut') {
          setSignOutFailed(false);
          if (await signOut()) onClose();
          else setSignOutFailed(true);
        }
        return;
      }
      case 'item':
        return go(
          row.source === 'inventory'
            ? `/inventario/${row.hit.uid}`
            : `/inventario/adicionar/${row.hit.id}`,
        );
      case 'player':
        return go(`/${row.hit.publicId}`);
      case 'server':
        return goToAnchor(serverHref(row.server));
    }
  }

  const renderGroup = (group: PaletteGroup, groupHits: Hit<Row>[]) => (
    <CommandGroup key={group} heading={t(`groups.${group}`)} className={GROUP_HEADING}>
      {groupHits.map(({ item: row }) => (
        <CommandItem
          key={rowKey(row)}
          value={rowKey(row)}
          onSelect={() => choose(row)}
          className={ROW}
          data-testid={`palette-${row.type}`}
        >
          <RowView row={row} />
        </CommandItem>
      ))}
    </CommandGroup>
  );

  return (
    <Command
      shouldFilter={false}
      loop
      vimBindings={false}
      value={selected}
      onValueChange={(next) => {
        moved.current = next !== firstKey;
        setSelected(next);
      }}
      label={t('palette.title')}
      className="min-h-0 flex-1 rounded-none bg-transparent md:rounded-xl"
    >
      <div className="flex items-center gap-1 p-2 pb-1">
        <CommandInput
          value={query}
          onValueChange={(next) => {
            moved.current = false;
            setQuery(next);
            setSignOutFailed(false);
          }}
          placeholder={t('palette.placeholder')}
          aria-label={t('palette.title')}
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          wrapperClassName="m-0 flex-1"
          className="min-h-(--tap) bg-(--fill-rest) text-sm max-md:text-base"
          data-testid="palette-input"
        />
        <Dialog.Close asChild>
          <Button
            type="button"
            variant="quiet"
            size="icon"
            aria-label={t('palette.close')}
            className="md:hidden"
          >
            <XIcon aria-hidden="true" className="size-5" />
          </Button>
        </Dialog.Close>
      </div>

      <CommandList
        label={t('palette.listLabel')}
        className={cn(
          'max-h-none min-h-0 flex-[0_1_auto] px-2 pb-2 transition-opacity duration-(--dur-base) ease-std md:max-h-[min(28rem,60dvh)]',
          loading && hasRemote && 'opacity-60',
        )}
        aria-busy={loading || undefined}
        data-testid="palette-list"
      >
        {showRecent ? (
          <CommandGroup heading={t('groups.recent')} className={GROUP_HEADING}>
            {recent.map((entry) => (
              <CommandItem
                key={entry}
                value={`recent:${entry}`}
                onSelect={() => setQuery(entry)}
                className={ROW}
                data-testid="palette-recent"
              >
                <Leading>
                  <HistoryIcon aria-hidden="true" className="size-4" />
                </Leading>
                <span className="min-w-0 flex-1 truncate">{entry}</span>
              </CommandItem>
            ))}
            <CommandItem
              value="recent-clear"
              onSelect={() => {
                clearRecent(publicId);
                setRecent([]);
              }}
              className={cn(ROW, 'min-h-10 text-[13px]', 'muted-on-fill')}
              data-testid="palette-recent-clear"
            >
              <Leading>
                <XIcon aria-hidden="true" className="size-4" />
              </Leading>
              {t('recent.clear')}
            </CommandItem>
          </CommandGroup>
        ) : null}

        {groups.map((group) => renderGroup(group.group, group.hits))}
      </CommandList>

      <Status
        text={text}
        total={total}
        loading={loading}
        skeleton={loading && !hasRemote}
        failed={failed}
        signOutFailed={signOutFailed}
        settled={settled}
        onRetry={data.retry}
      />

      <p
        aria-hidden="true"
        className="hidden items-center gap-4 px-4 py-2.5 text-[12px] text-muted-foreground md:flex"
      >
        <Hint keys={['↑', '↓']} label={t('keys.navigate')} />
        <Hint keys={['↵']} label={t('keys.open')} />
        <Hint keys={[t('keys.esc')]} label={t('keys.close')} />
      </p>
    </Command>
  );
}

function Leading({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-8 shrink-0 place-items-center overflow-hidden rounded-md bg-(--fill-rest)',
        'muted-on-fill',
      )}
    >
      {children}
    </span>
  );
}

function Hint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {keys.map((key) => (
        <kbd
          key={key}
          className={cn(
            'grid min-w-5 place-items-center rounded-sm bg-(--fill-rest) px-1 py-0.5 font-sans text-[11px] leading-none font-medium',
            'muted-on-fill',
          )}
        >
          {key}
        </kbd>
      ))}
      {label}
    </span>
  );
}

function RowText({
  title,
  subtitle,
  dot,
}: {
  title: string;
  subtitle?: string | null;
  dot?: string;
}) {
  return (
    <span className="grid min-w-0 flex-1 gap-0.5">
      <span className="flex items-center gap-1.5 truncate text-sm font-medium">
        {dot ? (
          <span
            aria-hidden="true"
            className="inline-block size-1.5 shrink-0 rounded-full"
            style={{ background: dot }}
          />
        ) : null}
        <span className="truncate">{title}</span>
      </span>
      {subtitle ? (
        <span className={cn('truncate text-[12px]', 'muted-on-fill')}>{subtitle}</span>
      ) : null}
    </span>
  );
}

function Trailing({ children }: { children: ReactNode }) {
  return (
    <span className={cn('shrink-0 text-[12px] tabular-nums', 'muted-on-fill')}>{children}</span>
  );
}

function RowView({ row }: { row: Row }) {
  const t = useTranslations('search');
  switch (row.type) {
    case 'entry': {
      const Icon = ENTRY_ICON[row.entry.id];
      return (
        <>
          <Leading>
            <Icon aria-hidden="true" className="size-4" />
          </Leading>
          <RowText title={row.entry.label} />
        </>
      );
    }
    case 'item': {
      const { hit } = row;
      const skin = hit.skinFirst && hit.subtitle;
      return (
        <>
          <Leading>
            {hit.image ? (
              // biome-ignore lint/performance/noImgElement: imagem da CDN da cs2-lib, sem otimização no Next (next.config).
              <img
                src={hit.image}
                alt=""
                width={32}
                height={24}
                loading="lazy"
                decoding="async"
                className="size-full object-contain"
              />
            ) : null}
          </Leading>
          <RowText
            title={skin ? (hit.subtitle as string) : hit.title}
            subtitle={skin ? hit.title : hit.subtitle}
            dot={RARITY_COLOR[hit.rarity]}
          />
        </>
      );
    }
    case 'player':
      return (
        <>
          <Avatar
            src={row.hit.avatarUrl}
            name={row.hit.displayName}
            size={32}
            className="bg-(--fill-hover)"
          />
          <RowText title={row.hit.displayName} />
        </>
      );
    case 'server': {
      const { server } = row;
      const tone =
        server.state === 'online' ? 'online' : server.state === 'full' ? 'warn' : 'offline';
      return (
        <>
          <Leading>
            <StatusDot tone={tone} className="size-2" />
          </Leading>
          <RowText
            title={server.showcaseName ?? server.name}
            subtitle={mapDisplayName(server.map)}
          />
          <Trailing>
            {server.state === 'offline'
              ? t('hints.serverOffline')
              : server.state === 'full'
                ? t('hints.serverFull')
                : t('hints.server', { players: server.players, max: server.maxPlayers })}
          </Trailing>
        </>
      );
    }
  }
}

/**
 * O que a lista não diz sozinha: carregando, vazio, erro (e "Tentar de novo"), mais um anúncio
 * para leitores de tela com a quantidade de resultados. O erro de uma fonte não esconde o que as
 * outras trouxeram.
 */
function Status({
  text,
  total,
  loading,
  skeleton,
  failed,
  signOutFailed,
  settled,
  onRetry,
}: {
  text: string;
  total: number;
  loading: boolean;
  /** O esqueleto só aparece quando não há nenhum resultado da busca para mostrar. */
  skeleton: boolean;
  failed: boolean;
  signOutFailed: boolean;
  /** Todas as fontes responderam (ou falharam) para a busca de agora. */
  settled: boolean;
  onRetry: () => void;
}) {
  const t = useTranslations('search.status');
  const empty = settled && !failed && total === 0;

  return (
    <>
      {/* Quando a lista só tem as páginas e ações, a busca ainda traz Itens e jogadores. */}
      {skeleton ? (
        <div data-testid="palette-loading" className="grid gap-2 px-2.5 py-3" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <span key={index} className="flex items-center gap-3">
              <span className="shimmer size-8 shrink-0 rounded-md" />
              <span
                className="shimmer h-3 w-40 max-w-full rounded-sm"
                style={{ opacity: 1 - index * 0.25 }}
              />
            </span>
          ))}
        </div>
      ) : null}

      {empty ? (
        <div data-testid="palette-empty" className="grid gap-1 px-4 py-8 text-center">
          <p className="text-sm font-medium break-words">{t('empty', { query: text })}</p>
          <p className="text-[13px] text-muted-foreground">{t('emptyHint')}</p>
        </div>
      ) : null}

      {failed && !loading ? (
        <div
          data-testid="palette-error"
          className="flex items-center justify-between gap-3 px-2.5 py-3 text-[13px]"
        >
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-status-danger" />
            {total === 0 ? t('error') : t('partialError')}
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={onRetry}>
            {t('retry')}
          </Button>
        </div>
      ) : null}

      {signOutFailed ? (
        <p
          data-testid="palette-signout-failed"
          role="alert"
          className="flex items-center gap-2 px-2.5 py-3 text-[13px]"
        >
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-status-danger" />
          {t('signOutFailed')}
        </p>
      ) : null}

      <div role="status" aria-live="polite" className="sr-only">
        {loading ? t('loading') : settled && !failed ? t('count', { count: total }) : ''}
      </div>
    </>
  );
}
