// A escada: roda um passo do k6 por vez (10, 25, 50... servidores ou visitantes) e decide, pelo código de
// saída e pelo JSON que o roteiro grava, se sobe o próximo, para porque achou o limite, ou para porque a
// sonda da produção abortou. A parte pura fica aqui (testada); o processo, em bin/escada.mjs.

/** Códigos de saída do k6 que o orquestrador entende. */
export const SAIDA_K6 = { ok: 0, limiarEstourado: 99, abortadoPorScript: 108 };

/**
 * O que um passo foi.
 * - `ok`: dentro do limite, sobe o próximo;
 * - `limite`: estourou p95 ou erros, é o limite deste grupo (o passo anterior é o último que aguentou);
 * - `producao`: a sonda da produção abortou, o teste inteiro para;
 * - `erro`: o roteiro quebrou (sem JSON, exceção, saída inesperada): não é resultado, é defeito.
 */
export function classificaPasso({ codigoDeSaida, resultado }) {
  if (resultado?.abortouPelaSonda) return 'producao';
  if (codigoDeSaida === SAIDA_K6.abortadoPorScript) return resultado ? 'producao' : 'erro';
  if (!resultado) return 'erro';
  if (codigoDeSaida === SAIDA_K6.ok && resultado.ok) return 'ok';
  if (codigoDeSaida === SAIDA_K6.limiarEstourado || !resultado.ok) return 'limite';
  return 'erro';
}

const ms = (valor) => (typeof valor === 'number' ? `${Math.round(valor)} ms` : '—');
const pct = (valor) => (typeof valor === 'number' ? `${(valor * 100).toFixed(2)}%` : '—');

/** As rotas medidas de um resultado, na ordem em que aparecem: `{ nome, p95, p99 }`. */
export function rotasDe(resultado) {
  const rotas = [];
  for (const [chave, m] of Object.entries(resultado.metricas ?? {})) {
    const achado = /^http_req_duration\{scenario:carga,endpoint:([^}]+)\}$/.exec(chave);
    if (achado && m.contagem !== 0) rotas.push({ nome: achado[1], p95: m.p95, p99: m.p99 });
  }
  return rotas;
}

/** A tabela em Markdown de um grupo, uma linha por passo (vai para o resumo do GitHub e para o doc). */
export function tabelaDoGrupo(grupo, passos) {
  const nomes = [
    ...new Set(passos.flatMap((p) => (p.resultado ? rotasDe(p.resultado) : []).map((r) => r.nome))),
  ];
  const cabecalho = ['Passo', 'Resultado', 'Req/s', 'Erros', ...nomes.map((n) => `p95 ${n}`)];
  const linhas = passos.map(({ passo, classe, resultado }) => {
    const rotas = new Map((resultado ? rotasDe(resultado) : []).map((r) => [r.nome, r]));
    const m = resultado?.metricas ?? {};
    return [
      String(passo),
      {
        ok: 'dentro do limite',
        limite: '**estourou o limite**',
        producao: '**abortado pela sonda**',
        erro: '**erro no roteiro**',
      }[classe],
      m['http_reqs{scenario:carga}']?.taxa?.toFixed(1) ?? '—',
      pct(m['http_req_failed{scenario:carga}']?.taxa),
      ...nomes.map((n) => ms(rotas.get(n)?.p95)),
    ];
  });
  const formata = (celulas) => `| ${celulas.join(' | ')} |`;
  return [
    `### ${grupo}`,
    '',
    formata(cabecalho),
    formata(cabecalho.map(() => '---')),
    ...linhas.map(formata),
    '',
  ].join('\n');
}

/** O último passo que aguentou e o que estourou, para a frase "o limite está entre X e Y". */
export function limiteDoGrupo(passos) {
  const estourou = passos.find((p) => p.classe === 'limite');
  const aguentou = [...passos]
    .reverse()
    .find((p) => p.classe === 'ok' && (!estourou || p.passo < estourou.passo));
  return { aguentou: aguentou?.passo ?? null, estourou: estourou?.passo ?? null };
}
