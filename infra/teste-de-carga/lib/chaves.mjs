// As chaves dos Servidores Carmine do teste de carga. O CLI da API (`servers load-test`) grava só o hash
// delas na homologação; aqui se calcula a mesma chave a partir do mesmo segredo, sem imprimir centenas de
// chaves de uma vez. Espelha apps/api/src/game-servers/load-test-servers.ts (o vetor fixo do teste dos dois
// lados garante que não se separem).
import { createHmac } from 'node:crypto';

export const PREFIXO_PADRAO = 'carga-';

/** `carga-001`, `carga-002`... (índice a partir de 1). */
export function nomeDoServidor(prefixo, indice) {
  return `${prefixo}${String(indice).padStart(3, '0')}`;
}

export function chaveDoServidor(segredo, nome) {
  return `cmk_${createHmac('sha256', segredo).update(`carga:${nome}`).digest('base64url')}`;
}

/** As chaves dos servidores `prefixo001` a `prefixo<quantidade>`, na ordem. */
export function chavesDosServidores(segredo, quantidade, prefixo = PREFIXO_PADRAO) {
  return Array.from({ length: quantidade }, (_, i) =>
    chaveDoServidor(segredo, nomeDoServidor(prefixo, i + 1)),
  );
}
