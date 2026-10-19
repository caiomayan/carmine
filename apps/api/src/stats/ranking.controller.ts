import { type GameMode, gameModeSchema, type Ranking, rankingSchema } from '@carmine/contracts';
import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { InvalidRankingWeek, WeeklyRanking } from './weekly-ranking.js';

@ApiTags('ranking')
@Controller('ranking')
export class RankingController {
  constructor(@Inject(WeeklyRanking) private readonly ranking: WeeklyRanking) {}

  @Get(':mode')
  @RateLimit('public')
  @ApiOperation({
    operationId: 'getRanking',
    summary:
      'Ranking semanal de um Modo (top 50); quem está logado recebe também a própria posição ou o progresso até o mínimo',
  })
  @ApiParam({ name: 'mode', enum: gameModeSchema.options })
  @ApiQuery({
    name: 'week',
    required: false,
    description: 'Segunda-feira da semana (YYYY-MM-DD); sem ela, a semana atual',
  })
  @ApiOkResponse({ description: 'O Ranking', standardSchema: rankingSchema })
  @ApiBadRequestResponse({ description: 'Semana inválida (precisa ser uma segunda-feira passada)' })
  @ApiNotFoundResponse({ description: 'Modo desconhecido' })
  async get(
    @Param('mode') mode: string,
    @Query('week') week: string | undefined,
    @Req() request: FastifyRequest,
  ): Promise<Ranking> {
    const parsed = gameModeSchema.safeParse(mode);
    if (!parsed.success) throw new NotFoundException('Modo não encontrado');
    try {
      return await this.ranking.read(
        parsed.data satisfies GameMode,
        week,
        request.carmineSession?.accountId ?? null,
      );
    } catch (error) {
      if (error instanceof InvalidRankingWeek) throw new BadRequestException(error.message);
      throw error;
    }
  }
}
