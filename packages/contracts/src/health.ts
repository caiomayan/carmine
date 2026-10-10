import { z } from 'zod';

/** Resultado da verificação de uma dependência da API (Postgres, Valkey). */
export const dependencyCheckSchema = z
  .object({
    status: z.enum(['up', 'down']),
    latencyMs: z.int().nonnegative(),
    error: z.string().optional(),
  })
  .meta({ id: 'DependencyCheck' });

export type DependencyCheck = z.infer<typeof dependencyCheckSchema>;

/** Corpo de `GET /api/health`: `ok` só quando todas as dependências estão no ar. */
export const healthReportSchema = z
  .object({
    status: z.enum(['ok', 'unavailable']),
    checks: z.object({
      database: dependencyCheckSchema,
      valkey: dependencyCheckSchema,
    }),
  })
  .meta({ id: 'HealthReport' });

export type HealthReport = z.infer<typeof healthReportSchema>;
