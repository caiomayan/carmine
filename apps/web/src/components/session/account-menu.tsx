'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
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
import { UsersIcon } from '@/components/icons/animated/users';
import { AnimatedIcon } from '@/components/icons/animated-icon';
import { Button } from '@/components/ui/button';
import type { AccountControlLabels } from './account-control';
import { useSession } from './session-provider';

/**
 * O menu da Conta de quem entrou (Meu perfil, Primeiros passos, Painel da Staff, Sair). Fica num
 * chunk à parte: o visitante que não entrou nunca o renderiza, então o Radix Dropdown, o
 * Animate UI e os ícones do menu saem da primeira carga (ver `AccountControl`).
 */
export default function AccountMenu({ labels }: { labels: AccountControlLabels }) {
  const { account, staffRole, signOut, firstSteps } = useSession();
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  // "Primeiros passos" leva o foco para a orientação; o menu não deve devolvê-lo ao gatilho.
  const keepFocus = useRef(false);
  if (!account) return null;

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
          {staffRole ? (
            <DropdownMenuItem
              onSelect={() => router.push('/staff')}
              className="min-h-9"
              data-testid="staff-panel-link"
            >
              <AnimatedIcon icon={UsersIcon} size={16} className="text-muted-foreground" />
              {labels.staffPanel}
            </DropdownMenuItem>
          ) : null}
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
