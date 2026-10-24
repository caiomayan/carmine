import { type WeekSummary, weekSummarySchema } from '@carmine/contracts';
import { Controller, Get, Header, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { WeekSummaryReader } from './week-summary.js';

@ApiTags('stats')
@Controller('stats')
export class WeekSummaryController {
  constructor(@Inject(WeekSummaryReader) private readonly summary: WeekSummaryReader) {}

  @Get('week')
  @RateLimit('public')
  @Header('cache-control', 'public, max-age=30')
  @ApiOperation({
    operationId: 'getWeekSummary',
    summary:
      'Os números da semana atual (jogadores, abates, headshots e tempo jogado, de todas as Contas) e os da anterior',
  })
  @ApiOkResponse({ description: 'Os números da semana', standardSchema: weekSummarySchema })
  async get(): Promise<WeekSummary> {
    return this.summary.read();
  }
}
