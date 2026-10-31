import { LOADOUT_ERROR_STATUS, type LoadoutError } from '@carmine/contracts';
import {
  type ArgumentsHost,
  BadRequestException,
  Catch,
  type ExceptionFilter,
  Inject,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Analytics } from '../analytics/analytics.js';
import { LoadoutRejection } from './loadouts.js';

/** `assignments.0.uid: Invalid UUID` → `assignments.0.uid`. */
const ISSUE_PATH = /^([\w.]+): /;

/**
 * Responde os erros do Loadout e dos Presets no formato do contrato (`LoadoutError`). O 400 do
 * corpo ou da query fora do schema vira `invalid_body`, com o caminho do primeiro problema.
 */
@Catch(LoadoutRejection, BadRequestException)
export class LoadoutErrorsFilter implements ExceptionFilter {
  constructor(@Inject(Analytics) private readonly analytics: Analytics) {}

  catch(exception: LoadoutRejection | BadRequestException, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    if (exception instanceof LoadoutRejection) {
      // O que desperta vontade de VIP no Loadout (plano de eventos): criar Preset e mexer num extra sem VIP.
      const accountId = host.switchToHttp().getRequest<FastifyRequest>().carmineSession?.accountId;
      const recurso =
        exception.code === 'vip_required'
          ? 'preset_extra'
          : exception.code === 'preset_read_only'
            ? 'preset_somente_leitura'
            : null;
      if (accountId && recurso) {
        this.analytics.capture('recurso_vip_bloqueado', {
          accountId,
          props: { recurso, origem: 'loadout' },
        });
      }
    }
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
