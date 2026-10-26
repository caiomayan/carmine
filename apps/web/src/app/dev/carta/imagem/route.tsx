import { ImageResponse } from 'next/og';
import { CartaImage } from '@/lib/proto-carta/card-image';
import { CARTA_FORMAT_SPEC, examplePlayer, parseCarta } from '@/lib/proto-carta/data';
import { loadImageFonts } from '@/lib/proto-carta/fonts';
import { skinAsPng } from '@/lib/proto-carta/skin-png';
import { pickSkin } from '@/lib/proto-sobre/skins';

// PROTÓTIPO (vitrine): só existe com CARMINE_UI_GALLERY=1, como /dev/componentes.
export const dynamic = 'force-dynamic';

/**
 * A imagem da carta do jogador: `GET /dev/carta/imagem?formato=cartao|story|og&modo=retake|deathmatch&privado=1`.
 * É o que gera o PNG que vai para o WhatsApp, o Discord e o Instagram, o `og:image` da página e a textura do cartão
 * do Lanyard. Satori (React → SVG) + resvg (SVG → PNG), sem navegador. Na versão de verdade a rota é do Perfil
 * (`/<id>/carta`) e lê os dados dele; o cache fica no CDN (a imagem só muda quando o Perfil muda).
 */
export async function GET(request: Request) {
  if (process.env.CARMINE_UI_GALLERY !== '1') return new Response('Not Found', { status: 404 });

  const options = parseCarta(new URL(request.url).searchParams);
  const spec = CARTA_FORMAT_SPEC[options.format];
  const player = examplePlayer(options);
  const picked = pickSkin(options.mode === 'retake' ? 'AK-47 Redline' : 'AWP Dragon Lore');
  // O Satori não lê WebP: a skin entra como PNG (sem ela, a carta sai só com o nome da skin).
  const skin = picked ? { ...picked, image: (await skinAsPng(picked.image)) ?? '' } : null;
  const fonts = await loadImageFonts();

  return new ImageResponse(<CartaImage format={options.format} player={player} skin={skin} />, {
    width: spec.width,
    height: spec.height,
    fonts,
    headers: {
      'cache-control': 'public, max-age=60, s-maxage=3600, stale-while-revalidate=86400',
      'content-disposition': `inline; filename="carta-${options.format}.png"`,
    },
  });
}
