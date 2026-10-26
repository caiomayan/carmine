import {
  type AvatarDecisionInput,
  avatarDecisionInputSchema,
  STAFF_REPORTS_PAGE_DEFAULT,
  STAFF_REPORTS_PAGE_MAX,
  type StaffAccountAvatar,
  type StaffAvatarCase,
  type StaffAvatarCasePage,
  staffAccountAvatarSchema,
  staffAvatarCasePageSchema,
  staffAvatarCaseSchema,
  staffErrorSchema,
} from '@carmine/contracts';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { AuthenticatedGuard } from '../auth/session.guard.js';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { CurrentStaff, type StaffActor, StaffOnly } from '../staff/staff.guard.js';
import { StaffErrorsFilter, StaffRejection } from '../staff/staff-errors.js';
import { AvatarModeration, InvalidAvatarCursor } from './avatar-moderation.js';

/** ID público no caminho: só dígitos, sem zero à esquerda. */
const publicIdParam = z
  .string()
  .regex(/^[1-9]\d{0,14}$/, 'ID público inválido')
  .transform(Number);

const uuidParam = z.uuid('id inválido');

const queueQuerySchema = z.object({
  status: z.enum(['open', 'decided']).default('open'),
  before: z.string().max(200).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(STAFF_REPORTS_PAGE_MAX)
    .default(STAFF_REPORTS_PAGE_DEFAULT),
});

const ERROR = {
  description: 'Recusa com código estável (`StaffError`)',
  standardSchema: staffErrorSchema,
};

/**
 * A moderação da foto de perfil no painel da Staff (ADR 0022): a fila de denúncias, a decisão
 * (manter ou remover), a remoção em um clique pela ficha da Conta e a imagem para a Staff ver. Toda
 * rota exige a permissão `avatars.moderate` (Dono, Admin e Moderador); as mutações exigem
 * `x-csrf-token` e uma nota, que vai para o log de auditoria.
 */
@ApiTags('staff')
@UseGuards(AuthenticatedGuard)
@UseFilters(StaffErrorsFilter)
@Controller('staff')
export class StaffAvatarsController {
  constructor(@Inject(AvatarModeration) private readonly moderation: AvatarModeration) {}

  @Get('avatar-reports')
  @StaffOnly('avatars.moderate')
  @RateLimit('public')
  @ApiOperation({
    operationId: 'listStaffAvatarReports',
    summary:
      'Fila de denúncias de foto de perfil; as abertas, das mais antigas (o prazo é de 24 h), as decididas, das mais recentes',
  })
  @ApiQuery({ name: 'status', required: false, enum: ['open', 'decided'] })
  @ApiQuery({ name: 'before', required: false, description: '`nextCursor` da página anterior' })
  @ApiQuery({ name: 'limit', required: false, description: `1 a ${STAFF_REPORTS_PAGE_MAX}` })
  @ApiOkResponse({ description: 'Uma página', standardSchema: staffAvatarCasePageSchema })
  async queue(@Query() query: Record<string, string>): Promise<StaffAvatarCasePage> {
    const parsed = queueQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new StaffRejection(
        'invalid_body',
        parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      );
    }
    const { status, before, limit } = parsed.data;
    try {
      return await this.moderation.page(status, { ...(before && { before }), limit });
    } catch (error) {
      if (error instanceof InvalidAvatarCursor) {
        throw new StaffRejection('invalid_body', 'cursor inválido');
      }
      throw error;
    }
  }

  @Post('avatars/:id/decision')
  @StaffOnly('avatars.moderate')
  @RateLimit('mutations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'decideStaffAvatar',
    summary:
      'Decide uma foto de perfil: manter (volta ao ar se estava suspensa e arquiva as denúncias) ou remover (a Conta volta à Steam, a imagem fica guardada em privado por 30 dias e o envio é bloqueado conforme a regra). Vai para o log de auditoria',
  })
  @ApiParam({ name: 'id', description: 'O id da foto' })
  @ApiOkResponse({ description: 'O caso, já decidido', standardSchema: staffAvatarCaseSchema })
  @ApiNotFoundResponse(ERROR)
  @ApiConflictResponse(ERROR)
  decide(
    @CurrentStaff() actor: StaffActor,
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: avatarDecisionInputSchema }) body: AvatarDecisionInput,
  ): Promise<StaffAvatarCase> {
    return this.moderation.decide(actor, id, body);
  }

  @Get('accounts/:publicId/avatar')
  @StaffOnly('avatars.moderate')
  @RateLimit('public')
  @ApiOperation({
    operationId: 'getStaffAccountAvatar',
    summary:
      'A foto de perfil na ficha da Conta: a atual, o bloqueio de reincidente (só a Staff o vê) e as remoções anteriores',
  })
  @ApiParam({ name: 'publicId', type: 'integer', example: 10_016 })
  @ApiOkResponse({ description: 'A foto da Conta', standardSchema: staffAccountAvatarSchema })
  @ApiNotFoundResponse(ERROR)
  accountAvatar(
    @Param('publicId', { schema: publicIdParam }) publicId: number,
  ): Promise<StaffAccountAvatar> {
    return this.moderation.accountAvatar(publicId);
  }

  @Post('accounts/:publicId/avatar/remove')
  @StaffOnly('avatars.moderate')
  @RateLimit('mutations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'removeStaffAccountAvatar',
    summary:
      'Remove a foto de perfil da Conta em um clique, sem denúncia (`decision` só vale `remove`); mesmo efeito e mesmo log da decisão',
  })
  @ApiParam({ name: 'publicId', type: 'integer', example: 10_016 })
  @ApiOkResponse({
    description: 'A foto da Conta, já removida',
    standardSchema: staffAccountAvatarSchema,
  })
  @ApiNotFoundResponse(ERROR)
  @ApiConflictResponse(ERROR)
  removeAccountAvatar(
    @CurrentStaff() actor: StaffActor,
    @Param('publicId', { schema: publicIdParam }) publicId: number,
    @Body({ schema: avatarDecisionInputSchema }) body: AvatarDecisionInput,
  ): Promise<StaffAccountAvatar> {
    return this.moderation.removeFromAccount(actor, publicId, body);
  }

  @Get('avatars/:id/image')
  @StaffOnly('avatars.moderate')
  @RateLimit('public')
  @ApiOperation({
    operationId: 'getStaffAvatarImage',
    summary:
      'A imagem (WebP, 512 px) de uma foto de perfil, no ar, suspensa ou guardada em privado, só para a Staff',
  })
  @ApiParam({ name: 'id', description: 'O id da foto' })
  @ApiProduces('image/webp')
  @ApiOkResponse({
    description: 'A imagem',
    content: { 'image/webp': { schema: { type: 'string', format: 'binary' } } },
  })
  @ApiNotFoundResponse(ERROR)
  async image(
    @Param('id', { schema: uuidParam }) id: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Buffer> {
    const bytes = await this.moderation.image(id);
    reply.header('content-type', 'image/webp');
    // Foto que pode ser imprópria ou já removida: nunca fica em cache do navegador nem de proxy.
    reply.header('cache-control', 'private, no-store');
    return bytes;
  }
}
