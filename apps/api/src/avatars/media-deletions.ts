import { Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { mediaDeletions } from '../database/schema.js';
import type { CdnPurger, MediaBucket, MediaStorage } from './media-storage.js';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Um arquivo a apagar do R2; `purge` (só no bucket público) também tira a URL do cache da CDN. */
export interface MediaDeletion {
  bucket: MediaBucket;
  key: string;
  purge?: boolean;
  /** Quando apagar; padrão agora. No futuro, é a retenção. */
  runAt?: Date;
}

/**
 * Enfileira na transação de quem chama (basta o banco: a exclusão de Conta pelo CLI também usa).
 * Um arquivo tem uma linha só: enfileirar de novo não duplica, o `runAt` vale o mais cedo dos dois
 * e a purga, se algum pediu.
 */
export async function enqueueMediaDeletions(
  tx: Pick<Transaction, 'insert'>,
  items: MediaDeletion[],
  now = new Date(),
): Promise<void> {
  if (items.length === 0) return;
  await tx
    .insert(mediaDeletions)
    .values(
      items.map((item) => ({
        bucket: item.bucket,
        key: item.key,
        purge: item.purge ?? false,
        runAt: item.runAt ?? now,
      })),
    )
    .onConflictDoUpdate({
      target: [mediaDeletions.bucket, mediaDeletions.key],
      set: {
        runAt: sql`least(${mediaDeletions.runAt}, excluded.run_at)`,
        purge: sql`${mediaDeletions.purge} or excluded.purge`,
      },
    });
}

/** Quantos arquivos a fila apaga por rodada. */
const BATCH = 30;
/** Espera entre tentativas: dobra a cada falha, de 30 s até 1 h. */
const BACKOFF_BASE_MS = 30_000;
const BACKOFF_MAX_MS = 60 * 60_000;

/**
 * A fila de remoção de arquivos do R2 (ADR 0022). O R2 não participa da transação do Postgres, então
 * quem troca, devolve à Steam ou exclui uma foto só **enfileira** aqui, na mesma transação; o
 * `drain` apaga com nova tentativa. Apagar é idempotente. Cada arquivo tem uma linha só (bucket e
 * chave): enfileirar de novo não duplica e, ao enfileirar, `runAt` vale o mais cedo dos dois.
 */
export class MediaDeletions {
  private readonly logger = new Logger(MediaDeletions.name);
  private draining: Promise<number> | null = null;

  constructor(
    private readonly db: Database,
    private readonly storage: MediaStorage | null,
    private readonly purger: CdnPurger,
    /** Origem pública das fotos (a URL a purgar é origem + chave); nulo: nada a purgar. */
    private readonly publicOrigin: string | null,
    private readonly now: () => Date = () => new Date(),
  ) {}

  enqueue(tx: Pick<Transaction, 'insert'>, items: MediaDeletion[]): Promise<void> {
    return enqueueMediaDeletions(tx, items, this.now());
  }

  /** Tira da fila (antes de recolocar um arquivo no ar). */
  async cancel(tx: Pick<Transaction, 'delete'>, bucket: MediaBucket, keys: string[]) {
    if (keys.length === 0) return;
    await tx
      .delete(mediaDeletions)
      .where(and(eq(mediaDeletions.bucket, bucket), inArray(mediaDeletions.key, keys)));
  }

  /** Quantos arquivos ainda esperam (a retenção conta). */
  async pending(): Promise<number> {
    const [row] = await this.db.select({ n: sql<number>`count(*)::int` }).from(mediaDeletions);
    return row?.n ?? 0;
  }

  /**
   * Apaga o que venceu. Uma rodada por vez (chamadas durante uma rodada pegam a mesma). Devolve
   * quantos arquivos saíram. Sem armazenamento configurado, não faz nada (as linhas esperam).
   */
  drain(): Promise<number> {
    if (this.storage === null) return Promise.resolve(0);
    this.draining ??= this.round(this.storage).finally(() => {
      this.draining = null;
    });
    return this.draining;
  }

  private async round(storage: MediaStorage): Promise<number> {
    let removed = 0;
    for (;;) {
      const done = await this.batch(storage);
      removed += done;
      if (done < BATCH) return removed;
    }
  }

  /** Uma leva: trava as linhas vencidas (outras instâncias pulam), apaga, purga e dá baixa. */
  private async batch(storage: MediaStorage): Promise<number> {
    return this.db.transaction(async (tx) => {
      const due = await tx
        .select()
        .from(mediaDeletions)
        .where(lte(mediaDeletions.runAt, this.now()))
        .orderBy(asc(mediaDeletions.runAt))
        .limit(BATCH)
        .for('update', { skipLocked: true });
      if (due.length === 0) return 0;

      const failures = new Map<string, string>();
      const erased = [];
      for (const row of due) {
        try {
          await storage.delete({ bucket: row.bucket, key: row.key });
          erased.push(row);
        } catch (error) {
          failures.set(row.id, (error as Error).message);
        }
      }
      const purging = erased.filter((row) => row.purge && this.publicOrigin !== null);
      if (purging.length > 0) {
        try {
          await this.purger.purge(purging.map((row) => `${this.publicOrigin}/${row.key}`));
        } catch (error) {
          // O arquivo já saiu; apagar de novo é inofensivo e a purga é tentada na próxima.
          for (const row of purging) failures.set(row.id, (error as Error).message);
        }
      }
      const done = due.filter((row) => !failures.has(row.id));
      if (done.length > 0) {
        await tx.delete(mediaDeletions).where(
          inArray(
            mediaDeletions.id,
            done.map((row) => row.id),
          ),
        );
      }
      for (const row of due.filter((r) => failures.has(r.id))) {
        const wait = Math.min(BACKOFF_BASE_MS * 2 ** row.attempts, BACKOFF_MAX_MS);
        await tx
          .update(mediaDeletions)
          .set({
            attempts: row.attempts + 1,
            lastError: failures.get(row.id) ?? null,
            runAt: new Date(this.now().getTime() + wait),
          })
          .where(eq(mediaDeletions.id, row.id));
        this.logger.warn(`Remoção de ${row.bucket}/${row.key} falhou: ${failures.get(row.id)}`);
      }
      // Só as baixas contam para continuar (as que falharam foram adiadas, não somem da frente).
      return done.length;
    });
  }
}

/** Roda a fila ao subir e no intervalo; `intervalMs` 0 desliga. Nunca rejeita. */
export class MediaDeletionJob implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(MediaDeletionJob.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly deletions: Pick<MediaDeletions, 'drain'>,
    private readonly intervalMs: number,
  ) {}

  onModuleInit(): void {
    if (this.intervalMs <= 0) return;
    void this.run();
    this.timer = setInterval(() => void this.run(), this.intervalMs);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  async run(): Promise<void> {
    try {
      await this.deletions.drain();
    } catch (error) {
      this.logger.warn(`Fila de remoção de arquivos falhou: ${(error as Error).message}`);
    }
  }
}
