import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SobreFilme } from '@/components/proto-sobre/sobre-filme';
import { artTable } from '@/components/vida/map-art';
import { pickSkins } from '@/lib/proto-sobre/skins';
import { DISCORD_URL } from '@/lib/social';

// PROTÓTIPO (vitrine): como /dev/componentes, só existe com CARMINE_UI_GALLERY=1 (dev local e homologação).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sobre (protótipo)',
  robots: { index: false, follow: false },
};

/**
 * `/dev/sobre`: a página "Sobre" em formato de filme. As skins das cenas dos Modos vêm do catálogo de verdade
 * (servidor); nomes e números das outras cenas são exemplos. O GSAP só é carregado por esta rota.
 */
export default function SobreProtoPage() {
  if (process.env.CARMINE_UI_GALLERY !== '1') notFound();
  return (
    <SobreFilme
      art={artTable()}
      retakeSkins={pickSkins(['AK-47 Redline', 'M4A4 Howl', 'USP-S Kill Confirmed'])}
      deathmatchSkins={pickSkins(['AWP Dragon Lore', 'Desert Eagle Blaze', 'Karambit Doppler'])}
      discordUrl={DISCORD_URL}
    />
  );
}
