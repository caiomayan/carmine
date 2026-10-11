import {
  type Profile,
  type ProfileLocation,
  profileLocationSchema,
  profileSchema,
  steamId64Schema,
} from '@carmine/contracts';
import { Controller, Get, Inject, NotFoundException, Param } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { type Account, AccountsService } from './accounts.service.js';
import { toProfile } from './profile.js';

/** ID público no caminho: só dígitos, sem zero à esquerda (o maior cabe num `number`). */
const PUBLIC_ID = /^[1-9]\d{0,14}$/;

/** Perfis públicos (S03), lidos pelo web em `stcarmine.com/<publicId>`. */
@ApiTags('profiles')
@Controller('profiles')
export class ProfilesController {
  constructor(@Inject(AccountsService) private readonly accounts: AccountsService) {}

  @Get('by-steam-id/:steamId')
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
  @ApiOperation({ operationId: 'getProfile', summary: 'Perfil público de uma Conta' })
  @ApiParam({ name: 'publicId', type: 'integer', example: 10_016 })
  @ApiOkResponse({ description: 'O Perfil', standardSchema: profileSchema })
  @ApiNotFoundResponse({ description: 'Nenhuma Conta com esse ID público' })
  async get(@Param('publicId') publicId: string): Promise<Profile> {
    // Qualquer coisa que não é um ID público simplesmente não tem Perfil.
    const account = PUBLIC_ID.test(publicId)
      ? await this.accounts.findByPublicId(Number(publicId))
      : null;
    return toProfile(found(account));
  }
}

function found(account: Account | null): Account {
  if (account === null) {
    throw new NotFoundException('Perfil não encontrado');
  }
  return account;
}
