import {
  type ChangeDisplayNameInput,
  changeDisplayNameInputSchema,
  type DisplayNameChanged,
  displayNameChangedSchema,
  displayNameErrorSchema,
  type ProfilePrivacyInput,
  profilePrivacyInputSchema,
} from '@carmine/contracts';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Put,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthenticatedGuard, CurrentSession } from '../auth/session.guard.js';
import type { Session } from '../auth/sessions.js';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { AccountsService } from './accounts.service.js';
import { DisplayNameErrorsFilter } from './display-name-errors.filter.js';
import { DisplayNames } from './display-names.js';

const errorResponse = (status: number, description: string) =>
  ApiResponse({ status, description, standardSchema: displayNameErrorSchema });

/**
 * O que a Conta da sessão escolhe sobre si (S11): o Nome de exibição e o Perfil privado. Exige
 * sessão e `x-csrf-token`; conta no rate limit `mutations`.
 */
@ApiTags('me')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Sem sessão, ou ela expirou' })
@UseGuards(AuthenticatedGuard)
@UseFilters(DisplayNameErrorsFilter)
@Controller('me')
export class AccountSettingsController {
  constructor(
    @Inject(DisplayNames) private readonly displayNames: DisplayNames,
    @Inject(AccountsService) private readonly accounts: AccountsService,
  ) {}

  @Put('display-name')
  @HttpCode(HttpStatus.OK)
  @RateLimit('mutations')
  @ApiOperation({
    operationId: 'changeDisplayName',
    summary:
      'Troca o Nome de exibição da Conta (2 a 24 caracteres, filtro de palavras, uma troca a cada 7 dias); vale no jogo no próximo connect',
  })
  @ApiOkResponse({ description: 'Trocado', standardSchema: displayNameChangedSchema })
  @errorResponse(400, 'Corpo fora do formato (invalid_body)')
  @errorResponse(403, 'Conta não reivindicada (not_claimed), ou CSRF inválido')
  @errorResponse(
    409,
    'Trocou há menos de 7 dias (too_soon); `nextChangeAt` diz quando dá para trocar',
  )
  @errorResponse(
    422,
    'Nome curto, longo, com caracteres que não servem ou reprovado pelo filtro (too_short, too_long, invalid_chars, offensive)',
  )
  async changeName(
    @CurrentSession() session: Session,
    @Body({ schema: changeDisplayNameInputSchema }) body: ChangeDisplayNameInput,
  ): Promise<DisplayNameChanged> {
    const changed = await this.displayNames.change(session.accountId, body.displayName);
    return {
      displayName: changed.displayName,
      nextChangeAt: changed.nextChangeAt.toISOString(),
    };
  }

  @Put('privacy')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit('mutations')
  @ApiOperation({
    operationId: 'setProfilePrivacy',
    summary:
      'Liga ou desliga o Perfil privado: esconde as Estatísticas e a identidade no Ranking; nome, avatar, Loadout e presença continuam públicos',
  })
  @ApiNoContentResponse({ description: 'Gravado' })
  async setPrivacy(
    @CurrentSession() session: Session,
    @Body({ schema: profilePrivacyInputSchema }) body: ProfilePrivacyInput,
  ): Promise<void> {
    if (!(await this.accounts.setProfilePrivate(session.accountId, body.isPrivate))) {
      throw new NotFoundException('Conta não encontrada');
    }
  }
}
