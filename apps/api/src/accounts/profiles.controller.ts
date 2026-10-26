import {
  type FormerPublicIds,
  formerPublicIdsSchema,
  type Profile,
  type ProfileLocation,
  profileLocationSchema,
  profileSchema,
  steamId64Schema,
} from '@carmine/contracts';
import { Controller, Get, Inject, NotFoundException, Param, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Loadouts } from '../loadout/loadouts.js';
import { Sanctions } from '../moderation/sanctions.js';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { VipPeriods } from '../vip/vip-periods.js';
import { type Account, AccountsService } from './accounts.service.js';
import { toProfile } from './profile.js';
import { ReservedPublicIds } from './reserved-public-ids.js';

/** ID público no caminho: só dígitos, sem zero à esquerda (o maior cabe num `number`). */
const PUBLIC_ID = /^[1-9]\d{0,14}$/;

/** Perfis públicos (S03), lidos pelo web em `stcarmine.com/<publicId>`. */
@ApiTags('profiles')
@Controller('profiles')
export class ProfilesController {
  constructor(
    @Inject(AccountsService) private readonly accounts: AccountsService,
    @Inject(Loadouts) private readonly loadouts: Loadouts,
    @Inject(Sanctions) private readonly sanctions: Sanctions,
    @Inject(ReservedPublicIds) private readonly reservedIds: ReservedPublicIds,
    @Inject(VipPeriods) private readonly vipPeriods: VipPeriods,
  ) {}

  @Get('former-ids')
  @RateLimit('public')
  @ApiOperation({
    operationId: 'getFormerPublicIds',
    summary: 'IDs públicos trocados por um ID reservado, para o web redirecionar (301) ao ID atual',
  })
  @ApiOkResponse({ description: 'Os IDs antigos e o atual', standardSchema: formerPublicIdsSchema })
  async formerIds(): Promise<FormerPublicIds> {
    return { redirects: await this.reservedIds.redirects() };
  }

  @Get('by-steam-id/:steamId')
  @RateLimit('public')
  @ApiOperation({
    operationId: 'getProfileLocation',
    summary: 'ID público da Conta de um SteamID64, para o web redirecionar (301) ao Perfil',
  })
  @ApiOkResponse({ description: 'A Conta existe', standardSchema: profileLocationSchema })
  @ApiBadRequestResponse({ description: 'SteamID64 inválido' })
  @ApiNotFoundResponse({ description: 'Nenhuma Conta com esse SteamID64' })
  async locate(
    @Param('steamId', { schema: steamId64Schema }) steamId: string,
  ): Promise<ProfileLocation> {
    const account = found(await this.accounts.findBySteamId(steamId));
    return { publicId: account.publicId };
  }

  @Get(':publicId')
  @RateLimit('public')
  @ApiOperation({
    operationId: 'getProfile',
    summary:
      'Perfil público de uma Conta; o histórico de Punições só vem com sessão (o selo das ativas é público)',
  })
  @ApiParam({ name: 'publicId', type: 'integer', example: 10_016 })
  @ApiOkResponse({ description: 'O Perfil', standardSchema: profileSchema })
  @ApiNotFoundResponse({ description: 'Nenhuma Conta com esse ID público (ou ela foi excluída)' })
  async get(@Param('publicId') publicId: string, @Req() request: FastifyRequest): Promise<Profile> {
    // Qualquer coisa que não é um ID público simplesmente não tem Perfil.
    const account = PUBLIC_ID.test(publicId)
      ? await this.accounts.findByPublicId(Number(publicId))
      : null;
    const owner = found(account);
    const [showcase, sanctions, vip] = await Promise.all([
      this.loadouts.showcase(owner.id),
      // A sessão vem do SessionGuard global; o web a repassa na leitura do servidor.
      this.sanctions.profileOf(owner.id, { withHistory: request.carmineSession !== undefined }),
      this.vipPeriods.statusOf(owner.id),
    ]);
    return toProfile(owner, showcase, sanctions, vip.active);
  }
}

/** Conta anonimizada por um pedido de exclusão de dados (S08) não tem mais Perfil. */
function found(account: Account | null): Account {
  if (account === null || account.anonymizedAt !== null) {
    throw new NotFoundException('Perfil não encontrado');
  }
  return account;
}
