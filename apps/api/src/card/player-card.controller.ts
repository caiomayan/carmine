import { type PlayerCard, playerCardSchema, steamId64Schema } from '@carmine/contracts';
import { Controller, Get, Inject, NotFoundException, Param, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { GameServer } from '../game-servers/game-server-registry.js';
import { CurrentGameServer, ServerKeyGuard } from '../game-servers/server-key.guard.js';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { PlayerCards } from './player-card.service.js';

/** O card de boas-vindas em Panorama (S19): os textos por jogador, pedidos pelo plugin depois do connect. */
@ApiTags('server')
@ApiBearerAuth()
@UseGuards(ServerKeyGuard)
@Controller('server/players')
export class PlayerCardController {
  constructor(@Inject(PlayerCards) private readonly cards: PlayerCards) {}

  @Get(':steamId/card')
  @RateLimit('server')
  @ApiOperation({
    operationId: 'getPlayerCard',
    summary: 'Os textos do card de boas-vindas do addon (nome, plano, Ranking, amigos, Rating)',
  })
  @ApiOkResponse({
    description: 'Textos prontos em português; vazio quando não há o que dizer',
    standardSchema: playerCardSchema,
  })
  @ApiBadRequestResponse({ description: 'SteamID64 inválido' })
  @ApiNotFoundResponse({ description: 'Nenhuma Conta com esse SteamID64' })
  @ApiUnauthorizedResponse({ description: 'Chave de Servidor Carmine ausente ou inválida' })
  async card(
    @Param('steamId', { schema: steamId64Schema }) steamId: string,
    @CurrentGameServer() server: GameServer,
  ): Promise<PlayerCard> {
    const card = await this.cards.of(steamId, server.mode);
    if (!card) throw new NotFoundException('Conta não encontrada');
    return card;
  }
}
