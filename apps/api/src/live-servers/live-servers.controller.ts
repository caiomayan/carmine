import {
  LIVE_SERVERS_EVENT,
  type LiveServerList,
  liveServerListSchema,
  type ServerHeartbeat,
  serverHeartbeatSchema,
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
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import type { GameServer } from '../game-servers/game-server-registry.js';
import { CurrentGameServer, ServerKeyGuard } from '../game-servers/server-key.guard.js';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { LiveServerStreams } from './live-server-streams.js';
import { LiveServers } from './live-servers.js';

const UNAVAILABLE = 'Servidores ao vivo indisponíveis no momento; tente de novo';

/** Batimento dos Servidores Carmine (S06), mandado pelo Carmine.Core a cada ~10 s. */
@ApiTags('server')
@ApiBearerAuth()
@UseGuards(ServerKeyGuard)
@Controller('server/heartbeat')
export class HeartbeatController {
  constructor(@Inject(LiveServers) private readonly live: LiveServers) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit('server')
  @ApiOperation({
    operationId: 'sendHeartbeat',
    summary: 'Batimento do servidor: mapa, jogadores conectados e vagas públicas',
  })
  @ApiNoContentResponse({ description: 'Presença atualizada' })
  @ApiBadRequestResponse({ description: 'Corpo inválido' })
  @ApiUnauthorizedResponse({ description: 'Chave de Servidor Carmine ausente ou inválida' })
  @ApiServiceUnavailableResponse({ description: 'Presença indisponível (Valkey fora)' })
  async heartbeat(
    @CurrentGameServer() server: GameServer,
    @Body({ schema: serverHeartbeatSchema }) heartbeat: ServerHeartbeat,
  ): Promise<void> {
    try {
      await this.live.recordHeartbeat(server.id, heartbeat);
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
}
