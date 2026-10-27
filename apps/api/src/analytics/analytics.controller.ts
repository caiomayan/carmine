import {
  type AnalyticsPreference,
  type AnalyticsPreferenceInput,
  analyticsPreferenceInputSchema,
  analyticsPreferenceSchema,
} from '@carmine/contracts/analytics';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthenticatedGuard, CurrentSession } from '../auth/session.guard.js';
import type { Session } from '../auth/sessions.js';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { Analytics, AnalyticsPreferences } from './analytics.js';

/**
 * A chave "Participar da análise de uso" (direito de oposição, ADR 0021), em Configurações > Dados e conta. Desligada,
 * a API deixa de enviar qualquer evento daquela Conta. Exige sessão e `x-csrf-token` na mutação.
 */
@ApiTags('me')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Sem sessão, ou ela expirou' })
@UseGuards(AuthenticatedGuard)
@Controller('me/analytics')
export class AnalyticsController {
  constructor(
    @Inject(Analytics) private readonly analytics: Analytics,
    @Inject(AnalyticsPreferences) private readonly preferences: AnalyticsPreferences,
  ) {}

  @Get()
  @RateLimit('public')
  @ApiOperation({
    operationId: 'getAnalyticsPreference',
    summary:
      'Se a Conta participa da análise de uso (padrão: sim) e se a análise está ligada neste ambiente',
  })
  @ApiOkResponse({ description: 'A escolha', standardSchema: analyticsPreferenceSchema })
  async get(@CurrentSession() session: Session): Promise<AnalyticsPreference> {
    return {
      participate: await this.preferences.choice(session.accountId),
      enabled: this.analytics.enabled,
    };
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  @RateLimit('mutations')
  @ApiOperation({
    operationId: 'setAnalyticsPreference',
    summary:
      'Liga ou desliga a participação na análise de uso. Desligada, nenhum evento da Conta é enviado (vale na hora)',
  })
  @ApiOkResponse({ description: 'A escolha nova', standardSchema: analyticsPreferenceSchema })
  async set(
    @CurrentSession() session: Session,
    @Body({ schema: analyticsPreferenceInputSchema }) body: AnalyticsPreferenceInput,
  ): Promise<AnalyticsPreference> {
    await this.preferences.setChoice(session.accountId, body.participate);
    return { participate: body.participate, enabled: this.analytics.enabled };
  }
}
