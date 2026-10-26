import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ServerPageLive } from '@/components/server-page/server-page-live';
import { artTable } from '@/components/vida/map-art';
import { getLiveServers } from '@/lib/api-server';
import { serverLabel } from '@/lib/live-servers';

type Params = Promise<{ id: string }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A lista lida no servidor do site e o servidor da URL (nulo com a API fora; `notFound` se a lista não o tem). */
async function loadServer(id: string) {
  if (!UUID.test(id)) notFound();
  const list = await getLiveServers();
  const server = list?.servers.find((row) => row.id === id) ?? null;
  if (list && !server) notFound();
  return { list, server };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const t = await getTranslations('serverPage');
  const { server } = await loadServer(id);
  if (!server) return { title: t('notFound.title') };
  const name = serverLabel(server);
  const mode = (await getTranslations('servers.modes'))(server.mode);
  return { title: t('metaTitle', { name }), description: t('metaDescription', { name, mode }) };
}

/**
 * A página de um servidor (/servidores/[id]): o placar ao vivo, os jogadores e o histórico do dia. A lista de
 * servidores já sai do servidor do site na primeira pintura; no navegador, ela segue o ao vivo da API.
 */
export default async function ServerPage({ params }: { params: Params }) {
  const { id } = await params;
  const { list } = await loadServer(id);
  return <ServerPageLive id={id} initial={list} art={artTable()} />;
}
