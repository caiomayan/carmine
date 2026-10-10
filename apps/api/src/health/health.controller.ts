import {
  type HealthReport,
  type HealthStatus,
  healthReportSchema,
  healthStatusSchema,
} from '@carmine/contracts';
import { Controller, Get, HttpStatus, Inject, Logger, Res, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { ServerKeyGuard } from '../game-servers/server-key.guard.js';
import { HealthService } from './health.service.js';

/**
 * Rota pública (Docker, monitor de uptime): só o status geral. Mensagens de erro e latências
 * revelam a infraestrutura, então ficam na rota de servidor e no log.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  @Get()
  @ApiOperation({
    operationId: 'getHealth',
    summary: 'Verifica se a API e as suas dependências estão no ar (só o status geral)',
  })
  @ApiOkResponse({ description: 'Tudo no ar', standardSchema: healthStatusSchema })
  @ApiServiceUnavailableResponse({
    description: 'Alguma dependência está fora do ar',
    standardSchema: healthStatusSchema,
  })
  async check(@Res({ passthrough: true }) reply: FastifyReply): Promise<HealthStatus> {
    const report = await this.health.check();
    if (report.status !== 'ok') {
      this.logger.warn({ checks: report.checks }, 'Health check indisponível');
      reply.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return { status: report.status };
  }
}

/** Detalhe por dependência, para o Carmine.Core diagnosticar a API (chave de servidor). */
@ApiTags('server')
@ApiBearerAuth()
@UseGuards(ServerKeyGuard)
@Controller('server/health')
export class ServerHealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  @Get()
  @ApiOperation({
    operationId: 'getServerHealth',
    summary: 'Detalhe de cada dependência da API (Postgres, Valkey)',
  })
  @ApiOkResponse({ description: 'Tudo no ar', standardSchema: healthReportSchema })
  @ApiServiceUnavailableResponse({
    description: 'Alguma dependência está fora do ar',
    standardSchema: healthReportSchema,
  })
  @ApiUnauthorizedResponse({ description: 'Chave de Servidor Carmine ausente ou inválida' })
  async check(@Res({ passthrough: true }) reply: FastifyReply): Promise<HealthReport> {
    const report = await this.health.check();
    if (report.status !== 'ok') {
      reply.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return report;
  }
}
