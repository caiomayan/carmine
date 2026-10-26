import { steamId64Schema } from '@carmine/contracts';

/**
 * A demonstração (contas, servidores e partidas fictícios) existe só na homologação. A imagem da API
 * é a mesma da produção, então a trava é em tempo de execução e tem quatro chaves; todas precisam
 * estar certas, e a produção não tem nenhuma delas:
 *
 *   1. `CARMINE_DEMO=homologacao` (só o compose da homologação põe);
 *   2. `PUBLIC_WEB_URL` num host de homologação (nunca stcarmine.com, nem um valor omitido);
 *   3. `SENTRY_ENVIRONMENT` diferente de `production`;
 *   4. `DEMO_SEED_SECRET` (sorteado no `.env` da homologação; deriva as chaves dos servidores
 *      fictícios, então sem ele nem o simulador autentica).
 *
 * Além disso o seed recusa um banco com Servidores Carmine de verdade ({@link assertDemoDatabase}).
 */
export const DEMO_ALLOWED_HOSTS: ReadonlySet<string> = new Set([
  'dev.stcarmine.com',
  'localhost',
  '127.0.0.1',
]);

export class DemoNotAllowed extends Error {
  constructor(reason: string) {
    super(
      `Demonstração recusada: ${reason}. Ela só roda na homologação (docs/operacao/homologacao.md).`,
    );
  }
}

export interface DemoSettings {
  /** Deriva as chaves dos servidores fictícios. */
  secret: string;
  /** SteamID64 do dono, que ganha a demonstração na própria Conta; nulo se não informado. */
  ownerSteamId: string | null;
  publicWebUrl: string;
}

type Env = Readonly<Record<string, string | undefined>>;

/** As configurações da demonstração, ou {@link DemoNotAllowed} se o ambiente não é de homologação. */
export function demoSettings(env: Env): DemoSettings {
  if (env.CARMINE_DEMO !== 'homologacao') {
    throw new DemoNotAllowed('CARMINE_DEMO não é "homologacao"');
  }
  const publicWebUrl = (env.PUBLIC_WEB_URL ?? '').trim();
  let host: string;
  try {
    host = new URL(publicWebUrl).hostname;
  } catch {
    throw new DemoNotAllowed('PUBLIC_WEB_URL ausente ou inválida');
  }
  if (!DEMO_ALLOWED_HOSTS.has(host)) {
    throw new DemoNotAllowed(`PUBLIC_WEB_URL aponta para ${host}`);
  }
  if ((env.SENTRY_ENVIRONMENT ?? '').trim().toLowerCase() === 'production') {
    throw new DemoNotAllowed('SENTRY_ENVIRONMENT é production');
  }
  const secret = (env.DEMO_SEED_SECRET ?? '').trim();
  if (secret.length < 32) {
    throw new DemoNotAllowed('DEMO_SEED_SECRET ausente ou curto (mínimo 32 caracteres)');
  }
  const owner = (env.DEMO_OWNER_STEAM_ID ?? '').trim();
  if (owner !== '' && !steamId64Schema.safeParse(owner).success) {
    throw new DemoNotAllowed('DEMO_OWNER_STEAM_ID não é um SteamID64 de conta individual');
  }
  return { secret, ownerSteamId: owner === '' ? null : owner, publicWebUrl };
}

/**
 * Um banco com Servidor Carmine em operação que não é da demonstração é um banco de verdade: o
 * seed não encosta nele.
 */
export function assertDemoDatabase(
  operatingServerNames: readonly string[],
  demoServerNames: ReadonlySet<string>,
): void {
  const foreign = operatingServerNames.filter((name) => !demoServerNames.has(name));
  if (foreign.length > 0) {
    throw new DemoNotAllowed(
      `o banco tem Servidores Carmine que não são da demonstração (${foreign.join(', ')})`,
    );
  }
}
