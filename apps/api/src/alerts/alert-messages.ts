import type { ServerAlert } from './server-offline-tracker.js';

function duration(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** O texto do aviso no Discord. */
export function formatAlert(alert: ServerAlert, now: Date): string {
  if (alert.kind === 'offline') {
    return `🔴 **${alert.name}** está offline há ${duration(now.getTime() - alert.offlineSince.getTime())} (sem batimento do Carmine.Core).`;
  }
  return `🟢 **${alert.name}** voltou depois de ${duration(alert.downForMs)}.`;
}
