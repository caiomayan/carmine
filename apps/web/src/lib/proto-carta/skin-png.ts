/**
 * A skin da carta como PNG. As imagens do catálogo (cdn.cstrike.app) são WebP e o Satori só desenha PNG, JPEG, GIF e
 * SVG: a rota baixa o WebP, converte com o `sharp` (o mesmo que o Next usa nas imagens) e entrega um `data:` URI,
 * que também evita o Satori buscar a imagem pela rede. Fica em memória por URL (a skin não muda). Se algo falhar a
 * carta sai sem a skin, nunca com erro. **Só no servidor.**
 */

const cache = new Map<string, Promise<string | null>>();

async function convert(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const source = Buffer.from(await response.arrayBuffer());
    const { default: sharp } = await import('sharp');
    const png = await sharp(source).png().toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    return null;
  }
}

export function skinAsPng(url: string): Promise<string | null> {
  let pending = cache.get(url);
  if (!pending) {
    pending = convert(url);
    cache.set(url, pending);
  }
  void pending.then((value) => {
    if (value === null) cache.delete(url);
  });
  return pending;
}
