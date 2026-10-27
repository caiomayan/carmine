import { randomUUID } from 'node:crypto';
import {
  ANALYTICS_EVENTS,
  ANALYTICS_PLAN_VERSION,
  ANALYTICS_UUID_NAMESPACE,
  type AnalyticsEnvironment,
  type AnalyticsEventName,
  type AnalyticsProps,
} from '@carmine/contracts/analytics';
import { Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { accounts } from '../database/schema.js';
import type { AnalyticsTransport, ErasureOutcome } from './analytics-transport.js';
import { uuidV5 } from './uuid-v5.js';

/** Quem decide se uma Conta entra na análise: a chave "Participar da análise de uso" e a anonimização. */
export interface AnalyticsParticipation {
  participates(accountId: string): Promise<boolean>;
}

/**
 * A chave "Participar da análise de uso" (direito de oposição, ADR 0021): a coluna `accounts.analytics_opt_out`
 * (padrão `false`: a Conta participa até desligar). A leitura que decide se um evento sai é guardada por pouco tempo
 * (`ttlMs`), então desligar a chave vale em até um minuto sem uma consulta por evento. Conta anonimizada nunca participa.
 */
export class AnalyticsPreferences implements AnalyticsParticipation {
  private readonly cache = new Map<string, { participates: boolean; until: number }>();

  constructor(
    private readonly db: Database,
    private readonly ttlMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  async participates(accountId: string): Promise<boolean> {
    const cached = this.cache.get(accountId);
    if (cached && cached.until > this.now()) return cached.participates;
    const [account] = await this.db
      .select({ optOut: accounts.analyticsOptOut, anonymizedAt: accounts.anonymizedAt })
      .from(accounts)
      .where(eq(accounts.id, accountId));
    const participates = !!account && !account.optOut && account.anonymizedAt === null;
    // Limita a memória: passou de alguns milhares de Contas, recomeça (é só um cache).
    if (this.cache.size >= 5000) this.cache.clear();
    this.cache.set(accountId, { participates, until: this.now() + this.ttlMs });
    return participates;
  }

  /** O que a Conta escolheu (a chave aparece ligada para quem nunca mexeu). */
  async choice(accountId: string): Promise<boolean> {
    const [account] = await this.db
      .select({ optOut: accounts.analyticsOptOut })
      .from(accounts)
      .where(eq(accounts.id, accountId));
    return !!account && !account.optOut;
  }

  /** Liga ou desliga a chave; vale na hora para este processo (o cache é descartado). */
  async setChoice(accountId: string, participate: boolean): Promise<void> {
    await this.db
      .update(accounts)
      .set({ analyticsOptOut: !participate })
      .where(eq(accounts.id, accountId));
    this.cache.delete(accountId);
  }
}

export interface CaptureInput<N extends AnalyticsEventName> {
  /** A Conta (`accounts.id`); obrigatória nos eventos de Conta, ignorada nos anônimos. */
  accountId?: string;
  props: AnalyticsProps<N>;
  /** Quando o fato aconteceu (padrão: agora). */
  at?: Date;
  /**
   * O ID natural do fato (a Denúncia, o Período VIP, o evento do plugin): reenviar o mesmo fato dá o mesmo `uuid`
   * e o PostHog não duplica. Sem ele, o `uuid` é aleatório.
   */
  naturalId?: string;
}

/**
 * A porta `Analytics` (A1, ADR 0021): o único jeito de a API emitir um evento do plano. Valida as propriedades
 * contra o schema do evento (o que está fora da lista é descartado), respeita a oposição da Conta e a anonimização,
 * monta o evento com o horário do fato e o entrega ao transporte. **Nunca bloqueia nem lança erro**: quem chama a
 * dispara depois do commit, sem esperar. Sem transporte (sem chave do PostHog), não faz nada.
 */
export class Analytics {
  private readonly logger = new Logger('Analytics');
  private lastInvalidAt = 0;

  constructor(
    private readonly transport: AnalyticsTransport | null,
    private readonly participation: AnalyticsParticipation,
    private readonly environment: AnalyticsEnvironment,
  ) {}

  /** A análise está ligada neste ambiente (o web só mostra a chave quando está). */
  get enabled(): boolean {
    return this.transport !== null;
  }

  capture<N extends AnalyticsEventName>(name: N, input: CaptureInput<N>): void {
    if (!this.transport) return;
    this.emit(this.transport, name, input).catch((error: unknown) => {
      this.logger.warn(`Evento ${name} não saiu: ${(error as Error).message}`);
    });
  }

  private async emit<N extends AnalyticsEventName>(
    transport: AnalyticsTransport,
    name: N,
    input: CaptureInput<N>,
  ): Promise<void> {
    const definition = ANALYTICS_EVENTS[name];
    const parsed = definition.properties.safeParse(input.props);
    if (!parsed.success) {
      // Sem os valores (podem ser pessoais): só quais propriedades falharam, no máximo uma vez por minuto.
      const now = Date.now();
      if (now - this.lastInvalidAt > 60_000) {
        this.lastInvalidAt = now;
        this.logger.warn(
          `Evento ${name} descartado: propriedades inválidas (${parsed.error.issues.map((i) => i.path.join('.')).join(', ')})`,
        );
      }
      return;
    }
    const anonymous = definition.identity === 'anonymous';
    if (!anonymous) {
      if (!input.accountId || !(await this.participation.participates(input.accountId))) return;
    }
    const naturalId = input.naturalId;
    transport.send({
      event: name,
      uuid: naturalId ? uuidV5(`${name}:${naturalId}`, ANALYTICS_UUID_NAMESPACE) : randomUUID(),
      timestamp: (input.at ?? new Date()).toISOString(),
      properties: {
        ...parsed.data,
        // Sem Conta, o evento sai sem identidade e sem perfil de pessoa: um ID descartável por evento.
        distinct_id: anonymous ? randomUUID() : (input.accountId as string),
        ...(anonymous && { $process_person_profile: false }),
        versao_plano: ANALYTICS_PLAN_VERSION,
        ambiente: this.environment,
        origem_evento: definition.origin,
        $lib: 'carmine-api',
        // O IP que o PostHog veria é o do nosso servidor: sem geolocalização, para não sujar o país.
        $geoip_disable: true,
      },
    });
  }

  /**
   * Apaga a pessoa e os eventos dela no destino (a anonimização da Conta, S08). `off`: não há análise ligada, nada a
   * apagar; `pending`: não deu agora (sem a chave de gestão ou o PostHog fora), o Dono apaga à mão.
   */
  async erasePerson(accountId: string): Promise<ErasureOutcome | 'off'> {
    if (!this.transport) return 'off';
    return this.transport.erasePerson(accountId);
  }

  /** Esvazia a fila de envio (ao desligar a API). */
  async flush(): Promise<void> {
    await this.transport?.flush();
  }
}
