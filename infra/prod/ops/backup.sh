#!/bin/sh
# Backup do Postgres: pg_dump em formato custom (já comprimido), conferido com pg_restore --list
# antes de valer, copiado para o R2 e podado pela retenção.
#
#   backup.sh          noturno: grava em /backups, envia ao R2 e poda lá (BACKUP_RETENTION_DAYS)
#   backup.sh local    antes de um deploy: só grava em /backups
#
# Variáveis: PGHOST PGUSER PGPASSWORD PGDATABASE; R2_* (vazio: não envia, e o noturno avisa);
# BACKUP_DIR (/backups), BACKUP_KEEP_LOCAL (3), BACKUP_RETENTION_DAYS (30),
# BACKUP_HEARTBEAT_URL (opcional: um ping de "deu certo" para um monitor de cron).
set -eu
. "$(dirname "$0")/lib.sh"

mode="${1:-full}"
dir="${BACKUP_DIR:-/backups}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$dir/carmine-$stamp.dump"

fail() { trap - EXIT; notify "🔴 Backup do Postgres FALHOU: $*"; exit 1; }
trap 'fail "erro inesperado na linha $LINENO"' EXIT

mkdir -p "$dir"
log "pg_dump de $PGDATABASE em $PGHOST"
pg_dump -Fc -Z 6 -f "$file.partial" || fail "pg_dump"
pg_restore --list "$file.partial" >/dev/null || fail "o dump gerado não passou no pg_restore --list"
mv "$file.partial" "$file"
(cd "$dir" && sha256sum "carmine-$stamp.dump" > "carmine-$stamp.dump.sha256")
log "dump pronto: $file ($(du -h "$file" | cut -f1))"

# Mantém só os BACKUP_KEEP_LOCAL mais novos no volume.
keep="${BACKUP_KEEP_LOCAL:-3}"
ls -1t "$dir"/carmine-*.dump 2>/dev/null | tail -n +"$((keep + 1))" | while read -r old; do
  rm -f "$old" "$old.sha256"
done

if [ "$mode" = "local" ]; then
  trap - EXIT
  exit 0
fi

r2_enabled || fail "R2 não configurado (R2_BUCKET, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY); o dump ficou só no volume"
r2_setup
rclone copyto --s3-no-head "$file" "$R2_PATH/carmine-$stamp.dump" || fail "envio ao R2"
rclone copyto --s3-no-head "$file.sha256" "$R2_PATH/carmine-$stamp.dump.sha256" || fail "envio do sha256 ao R2"
# Confere que o objeto chegou com o tamanho certo.
rclone check "$dir" "$R2_PATH" --one-way --size-only --include "carmine-$stamp.dump" || fail "o objeto no R2 não confere"
rclone delete "$R2_PATH" --min-age "${BACKUP_RETENTION_DAYS:-30}d" || log "poda da retenção falhou (não fatal)"

log "backup concluído: carmine-$stamp.dump"
if [ -n "${BACKUP_HEARTBEAT_URL:-}" ]; then
  curl -fsS -m 10 "$BACKUP_HEARTBEAT_URL" >/dev/null 2>&1 || log "ping de heartbeat falhou"
fi
trap - EXIT
