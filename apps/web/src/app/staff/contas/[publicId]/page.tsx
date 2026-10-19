import { staffAccountDetailSchema } from '@carmine/contracts';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { AccountFile } from '@/components/staff/account-file';
import { getServerSession, readStaff } from '@/lib/api-server';
import { parseProfileSegment } from '@/lib/auth-links';

type Params = Promise<{ publicId: string }>;
type SearchParams = Promise<Record<'denuncia' | 'evidencia', string | string[] | undefined>>;

const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? '';

/** Ficha da Conta no painel da Staff; o layout já barrou quem não é da Staff. */
export default async function StaffAccountPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const parsed = parseProfileSegment((await params).publicId);
  if (parsed.kind !== 'publicId') notFound();
  const server = await getServerSession();
  if (server.status !== 'authenticated' || !server.session.staffRole) notFound();
  const result = await readStaff(`/staff/accounts/${parsed.publicId}`, staffAccountDetailSchema);
  if (result.status === 'forbidden' || result.status === 'anonymous') notFound();
  const t = await getTranslations('staff');
  // Vindo da fila de Denúncias (S13): a Punição aplicada fecha a Denúncia.
  const query = await searchParams;
  const reportId = first(query.denuncia);
  const fromReport = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    reportId,
  );
  if (result.status !== 'ok') {
    return (
      <p role="alert" className="text-sm">
        {result.status === 'not-found' ? t('account.notFound') : t('unavailable')}
      </p>
    );
  }
  return (
    <AccountFile
      // Outra Conta, outra ficha: o estado do formulário não passa de uma para a outra.
      key={result.data.account.publicId}
      initial={result.data}
      viewer={{ steamId: server.session.account.steamId, role: server.session.staffRole }}
      {...(fromReport && {
        report: { id: reportId, needsEvidence: first(query.evidencia) === '1' },
      })}
    />
  );
}
