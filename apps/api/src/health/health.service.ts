import type { DependencyCheck, HealthReport } from '@carmine/contracts';

/** Verifica uma dependência: resolve se ela está no ar, rejeita com o motivo se não. */
export type DependencyProbe = () => Promise<void>;

export type DependencyProbes = Record<keyof HealthReport['checks'], DependencyProbe>;

export class HealthService {
  constructor(
    private readonly probes: DependencyProbes,
    private readonly timeoutMs: number,
  ) {}

  async check(): Promise<HealthReport> {
    const [database, valkey] = await Promise.all([
      this.run(this.probes.database),
      this.run(this.probes.valkey),
    ]);
    const allUp = database.status === 'up' && valkey.status === 'up';
    return { status: allUp ? 'ok' : 'unavailable', checks: { database, valkey } };
  }

  private async run(probe: DependencyProbe): Promise<DependencyCheck> {
    const startedAt = performance.now();
    const latencyMs = () => Math.round(performance.now() - startedAt);
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`sem resposta em ${this.timeoutMs} ms`)),
        this.timeoutMs,
      );
    });

    try {
      await Promise.race([probe(), timeout]);
      return { status: 'up', latencyMs: latencyMs() };
    } catch (error) {
      return { status: 'down', latencyMs: latencyMs(), error: describeError(error) };
    } finally {
      clearTimeout(timer);
    }
  }
}

// O pg rejeita conexões recusadas com um AggregateError sem mensagem, só com `code`.
function describeError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const code = (error as { code?: unknown }).code;
  return error.message || (typeof code === 'string' ? code : error.name);
}
