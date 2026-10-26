import { NotImplementedException } from '@nestjs/common';

/**
 * S12b, PR de contratos: as rotas já existem no OpenAPI (o web e o cliente C# constroem contra
 * elas), mas respondem 501 até os PRs da API entrarem e trocarem cada corpo pela leitura de
 * verdade. Apague este arquivo junto com o último uso.
 */
export function s12bPending(): never {
  throw new NotImplementedException(
    'Estatísticas detalhadas (S12b): o contrato está publicado, a implementação ainda não',
  );
}
