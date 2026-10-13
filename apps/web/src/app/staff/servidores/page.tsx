import { staffCan, staffServerListSchema } from '@carmine/contracts';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ServerEditor } from '@/components/staff/server-editor';
import { getServerSession, readStaff } from '@/lib/api-server';

/** Nome de vitrine e código dos Servidores Carmine (Admin e Dono). */
export default async function StaffServersPage() {
  const server = await getServerSession();
  const role = server.status === 'authenticated' ? server.session.staffRole : null;
  if (!staffCan(role, 'servers.edit')) notFound();
  const result = await readStaff('/staff/servers', staffServerListSchema);
  if (result.status === 'forbidden' || result.status === 'anonymous') notFound();
  const t = await getTranslations('staff');

  return (
    <section
      aria-labelledby="servidores"
      className="grid animate-fade-up gap-5 [animation-delay:60ms]"
    >
      <div className="grid gap-1">
        <h2 id="servidores" className="text-lg font-semibold">
          {t('servers.title')}
        </h2>
        <p className="max-w-[72ch] text-[13px] text-muted-foreground">{t('servers.subtitle')}</p>
      </div>
      {result.status === 'ok' ? (
        result.data.servers.length > 0 ? (
          <ul className="grid">
            {result.data.servers.map((s) => (
              <ServerEditor key={s.id} initial={s} />
            ))}
          </ul>
        ) : (
          <p className="text-[13.5px] text-muted-foreground">{t('servers.empty')}</p>
        )
      ) : (
        <p role="alert" className="text-sm">
          {t('unavailable')}
        </p>
      )}
    </section>
  );
}
