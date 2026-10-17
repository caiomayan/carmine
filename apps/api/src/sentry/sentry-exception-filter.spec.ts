import { type ArgumentsHost, BadRequestException, HttpException, Logger } from '@nestjs/common';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { SentryExceptionFilter } from './sentry-exception-filter.js';

function setup() {
  const reply = vi.fn();
  const capture = vi.fn();
  const filter = new SentryExceptionFilter({ reply, isHeadersSent: () => false } as never, capture);
  const host = {
    getType: () => 'http',
    getArgByIndex: (index: number) => (index === 1 ? {} : {}),
    switchToHttp: () => ({ getResponse: () => ({}), getRequest: () => ({}) }),
  } as unknown as ArgumentsHost;
  return { filter, host, capture, reply };
}

describe('SentryExceptionFilter', () => {
  // O Nest registra o erro no log; aqui ele só atrapalha a saída.
  beforeAll(() => Logger.overrideLogger(false));

  it('captura erro inesperado e ainda responde 500', () => {
    const { filter, host, capture, reply } = setup();
    const error = new Error('quebrou');

    filter.catch(error, host);

    expect(capture).toHaveBeenCalledWith(error);
    expect(reply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ statusCode: 500 }),
      500,
    );
  });

  it('captura HttpException 5xx', () => {
    const { filter, host, capture } = setup();

    filter.catch(new HttpException('indisponível', 503), host);

    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('não captura erro do cliente (4xx)', () => {
    const { filter, host, capture, reply } = setup();

    filter.catch(new BadRequestException('inválido'), host);

    expect(capture).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalled();
  });
});
