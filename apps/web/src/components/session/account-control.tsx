'use client';

import type { Route } from 'next';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { SIGN_IN_PATH, signInHref } from '@/lib/auth-links';
import { useSession } from './session-provider';

const SKELETON_CLASS = 'shimmer block size-8 rounded-full max-md:size-(--tap)';

// O menu (Radix Dropdown, Animate UI e os ícones dele) só vai para quem entrou: o visitante não
// baixa nada disso na primeira carga. Quem já chega logado recebe o menu no HTML e o chunk vem
// junto da página.
const AccountMenu = dynamic(() => import('./account-menu'), {
  loading: () => <span aria-hidden="true" className={SKELETON_CLASS} />,
});

export type AccountControlLabels = {
  signIn: string;
  loading: string;
  menu: string;
  profile: string;
  firstSteps: string;
  staffPanel: string;
  signOut: string;
  signOutFailed: string;
};

/**
 * Canto direito da barra superior: "Entrar" para visitantes; para quem entrou, avatar e Nome
 * de exibição com o menu da Conta (Meu perfil, Primeiros passos, Painel da Staff para quem é
 * da Staff, Sair).
 */
export function AccountControl({ labels }: { labels: AccountControlLabels }) {
  const { status, account } = useSession();
  const pathname = usePathname();

  if (status === 'unknown') {
    return <span role="status" aria-label={labels.loading} className={SKELETON_CLASS} />;
  }

  if (status === 'anonymous' || !account) {
    if (pathname === SIGN_IN_PATH) return null;
    return (
      // Discreto na barra: o preenchido invertido fica para a ação principal de cada página.
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="animate-fade-up bg-surface-2 hover:bg-line"
      >
        <Link href={signInHref(pathname) as Route} data-testid="sign-in">
          {labels.signIn}
        </Link>
      </Button>
    );
  }

  return <AccountMenu labels={labels} />;
}
