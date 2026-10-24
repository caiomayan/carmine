import { ViewTransition } from 'react';
import { parseState } from '@/components/vida/data';
import { HomeLive } from '@/components/vida/home-live';
import { skinTable } from '@/components/vida/server-data';
import { HomeSkeleton } from '@/components/vida/skeleton';

const SKINS = [1327, 306, 461, 222, 86, 220, 1099, 171, 1717, 320];

/** Home do protótipo "vida" (dados de exemplo fixos; o estado vem de `?estado=`). */
export default async function VidaHome({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string | string[] }>;
}) {
  const state = parseState((await searchParams).estado);
  return (
    <ViewTransition enter="v-in" exit="v-out" default="none">
      {state === 'carregando' ? (
        <HomeSkeleton />
      ) : (
        <HomeLive state={state} skins={skinTable(SKINS)} />
      )}
    </ViewTransition>
  );
}
