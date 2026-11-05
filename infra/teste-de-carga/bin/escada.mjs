#!/usr/bin/env node
// Sobe a escada de um grupo (coleta, api ou paginas): um processo do k6 por passo, parando no primeiro que
// estoura o limite. O ambiente (BASE_URL, KEYS_FILE, CF_ACCESS_*, PROD_URL, SONDA_*...) passa direto ao k6.
//
//   node bin/escada.mjs --grupo coleta --passos 10,25,50,100,200 --p95 1000 --saida resultados [--max-erros 0.01]
//                       [--pausa 30] [--rampa 20] [--segura 120]
//
// Saída do processo: 0 = a escada terminou (com ou sem limite achado: o limite é o resultado), 3 = a sonda
// da produção abortou (os grupos seguintes não devem rodar), 4 = defeito no roteiro.
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { classificaPasso, limiteDoGrupo, tabelaDoGrupo } from '../lib/escada.mjs';

const aqui = dirname(fileURLToPath(import.meta.url));
const { values: v } = parseArgs({
  options: {
    grupo: { type: 'string' },
    passos: { type: 'string' },
    p95: { type: 'string' },
    saida: { type: 'string' },
    'max-erros': { type: 'string', default: '0.01' },
    pausa: { type: 'string', default: '30' },
    rampa: { type: 'string', default: '20' },
    segura: { type: 'string', default: '120' },
    k6: { type: 'string', default: process.env.K6_BIN || 'k6' },
  },
});
if (!['coleta', 'api', 'paginas'].includes(v.grupo) || !v.passos || !v.p95 || !v.saida) {
  console.error(
    'uso: escada.mjs --grupo coleta|api|paginas --passos 10,25 --p95 <ms> --saida <pasta>',
  );
  process.exit(4);
}
const passos = v.passos.split(',').map((n) => Number(n.trim()));
if (
  passos.some((n) => !Number.isInteger(n) || n < 1) ||
  passos.some((n, i) => i > 0 && n <= passos[i - 1])
) {
  console.error('--passos: inteiros positivos em ordem crescente');
  process.exit(4);
}
mkdirSync(v.saida, { recursive: true });

const dorme = (s) => new Promise((resolve) => setTimeout(resolve, s * 1000));

/** Roda o k6 e devolve o código de saída. O aviso "request timeout" do stream (esperado) é só contado. */
function roda(passo) {
  return new Promise((resolve) => {
    const filho = spawn(v.k6, ['run', '--quiet', join(aqui, '..', 'k6', `${v.grupo}.js`)], {
      env: {
        ...process.env,
        PASSO: String(passo),
        P95_MS: v.p95,
        MAX_ERROS: v['max-erros'],
        RAMPA_S: v.rampa,
        SEGURA_S: v.segura,
        SAIDA: v.saida,
      },
      stdio: ['ignore', 'inherit', 'pipe'],
    });
    let resto = '';
    let timeouts = 0;
    filho.stderr.on('data', (pedaco) => {
      resto += pedaco;
      const linhas = resto.split('\n');
      resto = linhas.pop();
      for (const linha of linhas) {
        if (linha.includes('Request Failed') && linha.includes('request timeout')) timeouts += 1;
        else console.error(linha);
      }
    });
    filho.on('error', (erro) => {
      console.error(`não consegui rodar ${v.k6}: ${erro.message}`);
      resolve(-1);
    });
    filho.on('close', (codigo) => {
      if (timeouts > 0)
        console.log(`(${timeouts} conexões de stream encerradas por tempo, como previsto)`);
      resolve(codigo ?? -1);
    });
  });
}

function leResultado(passo) {
  try {
    return JSON.parse(readFileSync(join(v.saida, `resultado-${v.grupo}-${passo}.json`), 'utf8'));
  } catch {
    return null;
  }
}

const feitos = [];
let saida = 0;
for (const [i, passo] of passos.entries()) {
  if (i > 0) await dorme(Number(v.pausa));
  console.log(`\n=== ${v.grupo}: passo ${passo} (${new Date().toISOString()}) ===`);
  const codigoDeSaida = await roda(passo);
  const resultado = leResultado(passo);
  const classe = classificaPasso({ codigoDeSaida, resultado });
  feitos.push({ passo, classe, codigoDeSaida, resultado });
  console.log(
    `=== ${v.grupo}: passo ${passo} terminou: ${classe} (k6 saiu com ${codigoDeSaida}) ===`,
  );
  if (classe === 'producao') saida = 3;
  if (classe === 'erro') saida = 4;
  if (classe !== 'ok') break;
}

const limite = limiteDoGrupo(feitos);
const tabela = tabelaDoGrupo(v.grupo, feitos);
const frase =
  limite.estourou === null
    ? saida === 0
      ? `Nenhum passo estourou o limite (até ${feitos.at(-1)?.passo}).`
      : 'A escada parou antes de achar o limite.'
    : `O limite está entre ${limite.aguentou ?? 'o primeiro passo (nem ele aguentou)'} e ${limite.estourou}.`;
writeFileSync(
  join(v.saida, `escada-${v.grupo}.json`),
  JSON.stringify({ grupo: v.grupo, limite, passos: feitos }, null, 2),
);
const markdown = `${tabela}\n${frase}\n\n`;
writeFileSync(join(v.saida, `escada-${v.grupo}.md`), markdown);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
console.log(`\n${tabela}\n${frase}`);
process.exit(saida);
