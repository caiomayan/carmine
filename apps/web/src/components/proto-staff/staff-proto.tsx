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
import { useCallback, useEffect, useMemo, useState } from 'react';
import './staff-proto.css';
import {
  ACCOUNTS,
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
  fotos: 'Fotos de perfil',
  contas: 'Contas',
  pagamentos: 'Pagamentos',
  servidores: 'Servidores',
  auditoria: 'Auditoria',
};

const NAV: { group: string; items: { id: ViewId; icon: typeof FlagIcon }[] }[] = [
  { group: 'Painel', items: [{ id: 'inicio', icon: LayoutDashboardIcon }] },
  {
    group: 'Revisão',
    items: [
      { id: 'denuncias', icon: FlagIcon },
      { id: 'fotos', icon: ImageIcon },
    ],
  },
  {
    group: 'Gestão',
    items: [
      { id: 'contas', icon: UserIcon },
      { id: 'pagamentos', icon: CreditCardIcon },
      { id: 'servidores', icon: ServerIcon },
      { id: 'auditoria', icon: ClockIcon },
    ],
  },
];

/**
 * O protótipo do Painel da Staff (S25, PR A): a casca (barra lateral recolhível, barra de cima, abas no celular),
 * o Ctrl+K e as três telas de exemplo. Tudo em memória, com dados fictícios.
 */
export function StaffProto({ nowMs }: { nowMs: number }) {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [view, setView] = useState<ViewId>('inicio');
  const [collapsed, setCollapsed] = useState(false);
  const [theme, setTheme] = useState<Theme>('auto');
  const [siteTheme, setSiteTheme] = useState<'light' | 'dark'>('dark');
  const [now, setNow] = useState(nowMs);
  const [reports, setReports] = useState<Report[]>(() => makeReports(nowMs));
  const [photos, setPhotos] = useState<Photo[]>(() => makePhotos(nowMs));
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [palette, setPalette] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
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
    setReports((list) => list.map((r) => (r.id === id ? { ...r, status } : r)));
    setToast({ text });
  }, []);

  const decide = useCallback((photo: Photo, approved: boolean) => {
    setPhotos((list) => list.filter((p) => p.id !== photo.id));
    setToast({
      text: `${photo.account}: foto ${approved ? 'aprovada' : 'recusada'}`,
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
      toggleTheme,
      toggleSidebar: () => setCollapsed((value) => !value),
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
    [toggleTheme, photos, decide],
  );

  return (
    <div
      ref={setRoot}
      className="stp"
      data-stp={theme}
      data-collapsed={collapsed ? '' : undefined}
      data-testid="stp"
      data-view={view}
    >
      <aside className="stp-side" aria-label="Painel da Staff">
        <div className="stp-brand">
          <span className="stp-mark" aria-hidden="true">
            C
          </span>
          <b>Carmine</b>
          <small>Staff</small>
        </div>
        <nav aria-label="Principal">
          {NAV.map((group) => (
            <div key={group.group}>
              <div className="stp-nav-group">{group.group}</div>
              <div className="stp-nav">
                {group.items.map(({ id, icon: Icon }) => {
                  const count = counts[id];
                  return (
                    <button
                      key={id}
                      type="button"
                      className="stp-item"
                      aria-current={view === id ? 'page' : undefined}
                      aria-label={collapsed ? TITLES[id] : undefined}
                      title={collapsed ? TITLES[id] : undefined}
                      data-has-count={count ? '' : undefined}
                      data-testid={`stp-nav-${id}`}
                      onClick={() => go(id)}
                    >
                      <Icon size={15} aria-hidden="true" />
                      <span className="stp-label">{TITLES[id]}</span>
                      {count ? <span className="stp-count">{count}</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="stp-side-foot">
          <button
            type="button"
            className="stp-item"
            onClick={() => setCollapsed((value) => !value)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expandir a barra lateral' : 'Recolher a barra lateral'}
            title="Recolher (tecla [)"
            data-testid="stp-collapse"
          >
            <PanelLeftIcon size={15} aria-hidden="true" />
            <span className="stp-label">Recolher</span>
          </button>
          <div className="stp-user">
            <span className="stp-avatar" aria-hidden="true">
              ML
            </span>
            <span>
              <b style={{ fontWeight: 500 }}>Mara Lopes</b>
              <small>Moderadora</small>
            </span>
          </div>
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
            <SearchIcon size={14} aria-hidden="true" />
            <span>Buscar ou executar um comando</span>
            <kbd className="stp-kbd">Ctrl K</kbd>
          </button>
          <button
            type="button"
            className="stp-icon-btn"
            onClick={toggleTheme}
            aria-label={resolved === 'dark' ? 'Usar o tema claro' : 'Usar o tema escuro'}
            data-testid="stp-theme"
          >
            {resolved === 'dark' ? (
              <SunIcon size={15} aria-hidden="true" />
            ) : (
              <MoonIcon size={15} aria-hidden="true" />
            )}
          </button>
        </header>

        <main className="stp-scroll" id="stp-content" tabIndex={-1}>
          {view === 'inicio' ? (
            <Inicio reports={reports} photos={photos} nowMs={now} go={go} />
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
          const Icon = NAV.flatMap((g) => g.items).find((item) => item.id === id)?.icon ?? FlagIcon;
          return (
            <button
              key={id}
              type="button"
              className="stp-tab"
              aria-current={view === id ? 'page' : undefined}
              onClick={() => go(id)}
            >
              <Icon size={18} aria-hidden="true" />
              {TITLES[id]}
              {counts[id] ? <span className="stp-count">{counts[id]}</span> : null}
            </button>
          );
        })}
        <button type="button" className="stp-tab" onClick={() => setPalette(true)}>
          <EllipsisIcon size={18} aria-hidden="true" />
          Mais
        </button>
      </nav>

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
                  {NAV.flatMap((g) => g.items).map(({ id, icon: Icon }) => (
                    <Command.Item key={id} value={`ir ${TITLES[id]}`} onSelect={() => go(id)}>
                      <Icon size={15} aria-hidden="true" />
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
                    <FlagIcon size={15} aria-hidden="true" />
                    Denúncias que vencem em 3 h
                  </Command.Item>
                  <Command.Item
                    value="aprovar a próxima foto"
                    onSelect={() => {
                      commands.nextPhoto();
                      setPalette(false);
                    }}
                  >
                    <ImageIcon size={15} aria-hidden="true" />
                    Aprovar a foto mais antiga
                  </Command.Item>
                  <Command.Item
                    value="alternar tema claro escuro"
                    onSelect={() => {
                      commands.toggleTheme();
                      setPalette(false);
                    }}
                  >
                    <SunIcon size={15} aria-hidden="true" />
                    Alternar o tema
                  </Command.Item>
                  <Command.Item
                    value="recolher expandir barra lateral"
                    onSelect={() => {
                      commands.toggleSidebar();
                      setPalette(false);
                    }}
                  >
                    <PanelLeftIcon size={15} aria-hidden="true" />
                    Recolher ou expandir a barra lateral
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
                      <ActivityIcon size={15} aria-hidden="true" />
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
