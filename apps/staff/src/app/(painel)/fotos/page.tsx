import type { StaffAvatarCasePage } from '@carmine/contracts/avatar';
import { staffCan } from '@carmine/contracts/staff';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PhotosScreen } from '@/components/photos/photos-screen';
import { apiGet } from '@/lib/api';
import { getPanelSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Fotos denunciadas' };
export const dynamic = 'force-dynamic';

/** Onde fica o site (a ficha da Conta, até a tela de Contas migrar para o painel). */
const SITE_URL = (process.env.SITE_URL ?? '').replace(/\/+$/, '');

/** A fila de fotos denunciadas (S25): a primeira página do estado pedido (`?status=open|decided`, padrão `open`). */
export default async function FotosPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await getPanelSession();
  if (session.status !== 'staff' || !staffCan(session.session.staffRole, 'avatars.moderate')) {
    notFound();
  }

  const { status: raw } = await searchParams;
  const status = raw === 'decided' ? 'decided' : 'open';

  const page = await apiGet<StaffAvatarCasePage>(
    `/api/staff/avatar-reports?status=${status}&limit=50`,
  );
  if (!page.ok) {
    return (
      <div className="stp-page">
        <div className="stp-card">
          <div className="stp-empty" role="alert">
            <b>Sem dado: a API não respondeu</b>
            <span>Não deu para carregar a fila de fotos agora. Tente de novo em instantes.</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PhotosScreen
      key={status}
      initial={page.data}
      status={status}
      serverNowMs={Date.now()}
      siteUrl={SITE_URL}
    />
  );
}
