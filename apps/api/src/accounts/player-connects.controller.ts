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
import { AccountsService } from './accounts.service.js';

@ApiTags('server')
@ApiBearerAuth()
@UseGuards(ServerKeyGuard)
@Controller('server/player-connects')
export class PlayerConnectsController {
  constructor(@Inject(AccountsService) private readonly accounts: AccountsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'registerPlayerConnect',
    summary: 'Registra o connect de um jogador; cria a Conta no primeiro connect',
  })
  @ApiOkResponse({
    description: 'Nome de exibição e ID público a aplicar no jogo',
    standardSchema: playerConnectResultSchema,
  })
  @ApiBadRequestResponse({ description: 'Corpo inválido' })
  @ApiUnauthorizedResponse({ description: 'Chave de Servidor Carmine ausente ou inválida' })
  register(
    @Body({ schema: playerConnectSchema }) connect: PlayerConnect,
  ): Promise<PlayerConnectResult> {
    return this.accounts.registerConnect(connect);
  }
}
