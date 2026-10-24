#!/usr/bin/env node
/**
 * Paleta de cada skin: extrai até 3 cores vivas da imagem (CDN da cs2-lib) e grava em
 * `src/lib/skin-palettes.json` (id da skin -> cores). A cor ambiente das telas e o holo tingido
 * (`@/components/vida/skin-ambient`) usam essas cores; nada é calculado no navegador. As telas leem a
 * paleta no servidor, por `skinPalette(id)` de `@/lib/skin-palette`.
 *
 *   node scripts/vida-palettes.mjs                  # só as skins que ainda não estão no JSON
 *   node scripts/vida-palettes.mjs --force          # refaz todas
 *   node scripts/vida-palettes.mjs --ids 222 306    # só estas
 *
 * Roda de vez em quando (quando a lib ganha skins novas). Skins sem imagem ou fora do ar ficam sem entrada: as
 * telas caem na cor da raridade. O `sharp` vem como dependência do Next (ver maps.mjs).
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CS2_ITEMS, CS2Economy } from '@ianlucas/cs2-lib';
import { brazilian } from '@ianlucas/cs2-lib/translations/brazilian';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(here, '..');
const OUT = path.join(webRoot, 'src/lib/skin-palettes.json');
const sharp = createRequire(
  createRequire(path.join(webRoot, 'package.json')).resolve('next/package.json'),
)('sharp');

const args = process.argv.slice(2);
const force = args.includes('--force');
const idsAt = args.indexOf('--ids');
const onlyIds =
  idsAt === -1
    ? null
    : args
        .slice(idsAt + 1)
        .filter((a) => /^\d+$/.test(a))
        .map(Number);
const CONCURRENCY = 8;
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
  const colors = bins
    .filter((b) => b.w > 0)
    .sort((a, b) => b.w - a.w)
    .slice(0, 6)
    .map((b) => [b.r / b.w, b.g / b.w, b.b / b.w]);
  // Cores vivas: levanta a saturação e o brilho para brilhar sobre o fundo escuro.
  const vivid = colors.map(([r, g, b]) => {
    const [h, s, v] = rgbToHsv(r, g, b);
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
  // Descarta cores parecidas (matiz a menos de 40 graus) para o brilho ter variedade.
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
  // Imagem sem cor viva (cinza, preto e branco): sem paleta, a tela usa a cor da raridade.
  return {
    colors: picked.map(hex),
    average: hex([sum[0] / n, sum[1] / n, sum[2] / n]),
    light: Number((lum / n).toFixed(2)),
  };
}

CS2Economy.load({ items: CS2_ITEMS, language: brazilian });
const wanted = CS2Economy.itemsAsArray.filter((item) => {
  if (!['weapon', 'melee', 'glove', 'agent', 'musickit'].includes(item.type) || item.isDefault)
    return false;
  if ((item.type === 'weapon' || item.type === 'glove') && item.isBase) return false;
  return onlyIds ? onlyIds.includes(item.id) : true;
});

const out = {};
try {
  Object.assign(out, JSON.parse(await readFile(OUT, 'utf8')));
} catch {
  // primeira execução: começa vazio
}
const todo = wanted.filter((item) => force || onlyIds || !out[item.id]);
console.log(`${wanted.length} skins no catálogo, ${todo.length} para extrair`);

let done = 0;
let failed = 0;
async function work(item) {
  try {
    const res = await fetch(item.getImageUrl());
    if (!res.ok) throw new Error(String(res.status));
    const { colors } = await palette(Buffer.from(await res.arrayBuffer()));
    if (colors.length) out[item.id] = colors;
  } catch (error) {
    failed++;
    console.warn('sem paleta', item.id, item.name, String(error));
  }
  if (++done % 200 === 0) console.log(`${done}/${todo.length}`);
}
const queue = [...todo];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let item = queue.shift(); item; item = queue.shift()) await work(item);
  }),
);

// Uma skin por linha: o diff mostra só o que mudou.
const ids = Object.keys(out).sort((a, b) => Number(a) - Number(b));
const body = ids
  .map((id) => `  ${JSON.stringify(id)}: ${JSON.stringify(out[id]).replace(/,/g, ', ')}`)
  .join(',\n');
await writeFile(OUT, `{\n${body}\n}\n`);
console.log(`${ids.length} paletas gravadas em ${path.relative(webRoot, OUT)} (${failed} falhas)`);
