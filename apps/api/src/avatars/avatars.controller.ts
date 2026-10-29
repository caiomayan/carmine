import {
  AVATAR_ACCEPTED_TYPES,
  AVATAR_ERROR_STATUS,
  type AvatarError,
  type AvatarState,
  avatarErrorSchema,
  avatarStateSchema,
} from '@carmine/contracts/avatar';
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
  Param,
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
  ApiParam,
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

/** Um ID que não é UUID não pode estar no histórico: a mesma resposta de uma foto que não existe. */
function historyId(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new AvatarRejection('not_in_history', 'Essa foto não está mais no histórico');
  }
  return value.toLowerCase();
}

const errorResponse = (status: number, description: string) =>
  ApiResponse({ status, description, standardSchema: avatarErrorSchema });

/**
 * A foto de perfil própria da Conta da sessão (ADR 0022 e 0025): o estado (com o histórico das últimas fotos),
 * enviar (publica na hora), escolher ou apagar uma foto do histórico e voltar à foto da Steam. Exige sessão e `x-csrf-token` nas mutações, que contam no rate limit `mutations`.
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
      'Estado da foto de perfil da Conta: de onde vem o avatar, a foto própria, o histórico das últimas 5 fotos, se pode enviar e por que não',
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
    'Conta com Punição ativa ou com o envio bloqueado pela Staff (punished, upload_blocked), ou CSRF inválido',
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
  @errorResponse(
    429,
    'Passou do limite de envios (upload_limit) ou outro envio há poucos segundos (upload_too_soon); `retryAfter` diz quando libera',
  )
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

  @Post('history/:id')
  @HttpCode(HttpStatus.OK)
  @RateLimit('mutations')
  @ApiOperation({
    operationId: 'chooseAvatarFromHistory',
    summary:
      'Escolhe uma foto do histórico: ela volta ao ar na hora e não conta nos limites de envio. Quem tem Punição ativa ou o envio bloqueado não escolhe',
  })
  @ApiParam({ name: 'id', description: 'ID da foto, como vem em `history` do estado' })
  @ApiOkResponse({ description: 'Com a foto escolhida no ar', standardSchema: avatarStateSchema })
  @errorResponse(
    403,
    'Punição ativa ou envio bloqueado (punished, upload_blocked), ou CSRF inválido',
  )
  @errorResponse(404, 'A foto não está no histórico desta Conta (not_in_history)')
  @errorResponse(503, 'Funcionalidade desligada neste ambiente (disabled)')
  chooseFromHistory(
    @CurrentSession() session: Session,
    @Param('id') id: string,
  ): Promise<AvatarState> {
    return this.avatars.chooseFromHistory(session.accountId, historyId(id));
  }

  @Delete('history/:id')
  @HttpCode(HttpStatus.OK)
  @RateLimit('mutations')
  @ApiOperation({
    operationId: 'deleteAvatarFromHistory',
    summary:
      'Apaga uma foto do histórico e do armazenamento. Se era a que estava no ar, volta a foto da Steam',
  })
  @ApiParam({ name: 'id', description: 'ID da foto, como vem em `history` do estado' })
  @ApiOkResponse({ description: 'Sem a foto', standardSchema: avatarStateSchema })
  @errorResponse(404, 'A foto não está no histórico desta Conta (not_in_history)')
  deleteFromHistory(
    @CurrentSession() session: Session,
    @Param('id') id: string,
  ): Promise<AvatarState> {
    return this.avatars.deleteFromHistory(session.accountId, historyId(id));
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @RateLimit('mutations')
  @ApiOperation({
    operationId: 'revertAvatar',
    summary:
      'Volta à foto da Steam na hora, sem moderação; a foto própria segue no histórico. Sem foto própria, não muda nada',
  })
  @ApiOkResponse({ description: 'Com a foto da Steam', standardSchema: avatarStateSchema })
  revert(@CurrentSession() session: Session): Promise<AvatarState> {
    return this.avatars.revertToSteam(session.accountId);
  }
}
