/**
 * Os hosts em que o que é de mentira (a demonstração da homologação e o provedor de pagamento falso)
 * pode rodar. A produção (`stcarmine.com`) nunca está aqui.
 */
export const SANDBOX_HOSTS: ReadonlySet<string> = new Set([
  'dev.stcarmine.com',
  'localhost',
  '127.0.0.1',
]);
