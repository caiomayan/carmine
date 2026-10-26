#!/usr/bin/env node
/**
 * Diagnóstico (não é parte da CI): para a rota dada, lista os chunks de cliente que o manifesto de referências
 * do build amarra aos módulos dela, com o tamanho em gzip e os módulos de cada chunk.
 *   node scripts/chunk-report.mjs /loadout
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { gzipSync } from 'node:zlib';

const route = process.argv[2] ?? '/loadout';
const root = path.join(import.meta.dirname, '..', '.next');
const file = path.join(root, 'server', 'app', route, 'page_client-reference-manifest.js');
const sandbox = { globalThis: {} };
sandbox.globalThis.__RSC_MANIFEST = {};
vm.runInNewContext(readFileSync(file, 'utf8'), sandbox);
const manifest = Object.values(sandbox.globalThis.__RSC_MANIFEST)[0];

const byChunk = new Map();
for (const [module, entry] of Object.entries(manifest.clientModules)) {
  for (const chunk of entry.chunks ?? []) {
    const list = byChunk.get(chunk) ?? [];
    list.push(module);
    byChunk.set(chunk, list);
  }
}
const rows = [];
for (const [chunk, modules] of byChunk) {
  const clean = chunk.replace(/^\/?_next\//, '').replace(/\?.*$/, '');
  let kb = 0;
  try {
    kb = gzipSync(readFileSync(path.join(root, clean))).length / 1024;
  } catch {}
  rows.push({ chunk: clean, kb, modules });
}
rows.sort((a, b) => b.kb - a.kb);
for (const row of rows) {
  console.log(`\n${row.kb.toFixed(1)} kB  ${row.chunk}`);
  for (const module of row.modules.slice(0, 25)) console.log(`    ${module}`);
  if (row.modules.length > 25) console.log(`    … +${row.modules.length - 25}`);
}
const dir = path.join(root, 'static', 'chunks');
const all = readdirSync(dir).filter((name) => name.endsWith('.js'));
const sizes = all.map((name) => ({
  name,
  kb: gzipSync(readFileSync(path.join(dir, name))).length / 1024,
}));
sizes.sort((a, b) => b.kb - a.kb);
console.log('\n--- maiores chunks do build (gzip) ---');
for (const s of sizes.slice(0, 25)) console.log(`${s.kb.toFixed(1)} kB  ${s.name}`);
void statSync;
