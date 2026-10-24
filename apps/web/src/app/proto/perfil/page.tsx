import { ViewTransition } from 'react';
import { ProfileView } from '@/components/vida/profile-view';
import { skinTable } from '@/components/vida/server-data';

/** Perfil do protótipo "vida": `?estado=novo` mostra a Conta nova, sem jogos e sem Itens. */
export default async function VidaProfile({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string | string[] }>;
}) {
  const raw = (await searchParams).estado;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const estado =
    value === 'novo' || value === 'privado' || value === 'nao-reivindicado' ? value : 'completo';
  return (
    <ViewTransition enter="v-in" exit="v-out" default="none">
      <ProfileView estado={estado} skins={skinTable([1327, 222, 1099, 306, 171, 1717])} />
    </ViewTransition>
  );
}
