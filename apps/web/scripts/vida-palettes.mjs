#!/usr/bin/env node
/**
 * Protótipo "vida": extrai as cores ambientes dos mapas (public/maps) e das skins (CDN da cs2-lib) e
 * grava em `src/components/vida/palettes.json`. A Home usa essas cores para o brilho do topo.
 *
 *   node scripts/vida-palettes.mjs
 *
 * Por mapa/skin: até 3 cores vivas (matizes diferentes, por população x saturação x brilho), a média
 * escura para o fundo e a luminosidade. O `sharp` vem como dependência do Next (ver maps.mjs).
 */
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CS2_ITEMS, CS2Economy } from '@ianlucas/cs2-lib';
import { brazilian } from '@ianlucas/cs2-lib/translations/brazilian';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(here, '..');
const sharp = createRequire(
  createRequire(path.join(webRoot, 'package.json')).resolve('next/package.json'),
)('sharp');

const MAPS = ['ancient', 'anubis', 'cache', 'dust2', 'inferno', 'mirage', 'nuke', 'overpass'];
// Skins do protótipo: AK Linhas Vermelhas, AWP Asiimov, Karambit Degradê, M4A4 Uivo, AK Serpente de Fogo,
// Glock Degradê, Desert Eagle Dragão Kumicho, M4A1-S Cyrex, Luvas Esportivas Caixa de Pandora, AWP Gungnir.
const SKINS = [222, 306, 1327, 461, 220, 171, 86, 1099, 1717, 320];

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max];
}
const hex = ([r, g, b]) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

async function palette(input) {
  const { data, info } = await sharp(input)
    .flatten({ background: '#000' })
    .resize(48, 28, { fit: 'inside' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const bins = Array.from({ length: 18 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
  let sum = [0, 0, 0]; let n = 0; let lum = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    sum[0] += r; sum[1] += g; sum[2] += b; n++;
    const [h, s, v] = rgbToHsv(r, g, b);
    lum += v;
    if (v < 0.18 || s < 0.22) continue;
    const w = s * s * (0.4 + v);
    const bin = bins[Math.floor(h / 20) % 18];
    bin.w += w; bin.r += r * w; bin.g += g * w; bin.b += b * w;
  }
  const colors = bins
    .filter((b) => b.w > 0)
    .sort((a, b) => b.w - a.w)
    .slice(0, 6)
    .map((b) => [b.r / b.w, b.g / b.w, b.b / b.w]);
  // Cores vivas: levanta a saturação e o brilho para brilhar sobre o fundo escuro.
  const vivid = colors.map(([r, g, b]) => {
    const [h, s, v] = rgbToHsv(r, g, b);
    const S = Math.min(1, s * 1.15 + 0.08); const V = Math.max(0.78, Math.min(1, v * 1.15));
    const c = V * S; const x = c * (1 - Math.abs(((h / 60) % 2) - 1)); const m = V - c;
    const [rr, gg, bb] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return [(rr + m) * 255, (gg + m) * 255, (bb + m) * 255];
  });
  // Descarta cores parecidas (matiz a menos de 40 graus) para o brilho ter variedade.
  const picked = [];
  for (const c of vivid) {
    const h = rgbToHsv(...c)[0];
    if (picked.every((p) => { const d = Math.abs(rgbToHsv(...p)[0] - h); return Math.min(d, 360 - d) > 40; })) picked.push(c);
    if (picked.length === 3) break;
  }
  if (picked.length === 0) picked.push([200, 190, 170]);
  return {
    colors: picked.map(hex),
    average: hex([sum[0] / n, sum[1] / n, sum[2] / n]),
    light: Number((lum / n).toFixed(2)),
  };
}

const out = { maps: {}, skins: {} };
for (const m of MAPS) out.maps[m] = await palette(path.join(webRoot, `public/maps/${m}-800.webp`));

CS2Economy.load({ items: CS2_ITEMS, language: brazilian });
for (const id of SKINS) {
  const item = CS2Economy.getById(id);
  const url = item.getImageUrl();
  const res = await fetch(url);
  if (!res.ok) { console.warn('sem imagem', id, url, res.status); continue; }
  out.skins[id] = { name: item.name.replace(/\s+/g, ' '), image: url, ...(await palette(Buffer.from(await res.arrayBuffer()))) };
}
await writeFile(path.join(webRoot, 'src/components/vida/palettes.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(out, null, 1).slice(0, 1800));
