import { type HealthReport, healthReportSchema } from '@carmine/contracts';
import { Controller, Get, HttpStatus, Inject, Logger, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { HealthService } from './health.service.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  @Get()
  @ApiOperation({
    operationId: 'getHealth',
    summary: 'Verifica se a API e as suas dependências (Postgres, Valkey) estão no ar',
  })
  @ApiOkResponse({ description: 'Tudo no ar', standardSchema: healthReportSchema })
  @ApiServiceUnavailableResponse({
    description: 'Alguma dependência está fora do ar',
    standardSchema: healthReportSchema,
  })
  async check(@Res({ passthrough: true }) reply: FastifyReply): Promise<HealthReport> {
    const report = await this.health.check();
    if (report.status !== 'ok') {
      this.logger.warn({ checks: report.checks }, 'Health check indisponível');
      reply.status(HttpStatus.SERVICE_UNAVAILABLE);
    }
    return report;
  }
}
