import {
  type PlayerChatPreference,
  playerChatPreferenceSchema,
  steamId64Schema,
} from '@carmine/contracts';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ServerKeyGuard } from '../game-servers/server-key.guard.js';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { AccountsService } from './accounts.service.js';

/** Preferências que o jogador muda dentro do jogo, gravadas pelo Carmine.Core. */
@ApiTags('server')
@ApiBearerAuth()
@UseGuards(ServerKeyGuard)
@Controller('server/players')
export class PlayerPreferencesController {
  constructor(@Inject(AccountsService) private readonly accounts: AccountsService) {}

  @Put(':steamId/chat-preference')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit('server')
  @ApiOperation({
    operationId: 'setPlayerChatPreference',
    summary: 'Grava o !chat off (oculta o chat dos outros) ou o !chat on de um jogador',
  })
  @ApiNoContentResponse({ description: 'Gravado; vale nos próximos connects' })
  @ApiBadRequestResponse({ description: 'SteamID64 ou corpo inválido' })
  @ApiNotFoundResponse({ description: 'Nenhuma Conta com esse SteamID64' })
  @ApiUnauthorizedResponse({ description: 'Chave de Servidor Carmine ausente ou inválida' })
  async setChat(
    @Param('steamId', { schema: steamId64Schema }) steamId: string,
    @Body({ schema: playerChatPreferenceSchema }) body: PlayerChatPreference,
  ): Promise<void> {
    if (!(await this.accounts.setChatHidden(steamId, body.hidden))) {
      throw new NotFoundException('Conta não encontrada');
    }
  }
}
