/**
 * Os schemas Zod (cerca de 40 kB) ficam fora do bundle da primeira carga: o navegador importa
 * constantes e regras de `@carmine/contracts/rules` e `@carmine/contracts/auth` e só chama
 * isto quando uma resposta da API precisa ser validada. O servidor continua importando direto.
 */
export const loadContracts = () => import('@carmine/contracts');
