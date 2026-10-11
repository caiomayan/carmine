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
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { InventoryRejection } from './inventory.js';

/** `item.stickers.0.wear: Too big` → `stickers.0.wear` (os caminhos do contrato são do Item). */
const ISSUE_PATH = /^item\.([\w.]+): /;

/**
 * Responde os erros do Inventário no formato do contrato (`InventoryError`), com o código
 * estável. O 400 do corpo fora do schema (do `StandardSchemaValidationPipe` global) vira
 * `invalid_body`, com o caminho do primeiro problema em `field`.
 */
@Catch(InventoryRejection, BadRequestException)
export class InventoryErrorsFilter implements ExceptionFilter {
  catch(exception: InventoryRejection | BadRequestException, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const body =
      exception instanceof InventoryRejection
        ? errorBody(exception.violation.code, exception.violation)
        : invalidBody(exception);
    reply.status(body.statusCode).send(body);
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
