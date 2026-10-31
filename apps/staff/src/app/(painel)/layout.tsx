import { staffCan } from '@carmine/contracts/staff';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { Shell } from '@/components/shell/shell';
import { apiGet } from '@/lib/api';
import { navFor } from '@/lib/nav';
import { getPanelSession } from '@/lib/session';
import '../painel.css';

export const dynamic = 'force-dynamic';

/**
 * Tudo que fica atrás do login (S25): sem sessão vai para `/entrar`; sem papel de Staff também (a API recusa as rotas
 * da Staff de qualquer jeito). Os selos do trilho (quantos itens esperam em cada fila) vêm da API, só do que o papel vê.
 */
export default async function PanelLayout({ children }: { children: ReactNode }) {
  const session = await getPanelSession();
  if (session.status === 'anonymous') redirect('/entrar');
  if (session.status === 'no-access') redirect('/entrar?erro=sem-acesso');
  if (session.status === 'unavailable') {
    return (
      <main className="stp-entry">
        <section className="stp-entry-card" role="alert">
          <h1>API fora do ar</h1>
          <p>O painel não conseguiu falar com a API. Tente de novo em instantes.</p>
        </section>
      </main>
    );
  }

  const { role, displayName } = {
    role: session.session.staffRole,
    displayName: session.session.account.displayName,
  };
  const items = navFor(role);
  const jar = await cookies();

  const [reports, photos] = await Promise.all([
    staffCan(role, 'reports.handle')
      ? apiGet<{ openCount: number }>('/api/staff/reports?status=open&limit=1')
      : null,
    staffCan(role, 'avatars.moderate')
      ? apiGet<{ openCount: number }>('/api/staff/avatar-reports?status=open&limit=1')
      : null,
  ]);

  return (
    <Shell
      items={items}
      role={role}
      displayName={displayName}
      badges={{
        ...(reports?.ok ? { denuncias: reports.data.openCount } : {}),
        ...(photos?.ok ? { fotos: photos.data.openCount } : {}),
      }}
      initialTheme={jar.get('stp-theme')?.value === 'light' ? 'light' : 'dark'}
      initialCollapsed={jar.get('stp-rail')?.value === 'closed'}
    >
      {children}
    </Shell>
  );
}
