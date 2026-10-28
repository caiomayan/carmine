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
import { Analytics } from '../analytics/analytics.js';
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
    @Inject(Analytics) private readonly analytics: Analytics,
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
    const { result, created, reporterAccountId } = await this.reports.create(
      { id: server.id, name: server.name, code: server.code, mode: server.mode },
      body,
    );
    if (created) this.notifier.notify(created);
    // Só o motivo e o Modo; nada do alvo, do chat nem do estado da Denúncia sai (moderação não vai a terceiros).
    if (created) {
      this.analytics.capture('denuncia_enviada', {
        accountId: created.reporterAccountId,
        props: { motivo: body.reason, modo: server.mode },
        naturalId: created.id,
      });
    } else if (
      reporterAccountId &&
      (result.refusal === 'same_target_cooldown' || result.refusal === 'hourly_limit')
    ) {
      this.analytics.capture('denuncia_recusada', {
        accountId: reporterAccountId,
        props: { recusa: result.refusal, modo: server.mode },
      });
    }
    return result;
  }
}
