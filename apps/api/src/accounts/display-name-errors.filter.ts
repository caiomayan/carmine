import { DISPLAY_NAME_ERROR_STATUS, type DisplayNameError } from '@carmine/contracts';
import {
  type ArgumentsHost,
  BadRequestException,
  Catch,
  type ExceptionFilter,
  Inject,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Analytics } from '../analytics/analytics.js';
import { DisplayNameRejected } from './display-names.js';

/**
 * Responde as recusas da troca de nome no formato do contrato (`DisplayNameError`). O 400 do
 * corpo fora do schema vira `invalid_body`.
 */
@Catch(DisplayNameRejected, BadRequestException)
export class DisplayNameErrorsFilter implements ExceptionFilter {
  constructor(@Inject(Analytics) private readonly analytics: Analytics) {}

  catch(exception: DisplayNameRejected | BadRequestException, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    if (exception instanceof DisplayNameRejected && exception.code !== 'invalid_body') {
      // Só o motivo da recusa (nunca o nome tentado): o filtro de palavras recusa demais? o prazo atrapalha?
      const accountId = host.switchToHttp().getRequest<FastifyRequest>().carmineSession?.accountId;
      if (accountId) {
        this.analytics.capture('nome_exibicao_recusado', {
          accountId,
          props: { motivo: exception.code },
        });
      }
    }
    const body: DisplayNameError =
      exception instanceof DisplayNameRejected
        ? {
            statusCode: DISPLAY_NAME_ERROR_STATUS[exception.code],
            code: exception.code,
            message: exception.message,
            ...(exception.nextChangeAt && { nextChangeAt: exception.nextChangeAt.toISOString() }),
          }
        : {
            statusCode: DISPLAY_NAME_ERROR_STATUS.invalid_body,
            code: 'invalid_body',
            message: exception.message,
          };
    reply.status(body.statusCode).send(body);
  }
}
