import { Logger } from '@nestjs/common';
import type { AnalyticsConfig } from '../config/config.js';
import type { AnalyticsTransport, ErasureOutcome, OutgoingEvent } from './analytics-transport.js';

type PostHogConfig = NonNullable<AnalyticsConfig['posthog']>;

/** Quantos eventos esperam na fila; passou disso, o mais antigo é descartado (analytics não segura a API). */
const MAX_QUEUE = 2000;
/** Quantos eventos vão por pedido. */
const BATCH_SIZE = 100;
/** Quantas tentativas um evento tem antes de ser descartado. */
const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 5000;

interface Queued {
  event: OutgoingEvent;
  attempts: number;
}

/**
 * O adaptador do PostHog Cloud (região UE, ADR 0021): enfileira em memória, manda em lote por `POST /batch/` a cada
 * poucos segundos, nunca bloqueia a requisição, nunca lança erro e descarta o que não conseguir mandar depois de
 * algumas tentativas. Só o servidor fala com o PostHog (o navegador nunca recebe o ID da Conta).
 */
export class PostHogTransport implements AnalyticsTransport {
  readonly mode = 'posthog' as const;
  private readonly logger = new Logger('Analytics');
  private queue: Queued[] = [];
  private flushing: Promise<void> | null = null;
  private timer: NodeJS.Timeout | undefined;
  private lastWarnAt = 0;

  constructor(
    private readonly config: PostHogConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /** Liga a descarga periódica (a API chama ao subir). */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.flush(), this.config.flushMs);
    this.timer.unref();
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  send(event: OutgoingEvent): void {
    this.queue.push({ event, attempts: 0 });
    if (this.queue.length > MAX_QUEUE) this.queue.splice(0, this.queue.length - MAX_QUEUE);
    if (this.queue.length >= BATCH_SIZE) void this.flush();
  }

  /** Manda o que está na fila; várias chamadas juntas viram uma só. Nunca rejeita. */
  flush(): Promise<void> {
    this.flushing ??= this.drain().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async drain(): Promise<void> {
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, BATCH_SIZE);
      try {
        const response = await this.fetchImpl(`${this.config.host}/batch/`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ api_key: this.config.apiKey, batch: batch.map((q) => q.event) }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
      } catch (error) {
        // Volta para a frente da fila só o que ainda tem tentativa; o resto é descartado. Tenta de novo no próximo ciclo.
        const again = batch
          .map((q) => ({ ...q, attempts: q.attempts + 1 }))
          .filter((q) => q.attempts < MAX_ATTEMPTS);
        this.queue.unshift(...again);
        this.warn(
          `PostHog não recebeu ${batch.length} eventos (${(error as Error).message}); ${batch.length - again.length} descartados`,
        );
        return;
      }
    }
  }

  /** No máximo um aviso por minuto: um PostHog fora do ar não enche o log. */
  private warn(message: string): void {
    const now = Date.now();
    if (now - this.lastWarnAt < 60_000) return;
    this.lastWarnAt = now;
    this.logger.warn(message);
  }

  /**
   * Apaga a pessoa e os eventos dela (S08, direito de exclusão): procura a pessoa pelo `distinct_id` e a remove com
   * `delete_events`. Precisa da chave pessoal e do projeto; sem eles, ou com o PostHog fora, fica pendente. O PostHog
   * apaga os eventos em lote (em geral no fim de semana).
   */
  async erasePerson(distinctId: string): Promise<ErasureOutcome> {
    const erasure = this.config.erasure;
    if (!erasure) return 'pending';
    const headers = { authorization: `Bearer ${erasure.personalApiKey}` };
    const base = `${this.config.apiHost}/api/projects/${encodeURIComponent(erasure.projectId)}/persons`;
    try {
      const found = await this.fetchImpl(`${base}/?distinct_id=${encodeURIComponent(distinctId)}`, {
        headers,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!found.ok) return 'pending';
      const body = (await found.json()) as { results?: { id?: number | string }[] };
      const person = body.results?.[0];
      if (person?.id === undefined) return 'absent';
      const removed = await this.fetchImpl(`${base}/${person.id}/?delete_events=true`, {
        method: 'DELETE',
        headers,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      return removed.ok || removed.status === 404 ? 'removed' : 'pending';
    } catch {
      return 'pending';
    }
  }
}
