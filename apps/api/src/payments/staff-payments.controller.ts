import {
  STAFF_PAYMENTS_PAGE_DEFAULT,
  STAFF_PAYMENTS_PAGE_MAX,
  type StaffCompensationInput,
  type StaffCompensationOverview,
  type StaffCompensationResult,
  type StaffPaymentDetail,
  type StaffPaymentPage,
  type StaffPaymentRefund,
  type StaffPurchasesUnblocked,
  type StaffReasonBody,
  type StaffReconcileInput,
  type StaffReconcileResult,
  staffCompensationInputSchema,
  staffCompensationOverviewSchema,
  staffCompensationResultSchema,
  staffErrorSchema,
  staffPaymentDetailSchema,
  staffPaymentFilterSchema,
  staffPaymentPageSchema,
  staffPaymentRefundSchema,
  staffPurchasesUnblockedSchema,
  staffReasonBodySchema,
  staffReconcileInputSchema,
  staffReconcileResultSchema,
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
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';
import { AuthenticatedGuard } from '../auth/session.guard.js';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { CurrentStaff, type StaffActor, StaffOnly } from '../staff/staff.guard.js';
import { StaffErrorsFilter, StaffRejection } from '../staff/staff-errors.js';
import { InvalidPaymentCursor, StaffPayments } from './staff-payments.js';

/** ID público no caminho: só dígitos, sem zero à esquerda. */
const publicIdParam = z
  .string()
  .regex(/^[1-9]\d{0,14}$/, 'ID público inválido')
  .transform(Number);

const uuidParam = z.uuid('id inválido');

const listQuerySchema = z.object({
  status: staffPaymentFilterSchema.default('all'),
  before: z.string().max(200).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(STAFF_PAYMENTS_PAGE_MAX)
    .default(STAFF_PAYMENTS_PAGE_DEFAULT),
});

const ERROR = {
  description: 'Recusa com código estável (`StaffError`)',
  standardSchema: staffErrorSchema,
};

/**
 * Os pagamentos do VIP no painel da Staff (S14): a lista com filtro por estado, a ficha com os
 * webhooks, reembolsar, reabrir as compras de uma Conta bloqueada, conciliar e a compensação em lote
 * por indisponibilidade. Toda rota exige a permissão `payments.manage` (Dono e Admin); as mutações
 * exigem `x-csrf-token` e um motivo, que vai para o log de auditoria.
 */
@ApiTags('staff')
@UseGuards(AuthenticatedGuard)
@UseFilters(StaffErrorsFilter)
@Controller('staff')
export class StaffPaymentsController {
  constructor(@Inject(StaffPayments) private readonly staffPayments: StaffPayments) {}

  @Get('payments')
  @StaffOnly('payments.manage')
  @RateLimit('public')
  @ApiOperation({
    operationId: 'listStaffPayments',
    summary:
      'Pagamentos do VIP, do mais recente ao mais antigo, com filtro por estado e a contagem de cada estado',
  })
  @ApiQuery({ name: 'status', required: false, description: '`all` ou um estado do pagamento' })
  @ApiQuery({ name: 'before', required: false, description: '`nextCursor` da página anterior' })
  @ApiQuery({ name: 'limit', required: false, description: `1 a ${STAFF_PAYMENTS_PAGE_MAX}` })
  @ApiOkResponse({ description: 'Uma página', standardSchema: staffPaymentPageSchema })
  async list(@Query() query: Record<string, string>): Promise<StaffPaymentPage> {
    const parsed = listQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new StaffRejection(
        'invalid_body',
        parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      );
    }
    const { status, before, limit } = parsed.data;
    try {
      return await this.staffPayments.page(status, { ...(before && { before }), limit });
    } catch (error) {
      if (error instanceof InvalidPaymentCursor) {
        throw new StaffRejection('invalid_body', 'cursor inválido');
      }
      throw error;
    }
  }

  @Get('payments/compensation')
  @StaffOnly('payments.manage')
  @RateLimit('public')
  @ApiOperation({
    operationId: 'getStaffCompensation',
    summary:
      'O que ver antes de compensar por indisponibilidade: quantas Contas têm VIP ativo agora e as últimas compensações',
  })
  @ApiOkResponse({ description: 'O resumo', standardSchema: staffCompensationOverviewSchema })
  compensationOverview(): Promise<StaffCompensationOverview> {
    return this.staffPayments.compensationOverview();
  }

  @Post('payments/compensation')
  @StaffOnly('payments.manage')
  @RateLimit('mutations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'applyStaffCompensation',
    summary:
      'Compensa por indisponibilidade acima de 24 h: soma os dias a todos os VIPs ativos de uma vez. A chave é única por queda (repetir não soma de novo); avisa no Discord e vai para o log de auditoria',
  })
  @ApiOkResponse({ description: 'Aplicada', standardSchema: staffCompensationResultSchema })
  @ApiConflictResponse(ERROR)
  compensate(
    @CurrentStaff() actor: StaffActor,
    @Body({ schema: staffCompensationInputSchema }) body: StaffCompensationInput,
  ): Promise<StaffCompensationResult> {
    return this.staffPayments.compensate(actor, body);
  }

  @Post('payments/reconcile')
  @StaffOnly('payments.manage')
  @RateLimit('mutations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'reconcileStaffPayments',
    summary:
      'Concilia agora com o provedor os pagamentos dos últimos dias (pega reembolso, contestação e webhook perdido)',
  })
  @ApiOkResponse({
    description: 'Quantos foram conferidos e quantos mudaram',
    standardSchema: staffReconcileResultSchema,
  })
  reconcile(
    @Body({ schema: staffReconcileInputSchema }) body: StaffReconcileInput,
  ): Promise<StaffReconcileResult> {
    return this.staffPayments.reconcile(body.days);
  }

  @Get('payments/:id')
  @StaffOnly('payments.manage')
  @RateLimit('public')
  @ApiOperation({
    operationId: 'getStaffPayment',
    summary:
      'A ficha do pagamento: o provedor, os valores, o que ainda dá para devolver, os webhooks recebidos e o que a Staff já fez',
  })
  @ApiParam({ name: 'id', description: 'O identificador do pagamento (o da compra)' })
  @ApiOkResponse({ description: 'A ficha', standardSchema: staffPaymentDetailSchema })
  @ApiNotFoundResponse(ERROR)
  detail(@Param('id', { schema: uuidParam }) id: string): Promise<StaffPaymentDetail> {
    return this.staffPayments.detail(id);
  }

  @Post('payments/:id/refund')
  @StaffOnly('payments.manage')
  @RateLimit('mutations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'refundStaffPayment',
    summary:
      'Reembolsa um pagamento aprovado (depois dos 7 dias, ou parcial por dias): o provedor estorna e os dias saem do VIP. Com motivo, vai para o log de auditoria',
  })
  @ApiParam({ name: 'id', description: 'O identificador do pagamento' })
  @ApiOkResponse({ description: 'A ficha atualizada', standardSchema: staffPaymentDetailSchema })
  @ApiNotFoundResponse(ERROR)
  @ApiConflictResponse(ERROR)
  @ApiBadGatewayResponse(ERROR)
  refund(
    @CurrentStaff() actor: StaffActor,
    @Param('id', { schema: uuidParam }) id: string,
    @Body({ schema: staffPaymentRefundSchema }) body: StaffPaymentRefund,
  ): Promise<StaffPaymentDetail> {
    return this.staffPayments.refund(actor, id, body);
  }

  @Post('accounts/:publicId/purchases/unblock')
  @StaffOnly('payments.manage')
  @RateLimit('mutations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'unblockStaffPurchases',
    summary:
      'Reabre as compras de uma Conta bloqueada por contestação, depois de a Staff revisar. Com motivo, vai para o log de auditoria',
  })
  @ApiParam({ name: 'publicId', type: 'integer', example: 10_016 })
  @ApiOkResponse({ description: 'Reabertas', standardSchema: staffPurchasesUnblockedSchema })
  @ApiNotFoundResponse(ERROR)
  @ApiConflictResponse(ERROR)
  async unblock(
    @CurrentStaff() actor: StaffActor,
    @Param('publicId', { schema: publicIdParam }) publicId: number,
    @Body({ schema: staffReasonBodySchema }) body: StaffReasonBody,
  ): Promise<StaffPurchasesUnblocked> {
    return { publicId: await this.staffPayments.unblock(actor, publicId, body.reason) };
  }
}
