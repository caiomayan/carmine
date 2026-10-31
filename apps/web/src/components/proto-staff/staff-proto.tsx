'use client';

import { Command } from 'cmdk';
import {
  ActivityIcon,
  ClockIcon,
  CreditCardIcon,
  EllipsisIcon,
  FlagIcon,
  ImageIcon,
  LayoutDashboardIcon,
  MoonIcon,
  PanelLeftIcon,
  SearchIcon,
  ServerIcon,
  SunIcon,
  UserIcon,
} from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { ArtPair } from '@/components/vida/map-art';
import './staff-proto.css';
import {
  ACCOUNTS,
  type ModeId,
  makePhotos,
  makeReports,
  type Photo,
  type Report,
  type ReportStatus,
} from './data';
import { Reports } from './reports';
import { Inicio, Photos, Stub, type ViewId } from './views';

type Theme = 'auto' | 'light' | 'dark';
type Toast = { text: string; undo?: () => void };

const TITLES: Record<ViewId, string> = {
  inicio: 'Início',
  denuncias: 'Denúncias',
  fotos: 'Fotos denunciadas',
  contas: 'Contas',
  pagamentos: 'Pagamentos',
  servidores: 'Servidores',
  auditoria: 'Auditoria',
};

const REVIEW: { id: ViewId; icon: typeof FlagIcon }[] = [
  { id: 'inicio', icon: LayoutDashboardIcon },
  { id: 'denuncias', icon: FlagIcon },
  { id: 'fotos', icon: ImageIcon },
];
const MANAGE: { id: ViewId; icon: typeof FlagIcon }[] = [
  { id: 'contas', icon: UserIcon },
  { id: 'pagamentos', icon: CreditCardIcon },
  { id: 'servidores', icon: ServerIcon },
  { id: 'auditoria', icon: ClockIcon },
];

/**
 * O protótipo do Painel da Staff (S25, PR A): a moldura com o trilho de ícones em cápsulas (recolhível), a barra de
 * cima, as abas do celular, o Ctrl+K e as telas de exemplo. Tudo em memória, com dados fictícios.
 */
export function StaffProto({
  nowMs,
  heroMap,
  heroArt,
}: {
  nowMs: number;
  heroMap: string | null;
  heroArt: ArtPair | null;
}) {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [view, setView] = useState<ViewId>('inicio');
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState<Theme>('auto');
  const [siteTheme, setSiteTheme] = useState<'light' | 'dark'>('dark');
  const [now, setNow] = useState(nowMs);
  const [reports, setReports] = useState<Report[]>(() => makeReports(nowMs));
  const [photos, setPhotos] = useState<Photo[]>(() => makePhotos(nowMs));
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [mode, setMode] = useState<ModeId>('all');
  const [palette, setPalette] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  useLayoutEffect(() => {
    setSiteTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  }, []);

  // O prazo é em minutos: um tique por minuto basta, e não gira com a aba escondida.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') setNow(Date.now());
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), toast.undo ? 6000 : 3200);
    return () => clearTimeout(id);
  }, [toast]);

  // Ctrl+K em captura: o painel toma o atalho antes da busca do site, que fica escondida atrás dele.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const k = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && k === 'k') {
        event.preventDefault();
        event.stopPropagation();
        setPalette((open) => !open);
        return;
      }
      const target = event.target as HTMLElement | null;
      const typing =
        target?.isContentEditable ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '');
      if (!typing && !event.ctrlKey && !event.metaKey && !event.altKey && k === '[') {
        setCollapsed((value) => !value);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const resolved = theme === 'auto' ? siteTheme : theme;
  const toggleTheme = useCallback(
    () => setTheme(resolved === 'dark' ? 'light' : 'dark'),
    [resolved],
  );

  const setStatus = useCallback((id: string, status: ReportStatus, text: string) => {
    const at = Date.now();
    setReports((list) =>
      list.map((r) => {
        if (r.id !== id) return r;
        const next: Report = { ...r, status };
        if (status === 'review') next.assumedAt = at;
        if (status === 'done') {
          next.assumedAt = r.assumedAt ?? at;
          next.resolvedAt = at;
        }
        if (status === 'open') {
          next.assumedAt = undefined;
          next.resolvedAt = undefined;
        }
        return next;
      }),
    );
    setToast({ text });
  }, []);

  const decide = useCallback((photo: Photo, approved: boolean) => {
    setPhotos((list) => list.filter((p) => p.id !== photo.id));
    setToast({
      text: `${photo.account}: foto ${approved ? 'mantida' : 'removida, volta a da Steam'}`,
      undo: () => setPhotos((list) => [...list, photo]),
    });
  }, []);

  const go = useCallback((next: ViewId) => {
    setView(next);
    setPalette(false);
  }, []);

  const counts: Partial<Record<ViewId, number>> = {
    denuncias: reports.filter((r) => r.status !== 'done').length,
    fotos: photos.length,
  };

  const commands = useMemo(
    () => ({
      urgent: () => {
        setUrgentOnly(true);
        setView('denuncias');
      },
      nextPhoto: () => {
        const first = [...photos].sort((a, b) => a.sentAt - b.sentAt)[0];
        if (!first) return setToast({ text: 'Nenhuma foto esperando' });
        decide(first, true);
        setView('fotos');
      },
    }),
    [photos, decide],
  );

  const railItem = ({ id, icon: Icon }: { id: ViewId; icon: typeof FlagIcon }) => {
    const count = counts[id];
    return (
      <button
        key={id}
        type="button"
        className="stp-item"
        aria-current={view === id ? 'page' : undefined}
        aria-label={TITLES[id]}
        data-tip={TITLES[id]}
        data-testid={`stp-nav-${id}`}
        onClick={() => go(id)}
      >
        <Icon size={18} aria-hidden="true" />
        {count ? <span className="stp-badge">{count}</span> : null}
      </button>
    );
  };

  return (
    <div
      ref={setRoot}
      className="stp"
      data-stp=""
      data-theme={resolved}
      data-collapsed={collapsed ? '' : undefined}
      data-testid="stp"
      data-view={view}
    >
      <div className="stp-frame">
        <aside className="stp-rail" aria-label="Painel da Staff">
          <span className="stp-mark" aria-hidden="true" title="Carmine">
            C
          </span>
          <nav className="stp-pill" aria-label="Revisão">
            {REVIEW.map(railItem)}
          </nav>
          <nav className="stp-pill" aria-label="Gestão">
            {MANAGE.map(railItem)}
          </nav>
          <div className="stp-pill stp-rail-foot">
            <button
              type="button"
              className="stp-item"
              onClick={() => setCollapsed((value) => !value)}
              aria-expanded={!collapsed}
              aria-label={collapsed ? 'Expandir o trilho' : 'Recolher o trilho'}
              data-tip="Recolher (tecla [)"
              data-testid="stp-collapse"
            >
              <PanelLeftIcon size={18} aria-hidden="true" />
            </button>
          </div>
        </aside>

        <div className="stp-main">
          <header className="stp-top">
            <div className="stp-crumbs">
              <span className="stp-crumb-root">Staff /</span>
              <b>{TITLES[view]}</b>
            </div>
            <span className="stp-spacer" />
            <button
              type="button"
              className="stp-search"
              onClick={() => setPalette(true)}
              aria-label="Buscar e executar comandos"
              data-testid="stp-search"
            >
              <SearchIcon size={16} aria-hidden="true" />
              <span>Buscar ou executar…</span>
              <kbd className="stp-kbd">Ctrl K</kbd>
            </button>
            <button
              type="button"
              className="stp-round"
              onClick={toggleTheme}
              aria-label={resolved === 'dark' ? 'Usar o tema claro' : 'Usar o tema escuro'}
              data-testid="stp-theme"
            >
              {resolved === 'dark' ? (
                <SunIcon size={17} aria-hidden="true" />
              ) : (
                <MoonIcon size={17} aria-hidden="true" />
              )}
            </button>
            <span className="stp-avatar" role="img" aria-label="Mara Lopes, Moderadora">
              ML
            </span>
          </header>

          <main className="stp-scroll" id="stp-content" tabIndex={-1}>
            {view === 'inicio' ? (
              <Inicio
                reports={reports}
                photos={photos}
                nowMs={now}
                go={go}
                mode={mode}
                onMode={setMode}
                heroMap={heroMap}
                heroArt={heroArt}
              />
            ) : view === 'denuncias' ? (
              <Reports
                reports={reports}
                nowMs={now}
                onStatus={setStatus}
                urgentOnly={urgentOnly}
                onUrgentOnly={setUrgentOnly}
                portal={root}
              />
            ) : view === 'fotos' ? (
              <Photos photos={photos} nowMs={now} onDecide={decide} />
            ) : (
              <Stub view={view} />
            )}
          </main>
        </div>

        <nav className="stp-tabs" aria-label="Atalhos">
          {(['inicio', 'denuncias', 'fotos'] as const).map((id) => {
            const Icon = REVIEW.find((item) => item.id === id)?.icon ?? FlagIcon;
            return (
              <button
                key={id}
                type="button"
                className="stp-tab"
                aria-current={view === id ? 'page' : undefined}
                onClick={() => go(id)}
              >
                <Icon size={19} aria-hidden="true" />
                {id === 'fotos' ? 'Fotos' : TITLES[id]}
                {counts[id] ? <span className="stp-badge">{counts[id]}</span> : null}
              </button>
            );
          })}
          <button type="button" className="stp-tab" onClick={() => setPalette(true)}>
            <EllipsisIcon size={19} aria-hidden="true" />
            Mais
          </button>
        </nav>
      </div>

      <Dialog.Root open={palette} onOpenChange={setPalette}>
        <Dialog.Portal container={root}>
          <Dialog.Overlay className="stp-overlay" />
          <Dialog.Content
            className="stp-palette"
            data-testid="stp-palette"
            aria-describedby={undefined}
          >
            <Dialog.Title className="stp-sr">Buscar e executar comandos</Dialog.Title>
            <Command label="Comandos do painel">
              <Command.Input placeholder="Buscar uma tela, uma Conta ou um comando" autoFocus />
              <Command.List>
                <Command.Empty>Nada encontrado para essa busca.</Command.Empty>
                <Command.Group heading="Ir para">
                  {[...REVIEW, ...MANAGE].map(({ id, icon: Icon }) => (
                    <Command.Item key={id} value={`ir ${TITLES[id]}`} onSelect={() => go(id)}>
                      <Icon size={16} aria-hidden="true" />
                      {TITLES[id]}
                    </Command.Item>
                  ))}
                </Command.Group>
                <Command.Group heading="Comandos">
                  <Command.Item
                    value="denúncias que vencem em 3 horas urgentes"
                    onSelect={() => {
                      commands.urgent();
                      setPalette(false);
                    }}
                  >
                    <FlagIcon size={16} aria-hidden="true" />
                    Denúncias que vencem em 3 h
                  </Command.Item>
                  <Command.Item
                    value="manter a próxima foto denunciada"
                    onSelect={() => {
                      commands.nextPhoto();
                      setPalette(false);
                    }}
                  >
                    <ImageIcon size={16} aria-hidden="true" />
                    Manter a foto denunciada mais antiga
                  </Command.Item>
                  <Command.Item
                    value="alternar tema claro escuro"
                    onSelect={() => {
                      toggleTheme();
                      setPalette(false);
                    }}
                  >
                    <SunIcon size={16} aria-hidden="true" />
                    Alternar o tema
                  </Command.Item>
                  <Command.Item
                    value="recolher expandir trilho barra lateral"
                    onSelect={() => {
                      setCollapsed((value) => !value);
                      setPalette(false);
                    }}
                  >
                    <PanelLeftIcon size={16} aria-hidden="true" />
                    Recolher ou expandir o trilho
                    <kbd className="stp-kbd">[</kbd>
                  </Command.Item>
                </Command.Group>
                <Command.Group heading="Contas">
                  {ACCOUNTS.map((name) => (
                    <Command.Item
                      key={name}
                      value={`conta ${name}`}
                      onSelect={() => {
                        setToast({ text: `Ficha de ${name} (a tela de Contas migra depois)` });
                        setPalette(false);
                      }}
                    >
                      <ActivityIcon size={16} aria-hidden="true" />
                      {name}
                    </Command.Item>
                  ))}
                </Command.Group>
              </Command.List>
              <div className="stp-palette-foot" aria-hidden="true">
                <span>↑ ↓ navegar</span>
                <span>Enter abrir</span>
                <span>Esc fechar</span>
              </div>
            </Command>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {toast ? (
        <div className="stp-toast" role="status" data-testid="stp-toast">
          <span>{toast.text}</span>
          {toast.undo ? (
            <button
              type="button"
              className="stp-btn"
              onClick={() => {
                toast.undo?.();
                setToast(null);
              }}
            >
              Desfazer
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
