import {
  type CreatePurchase,
  createPurchaseSchema,
  type Purchase,
  type PurchaseError,
  type PurchaseList,
  purchaseErrorSchema,
  purchaseListSchema,
  purchaseSchema,
  type VipPackages,
  vipPackagesSchema,
} from '@carmine/contracts';
import type { ExceptionFilter } from '@nestjs/common';
import {
  type ArgumentsHost,
  BadRequestException,
  Body,
  Catch,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiExcludeController,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthenticatedGuard, CurrentSession } from '../auth/session.guard.js';
import type { Session } from '../auth/sessions.js';
import { RateLimit } from '../rate-limit/rate-limit.decorator.js';
import { FAKE_ACTIONS, type FakeAction, type FakePaymentsGateway } from './fake-gateway.js';
import { Payments, PurchaseRejection } from './payments.js';

/** O status HTTP de cada código de erro da compra. */
const STATUS: Record<PurchaseError['code'], number> = {
  payments_disabled: HttpStatus.SERVICE_UNAVAILABLE,
  invalid_body: HttpStatus.BAD_REQUEST,
  banned: HttpStatus.FORBIDDEN,
  purchases_blocked: HttpStatus.FORBIDDEN,
  vip_horizon: HttpStatus.UNPROCESSABLE_ENTITY,
  daily_limit: HttpStatus.TOO_MANY_REQUESTS,
  provider_unavailable: HttpStatus.BAD_GATEWAY,
  not_found: HttpStatus.NOT_FOUND,
  purchase_in_progress: HttpStatus.CONFLICT,
  refund_unavailable: HttpStatus.CONFLICT,
};

/** Responde os erros da compra no formato do contrato (`PurchaseError`), com o código estável. */
@Catch(PurchaseRejection, BadRequestException)
export class PurchaseErrorsFilter implements ExceptionFilter {
  catch(exception: PurchaseRejection | BadRequestException, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const body: PurchaseError & { statusCode: number } =
      exception instanceof PurchaseRejection
        ? { statusCode: STATUS[exception.code], code: exception.code, message: exception.message }
        : {
            statusCode: HttpStatus.BAD_REQUEST,
            code: 'invalid_body',
            message: 'Corpo fora do formato: confira o Pacote, o meio e a declaração de maioridade',
          };
    reply.status(body.statusCode).send(body);
  }
}

const errorResponse = (status: number, description: string) =>
  ApiResponse({ status, description, standardSchema: purchaseErrorSchema });

/** `GET /api/vip/packages`: os Pacotes e se a compra está aberta (público). */
@ApiTags('vip')
@Controller('vip')
export class VipCatalogController {
  constructor(@Inject(Payments) private readonly payments: Payments) {}

  @Get('packages')
  @RateLimit('public')
  @ApiOperation({
    operationId: 'getVipPackages',
    summary: 'Os Pacotes VIP, os preços e se a compra está aberta (a cobrança nasce desligada)',
  })
  @ApiOkResponse({ description: 'O catálogo', standardSchema: vipPackagesSchema })
  packages(): VipPackages {
    return this.payments.catalog();
  }
}

/**
 * "Minhas compras" (S14): as compras de Pacote VIP da Conta da sessão. Toda rota exige sessão; as
 * mutações também o `x-csrf-token` e contam no rate limit `mutations`.
 */
@ApiTags('vip')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Sem sessão, ou ela expirou' })
@UseGuards(AuthenticatedGuard)
@UseFilters(PurchaseErrorsFilter)
@Controller('me/purchases')
export class PurchasesController {
  constructor(@Inject(Payments) private readonly payments: Payments) {}

  @Get()
  @RateLimit('public')
  @ApiOperation({
    operationId: 'listPurchases',
    summary: 'As compras de VIP da Conta, da mais nova',
  })
  @ApiOkResponse({ description: 'As compras', standardSchema: purchaseListSchema })
  async list(@CurrentSession() session: Session): Promise<PurchaseList> {
    return { purchases: await this.payments.list(session.accountId) };
  }

  @Get(':id')
  @RateLimit('public')
  @ApiOperation({
    operationId: 'getPurchase',
    summary: 'Uma compra; a pendente pergunta ao provedor, sem esperar o webhook',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ description: 'A compra', standardSchema: purchaseSchema })
  @errorResponse(404, 'Compra não encontrada (not_found)')
  get(@CurrentSession() session: Session, @Param('id') id: string): Promise<Purchase> {
    return this.payments.refresh(session.accountId, id);
  }

  @Post()
  @RateLimit('mutations')
  @ApiOperation({
    operationId: 'createPurchase',
    summary:
      'Compra um Pacote VIP para a Conta da sessão (Pix ou cartão). Devolve a compra pendente com o Pix ou o endereço do checkout',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description: 'Repetir a chamada com a mesma chave devolve a mesma compra (duplo clique)',
  })
  @ApiCreatedResponse({
    description: 'A compra criada (ou a pendente igual)',
    standardSchema: purchaseSchema,
  })
  @errorResponse(400, 'Corpo fora do formato (invalid_body)')
  @errorResponse(403, 'Ban permanente (banned) ou compras suspensas (purchases_blocked), ou CSRF')
  @errorResponse(409, 'Há um pagamento em análise (purchase_in_progress)')
  @errorResponse(422, 'O VIP passaria do limite à frente (vip_horizon)')
  @errorResponse(429, 'Muitas compras hoje (daily_limit)')
  @errorResponse(502, 'O provedor não respondeu (provider_unavailable)')
  @errorResponse(503, 'A cobrança está desligada (payments_disabled)')
  create(
    @CurrentSession() session: Session,
    @Req() request: FastifyRequest,
    @Body({ schema: createPurchaseSchema }) body: CreatePurchase,
  ): Promise<Purchase> {
    const header = request.headers['idempotency-key'];
    const key =
      typeof header === 'string' && header.length > 0 && header.length <= 100 ? header : null;
    return this.payments.create(session.accountId, body, key);
  }

  @Post(':id/refund')
  @HttpCode(HttpStatus.OK)
  @RateLimit('mutations')
  @ApiOperation({
    operationId: 'refundPurchase',
    summary:
      'Direito de arrependimento: reembolso integral em até 7 dias da aprovação, sem motivo; os dias saem do VIP',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ description: 'A compra, já reembolsada', standardSchema: purchaseSchema })
  @errorResponse(404, 'Compra não encontrada (not_found)')
  @errorResponse(409, 'Fora do prazo ou não aprovada (refund_unavailable)')
  @errorResponse(502, 'O provedor não confirmou o estorno (provider_unavailable)')
  refund(@CurrentSession() session: Session, @Param('id') id: string): Promise<Purchase> {
    return this.payments.refund(session.accountId, id);
  }
}

/**
 * O webhook do provedor (`POST /api/webhooks/mercadopago`; o falso entrega nele também). Sem sessão:
 * a assinatura é a autoridade. Assinatura inválida: 401 (registrada). Erro nosso: 5xx, para o
 * provedor reenviar.
 */
@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(@Inject(Payments) private readonly payments: Payments) {}

  @Post('mercadopago')
  @HttpCode(HttpStatus.OK)
  @RateLimit('webhook')
  @ApiOperation({
    operationId: 'receivePaymentWebhook',
    summary:
      'Aviso do provedor de pagamento (assinado). Nunca concede nada pelo corpo: consulta o pagamento',
  })
  @ApiResponse({ status: 200, description: 'Recebido' })
  @ApiResponse({ status: 401, description: 'Assinatura inválida ou ausente' })
  async receive(@Req() request: FastifyRequest): Promise<{ received: true }> {
    const { result } = await this.payments.handleWebhook({
      headers: request.headers,
      query: request.query as Record<string, string | undefined>,
      body: request.body,
    });
    if (result === 'rejected') {
      throw new UnauthorizedException('Assinatura inválida');
    }
    return { received: true };
  }
}

/**
 * Só com o provedor FALSO (dev e homologação): a página de simulação lê e muda a cobrança. Cada ação
 * dispara o webhook assinado contra o tratador de verdade. Não aparece no OpenAPI.
 */
@ApiExcludeController()
@Controller('dev/payments')
export class DevPaymentsController {
  constructor(@Inject('FAKE_PAYMENTS_GATEWAY') private readonly gateway: FakePaymentsGateway) {}

  @Get(':providerId')
  @RateLimit('public')
  async show(@Param('providerId') providerId: string) {
    const payment = await this.gateway.getPayment(providerId);
    if (!payment) throw new NotFoundException('Cobrança não encontrada');
    return { ...payment, actions: FAKE_ACTIONS };
  }

  @Post(':providerId/:action')
  @HttpCode(HttpStatus.OK)
  @RateLimit('public')
  async act(@Param('providerId') providerId: string, @Param('action') action: string) {
    if (!(FAKE_ACTIONS as readonly string[]).includes(action)) {
      throw new NotFoundException('Ação desconhecida');
    }
    const payment = await this.gateway.act(providerId, action as FakeAction);
    if (!payment) throw new NotFoundException('Cobrança não encontrada');
    return payment;
  }
}
