import {
  type GamePreferenceKey,
  type GamePreferenceSet,
  type GamePreferenceValue,
  gamePreferenceKeySchema,
  gamePreferenceSetSchema,
  gamePreferenceValueSchema,
  type PlayerChatPreference,
  type PlayerVip,
  playerChatPreferenceSchema,
  playerVipSchema,
  steamId64Schema,
  vipNoticeAt,
} from '@carmine/contracts';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { GameServer } from '../game-servers/game-server-registry.js';
import { CurrentGameServer, ServerKeyGuard } from '../game-servers/server-key.guard.js';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { VipPeriods } from '../vip/vip-periods.js';
import { toVipStatus } from '../vip/vip-status.js';
import { AccountsService } from './accounts.service.js';
import { GamePreferencesStore, PreferenceNotInMode } from './game-preferences.js';

/** Preferências que o jogador muda dentro do jogo, gravadas pelo Carmine.Core. */
@ApiTags('server')
@ApiBearerAuth()
@UseGuards(ServerKeyGuard)
@Controller('server/players')
export class PlayerPreferencesController {
  constructor(
    @Inject(AccountsService) private readonly accounts: AccountsService,
    @Inject(VipPeriods) private readonly vip: VipPeriods,
    @Inject(GamePreferencesStore) private readonly preferences: GamePreferencesStore,
  ) {}

  @Get(':steamId/vip')
  @RateLimit('server')
  @ApiOperation({
    operationId: 'getPlayerVip',
    summary: 'O VIP da Conta agora (para o !vip do jogo)',
  })
  @ApiOkResponse({
    description: 'VIP ativo e até quando, ou quando acabou, e o aviso do fim a mostrar',
    standardSchema: playerVipSchema,
  })
  @ApiBadRequestResponse({ description: 'SteamID64 inválido' })
  @ApiNotFoundResponse({ description: 'Nenhuma Conta com esse SteamID64' })
  @ApiUnauthorizedResponse({ description: 'Chave de Servidor Carmine ausente ou inválida' })
  async getVip(@Param('steamId', { schema: steamId64Schema }) steamId: string): Promise<PlayerVip> {
    const account = await this.accounts.findBySteamId(steamId);
    if (!account || account.anonymizedAt !== null)
      throw new NotFoundException('Conta não encontrada');
    const status = toVipStatus(await this.vip.statusOf(account.id));
    return { ...status, notice: vipNoticeAt(status, new Date()) };
  }

  @Put(':steamId/preferences/:key')
  @RateLimit('server')
  @ApiOperation({
    operationId: 'setPlayerGamePreference',
    summary: 'Grava o valor explícito de uma Preferência de jogo da Conta (ADR 0028)',
  })
  @ApiOkResponse({
    description: 'O valor gravado; vale em todo servidor do Modo',
    standardSchema: gamePreferenceValueSchema,
  })
  @ApiBadRequestResponse({
    description: 'SteamID64, chave ou corpo inválido, ou a chave não vale no Modo do servidor',
  })
  @ApiNotFoundResponse({ description: 'Nenhuma Conta com esse SteamID64' })
  @ApiUnauthorizedResponse({ description: 'Chave de Servidor Carmine ausente ou inválida' })
  async setPreference(
    @Param('steamId', { schema: steamId64Schema }) steamId: string,
    @Param('key', { schema: gamePreferenceKeySchema }) key: GamePreferenceKey,
    @Body({ schema: gamePreferenceSetSchema }) body: GamePreferenceSet,
    @CurrentGameServer() server: GameServer,
  ): Promise<GamePreferenceValue> {
    return this.writing(() => this.preferences.set(steamId, server.mode, key, body.enabled));
  }

  @Post(':steamId/preferences/:key/toggle')
  @HttpCode(HttpStatus.OK)
  @RateLimit('server')
  @ApiOperation({
    operationId: 'togglePlayerGamePreference',
    summary: 'Inverte uma Preferência de jogo da Conta e devolve o novo valor (o !awp do jogo)',
  })
  @ApiOkResponse({
    description: 'O novo valor; vale em todo servidor do Modo',
    standardSchema: gamePreferenceValueSchema,
  })
  @ApiBadRequestResponse({
    description: 'SteamID64 ou chave inválida, ou a chave não vale no Modo do servidor',
  })
  @ApiNotFoundResponse({ description: 'Nenhuma Conta com esse SteamID64' })
  @ApiUnauthorizedResponse({ description: 'Chave de Servidor Carmine ausente ou inválida' })
  async togglePreference(
    @Param('steamId', { schema: steamId64Schema }) steamId: string,
    @Param('key', { schema: gamePreferenceKeySchema }) key: GamePreferenceKey,
    @CurrentGameServer() server: GameServer,
  ): Promise<GamePreferenceValue> {
    return this.writing(() => this.preferences.toggle(steamId, server.mode, key));
  }

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

  private async writing(
    write: () => Promise<GamePreferenceValue | null>,
  ): Promise<GamePreferenceValue> {
    try {
      const value = await write();
      if (value === null) throw new NotFoundException('Conta não encontrada');
      return value;
    } catch (error) {
      if (error instanceof PreferenceNotInMode) throw new BadRequestException(error.message);
      throw error;
    }
  }
}
