import {
  PROFILE_ACTIVITY_WEEKS_DEFAULT,
  PROFILE_ACTIVITY_WEEKS_MAX,
  PROFILE_SESSIONS_LIMIT_DEFAULT,
  PROFILE_SESSIONS_LIMIT_MAX,
  PROFILE_WEAPONS_LIMIT_DEFAULT,
  PROFILE_WEAPONS_LIMIT_MAX,
  type ProfileActivity,
  type ProfileSeries,
  type ProfileSessions,
  type ProfileStats,
  type ProfileWeapons,
  profileActivitySchema,
  profileSeriesSchema,
  profileSessionsSchema,
  profileStatsSchema,
  profileWeaponsSchema,
  weaponsModeSchema,
} from '@carmine/contracts';
import { Controller, Get, Inject, NotFoundException, Param, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiNotImplementedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { AccountsService } from '../accounts/accounts.service.js';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { ProfileStatsReader } from './profile-stats.js';
import { s12bPending } from './s12b-pending.js';

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

  // --- S12b: contratos publicados, implementação nos PRs da API (501 até lá) ---------------------

  @Get(':publicId/stats/activity')
  @RateLimit('public')
  @ApiOperation({
    operationId: 'getProfileStatsActivity',
    summary:
      'Atividade por dia (o mapa de calor) das últimas semanas; num Perfil privado, só a própria Conta a vê',
    description: 'S12b: o contrato está publicado; responde 501 até a implementação entrar.',
  })
  @ApiParam({ name: 'publicId', type: 'integer', example: 10_016 })
  @ApiQuery({
    name: 'weeks',
    required: false,
    description: `Quantas semanas (1 a ${PROFILE_ACTIVITY_WEEKS_MAX}); padrão ${PROFILE_ACTIVITY_WEEKS_DEFAULT}`,
  })
  @ApiOkResponse({ description: 'A atividade', standardSchema: profileActivitySchema })
  @ApiBadRequestResponse({ description: 'weeks fora do intervalo' })
  @ApiNotFoundResponse({ description: 'Nenhuma Conta com esse ID público (ou ela foi excluída)' })
  @ApiNotImplementedResponse({ description: 'S12b: a implementação ainda não entrou' })
  getActivity(): Promise<ProfileActivity> {
    return s12bPending();
  }

  @Get(':publicId/stats/weapons')
  @RateLimit('public')
  @ApiOperation({
    operationId: 'getProfileStatsWeapons',
    summary:
      'Armas mais usadas (abates e headshots por lado); num Perfil privado, só a própria Conta as vê',
    description: 'S12b: o contrato está publicado; responde 501 até a implementação entrar.',
  })
  @ApiParam({ name: 'publicId', type: 'integer', example: 10_016 })
  @ApiQuery({ name: 'mode', required: false, enum: weaponsModeSchema.options })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: `Quantas armas (1 a ${PROFILE_WEAPONS_LIMIT_MAX}); padrão ${PROFILE_WEAPONS_LIMIT_DEFAULT}`,
  })
  @ApiOkResponse({ description: 'As armas', standardSchema: profileWeaponsSchema })
  @ApiBadRequestResponse({ description: 'mode ou limit inválidos' })
  @ApiNotFoundResponse({ description: 'Nenhuma Conta com esse ID público (ou ela foi excluída)' })
  @ApiNotImplementedResponse({ description: 'S12b: a implementação ainda não entrou' })
  getWeapons(): Promise<ProfileWeapons> {
    return s12bPending();
  }

  @Get(':publicId/sessions')
  @RateLimit('public')
  @ApiOperation({
    operationId: 'getProfileSessions',
    summary:
      'Sessões de jogo recentes (Modo, mapa, dia e duração); horário exato e "em andamento" só para a própria Conta e amigos',
    description: 'S12b: o contrato está publicado; responde 501 até a implementação entrar.',
  })
  @ApiParam({ name: 'publicId', type: 'integer', example: 10_016 })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: `Quantas Sessões (1 a ${PROFILE_SESSIONS_LIMIT_MAX}); padrão ${PROFILE_SESSIONS_LIMIT_DEFAULT}`,
  })
  @ApiOkResponse({ description: 'As Sessões', standardSchema: profileSessionsSchema })
  @ApiBadRequestResponse({ description: 'limit fora do intervalo' })
  @ApiNotFoundResponse({ description: 'Nenhuma Conta com esse ID público (ou ela foi excluída)' })
  @ApiNotImplementedResponse({ description: 'S12b: a implementação ainda não entrou' })
  getSessions(): Promise<ProfileSessions> {
    return s12bPending();
  }
}
