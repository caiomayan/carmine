import type { StaffAccountDetail } from '@carmine/contracts';
import type { StaffAccountAvatar } from '@carmine/contracts/avatar';
import { staffCan } from '@carmine/contracts/staff';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AccountFile } from '@/components/accounts/account-file';
import type { ReportOrigin } from '@/components/accounts/apply-sanction-form';
import { apiGet } from '@/lib/api';
import { getPanelSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Ficha da Conta' };
export const dynamic = 'force-dynamic';

/** Onde fica o site (o Perfil público e o que ainda mora na ficha do site). */
const SITE_URL = (process.env.SITE_URL ?? '').replace(/\/+$/, '');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A ficha da Conta (S25). Vindo de uma Denúncia (`?denuncia=<caso>&evidencia=0|1`), a Punição aplicada fecha o caso.
 */
export default async function ContaPage({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<{ denuncia?: string; evidencia?: string }>;
}) {
  const session = await getPanelSession();
  if (session.status !== 'staff' || !staffCan(session.session.staffRole, 'accounts.read'))
    notFound();

  const { publicId } = await params;
  if (!/^\d{1,9}$/.test(publicId)) notFound();
  const result = await apiGet<StaffAccountDetail>(`/api/staff/accounts/${publicId}`);
  if (!result.ok) {
    if (result.status === 404 || result.status === 403) notFound();
    return (
      <div className="stp-page">
        <div className="stp-card">
          <div className="stp-empty" role="alert">
            <b>Sem dado: a API não respondeu</b>
            <span>Não deu para abrir a ficha agora. Tente de novo em instantes.</span>
          </div>
        </div>
      </div>
    );
  }

  // A foto de perfil (ADR 0022) é do papel que modera fotos.
  // 403 e 404 (sem a foto para mostrar) somem; qualquer outra falha vira o aviso de que o dado não veio.
  const avatarResult = staffCan(session.session.staffRole, 'avatars.moderate')
    ? await apiGet<StaffAccountAvatar>(`/api/staff/accounts/${publicId}/avatar`)
    : null;
  const avatar =
    avatarResult && !avatarResult.ok && (avatarResult.status === 403 || avatarResult.status === 404)
      ? null
      : avatarResult;

  const { denuncia, evidencia } = await searchParams;
  const report: ReportOrigin | undefined =
    denuncia && UUID.test(denuncia)
      ? { id: denuncia, needsEvidence: evidencia === '1' }
      : undefined;

  return (
    <AccountFile
      key={publicId}
      initial={result.data}
      viewer={{ steamId: session.session.account.steamId, role: session.session.staffRole }}
      siteUrl={SITE_URL}
      {...(avatar && { avatar: avatar.ok ? avatar.data : ('unavailable' as const) })}
      {...(report && { report })}
    />
  );
}
