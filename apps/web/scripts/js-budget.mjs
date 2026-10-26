#!/usr/bin/env node
/**
 * Orçamento de JavaScript por página (decisão do dono, redesenho "Vida"): ~360 kB no geral e ~425 kB no Perfil,
 * em gzip, o que o navegador baixa na primeira carga mais o que a rolagem até o fim puxa sob demanda. Os
 * gráficos do Perfil são o conteúdo dele e já ficam em chunk à parte; fora ele, o que for pesado e abaixo da
 * dobra entra com `dynamic()` e só baixa quando aparece.
 *
 * Mede contra um build de produção (`next build && next start`), Chromium em 1440 px de largura, cache frio
 * por página, só os scripts da própria origem, bytes transferidos (corpo + cabeçalhos). Os limites estão em
 * `js-budget.json`; sai com código 1 se alguma página passar do limite.
 *
 *   node scripts/js-budget.mjs --base http://localhost:3000
 *   node scripts/js-budget.mjs --base http://localhost:3000 --storage-state sessao.json --profile /AbCd123
 *
 * As páginas com `auth` precisam de uma sessão (`--storage-state`, o arquivo do `context.storageState()` do
 * Playwright, com a Steam falsa); sem ela são puladas. A do Perfil também pede `--profile /<publicId>`.
 */
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(here, '..');
const { chromium } = createRequire(path.join(webRoot, 'package.json'))('@playwright/test');

const args = process.argv.slice(2);
const option = (name) => {
  const at = args.indexOf(name);
  return at === -1 ? null : (args[at + 1] ?? null);
};
const base = (option('--base') ?? 'http://localhost:3000').replace(/\/$/, '');
const storageStatePath = option('--storage-state');
const profilePath = option('--profile');
const listChunks = args.includes('--chunks');
const config = JSON.parse(await readFile(path.join(webRoot, 'js-budget.json'), 'utf8'));
const storageState = storageStatePath
  ? JSON.parse(await readFile(storageStatePath, 'utf8'))
  : undefined;

const browser = await chromium.launch();
const rows = [];
for (const page of config.pages) {
  const target = page.path === '{profile}' ? profilePath : page.path;
  if (!target || (page.auth && !storageState)) {
    rows.push({ ...page, skipped: true });
    continue;
  }
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ...(storageState ? { storageState } : {}),
  });
  const tab = await context.newPage();
  const bytes = { first: 0, later: 0 };
  const files = [];
  let phase = 'first';
  const pending = [];
  tab.on('requestfinished', (request) => {
    if (request.resourceType() !== 'script' || !request.url().startsWith(base)) return;
    pending.push(
      request
        .sizes()
        .then((sizes) => {
          const size = sizes.responseBodySize + sizes.responseHeadersSize;
          bytes[phase] += size;
          files.push({ phase, size, url: request.url().slice(base.length) });
        })
        .catch(() => {}),
    );
  });
  await tab.goto(`${base}${target}${target.includes('?') ? '&' : '?'}curtain=0`, {
    waitUntil: 'load',
    timeout: 120_000,
  });
  await tab.waitForTimeout(1800);
  await Promise.all(pending);
  phase = 'later';
  const height = await tab.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 600) {
    await tab.evaluate((top) => window.scrollTo(0, top), y);
    await tab.waitForTimeout(150);
  }
  await tab.waitForTimeout(1500);
  await Promise.all(pending);
  await context.close();
  const first = bytes.first / 1024;
  const later = bytes.later / 1024;
  rows.push({ ...page, first, later, total: first + later, limit: page.kb ?? config.defaultKb, files });
}
await browser.close();

console.log('| Página | 1ª carga | sob demanda | total | limite | |');
console.log('|---|---:|---:|---:|---:|---|');
let over = 0;
for (const row of rows) {
  if (row.skipped) {
    console.log(
      `| ${row.name} | - | - | - | ${row.kb ?? config.defaultKb} kB | pulada (precisa de --storage-state${row.path === '{profile}' ? ' e --profile' : ''}) |`,
    );
    continue;
  }
  const ok = row.total <= row.limit;
  if (!ok) over++;
  console.log(
    `| ${row.name} | ${row.first.toFixed(1)} kB | +${row.later.toFixed(1)} kB | ${row.total.toFixed(1)} kB | ${row.limit} kB | ${ok ? 'ok' : 'ACIMA'} |`,
  );
}
if (listChunks) {
  for (const row of rows.filter((r) => !r.skipped)) {
    console.log(`
#### ${row.name}: scripts por tamanho`);
    for (const file of row.files.sort((a, b) => b.size - a.size)) {
      console.log(`${(file.size / 1024).toFixed(1).padStart(7)} kB  ${file.phase === 'later' ? '(sob demanda) ' : ''}${file.url}`);
    }
  }
}
if (over) {
  console.error(`${over} página(s) acima do orçamento de JS.`);
  process.exit(1);
}
