import {
  type PlayerConnect,
  type PlayerConnectResult,
  playerConnectResultSchema,
  playerConnectSchema,
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
import { ServerKeyGuard } from '../game-servers/server-key.guard.js';
import { Sanctions } from '../moderation/sanctions.js';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { AccountsService } from './accounts.service.js';

@ApiTags('server')
@ApiBearerAuth()
@UseGuards(ServerKeyGuard)
@Controller('server/player-connects')
export class PlayerConnectsController {
  constructor(
    @Inject(AccountsService) private readonly accounts: AccountsService,
    @Inject(Sanctions) private readonly sanctions: Sanctions,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @RateLimit('server')
  @ApiOperation({
    operationId: 'registerPlayerConnect',
    summary: 'Registra o connect de um jogador; cria a Conta no primeiro connect',
  })
  @ApiOkResponse({
    description: 'Nome de exibição, ID público e Punições a aplicar no jogo',
    standardSchema: playerConnectResultSchema,
  })
  @ApiBadRequestResponse({ description: 'Corpo inválido' })
  @ApiUnauthorizedResponse({ description: 'Chave de Servidor Carmine ausente ou inválida' })
  async register(
    @Body({ schema: playerConnectSchema }) connect: PlayerConnect,
  ): Promise<PlayerConnectResult> {
    const result = await this.accounts.registerConnect(connect);
    return { ...result, sanctions: await this.sanctions.forGame([connect.steamId]) };
  }
}
