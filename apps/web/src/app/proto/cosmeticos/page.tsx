import { ViewTransition } from 'react';
import { demoCharms } from '@/components/cosmetics/charms.server';
import { CosmeticsPicker } from '@/components/cosmetics/cosmetics-picker';
import { PageHead } from '@/components/page-head';

/** Escolha dos cosméticos do Perfil (protótipo "vida"): molduras de avatar e chaveiro, com prévia ao vivo. */
export default function VidaCosmetics() {
  return (
    <ViewTransition enter="v-in" exit="v-out" default="none">
      <div className="container-page pb-28">
        <PageHead
          title="Cosméticos do Perfil"
          subtitle="Escolha a moldura do avatar e o chaveiro que pende da borda. A prévia é ao vivo; equipar vale no Perfil, no pódio, no trilho de amigos e no header."
        />
        <CosmeticsPicker charms={demoCharms()} />
      </div>
    </ViewTransition>
  );
}
