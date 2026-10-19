import {
  type CreateReport,
  createReportSchema,
  type ReportResult,
  reportResultSchema,
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
import { ReportNotifier } from './report-discord.js';
import { Reports } from './reports.js';

@ApiTags('server')
@ApiBearerAuth()
@UseGuards(ServerKeyGuard)
@Controller('server/reports')
export class ServerReportsController {
  constructor(
    @Inject(Reports) private readonly reports: Reports,
    @Inject(ReportNotifier) private readonly notifier: ReportNotifier,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @RateLimit('server')
  @ApiOperation({
    operationId: 'createReport',
    summary:
      'Registra a Denúncia (`!report`) de um jogador contra outro; aplica os limites e avisa a Staff',
  })
  @ApiOkResponse({
    description:
      'Aceita ou recusada (com `message` pronta para o chat e, nos limites, `retryAfterSeconds`)',
    standardSchema: reportResultSchema,
  })
  @ApiBadRequestResponse({ description: 'Corpo inválido' })
  @ApiUnauthorizedResponse({ description: 'Chave de Servidor Carmine ausente ou inválida' })
  async create(
    @Body({ schema: createReportSchema }) body: CreateReport,
    @CurrentGameServer() server: GameServer,
  ): Promise<ReportResult> {
    const { result, created } = await this.reports.create(
      { id: server.id, name: server.name, code: server.code, mode: server.mode },
      body,
    );
    if (created) this.notifier.notify(created);
    return result;
  }
}
