export interface TrackedServer {
  id: string;
  name: string;
  state: 'online' | 'full' | 'offline';
}

export type ServerAlert =
  | { kind: 'offline'; serverId: string; name: string; offlineSince: Date }
  | { kind: 'recovered'; serverId: string; name: string; downForMs: number };

interface Outage {
  since: Date;
  alerted: boolean;
}

/**
 * Transforma a lista ao vivo em avisos: um Servidor Carmine offline por `confirmAfterMs`
 * seguidos gera um aviso (uma vez por queda), e voltar depois de avisado gera o aviso de volta.
 * A presença já marca offline após 45 s sem batimento; a confirmação extra evita alerta por troca
 * de mapa ou reinício rápido. Estado em memória: depois de um reinício da API a contagem
 * recomeça, e um servidor que continua fora volta a avisar uma vez.
 */
export class ServerOfflineTracker {
  private readonly outages = new Map<string, Outage>();

  constructor(private readonly options: { confirmAfterMs: number }) {}

  observe(servers: TrackedServer[], now: Date): ServerAlert[] {
    const alerts: ServerAlert[] = [];
    const present = new Set(servers.map((server) => server.id));
    for (const id of this.outages.keys()) {
      if (!present.has(id)) this.outages.delete(id);
    }

    for (const server of servers) {
      const outage = this.outages.get(server.id);
      if (server.state === 'offline') {
        if (!outage) {
          this.outages.set(server.id, { since: now, alerted: false });
        } else if (
          !outage.alerted &&
          now.getTime() - outage.since.getTime() >= this.options.confirmAfterMs
        ) {
          outage.alerted = true;
          alerts.push({
            kind: 'offline',
            serverId: server.id,
            name: server.name,
            offlineSince: outage.since,
          });
        }
        continue;
      }
      if (outage) {
        this.outages.delete(server.id);
        if (outage.alerted) {
          alerts.push({
            kind: 'recovered',
            serverId: server.id,
            name: server.name,
            downForMs: now.getTime() - outage.since.getTime(),
          });
        }
      }
    }
    return alerts;
  }
}
