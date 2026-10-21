#!/usr/bin/env node
/**
 * Imagens dos mapas da home (U2): converte as miniaturas originais da Valve (fora do git, ~390 MB)
 * em AVIF e WebP de 800 e 1600 px de largura, em `public/maps/<mapa>-<largura>.<formato>`.
 *
 *   pnpm --filter @carmine/web maps                       # usa <raiz>/assets/thumbs
 *   pnpm --filter @carmine/web maps -- --src D:/thumbs    # ou MAPS_SRC=D:/thumbs
 *   pnpm --filter @carmine/web maps -- --only mirage nuke # só alguns mapas
 *
 * Para um mapa novo: ponha `de_<mapa>_png.png` na pasta de origem, acrescente o mapa em MAPS aqui
 * e em ROTATION_MAPS (src/lib/map-art.ts), rode o script e commite os arquivos gerados. O teste
 * `map-art.test.ts` falha se algum mapa da lista ficar sem os quatro arquivos.
 *
 * O `sharp` vem como dependência do Next: é resolvido a partir dele, sem entrar no package.json.
 */
import { mkdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(here, '..');
const sharp = createRequire(
  createRequire(path.join(webRoot, 'package.json')).resolve('next/package.json'),
)('sharp');

/** Mapas da rotação dos perfis (infra/cs2/profiles/*), pelo nome sem o prefixo `de_`. */
const MAPS = ['ancient', 'anubis', 'cache', 'dust2', 'inferno', 'mirage', 'nuke', 'overpass'];
const WIDTHS = [800, 1600];
/** Qualidades que miram ~150 KB aos 1600 px; o relatório no fim mostra o resultado real. */
const AVIF = { quality: 60, effort: 6 };
const WEBP = { quality: 78, effort: 6, smartSubsample: true };

const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : at;
};
const srcAt = flag('--src');
const src = path.resolve(
  srcAt === undefined
    ? (process.env.MAPS_SRC ?? path.join(webRoot, '../../assets/thumbs'))
    : args[srcAt + 1],
);
const onlyAt = flag('--only');
const only =
  onlyAt === undefined ? MAPS : args.slice(onlyAt + 1).filter((a) => !a.startsWith('--'));
const out = path.join(webRoot, 'public/maps');

const unknown = only.filter((m) => !MAPS.includes(m));
if (unknown.length > 0) {
  console.error(`Mapa fora da lista MAPS: ${unknown.join(', ')}`);
  process.exit(1);
}

await mkdir(out, { recursive: true });
const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;

for (const map of only) {
  const input = path.join(src, `de_${map}_png.png`);
  try {
    await stat(input);
  } catch {
    console.error(`Não achei ${input}. Passe a pasta das miniaturas com --src ou MAPS_SRC.`);
    process.exit(1);
  }
  const sizes = [];
  for (const width of WIDTHS) {
    const base = sharp(input).resize({ width, withoutEnlargement: true }).removeAlpha();
    const avif = await base
      .clone()
      .avif(AVIF)
      .toFile(path.join(out, `${map}-${width}.avif`));
    const webp = await base
      .clone()
      .webp(WEBP)
      .toFile(path.join(out, `${map}-${width}.webp`));
    sizes.push(`${width}px avif ${kb(avif.size)} / webp ${kb(webp.size)}`);
  }
  console.log(`${map.padEnd(9)} ${sizes.join('  |  ')}`);
}
