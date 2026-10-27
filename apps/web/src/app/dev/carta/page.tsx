import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { CartaVitrine } from '@/components/proto-carta/carta-vitrine';
import { cartaImagePath, examplePlayer, parseCarta } from '@/lib/proto-carta/data';
import { pickSkin } from '@/lib/proto-sobre/skins';

// PROTÓTIPO (vitrine): como /dev/componentes, só existe com CARMINE_UI_GALLERY=1 (dev local e homologação).
export const dynamic = 'force-dynamic';

type Search = Promise<Record<string, string | string[] | undefined>>;

/** A origem pública da requisição (atrás do túnel o `host` é o do site): o `og:image` precisa de URL absoluta. */
async function origin(): Promise<string> {
  const list = await headers();
  const host = list.get('x-forwarded-host') ?? list.get('host') ?? 'localhost:3000';
  const proto = list.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

/** O `og:image` da página é a própria carta no formato de link: é o que o Discord e o WhatsApp mostram. */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Search;
}): Promise<Metadata> {
  const options = parseCarta(await searchParams);
  const image = new URL(cartaImagePath({ ...options, format: 'og' }), await origin()).toString();
  const title = 'A sua carta da semana · Saint Carmine';
  const description = 'Avatar, Modo favorito, números da semana e a skin principal do Loadout.';
  return {
    title: 'Carta do jogador (protótipo)',
    robots: { index: false, follow: false },
    openGraph: {
      type: 'website',
      title,
      description,
      images: [{ url: image, width: 1200, height: 630 }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  };
}

/** `/dev/carta`: a carta do jogador, a imagem compartilhável e o Lanyard (o cartão na tela). */
export default async function CartaProtoPage({ searchParams }: { searchParams: Search }) {
  if (process.env.CARMINE_UI_GALLERY !== '1') notFound();
  const options = parseCarta(await searchParams);
  const skin = pickSkin(options.mode === 'retake' ? 'AK-47 Redline' : 'AWP Dragon Lore');
  return (
    <CartaVitrine
      options={options}
      player={examplePlayer(options)}
      skinGlow={skin?.palette?.[0] ?? null}
    />
  );
}
