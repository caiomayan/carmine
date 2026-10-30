'use client';

import { CSRF_COOKIE, CSRF_HEADER } from '@carmine/contracts';
import type { StaffRole } from '@carmine/contracts/staff';
import { Command } from 'cmdk';
import {
  ClockIcon,
  CreditCardIcon,
  EllipsisIcon,
  FlagIcon,
  ImageIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MoonIcon,
  PanelLeftIcon,
  SearchIcon,
  ServerIcon,
  SunIcon,
  UserIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Dialog } from 'radix-ui';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import type { NavId, NavItem } from '@/lib/nav';

const ICONS: Record<NavId, typeof FlagIcon> = {
  inicio: LayoutDashboardIcon,
  denuncias: FlagIcon,
  fotos: ImageIcon,
  contas: UserIcon,
  pagamentos: CreditCardIcon,
  servidores: ServerIcon,
  auditoria: ClockIcon,
};

const ROLE_LABEL: Record<StaffRole, string> = {
  owner: 'Dono',
  admin: 'Admin',
  moderator: 'Moderador',
};

const readCookie = (name: string) =>
  document.cookie
    .split('; ')
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);

const COOKIE = (name: string, value: string) => {
  // Preferência de interface, lida no servidor para a primeira pintura já vir certa; um ano.
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
};

export type ShellProps = {
  items: NavItem[];
  role: StaffRole;
  displayName: string;
  /** Quantos itens esperam em cada fila (o selo do trilho). */
  badges: Partial<Record<NavId, number>>;
  initialTheme: 'light' | 'dark';
  initialCollapsed: boolean;
  children: ReactNode;
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';

/**
 * A casca do painel (S25): moldura com o trilho de ícones em cápsulas (recolhível), a barra de cima com a busca e o
 * tema, as abas de baixo no celular e o Ctrl+K. As telas entram no `children`.
 */
export function Shell({
  items,
  role,
  displayName,
  badges,
  initialTheme,
  initialCollapsed,
  children,
}: ShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [theme, setTheme] = useState(initialTheme);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [palette, setPalette] = useState(false);

  const current = items.find((item) =>
    item.href === '/' ? pathname === '/' : pathname.startsWith(item.href),
  );

  const toggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    COOKIE('stp-theme', next);
  }, [theme]);

  /** Sair: encerra a sessão deste host (com o token CSRF, como no site) e volta à tela de entrada. */
  const signOut = useCallback(async () => {
    const token = readCookie(CSRF_COOKIE);
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: token ? { [CSRF_HEADER]: token } : {},
      });
      if (!response.ok) return;
    } catch {
      return;
    }
    router.replace('/entrar');
    router.refresh();
  }, [router]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((value) => {
      COOKIE('stp-rail', value ? 'open' : 'closed');
      return !value;
    });
  }, []);

  // Ctrl+K em captura (antes de qualquer outro atalho) e `[` para recolher o trilho.
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
        toggleCollapsed();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [toggleCollapsed]);

  const railItem = (item: NavItem) => {
    const Icon = ICONS[item.id];
    const count = badges[item.id];
    const active = current?.id === item.id;
    return (
      <Link
        key={item.id}
        href={item.href}
        prefetch={false}
        className="stp-item"
        aria-current={active ? 'page' : undefined}
        aria-label={item.label}
        data-tip={item.label}
        data-testid={`stp-nav-${item.id}`}
      >
        <Icon size={18} aria-hidden="true" />
        {count ? <span className="stp-badge">{count > 99 ? '99+' : count}</span> : null}
      </Link>
    );
  };

  const review = items.filter((item) => item.group === 'revisao');
  const manage = items.filter((item) => item.group === 'gestao');
  const tabs = items.filter((item) => ['inicio', 'denuncias', 'fotos'].includes(item.id));

  return (
    <div
      ref={setRoot}
      className="stp"
      data-stp=""
      data-theme={theme}
      data-collapsed={collapsed ? '' : undefined}
      data-testid="stp"
    >
      <div className="stp-frame">
        <aside className="stp-rail" aria-label="Painel da Staff">
          <span className="stp-mark" aria-hidden="true" title="Carmine">
            C
          </span>
          <nav className="stp-pill" aria-label="Revisão">
            {review.map(railItem)}
          </nav>
          {manage.length ? (
            <nav className="stp-pill" aria-label="Gestão">
              {manage.map(railItem)}
            </nav>
          ) : null}
          <div className="stp-pill stp-rail-foot">
            <button
              type="button"
              className="stp-item"
              onClick={toggleCollapsed}
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
              <b>{current?.label ?? 'Painel'}</b>
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
              aria-label={theme === 'dark' ? 'Usar o tema claro' : 'Usar o tema escuro'}
              data-testid="stp-theme"
            >
              {theme === 'dark' ? (
                <SunIcon size={17} aria-hidden="true" />
              ) : (
                <MoonIcon size={17} aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              className="stp-round"
              onClick={signOut}
              aria-label="Sair do painel"
              data-testid="stp-signout"
            >
              <LogOutIcon size={17} aria-hidden="true" />
            </button>
            <span
              className="stp-avatar"
              role="img"
              aria-label={`${displayName}, ${ROLE_LABEL[role]}`}
            >
              {initials(displayName)}
            </span>
          </header>

          <main className="stp-scroll" id="stp-content" tabIndex={-1}>
            {children}
          </main>
        </div>

        <nav className="stp-tabs" aria-label="Atalhos">
          {tabs.map((item) => {
            const Icon = ICONS[item.id];
            const count = badges[item.id];
            return (
              <Link
                key={item.id}
                href={item.href}
                prefetch={false}
                className="stp-tab"
                aria-current={current?.id === item.id ? 'page' : undefined}
              >
                <Icon size={19} aria-hidden="true" />
                {item.id === 'fotos' ? 'Fotos' : item.label}
                {count ? <span className="stp-badge">{count > 99 ? '99+' : count}</span> : null}
              </Link>
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
              <Command.Input placeholder="Buscar uma tela ou um comando" autoFocus />
              <Command.List>
                <Command.Empty>Nada encontrado para essa busca.</Command.Empty>
                <Command.Group heading="Ir para">
                  {items.map((item) => {
                    const Icon = ICONS[item.id];
                    return (
                      <Command.Item
                        key={item.id}
                        value={`ir ${item.label}`}
                        onSelect={() => {
                          setPalette(false);
                          router.push(item.href);
                        }}
                      >
                        <Icon size={16} aria-hidden="true" />
                        {item.label}
                      </Command.Item>
                    );
                  })}
                </Command.Group>
                <Command.Group heading="Comandos">
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
                      toggleCollapsed();
                      setPalette(false);
                    }}
                  >
                    <PanelLeftIcon size={16} aria-hidden="true" />
                    Recolher ou expandir o trilho
                    <kbd className="stp-kbd">[</kbd>
                  </Command.Item>
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
    </div>
  );
}
