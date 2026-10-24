#!/usr/bin/env node
/**
 * Arte dos mapas: converte as telas de carregamento do CS2 (1920x1080, sem HUD, ~3 MB cada, fora
 * do git em `assets/thumbs/`) em AVIF e WebP de 480, 960 e 1600 px, em
 * `public/maps/<mapa>/<n>-<largura>.<ext>`, com a de 1600 abaixo de 150 kB. Só as versões otimizadas entram
 * no git. Também grava `src/components/vida/map-art.json` com, por variante: se é noturna, o blurDataURL
 * (carregamento) e as cores vivas extraídas da imagem (cartão e brilho ambiente): nada é calculado no navegador.
 *
 *   node scripts/maps-art.mjs --src C:/caminho/assets/thumbs            # todos os mapas da lista
 *   node scripts/maps-art.mjs --src ... --only mirage dust2             # só alguns
 *
 * Nomes de origem: `de_<mapa>_png.png` (variante 0), `de_<mapa>_<n>_png.png`, e as noturnas
 * `de_<mapa>_night_png.png` / `de_<mapa>_night_<n>_png.png`. O `sharp` vem como dependência do Next.
 */
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(here, '..');
const sharp = createRequire(
  createRequire(path.join(webRoot, 'package.json')).resolve('next/package.json'),
)('sharp');

const MAPS = [
  'mirage',
  'dust2',
  'inferno',
  'ancient',
  'anubis',
  'nuke',
  'overpass',
  'train',
  'vertigo',
  'cache',
];
const WIDTHS = [480, 960, 1600];
const TARGET_KB_1600 = 150;
const MAX_VARIANTS_PER_KIND = 6;

const args = process.argv.slice(2);
const flag = (name) => args.indexOf(name);
const srcAt = flag('--src');
const src = path.resolve(
  srcAt === -1
    ? (process.env.MAPS_SRC ?? path.join(webRoot, '../../assets/thumbs'))
    : args[srcAt + 1],
);
const onlyAt = flag('--only');
const only = onlyAt === -1 ? MAPS : args.slice(onlyAt + 1).filter((a) => !a.startsWith('--'));
const outRoot = path.join(webRoot, 'public/maps');

function rgbToHsv(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max];
}
const hex = ([r, g, b]) =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** Até 3 cores vivas (matizes diferentes, por população x saturação x brilho) + média + luminosidade. */
async function palette(input) {
  const { data, info } = await sharp(input)
    .flatten({ background: '#000' })
    .resize(48, 28, { fit: 'inside' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const bins = Array.from({ length: 18 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
  const sum = [0, 0, 0];
  let n = 0;
  let lum = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    sum[0] += r;
    sum[1] += g;
    sum[2] += b;
    n++;
    const [h, s, v] = rgbToHsv(r, g, b);
    lum += v;
    if (v < 0.18 || s < 0.22) continue;
    const w = s * s * (0.4 + v);
    const bin = bins[Math.floor(h / 20) % 18];
    bin.w += w;
    bin.r += r * w;
    bin.g += g * w;
    bin.b += b * w;
  }
  const vivid = bins
    .filter((b) => b.w > 0)
    .sort((a, b) => b.w - a.w)
    .slice(0, 6)
    .map((b) => {
      const [h, s, v] = rgbToHsv(b.r / b.w, b.g / b.w, b.b / b.w);
      const S = Math.min(1, s * 1.15 + 0.08);
      const V = Math.max(0.78, Math.min(1, v * 1.15));
      const c = V * S;
      const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
      const m = V - c;
      const [rr, gg, bb] =
        h < 60
          ? [c, x, 0]
          : h < 120
            ? [x, c, 0]
            : h < 180
              ? [0, c, x]
              : h < 240
                ? [0, x, c]
                : h < 300
                  ? [x, 0, c]
                  : [c, 0, x];
      return [(rr + m) * 255, (gg + m) * 255, (bb + m) * 255];
    });
  const picked = [];
  for (const c of vivid) {
    const h = rgbToHsv(...c)[0];
    if (
      picked.every((p) => {
        const d = Math.abs(rgbToHsv(...p)[0] - h);
        return Math.min(d, 360 - d) > 40;
      })
    )
      picked.push(c);
    if (picked.length === 3) break;
  }
  if (!picked.length) picked.push([200, 190, 170]);
  return {
    colors: picked.map(hex),
    average: hex([sum[0] / n, sum[1] / n, sum[2] / n]),
    light: Number((lum / n).toFixed(2)),
  };
}

async function encode(file, width, format, kbTarget) {
  const base = sharp(file).resize({ width, withoutEnlargement: true });
  const qualities = format === 'avif' ? [58, 50, 42, 34] : [78, 68, 58, 48];
  let last;
  for (const quality of qualities) {
    last = await (format === 'avif'
      ? base.clone().avif({ quality, effort: 6 })
      : base.clone().webp({ quality, effort: 6, smartSubsample: true })
    ).toBuffer();
    if (!kbTarget || last.length <= kbTarget * 1024) break;
  }
  return last;
}

const files = (await readdir(src)).filter((f) => /\.png$/i.test(f));
const catalog = {};
let totalBytes = 0;
for (const map of only) {
  const re = new RegExp(`^de_${map}(_night)?(?:_(\\d+))?_png(?:_png_[0-9a-f]+)?\\.png$`, 'i');
  const found = files
    .map((f) => {
      const m = f.match(re);
      return m ? { f, night: !!m[1], n: m[2] ? Number(m[2]) : 0 } : null;
    })
    .filter(Boolean)
    .sort((a, b) => Number(a.night) - Number(b.night) || a.n - b.n);
  if (!found.length) {
    console.warn(`sem arte para ${map}`);
    continue;
  }
  const dir = path.join(outRoot, map);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const variants = [];
  const perKind = { day: 0, night: 0 };
  for (const item of found) {
    const kind = item.night ? 'night' : 'day';
    if (perKind[kind] >= MAX_VARIANTS_PER_KIND) continue;
    const id = `${kind === 'night' ? 'n' : 'd'}${perKind[kind]}`;
    perKind[kind] += 1;
    const input = path.join(src, item.f);
    for (const width of WIDTHS) {
      for (const format of ['avif', 'webp']) {
        const buf = await encode(input, width, format, width === 1600 ? TARGET_KB_1600 : 0);
        await writeFile(path.join(dir, `${id}-${width}.${format}`), buf);
        totalBytes += buf.length;
        if (width === 1600 && buf.length > TARGET_KB_1600 * 1024)
          console.warn(
            `${map}/${id}-1600.${format}: ${(buf.length / 1024).toFixed(0)} kB acima do alvo`,
          );
      }
    }
    const blur = `data:image/webp;base64,${(await sharp(input).resize(24).webp({ quality: 40 }).toBuffer()).toString('base64')}`;
    variants.push({ id, night: item.night, blur, ...(await palette(input)) });
  }
  catalog[map] = variants;
  console.log(
    `${map}: ${variants.length} variantes (${variants.filter((v) => v.night).length} noturnas)`,
  );
}
await writeFile(
  path.join(webRoot, 'src/components/vida/map-art.json'),
  `${JSON.stringify(catalog)}\n`,
);
console.log(`ok: ${(totalBytes / 1024 / 1024).toFixed(1)} MB de imagens otimizadas`);
