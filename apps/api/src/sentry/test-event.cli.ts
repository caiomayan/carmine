import { captureMessage, flush, init } from '@sentry/node';
import { loadConfig } from '../config/config.js';
import { sentryOptions } from './sentry-options.js';

/**
 * Manda um evento de teste ao Sentry da API e espera a entrega (verificação do passo a passo do
 * dono): `docker compose exec api node dist/sentry/test-event.cli.js`.
 */
const options = sentryOptions(loadConfig(process.env).sentry);
if (!options) {
  console.error('SENTRY_DSN vazio: o Sentry da API está desligado.');
  process.exit(1);
}
init(options);
captureMessage('Teste do Sentry da API (test-event.cli)', 'info');
const delivered = await flush(10_000);
console.log(
  delivered ? 'Evento entregue ao Sentry.' : 'Não deu para entregar o evento (DSN, rede?).',
);
process.exit(delivered ? 0 : 1);
