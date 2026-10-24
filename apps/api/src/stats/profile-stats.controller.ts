import {
  type ProfileSeries,
  type ProfileStats,
  profileSeriesSchema,
  profileStatsSchema,
} from '@carmine/contracts';
import { Controller, Get, Inject, NotFoundException, Param, Req } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { AccountsService } from '../accounts/accounts.service.js';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { ProfileStatsReader } from './profile-stats.js';

/** Mesma regra do Perfil: só dígitos, sem zero à esquerda. */
const PUBLIC_ID = /^[1-9]\d{0,14}$/;

@ApiTags('profiles')
@Controller('profiles')
export class ProfileStatsController {
  constructor(
    @Inject(AccountsService) private readonly accounts: AccountsService,
    @Inject(ProfileStatsReader) private readonly stats: ProfileStatsReader,
  ) {}

  @Get(':publicId/stats')
  @RateLimit('public')
  @ApiOperation({
    operationId: 'getProfileStats',
    summary:
      'Estatísticas de uma Conta, por Modo e no total; num Perfil privado, só a própria Conta as vê',
  })
  @ApiParam({ name: 'publicId', type: 'integer', example: 10_016 })
  @ApiOkResponse({ description: 'As Estatísticas', standardSchema: profileStatsSchema })
  @ApiNotFoundResponse({ description: 'Nenhuma Conta com esse ID público (ou ela foi excluída)' })
  async get(
    @Param('publicId') publicId: string,
    @Req() request: FastifyRequest,
  ): Promise<ProfileStats> {
    const account = PUBLIC_ID.test(publicId)
      ? await this.accounts.findByPublicId(Number(publicId))
      : null;
    if (account === null || account.anonymizedAt !== null) {
      throw new NotFoundException('Perfil não encontrado');
    }
    return this.stats.read(account, request.carmineSession?.accountId ?? null);
  }

  @Get(':publicId/stats/weekly')
  @RateLimit('public')
  @ApiOperation({
    operationId: 'getProfileStatsWeekly',
    summary:
      'Série semanal de uma Conta (últimas 8 semanas) e horas por Modo na semana e no total; num Perfil privado, só a própria Conta a vê',
  })
  @ApiParam({ name: 'publicId', type: 'integer', example: 10_016 })
  @ApiOkResponse({ description: 'A série semanal', standardSchema: profileSeriesSchema })
  @ApiNotFoundResponse({ description: 'Nenhuma Conta com esse ID público (ou ela foi excluída)' })
  async getWeekly(
    @Param('publicId') publicId: string,
    @Req() request: FastifyRequest,
  ): Promise<ProfileSeries> {
    const account = PUBLIC_ID.test(publicId)
      ? await this.accounts.findByPublicId(Number(publicId))
      : null;
    if (account === null || account.anonymizedAt !== null) {
      throw new NotFoundException('Perfil não encontrado');
    }
    return this.stats.readWeekly(account, request.carmineSession?.accountId ?? null);
  }
}
