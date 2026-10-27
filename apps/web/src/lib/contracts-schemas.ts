/**
 * @deprecated Carrega o ÍNDICE inteiro do contrato (~40 kB de Zod, de todos os domínios). Foi o que
 * pesou na 1ª carga de toda página por muito tempo: qualquer contrato novo no índice estourava o
 * orçamento de JS (issue #138). Carregue só o domínio de que precisa:
 *
 *     const { profileSchema } = await import('@carmine/contracts/profile');
 *
 * e importe valores no cliente sempre de `@carmine/contracts/<módulo>` (cada arquivo de
 * `packages/contracts/src` é um subpath), nunca do índice; do índice só tipos. O teste
 * `contracts-imports.test.ts` falha se alguém voltar a usar isto ou o índice por valor.
 */
export const loadContracts = () => import('@carmine/contracts');
