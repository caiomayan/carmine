import { staffCan, staffServerListSchema } from '@carmine/contracts/staff';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ServerCard } from '@/components/servers/server-card';
import { apiGet } from '@/lib/api';
import { getPanelSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Servidores' };
export const dynamic = 'force-dynamic';

/** Nome de vitrine e código dos Servidores Carmine (Admin e Dono). */
export default async function ServidoresPage() {
  const session = await getPanelSession();
  if (session.status !== 'staff' || !staffCan(session.session.staffRole, 'servers.edit'))
    notFound();

  const result = await apiGet<unknown>('/api/staff/servers');
  const list = result.ok ? staffServerListSchema.safeParse(result.data) : null;

  return (
    <div className="stp-page" data-testid="stp-servers">
      <div className="stp-head">
        <div>
          <h1>Servidores</h1>
          <p>
            Nome de vitrine e código de cada Servidor Carmine, com o hostname que o jogo mostra.
          </p>
        </div>
      </div>

      {list?.success ? (
        list.data.servers.length > 0 ? (
          <ul className="stp-srv-grid">
            {list.data.servers.map((server) => (
              <ServerCard key={server.id} initial={server} />
            ))}
          </ul>
        ) : (
          <div className="stp-card">
            <div className="stp-empty">
              <b>Nenhum Servidor Carmine cadastrado</b>
            </div>
          </div>
        )
      ) : (
        <div className="stp-card">
          <div className="stp-empty" role="alert">
            <b>Sem dado: a API não respondeu</b>
            <span>Não deu para abrir os servidores agora. Tente de novo em instantes.</span>
          </div>
        </div>
      )}
    </div>
  );
}
