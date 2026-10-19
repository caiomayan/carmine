import {
  type EventBatch,
  type EventBatchResult,
  eventBatchResultSchema,
  eventBatchSchema,
} from '@carmine/contracts';
import { Body, Controller, HttpCode, HttpStatus, Inject, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { GameServer } from '../game-servers/game-server-registry.js';
import { CurrentGameServer, ServerKeyGuard } from '../game-servers/server-key.guard.js';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { GameEventIngest } from './game-event-ingest.js';

@ApiTags('server')
@ApiBearerAuth()
@UseGuards(ServerKeyGuard)
@Controller('server/events')
export class GameEventsController {
  constructor(@Inject(GameEventIngest) private readonly ingest: GameEventIngest) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @RateLimit('server')
  @ApiOperation({
    operationId: 'sendGameEvents',
    summary:
      'Recebe um lote idempotente de eventos do jogo (kills, dano, rounds, Sessões de jogo) para as Estatísticas',
  })
  @ApiOkResponse({
    description: 'Quantos eventos entraram, quantos já eram conhecidos e quantos não contam',
    standardSchema: eventBatchResultSchema,
  })
  @ApiBadRequestResponse({ description: 'Corpo inválido ou lote grande demais' })
  @ApiUnauthorizedResponse({ description: 'Chave de Servidor Carmine ausente ou inválida' })
  send(
    @Body({ schema: eventBatchSchema }) batch: EventBatch,
    @CurrentGameServer() server: GameServer,
  ): Promise<EventBatchResult> {
    return this.ingest.ingest(server, batch);
  }
}
