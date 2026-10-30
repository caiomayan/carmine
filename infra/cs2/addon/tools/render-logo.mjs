#!/usr/bin/env node
// Gera as imagens do addon a partir do ícone da marca (apps/web/src/app/icon.svg):
//   src/panorama/images/carmine/logo.png      512x512, fundo transparente (card, via logo.vtex)
//   src/materials/carmine/wall_logo.png       512x512, cor do decal (logo sobre cinza 50%, ver README)
//   src/materials/carmine/wall_logo_trans.png 512x512, máscara de translucidez (branco = opaco)
//
// Uso: node infra/cs2/addon/tools/render-logo.mjs
// Não instala nada: reaproveita o `sharp` que já está em apps/web/node_modules (pnpm install do repositório).
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const addon = resolve(aqui, '..');
const repo = resolve(addon, '..', '..', '..');
const svgPath = join(repo, 'apps', 'web', 'src', 'app', 'icon.svg');
const TAMANHO = 512;

const require = createRequire(join(repo, 'apps', 'web', 'package.json'));
let sharp;
try {
  sharp = require('sharp');
} catch {
  console.error('sharp não encontrado em apps/web/node_modules. Rode `pnpm install` na raiz do repositório.');
  process.exit(1);
}

const svg = readFileSync(svgPath);
// density alto para o SVG de viewBox 100 ficar nítido antes do resize final.
const logo = await sharp(svg, { density: 576 })
  .resize(TAMANHO, TAMANHO, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();

const saida = (...partes) => {
  const caminho = join(addon, 'src', ...partes);
  mkdirSync(dirname(caminho), { recursive: true });
  return caminho;
};

// 1) Card: PNG com alfa.
await sharp(logo).png({ compressionLevel: 9 }).toFile(saida('panorama', 'images', 'carmine', 'logo.png'));

// 2) Decal: cor sobre cinza 50% (no blend Mod2X, 128 é neutro) + máscara em tons de cinza.
await sharp({ create: { width: TAMANHO, height: TAMANHO, channels: 3, background: { r: 128, g: 128, b: 128 } } })
  .composite([{ input: logo }])
  .removeAlpha()
  .png({ compressionLevel: 9 })
  .toFile(saida('materials', 'carmine', 'wall_logo.png'));

await sharp(logo)
  .ensureAlpha()
  .extractChannel('alpha')
  .toColourspace('b-w')
  .png({ compressionLevel: 9 })
  .toFile(saida('materials', 'carmine', 'wall_logo_trans.png'));

console.log('Imagens do addon geradas em', join(addon, 'src'));
