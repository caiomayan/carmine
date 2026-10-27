const ID = /^[0-9a-f-]{36}$/;
const FILE = /^\d{2,4}\.webp$/;

/** Uma foto nunca muda sob a mesma URL (o ID é novo a cada envio). */
const IMMUTABLE = 'public, max-age=31536000, immutable';

/**
 * As fotos de perfil da HOMOLOGAÇÃO, servidas por dentro da pilha: `dev.stcarmine.com/avatars/<id>/<tamanho>.webp`
 * (o mesmo caminho de `img.stcarmine.com` em produção) vai, pela rede interna, ao armazenamento de mídia de mentira
 * (`MEDIA_INTERNAL_URL`, o serviço `media`). Assim o túnel não precisa de uma rota a mais. Lido a cada pedido, não
 * no build (a imagem é a mesma da produção). Sem `MEDIA_INTERNAL_URL`, que só o compose da homologação define, o
 * caminho é um 404 comum: a produção serve as fotos pelo próprio domínio de imagens, nunca por aqui.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; file: string }> },
) {
  const { id, file } = await params;
  const base = (process.env.MEDIA_INTERNAL_URL ?? '').replace(/\/+$/, '');
  if (!base || !ID.test(id) || !FILE.test(file)) return new Response(null, { status: 404 });
  try {
    const upstream = await fetch(`${base}/avatars/${id}/${file}`, {
      method: request.method,
      signal: AbortSignal.timeout(5000),
    });
    if (!upstream.ok) return new Response(null, { status: upstream.status === 404 ? 404 : 502 });
    return new Response(request.method === 'HEAD' ? null : upstream.body, {
      status: 200,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'image/webp',
        'cache-control': IMMUTABLE,
        'x-content-type-options': 'nosniff',
      },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}

export const HEAD = GET;
