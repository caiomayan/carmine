import { type ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

/**
 * Manda ao Sentry o que é falha nossa (erro inesperado ou HttpException 5xx) e deixa o Nest
 * responder como sempre. 4xx são erro do cliente: não entram. A resposta ao cliente não muda.
 */
@Catch()
export class SentryExceptionFilter extends BaseExceptionFilter {
  constructor(
    applicationRef: ConstructorParameters<typeof BaseExceptionFilter>[0],
    private readonly capture: (exception: unknown) => void,
  ) {
    super(applicationRef);
  }

  override catch(exception: unknown, host: ArgumentsHost): void {
    const isClientError = exception instanceof HttpException && exception.getStatus() < 500;
    if (!isClientError) this.capture(exception);
    super.catch(exception, host);
  }
}
