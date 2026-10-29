'use client';

import { HouseIcon, SlidersHorizontalIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/animate-ui/components/radix/dropdown-menu';
import { Avatar } from '@/components/avatar';
import { BoxIcon } from '@/components/icons/animated/box';
import { CompassIcon } from '@/components/icons/animated/compass';
import { LogoutIcon } from '@/components/icons/animated/logout';
import { ServerIcon } from '@/components/icons/animated/server';
import { UserIcon } from '@/components/icons/animated/user';
import { UsersIcon } from '@/components/icons/animated/users';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { StatusDot } from '@/components/status-dot';
import { Button } from '@/components/ui/button';
import { vipDaysLeft } from '@/lib/account-menu';
import { SIGN_IN_PATH, signInHref } from '@/lib/auth-links';
import { SETTINGS_BASE } from '@/lib/settings-nav';
import { useSession } from './session-provider';
import { useNowPlaying } from './use-now-playing';

export type AccountControlLabels = {
  signIn: string;
  loading: string;
  menu: string;
  profile: string;
  inventory: string;
  loadout: string;
  settings: string;
  home: string;
  firstSteps: string;
  staffPanel: string;
  signOut: string;
  signOutFailed: string;
  /** "VIP · {days} dia" e "VIP · {days} dias": o plural é escolhido aqui, com os dias da sessão. */
  vipOne: string;
  vipOther: string;
  playing: string;
};

const ITEM = 'min-h-(--tap) gap-2.5';

/**
 * Canto direito da barra superior: "Entrar" para visitantes; para quem entrou, avatar e Nome
 * de exibição com o menu da Conta. O painel abre com a Conta (avatar, nome, selo VIP com os dias
 * e onde está jogando), os atalhos (Perfil, Inventário, Loadout, Configurações), o painel da
 * Staff para quem é da Staff, Início e Primeiros passos, e Sair separado no fim. O `#ID` não
 * aparece aqui (spec, "ID público fora da interface").
 */
export function AccountControl({ labels }: { labels: AccountControlLabels }) {
  const { status, account, staffRole, vip, signOut, firstSteps } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const playing = useNowPlaying();
  const [failed, setFailed] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  // "Primeiros passos" leva o foco para o Dialog; o menu não deve devolvê-lo ao gatilho.
  const keepFocus = useRef(false);

  if (status === 'unknown') {
    return (
      <span
        role="status"
        aria-label={labels.loading}
        className="shimmer block size-8 rounded-full max-md:size-(--tap)"
      />
    );
  }

  if (status === 'anonymous' || !account) {
    if (pathname === SIGN_IN_PATH) return null;
    return (
      // Discreto na barra: o preenchido invertido fica para a ação principal de cada página.
      <Button asChild variant="ghost" size="sm" className="animate-fade-up">
        <Link href={signInHref(pathname) as Route} data-testid="sign-in">
          {labels.signIn}
        </Link>
      </Button>
    );
  }

  const days = vip ? vipDaysLeft(vip, new Date()) : null;
  const go = (href: string) => () => router.push(href as Route);

  return (
    <div className="relative">
      {/* Não modal: o resto da página não fica aria-hidden com o menu aberto. */}
      <DropdownMenu
        modal={false}
        onOpenChange={(open) => {
          if (!open) return;
          setFailed(false);
          playing.load();
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button
            ref={trigger}
            variant="ghost"
            size="sm"
            aria-label={labels.menu.replace('{name}', account.displayName)}
            data-testid="account-menu"
            onPointerEnter={playing.load}
            onFocus={playing.load}
            className="animate-fade-up gap-2.5 rounded-full py-1 pr-3.5 pl-1 max-[1151px]:min-h-(--tap) max-[1151px]:min-w-(--tap) max-[1151px]:pr-1"
          >
            <Avatar src={account.avatarUrl} name={account.displayName} size={28} />
            {/* O nome só cabe ao lado do avatar a partir de 1152 px, como o campo de busca aberto: antes disso o grupo da direita invadia a navegação (o nome acessível está no aria-label). */}
            <span className="max-w-[16ch] truncate font-[550] max-[1151px]:hidden">
              {account.displayName}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-[min(20rem,calc(100vw-2*var(--mx)))]"
          onCloseAutoFocus={(event) => {
            if (keepFocus.current) event.preventDefault();
            keepFocus.current = false;
          }}
        >
          <DropdownMenuLabel className="grid gap-3 px-2 py-2.5">
            <span className="flex items-center gap-3">
              <Avatar src={account.avatarUrl} name={account.displayName} size={40} />
              <span className="grid min-w-0 gap-0.5">
                <span className="truncate text-[15px] font-semibold" data-testid="menu-name">
                  {account.displayName}
                </span>
                {days === null ? null : (
                  <span
                    className="inline-flex items-center gap-1.5 text-caption font-medium text-status-vip"
                    data-testid="menu-vip"
                  >
                    <span
                      aria-hidden="true"
                      className="size-1.5 shrink-0 rotate-45 bg-status-vip"
                    />
                    {(days === 1 ? labels.vipOne : labels.vipOther).replace('{days}', String(days))}
                  </span>
                )}
              </span>
            </span>
            {playing.server ? (
              <span
                className="grid gap-0.5 rounded-xl bg-surface-2 px-2.5 py-2"
                data-testid="menu-playing"
              >
                <span className="inline-flex items-center gap-1.5 label-caps text-[11px] text-muted-foreground">
                  <StatusDot tone="online" />
                  {labels.playing}
                </span>
                <span className="truncate text-body-sm font-medium">
                  {playing.server.showcaseName ?? playing.server.name}
                  {playing.server.map ? (
                    <span className="font-normal text-muted-foreground">
                      {' · '}
                      {playing.server.map}
                    </span>
                  ) : null}
                </span>
              </span>
            ) : null}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={go(`/${account.publicId}`)}
            className={ITEM}
            data-testid="menu-profile"
          >
            <AnimatedIcon icon={UserIcon} size={16} className="text-muted-foreground" />
            {labels.profile}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={go('/inventory')} className={ITEM}>
            <AnimatedIcon icon={BoxIcon} size={16} className="text-muted-foreground" />
            {labels.inventory}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={go('/loadout')} className={ITEM}>
            <AnimatedIcon icon={ServerIcon} size={16} className="text-muted-foreground" />
            {labels.loadout}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={go(SETTINGS_BASE)}
            className={ITEM}
            data-testid="menu-settings"
          >
            <SlidersHorizontalIcon aria-hidden="true" />
            {labels.settings}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {staffRole ? (
            <DropdownMenuItem
              onSelect={go('/staff')}
              className={ITEM}
              data-testid="staff-panel-link"
            >
              <AnimatedIcon icon={UsersIcon} size={16} className="text-muted-foreground" />
              {labels.staffPanel}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={go('/')} className={`${ITEM} text-body-sm`}>
            <HouseIcon aria-hidden="true" />
            {labels.home}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              keepFocus.current = true;
              firstSteps.openDialog(trigger.current);
            }}
            className={`${ITEM} text-body-sm`}
            data-testid="menu-first-steps"
          >
            <AnimatedIcon icon={CompassIcon} size={16} className="text-muted-foreground" />
            {labels.firstSteps}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={async () => {
              if (!(await signOut())) setFailed(true);
            }}
            className={ITEM}
            data-testid="menu-sign-out"
          >
            <AnimatedIcon icon={LogoutIcon} size={16} className="text-muted-foreground" />
            {labels.signOut}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Erro na Liberty: o sinal de contexto fica no ponto; o texto segue neutro. */}
      <div role="alert" className="absolute top-full right-0 z-40 mt-2 w-64">
        {failed ? (
          <p className="flex animate-fade-up items-start gap-2 rounded-xl bg-surface-2 px-3 py-2 text-xs shadow-[0_12px_32px_-16px_var(--shadow)]">
            <span
              aria-hidden="true"
              className="mt-1 size-1.5 shrink-0 rounded-full bg-status-danger"
            />
            {labels.signOutFailed}
          </p>
        ) : null}
      </div>
    </div>
  );
}
