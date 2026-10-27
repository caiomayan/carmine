/**
 * As fontes da imagem da carta. O `ImageResponse` (Satori) precisa dos bytes da fonte em TTF/OTF; o `next/font` só
 * entrega CSS para o navegador. No protótipo os TTFs vêm do Google Fonts (a API devolve `truetype` para um cliente
 * sem navegador) na primeira geração e ficam em memória. **Na versão de verdade os arquivos entram no repositório**
 * (ou num pacote `@fontsource`), para a imagem não depender de rede externa. Se uma fonte não carregar, a imagem sai
 * com a fonte padrão do Satori em vez de falhar.
 */

export type ImageFont = {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 500 | 700 | 800;
  style: 'normal';
};

const SOURCES = [
  { name: 'Big Shoulders', family: 'Big+Shoulders', weight: 800 },
  { name: 'Inter', family: 'Inter', weight: 500 },
  { name: 'Inter', family: 'Inter', weight: 700 },
  { name: 'DM Serif Display', family: 'DM+Serif+Display', weight: 400 },
] as const;

const cache = new Map<string, Promise<ArrayBuffer | null>>();

async function download(family: string, weight: number): Promise<ArrayBuffer | null> {
  try {
    const query = family === 'DM+Serif+Display' ? '' : `:wght@${weight}`;
    const css = await (
      await fetch(`https://fonts.googleapis.com/css2?family=${family}${query}`, {
        signal: AbortSignal.timeout(8000),
      })
    ).text();
    const url = /src: url\((.+?)\) format\('(?:opentype|truetype)'\)/.exec(css)?.[1];
    if (!url) return null;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    return response.ok ? await response.arrayBuffer() : null;
  } catch {
    return null;
  }
}

export async function loadImageFonts(): Promise<ImageFont[]> {
  const loaded = await Promise.all(
    SOURCES.map(async (source): Promise<ImageFont | null> => {
      const key = `${source.family}:${source.weight}`;
      let pending = cache.get(key);
      if (!pending) {
        pending = download(source.family, source.weight);
        cache.set(key, pending);
      }
      const data = await pending;
      if (!data) cache.delete(key);
      return data
        ? { name: source.name, data, weight: source.weight, style: 'normal' as const }
        : null;
    }),
  );
  return loaded.filter((font): font is ImageFont => font !== null);
}
