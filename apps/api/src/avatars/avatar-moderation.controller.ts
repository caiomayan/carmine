import {
  AVATAR_ERROR_STATUS,
  type AvatarError,
  type AvatarReportInput,
  type AvatarReportReceived,
  avatarErrorSchema,
  avatarReportInputSchema,
  avatarReportReceivedSchema,
} from '@carmine/contracts/avatar';
import {
  type ArgumentsHost,
  BadRequestException,
  Body,
  Catch,
  Controller,
  type ExceptionFilter,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { AuthenticatedGuard, CurrentSession } from '../auth/session.guard.js';
import type { Session } from '../auth/sessions.js';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { AvatarModeration } from './avatar-moderation.js';
import { AvatarRejection } from './avatar-processor.js';

/** ID público no caminho: só dígitos, sem zero à esquerda (o maior cabe num `number`). */
const publicIdParam = z
  .string()
  .regex(/^[1-9]\d{0,14}$/, 'ID público inválido')
  .transform(Number);

/** Responde as recusas da denúncia de foto no formato do contrato (`AvatarError`); o corpo fora do schema vira `invalid_body`. */
@Catch(AvatarRejection, BadRequestException)
export class AvatarReportErrorsFilter implements ExceptionFilter {
  catch(exception: AvatarRejection | BadRequestException, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const body: AvatarError =
      exception instanceof AvatarRejection
        ? {
            statusCode: AVATAR_ERROR_STATUS[exception.code],
            code: exception.code,
            message: exception.message,
            ...(exception.retryAfter && { retryAfter: exception.retryAfter.toISOString() }),
          }
        : { statusCode: 400, code: 'invalid_body', message: messageOf(exception) };
    reply.status(body.statusCode).send(body);
  }
}

function messageOf(exception: BadRequestException): string {
  const response = exception.getResponse();
  return typeof response === 'object' && response !== null && 'message' in response
    ? [response.message].flat().map(String).join('; ')
    : exception.message;
}

const errorResponse = (status: number, description: string) =>
  ApiResponse({ status, description, standardSchema: avatarErrorSchema });

/**
 * Denunciar a foto de perfil de outra pessoa (ADR 0022). Exige sessão e `x-csrf-token`; conta no rate
 * limit `mutations` e no limite próprio de `AVATAR_REPORTS_PER_HOUR` denúncias por hora.
 */
@ApiTags('profiles')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Sem sessão, ou ela expirou' })
@UseGuards(AuthenticatedGuard)
@UseFilters(AvatarReportErrorsFilter)
@Controller('profiles')
export class AvatarReportsController {
  constructor(@Inject(AvatarModeration) private readonly moderation: AvatarModeration) {}

  @Post(':publicId/avatar-report')
  @HttpCode(HttpStatus.OK)
  @RateLimit('mutations')
  @ApiOperation({
    operationId: 'reportAvatar',
    summary:
      'Denuncia a foto de perfil própria de um Perfil. Duas Contas diferentes tiram a foto do ar até a Staff decidir; a resposta nunca diz se isso aconteceu',
  })
  @ApiParam({ name: 'publicId', type: 'integer', example: 10_016 })
  @ApiOkResponse({
    description: 'A denúncia entrou na fila',
    standardSchema: avatarReportReceivedSchema,
  })
  @errorResponse(400, 'Motivo fora da lista (invalid_body)')
  @errorResponse(404, 'O Perfil não tem foto própria no ar (no_custom_avatar)')
  @errorResponse(409, 'Esta Conta já denunciou esta foto (already_reported)')
  @errorResponse(422, 'A própria foto não se denuncia (own_avatar)')
  @errorResponse(
    429,
    '5 denúncias de foto na última hora (report_limit) ou 10 no dia, de todos os tipos (report_daily_limit); `retryAfter` diz quando libera',
  )
  @errorResponse(503, 'Funcionalidade desligada neste ambiente (disabled)')
  report(
    @CurrentSession() session: Session,
    @Param('publicId', { schema: publicIdParam }) publicId: number,
    @Body({ schema: avatarReportInputSchema }) body: AvatarReportInput,
  ): Promise<AvatarReportReceived> {
    return this.moderation.report(session.accountId, publicId, body.reason);
  }
}
