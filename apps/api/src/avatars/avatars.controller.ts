import {
  AVATAR_ACCEPTED_TYPES,
  AVATAR_ERROR_STATUS,
  type AvatarError,
  type AvatarState,
  avatarErrorSchema,
  avatarStateSchema,
} from '@carmine/contracts';
import {
  type ArgumentsHost,
  Body,
  Catch,
  Controller,
  Delete,
  type ExceptionFilter,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { AuthenticatedGuard, CurrentSession } from '../auth/session.guard.js';
import type { Session } from '../auth/sessions.js';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { AvatarRejection } from './avatar-processor.js';
import { OversizeUpload } from './avatar-upload.js';
import { Avatars } from './avatars.js';

/** Responde as recusas da foto no formato do contrato (`AvatarError`). */
@Catch(AvatarRejection)
export class AvatarErrorsFilter implements ExceptionFilter {
  catch(exception: AvatarRejection, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const body: AvatarError = {
      statusCode: AVATAR_ERROR_STATUS[exception.code],
      code: exception.code,
      message: exception.message,
      ...(exception.retryAfter && { retryAfter: exception.retryAfter.toISOString() }),
    };
    reply.status(body.statusCode).send(body);
  }
}

const errorResponse = (status: number, description: string) =>
  ApiResponse({ status, description, standardSchema: avatarErrorSchema });

/**
 * A foto de perfil própria da Conta da sessão (ADR 0022): o estado, enviar (publica na hora) e voltar
 * à foto da Steam. Exige sessão e `x-csrf-token` nas mutações, que contam no rate limit `mutations`.
 */
@ApiTags('me')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Sem sessão, ou ela expirou' })
@UseGuards(AuthenticatedGuard)
@UseFilters(AvatarErrorsFilter)
@Controller('me/avatar')
export class AvatarsController {
  constructor(@Inject(Avatars) private readonly avatars: Avatars) {}

  @Get()
  @RateLimit('public')
  @ApiOperation({
    operationId: 'getAvatar',
    summary:
      'Estado da foto de perfil da Conta: de onde vem o avatar, a foto própria (no ar ou suspensa), se pode enviar e por que não',
  })
  @ApiOkResponse({ description: 'O estado', standardSchema: avatarStateSchema })
  get(@CurrentSession() session: Session): Promise<AvatarState> {
    return this.avatars.stateOf(session.accountId);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @RateLimit('mutations')
  @ApiOperation({
    operationId: 'uploadAvatar',
    summary:
      'Envia a foto de perfil e a publica na hora. O corpo é a imagem crua (JPEG, PNG ou WebP, até 1 MiB, quadrada de 256 a 1024 px); a API a refaz em 4 tamanhos WebP sem EXIF',
  })
  @ApiConsumes(...AVATAR_ACCEPTED_TYPES)
  @ApiBody({
    description: 'A imagem (o recorte que o navegador fez)',
    required: true,
    schema: { type: 'string', format: 'binary' },
  })
  @ApiOkResponse({ description: 'Publicada', standardSchema: avatarStateSchema })
  @errorResponse(
    403,
    'Conta com menos de 24 horas, com Punição ativa ou com o envio bloqueado (account_too_new, punished, upload_blocked), ou CSRF inválido',
  )
  @errorResponse(413, 'Maior que 1 MiB (too_large)')
  @errorResponse(
    415,
    'Tipo fora de JPEG, PNG e WebP, ou bytes que não são do tipo informado (unsupported_type)',
  )
  @errorResponse(
    422,
    'Não abre como imagem, é animada ou não é quadrada de 256 a 1024 px (invalid_image, bad_dimensions)',
  )
  @errorResponse(429, '3 envios em 24 horas (daily_limit); `retryAfter` diz quando libera')
  @errorResponse(503, 'Funcionalidade desligada neste ambiente (disabled)')
  async upload(
    @CurrentSession() session: Session,
    @Headers('content-type') contentType: string | undefined,
    @Body() body: unknown,
  ): Promise<AvatarState> {
    if (body instanceof OversizeUpload) {
      throw new AvatarRejection('too_large', 'A foto passa de 1 MB');
    }
    if (!Buffer.isBuffer(body)) {
      throw new AvatarRejection('unsupported_type', 'Envie a imagem como corpo da requisição');
    }
    const type = (contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
    return this.avatars.upload(session.accountId, body, type);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @RateLimit('mutations')
  @ApiOperation({
    operationId: 'revertAvatar',
    summary:
      'Volta à foto da Steam na hora, sem moderação; a foto própria é apagada. Sem foto própria, não muda nada',
  })
  @ApiOkResponse({ description: 'Com a foto da Steam', standardSchema: avatarStateSchema })
  revert(@CurrentSession() session: Session): Promise<AvatarState> {
    return this.avatars.revertToSteam(session.accountId);
  }
}
