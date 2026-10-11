import { LOADOUT_ERROR_STATUS, type LoadoutError } from '@carmine/contracts';
import {
  type ArgumentsHost,
  BadRequestException,
  Catch,
  type ExceptionFilter,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { LoadoutRejection } from './loadouts.js';

/** `assignments.0.uid: Invalid UUID` → `assignments.0.uid`. */
const ISSUE_PATH = /^([\w.]+): /;

/**
 * Responde os erros do Loadout e dos Presets no formato do contrato (`LoadoutError`). O 400 do
 * corpo ou da query fora do schema vira `invalid_body`, com o caminho do primeiro problema.
 */
@Catch(LoadoutRejection, BadRequestException)
export class LoadoutErrorsFilter implements ExceptionFilter {
  catch(exception: LoadoutRejection | BadRequestException, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const body = exception instanceof LoadoutRejection ? rejected(exception) : invalid(exception);
    reply.status(body.statusCode).send(body);
  }
}

function rejected({ code, message, field }: LoadoutRejection): LoadoutError {
  return { statusCode: LOADOUT_ERROR_STATUS[code], code, message, ...(field && { field }) };
}

function invalid(exception: BadRequestException): LoadoutError {
  const response = exception.getResponse();
  const messages =
    typeof response === 'object' && response !== null && 'message' in response
      ? [response.message].flat().map(String)
      : [exception.message];
  const field = messages.map((message) => ISSUE_PATH.exec(message)?.[1]).find(Boolean);
  return {
    statusCode: LOADOUT_ERROR_STATUS.invalid_body,
    code: 'invalid_body',
    message: messages.join('; '),
    ...(field && { field }),
  };
}
