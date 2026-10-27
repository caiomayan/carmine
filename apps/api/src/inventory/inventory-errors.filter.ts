import {
  INVENTORY_ERROR_STATUS,
  type InventoryError,
  type InventoryErrorCode,
} from '@carmine/contracts';
import {
  type ArgumentsHost,
  BadRequestException,
  Catch,
  type ExceptionFilter,
  Inject,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Analytics } from '../analytics/analytics.js';
import { InventoryRejection } from './inventory.js';
import type { ItemRuleViolation } from './item-rules.js';

/** O recurso VIP como o plano de eventos o nomeia. */
const RECURSO = {
  agent: 'agente',
  musicKit: 'music_kit',
  statTrak: 'stattrak',
  nameTag: 'nametag',
} as const;

/** Recusas que são ruído de cliente (Item que não existe, corpo torto): o plano não as mede. */
const NOT_MEASURED = new Set(['not_found', 'invalid_body']);

/** A operação do Inventário pela requisição; `null` para as que não adicionam, editam nem restauram. */
function operationOf(request: FastifyRequest): 'adicionar' | 'editar' | 'restaurar' | null {
  if (request.method === 'PUT') return 'editar';
  if (request.method !== 'POST') return null;
  return request.url.split('?', 1)[0]?.endsWith('/restore') ? 'restaurar' : 'adicionar';
}

/** `item.stickers.0.wear: Too big` → `stickers.0.wear` (os caminhos do contrato são do Item). */
const ISSUE_PATH = /^item\.([\w.]+): /;

/**
 * Responde os erros do Inventário no formato do contrato (`InventoryError`), com o código
 * estável. O 400 do corpo fora do schema (do `StandardSchemaValidationPipe` global) vira
 * `invalid_body`, com o caminho do primeiro problema em `field`.
 */
@Catch(InventoryRejection, BadRequestException)
export class InventoryErrorsFilter implements ExceptionFilter {
  constructor(@Inject(Analytics) private readonly analytics: Analytics) {}

  catch(exception: InventoryRejection | BadRequestException, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    let body: InventoryError;
    if (exception instanceof InventoryRejection) {
      // O recurso VIP é do analytics, não do contrato: sai do corpo do erro.
      const { feature: _feature, ...violation } = exception.violation;
      body = errorBody(violation.code, violation);
      this.measure(exception.violation, host.switchToHttp().getRequest<FastifyRequest>());
    } else {
      body = invalidBody(exception);
    }
    reply.status(body.statusCode).send(body);
  }

  /** `item_recusado` (onde o editor confunde) e `recurso_vip_bloqueado` (o que desperta vontade de VIP). */
  private measure(violation: ItemRuleViolation, request: FastifyRequest): void {
    const accountId = request.carmineSession?.accountId;
    if (!accountId || NOT_MEASURED.has(violation.code)) return;
    if (violation.code === 'vip_required') {
      if (violation.feature) {
        this.analytics.capture('recurso_vip_bloqueado', {
          accountId,
          props: { recurso: RECURSO[violation.feature], origem: 'inventario' },
        });
      }
      return;
    }
    const operacao = operationOf(request);
    if (operacao) {
      this.analytics.capture('item_recusado', {
        accountId,
        props: { motivo: violation.code, operacao },
      });
    }
  }
}

function errorBody(
  code: InventoryErrorCode,
  details: Omit<InventoryError, 'statusCode' | 'code'>,
): InventoryError {
  return { statusCode: INVENTORY_ERROR_STATUS[code], code, ...details };
}

function invalidBody(exception: BadRequestException): InventoryError {
  const response = exception.getResponse();
  const messages =
    typeof response === 'object' && response !== null && 'message' in response
      ? [response.message].flat().map(String)
      : [exception.message];
  const field = messages.map((message) => ISSUE_PATH.exec(message)?.[1]).find(Boolean);
  return errorBody('invalid_body', {
    message: messages.join('; '),
    ...(field && { field }),
  });
}
