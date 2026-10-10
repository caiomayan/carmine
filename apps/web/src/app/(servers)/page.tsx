import { getTranslations } from 'next-intl/server';
import { ServerBrowser } from '@/components/server-browser';

export default async function ServersPage() {
  const t = await getTranslations('servers');

  return (
    <div className="container-page animate-fade-up">
      <ServerBrowser
        labels={{
          title: t('title'),
          subtitle: t('subtitle'),
          region: t('region'),
          modeFilter: t('modeFilter'),
          modes: {
            all: t('modes.all'),
            retake: t('modes.retake'),
            deathmatch: t('modes.deathmatch'),
          },
          columns: {
            server: t('columns.server'),
            map: t('columns.map'),
            players: t('columns.players'),
            ping: t('columns.ping'),
          },
          empty: {
            all: t('empty.title'),
            retake: t('empty.titleMode', { mode: t('modes.retake') }),
            deathmatch: t('empty.titleMode', { mode: t('modes.deathmatch') }),
          },
          emptyBody: t('empty.body'),
        }}
      />
    </div>
  );
}
