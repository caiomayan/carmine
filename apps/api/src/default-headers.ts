import type { NestFastifyApplication } from '@nestjs/platform-fastify';

/**
 * Cabeçalhos de toda resposta da API, postos antes de qualquer handler (então valem também para
 * 404, 401 e 429): nada daqui deve ficar em cache de proxy ou do navegador (sessão, Loadout,
 * presença ao vivo), e o navegador não adivinha o tipo do conteúdo. Uma rota que precise de
 * outro `cache-control` o troca no próprio handler; o SSE já escreve o dele (`no-cache,
 * no-transform`) por cima.
 */
export function registerDefaultHeaders(app: NestFastifyApplication): void {
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequest', (_request, reply, done) => {
      reply.header('cache-control', 'no-store');
      reply.header('x-content-type-options', 'nosniff');
      done();
    });
}
