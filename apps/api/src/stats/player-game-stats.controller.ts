import { type PlayerGameLine, playerGameLineSchema, steamId64Schema } from '@carmine/contracts';
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
import { AccountsService } from '../accounts/accounts.service.js';
import type { GameServer } from '../game-servers/game-server-registry.js';
import { CurrentGameServer, ServerKeyGuard } from '../game-servers/server-key.guard.js';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { GameStatsReader } from './game-stats.js';

/** O `!rank` e o `!stats` do jogo (S16): a linha já pronta, com os mesmos números do Ranking e do Perfil. */
@ApiTags('server')
@ApiBearerAuth()
@UseGuards(ServerKeyGuard)
@Controller('server/players')
export class PlayerGameStatsController {
  constructor(
    @Inject(AccountsService) private readonly accounts: AccountsService,
    @Inject(GameStatsReader) private readonly reader: GameStatsReader,
  ) {}

  @Get(':steamId/rank')
  @RateLimit('server')
  @ApiOperation({
    operationId: 'getPlayerRankLine',
    summary: 'A posição da semana no Modo do servidor (o !rank do jogo)',
  })
  @ApiOkResponse({
    description: 'A linha pronta em português',
    standardSchema: playerGameLineSchema,
  })
  @ApiBadRequestResponse({ description: 'SteamID64 inválido' })
  @ApiNotFoundResponse({ description: 'Nenhuma Conta com esse SteamID64' })
  @ApiUnauthorizedResponse({ description: 'Chave de Servidor Carmine ausente ou inválida' })
  async rank(
    @Param('steamId', { schema: steamId64Schema }) steamId: string,
    @CurrentGameServer() server: GameServer,
  ): Promise<PlayerGameLine> {
    return { message: await this.reader.rank(await this.accountId(steamId), server.mode) };
  }

  @Get(':steamId/stats')
  @RateLimit('server')
  @ApiOperation({
    operationId: 'getPlayerStatsLine',
    summary: 'Os números da semana no Modo do servidor (o !stats do jogo)',
  })
  @ApiOkResponse({
    description: 'A linha pronta em português',
    standardSchema: playerGameLineSchema,
  })
  @ApiBadRequestResponse({ description: 'SteamID64 inválido' })
  @ApiNotFoundResponse({ description: 'Nenhuma Conta com esse SteamID64' })
  @ApiUnauthorizedResponse({ description: 'Chave de Servidor Carmine ausente ou inválida' })
  async stats(
    @Param('steamId', { schema: steamId64Schema }) steamId: string,
    @CurrentGameServer() server: GameServer,
  ): Promise<PlayerGameLine> {
    return { message: await this.reader.stats(await this.accountId(steamId), server.mode) };
  }

  private async accountId(steamId: string): Promise<string> {
    const account = await this.accounts.findBySteamId(steamId);
    if (!account || account.anonymizedAt !== null)
      throw new NotFoundException('Conta não encontrada');
    return account.id;
  }
}
