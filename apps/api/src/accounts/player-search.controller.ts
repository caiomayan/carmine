import { type PlayerSearch, playerSearchQuerySchema, playerSearchSchema } from '@carmine/contracts';
import { Controller, Get, Inject, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { PlayerSearcher } from './player-search.js';

/** Busca de jogadores pelo nome, para a paleta de comandos (Ctrl+K, U3d). */
@ApiTags('players')
@Controller('players')
export class PlayerSearchController {
  constructor(@Inject(PlayerSearcher) private readonly searcher: PlayerSearcher) {}

  @Get('search')
  @RateLimit('search')
  @ApiOperation({
    operationId: 'searchPlayers',
    summary: 'Jogadores pelo Nome de exibição (até 8): ID público, nome e avatar, sem SteamID64',
    description:
      'Só o que o Perfil mostra a qualquer visitante. O Perfil privado aparece pelo nome (só as Estatísticas ficam escondidas); a Conta anonimizada não aparece.',
  })
  @ApiQuery({ name: 'q', required: true, description: 'Parte do nome (2 a 50 caracteres)' })
  @ApiOkResponse({ description: 'Os jogadores achados', standardSchema: playerSearchSchema })
  @ApiBadRequestResponse({ description: 'Busca curta demais ou longa demais' })
  async search(
    @Query('q', { schema: playerSearchQuerySchema.shape.q }) q: string,
  ): Promise<PlayerSearch> {
    return this.searcher.search(q);
  }
}
