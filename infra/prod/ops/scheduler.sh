#!/bin/sh
# Roda o backup noturno todo dia às BACKUP_HOUR_UTC (padrão 6 = 03:00 de Brasília).
set -u
. "$(dirname "$0")/lib.sh"

hour="${BACKUP_HOUR_UTC:-6}"
log "agendador do backup no ar: todo dia às ${hour}:00 UTC"
while true; do
  now="$(date -u +%s)"
  today="$(date -u +%Y-%m-%d)"
  next="$(date -u -d "$today ${hour}:00:00" +%s 2>/dev/null || date -u -D '%Y-%m-%d %H:%M:%S' -d "$today ${hour}:00:00" +%s)"
  [ "$next" -gt "$now" ] || next=$((next + 86400))
  log "próximo backup em $((next - now)) s"
  sleep "$((next - now))"
  /opt/ops/backup.sh full || log "backup terminou com erro (já avisado)"
done
