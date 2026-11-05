#!/usr/bin/env node
// Grava as chaves dos servidores do teste de carga (uma por linha) num arquivo e as mascara no log do
// GitHub Actions. O segredo vem de LOADTEST_KEY_SECRET, nunca de argumento (argumento aparece em `ps`).
//
//   LOADTEST_KEY_SECRET=... node bin/chaves.mjs --count 200 --out "$RUNNER_TEMP/chaves.txt" [--prefix carga-] [--mask]
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { chavesDosServidores, PREFIXO_PADRAO } from '../lib/chaves.mjs';

const { values } = parseArgs({
  options: {
    count: { type: 'string' },
    out: { type: 'string' },
    prefix: { type: 'string', default: PREFIXO_PADRAO },
    mask: { type: 'boolean', default: false },
  },
});
const segredo = (process.env.LOADTEST_KEY_SECRET ?? '').trim();
const quantidade = Number(values.count);
if (segredo.length < 32) {
  console.error('LOADTEST_KEY_SECRET ausente ou curto (mínimo 32 caracteres)');
  process.exit(1);
}
if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 500 || !values.out) {
  console.error('uso: chaves.mjs --count <1..500> --out <arquivo> [--prefix carga-] [--mask]');
  process.exit(1);
}
const chaves = chavesDosServidores(segredo, quantidade, values.prefix);
if (values.mask) for (const chave of chaves) console.log(`::add-mask::${chave}`);
writeFileSync(values.out, `${chaves.join('\n')}\n`, { mode: 0o600 });
console.log(`${chaves.length} chaves gravadas`);
