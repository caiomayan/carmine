#!/usr/bin/env node
/**
 * Diagnóstico (não é parte da CI): lista todos os chunks de cliente do build com o tamanho em gzip e o que cada um
 * leva (pacotes e módulos do projeto), e os módulos de cliente que o manifesto da rota liga a cada chunk.
 *   node scripts/chunk-report.mjs /loadout
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { gzipSync } from 'node:zlib';

const route = process.argv[2] ?? '/loadout';
const root = path.join(import.meta.dirname, '..', '.next');
const chunksDir = path.join(root, 'static', 'chunks');

function find(dir, name, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) find(full, name, found);
    else if (full.replaceAll('\\', '/').endsWith(name)) found.push(full);
  }
  return found;
}

const markers = {
  'framer-motion': /useReducedMotion|AnimatePresence|MotionConfig|LazyMotion/,
  radix: /data-radix|@radix-ui|radix-/,
  'next-intl': /NextIntl|IntlProvider/,
  zod: /ZodError|ZodType/,
  'simple-icons': /simple-icons/,
  'react-dom': /react-dom|react\.production/,
  'next/router': /app-router|AppRouter/,
};

const rows = readdirSync(chunksDir)
  .filter((name) => name.endsWith('.js'))
  .map((name) => {
    const source = readFileSync(path.join(chunksDir, name), 'utf8');
    const kb = gzipSync(source).length / 1024;
    const has = Object.entries(markers)
      .filter(([, pattern]) => pattern.test(source))
      .map(([key]) => key);
    const own = [...source.matchAll(/\[project\]\/(src\/[\w@./()[\]-]+)/g)].map((m) => m[1]);
    const zod = /ZodError|ZodType/.exec(source);
    const sample = zod ? source.slice(Math.max(0, zod.index - 200), zod.index + 200) : '';
    const head = source.slice(0, 400);
    return { name, kb, has, own: [...new Set(own)], sample, head };
  })
  .sort((a, b) => b.kb - a.kb);

console.log('--- chunks do build (gzip) ---');
for (const row of rows.slice(0, 40)) {
  console.log(`${row.kb.toFixed(1).padStart(6)} kB  ${row.name}  [${row.has.join(', ')}]`);
  for (const own of row.own.slice(0, 12)) console.log(`          ${own}`);
  if (row.kb > 30 && row.kb < 100) console.log(`   HEAD: ${row.head}
   ZOD: ${row.sample}`);
}

const manifests = find(path.join(root, 'server', 'app'), `${route}/page_client-reference-manifest.js`);
for (const file of manifests) {
  const sandbox = { globalThis: { __RSC_MANIFEST: {} } };
  vm.runInNewContext(readFileSync(file, 'utf8'), sandbox);
  const manifest = Object.values(sandbox.globalThis.__RSC_MANIFEST)[0];
  console.log(`\n--- ${file} ---`);
  for (const [module, entry] of Object.entries(manifest.clientModules)) {
    console.log(`${module} -> ${(entry.chunks ?? []).map((c) => c.split('/').pop()).join(' ')}`);
  }
}
