import { Logger } from '@nestjs/common';

/** Um evento pronto para sair: o que o PostHog recebe (`/batch/`), com o `distinct_id` e o horário do fato. */
export interface OutgoingEvent {
  event: string;
  uuid: string;
  timestamp: string;
  properties: Record<string, unknown> & { distinct_id: string };
}

/** O resultado de apagar uma pessoa: apagada, nunca existiu no PostHog, ou não deu agora (fica pendente). */
export type ErasureOutcome = 'removed' | 'absent' | 'pending';

/**
 * Para onde os eventos vão. A porta {@link Analytics} valida, aplica a oposição e monta o evento; o transporte só
 * entrega, sem nunca bloquear nem lançar erro (analytics não é contabilidade: o que não sair é descartado).
 */
export interface AnalyticsTransport {
  /** `posthog` envia; `log` só registra (a homologação). */
  readonly mode: 'log' | 'posthog';
  send(event: OutgoingEvent): void;
  /** Apaga a pessoa (e os eventos) no destino; sem como, devolve `pending`. */
  erasePerson(distinctId: string): Promise<ErasureOutcome>;
  /** Esvazia a fila (ao desligar a API). */
  flush(): Promise<void>;
}

/**
 * A homologação: o evento só vai para o log da API, para o dono ver o que seria medido, e nada sai de lá para
 * ninguém. O `distinct_id` é o ID interno da Conta (um UUID aleatório), então o log não identifica ninguém fora do banco.
 */
export class LogTransport implements AnalyticsTransport {
  readonly mode = 'log' as const;
  private readonly logger = new Logger('Analytics');

  send(event: OutgoingEvent): void {
    const { distinct_id: distinctId, ...properties } = event.properties;
    this.logger.log(`${event.event} ${distinctId} ${JSON.stringify(properties)}`);
  }

  async erasePerson(distinctId: string): Promise<ErasureOutcome> {
    this.logger.log(`apagar_pessoa ${distinctId}`);
    return 'removed';
  }

  async flush(): Promise<void> {}
}
