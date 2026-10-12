import { STAFF_ERROR_STATUS, type StaffError, type StaffErrorCode } from '@carmine/contracts';
import {
  type ArgumentsHost,
  BadRequestException,
  Catch,
  type ExceptionFilter,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';

/** Uma recusa do painel da Staff, com o código estável do contrato. */
export class StaffRejection extends Error {
  constructor(
    readonly code: StaffErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'StaffRejection';
  }
}

/**
 * Responde os erros do painel da Staff no formato do contrato (`StaffError`). O 400 do corpo fora
 * do schema (do `StandardSchemaValidationPipe` global) vira `invalid_body`.
 */
@Catch(StaffRejection, BadRequestException)
export class StaffErrorsFilter implements ExceptionFilter {
  catch(exception: StaffRejection | BadRequestException, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const body: StaffError =
      exception instanceof StaffRejection
        ? {
            statusCode: STAFF_ERROR_STATUS[exception.code],
            code: exception.code,
            message: exception.message,
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
