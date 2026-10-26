import {
  LIVE_SERVERS_EVENT,
  type LiveServerList,
  liveServerListSchema,
  SERVER_TODAY_MAX_DAYS_BACK,
  type ServerHeartbeat,
  type ServerHeartbeatResult,
  type ServerPlayers,
  type ServerToday,
  serverHeartbeatResultSchema,
  serverHeartbeatSchema,
  serverPlayersSchema,
  serverTodaySchema,
} from '@carmine/contracts';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiNotImplementedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { type GameServer, hostnameOf } from '../game-servers/game-server-registry.js';
import { CurrentGameServer, ServerKeyGuard } from '../game-servers/server-key.guard.js';
import { Sanctions } from '../moderation/sanctions.js';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { s12bPending } from '../stats/s12b-pending.js';
import { LiveServerStreams } from './live-server-streams.js';
import { LiveServers } from './live-servers.js';

const UNAVAILABLE = 'Servidores ao vivo indisponíveis no momento; tente de novo';

/**
 * Batimento dos Servidores Carmine (S06), mandado pelo Carmine.Core a cada ~10 s. A resposta
 * (S07) leva o hostname e as Punições dos jogadores conectados: é assim que um ban, mute ou gag
 * aplicado no site chega ao jogo em até ~10 s, sem canal à parte.
 */
@ApiTags('server')
@ApiBearerAuth()
@UseGuards(ServerKeyGuard)
@Controller('server/heartbeat')
export class HeartbeatController {
  constructor(
    @Inject(LiveServers) private readonly live: LiveServers,
    @Inject(Sanctions) private readonly sanctions: Sanctions,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @RateLimit('server')
  @ApiOperation({
    operationId: 'sendHeartbeat',
    summary:
      'Batimento do servidor: mapa, jogadores e vagas; responde o hostname e as Punições a aplicar',
  })
  @ApiOkResponse({
    description: 'Presença atualizada; o que aplicar no jogo agora',
    standardSchema: serverHeartbeatResultSchema,
  })
  @ApiBadRequestResponse({ description: 'Corpo inválido' })
  @ApiUnauthorizedResponse({ description: 'Chave de Servidor Carmine ausente ou inválida' })
  @ApiServiceUnavailableResponse({ description: 'Presença indisponível (Valkey fora)' })
  async heartbeat(
    @CurrentGameServer() server: GameServer,
    @Body({ schema: serverHeartbeatSchema }) heartbeat: ServerHeartbeat,
  ): Promise<ServerHeartbeatResult> {
    try {
      await this.live.recordHeartbeat(server.id, heartbeat);
      return {
        hostname: hostnameOf(server),
        sanctions: await this.sanctions.forGame(heartbeat.players),
      };
    } catch {
      throw new ServiceUnavailableException(UNAVAILABLE);
    }
  }
}

/** Lista pública dos Servidores Carmine ao vivo (S06), para a home e o rodapé. */
@ApiTags('servers')
@Controller('servers')
export class LiveServersController {
  constructor(
    @Inject(LiveServers) private readonly live: LiveServers,
    @Inject(LiveServerStreams) private readonly streams: LiveServerStreams,
  ) {}

  @Get()
  @RateLimit('public')
  @ApiOperation({
    operationId: 'listLiveServers',
    summary: 'Servidores Carmine com estado, mapa e jogadores, e o resumo do rodapé',
  })
  @ApiOkResponse({ description: 'A lista agora', standardSchema: liveServerListSchema })
  @ApiServiceUnavailableResponse({ description: UNAVAILABLE })
  async list(): Promise<LiveServerList> {
    try {
      return await this.live.current();
    } catch {
      throw new ServiceUnavailableException(UNAVAILABLE);
    }
  }

  @Get('live')
  @RateLimit('public')
  @ApiOperation({
    operationId: 'streamLiveServers',
    summary: 'A mesma lista ao vivo, por SSE (ADR 0016)',
    description: `Stream \`text/event-stream\`: um evento \`${LIVE_SERVERS_EVENT}\` com o \`LiveServerList\` inteiro em JSON logo ao conectar e a cada mudança, e um comentário \`: keepalive\` a cada 15 s.`,
  })
  @ApiProduces('text/event-stream')
  @ApiOkResponse({ description: 'Stream aberto' })
  stream(@Res() reply: FastifyReply): void {
    this.streams.stream(reply);
  }

  // --- S12b: contratos publicados, implementação nos PRs da API (501 até lá) ---------------------

  @Get(':id/players')
  @RateLimit('public')
  @ApiOperation({
    operationId: 'getServerPlayers',
    summary:
      'Quem está no servidor agora, com time, kills, mortes e pontos; Perfil privado aparece como "Jogador privado"',
    description: 'S12b: o contrato está publicado; responde 501 até a implementação entrar.',
  })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiOkResponse({ description: 'Os jogadores agora', standardSchema: serverPlayersSchema })
  @ApiNotFoundResponse({ description: 'Servidor desconhecido ou aposentado' })
  @ApiNotImplementedResponse({ description: 'S12b: a implementação ainda não entrou' })
  players(): Promise<ServerPlayers> {
    return s12bPending();
  }

  @Get(':id/today')
  @RateLimit('public')
  @ApiOperation({
    operationId: 'getServerToday',
    summary: 'Histórico do dia do servidor: rounds, mapas, horas, pico e jogadores únicos',
    description: 'S12b: o contrato está publicado; responde 501 até a implementação entrar.',
  })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiQuery({
    name: 'date',
    required: false,
    description: `Dia (YYYY-MM-DD, Brasília); sem ele, hoje; até ${SERVER_TODAY_MAX_DAYS_BACK} dias atrás`,
  })
  @ApiOkResponse({ description: 'O dia do servidor', standardSchema: serverTodaySchema })
  @ApiBadRequestResponse({ description: 'date inválida ou mais antiga que o limite' })
  @ApiNotFoundResponse({ description: 'Servidor desconhecido ou aposentado' })
  @ApiNotImplementedResponse({ description: 'S12b: a implementação ainda não entrou' })
  today(): Promise<ServerToday> {
    return s12bPending();
  }
}
