'use client';

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
import { CompassIcon } from '@/components/icons/animated/compass';
import { LogoutIcon } from '@/components/icons/animated/logout';
import { UserIcon } from '@/components/icons/animated/user';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { Button } from '@/components/ui/button';
import { SIGN_IN_PATH, signInHref } from '@/lib/auth-links';
import { useSession } from './session-provider';

export type AccountControlLabels = {
  signIn: string;
  loading: string;
  menu: string;
  profile: string;
  firstSteps: string;
  signOut: string;
  signOutFailed: string;
};

/**
 * Canto direito da barra superior: "Entrar" para visitantes; para quem entrou, avatar e Nome
 * de exibição com o menu da Conta (Meu perfil, Primeiros passos, Sair).
 */
export function AccountControl({ labels }: { labels: AccountControlLabels }) {
  const { status, account, signOut, firstSteps } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  // "Primeiros passos" leva o foco para a orientação; o menu não deve devolvê-lo ao gatilho.
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
      <Button asChild size="sm" className="animate-fade-up">
        <Link href={signInHref(pathname) as Route} data-testid="sign-in">
          {labels.signIn}
        </Link>
      </Button>
    );
  }

  const profilePath = `/${account.publicId}` as Route;

  return (
    <div className="relative">
      {/* Não modal: o resto da página não fica aria-hidden com o menu aberto. */}
      <DropdownMenu modal={false} onOpenChange={(open) => open && setFailed(false)}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label={labels.menu.replace('{name}', account.displayName)}
            data-testid="account-menu"
            className="animate-fade-up gap-2.5 rounded-full py-1 pr-3.5 pl-1 max-md:pr-1"
          >
            <Avatar src={account.avatarUrl} name={account.displayName} size={28} />
            <span className="max-w-[16ch] truncate font-[550] max-md:hidden">
              {account.displayName}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-60"
          onCloseAutoFocus={(event) => {
            if (keepFocus.current) event.preventDefault();
            keepFocus.current = false;
          }}
        >
          <DropdownMenuLabel className="grid gap-0.5 px-2 py-2">
            <span className="truncate font-semibold">{account.displayName}</span>
            <span className="text-xs font-normal text-muted-foreground">#{account.publicId}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => router.push(profilePath)} className="min-h-9">
            <AnimatedIcon icon={UserIcon} size={16} className="text-muted-foreground" />
            {labels.profile}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              keepFocus.current = true;
              firstSteps.show();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="min-h-9"
          >
            <AnimatedIcon icon={CompassIcon} size={16} className="text-muted-foreground" />
            {labels.firstSteps}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={async () => {
              if (!(await signOut())) setFailed(true);
            }}
            className="min-h-9"
          >
            <AnimatedIcon icon={LogoutIcon} size={16} className="text-muted-foreground" />
            {labels.signOut}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Erro na Liberty: o sinal de contexto fica no ponto; o texto segue neutro. */}
      <div role="alert" className="absolute top-full right-0 z-40 mt-2 w-64">
        {failed ? (
          <p className="flex animate-fade-up items-start gap-2 rounded-md bg-surface-2 px-3 py-2 text-xs shadow-[0_12px_32px_-16px_var(--shadow)]">
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
