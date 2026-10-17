#!/bin/sh
# Restaura um dump num banco NOVO (nunca por cima de um que já tem tabelas).
#
#   restore.sh <origem> <banco-destino>
#
# <origem>: caminho de um .dump, "latest" (o mais novo do R2) ou "r2:<nome>.dump".
# <banco-destino>: criado se não existir; se já tiver tabelas, o script para.
# Variáveis: PGHOST PGUSER PGPASSWORD; R2_* para origens do R2.
set -eu
. "$(dirname "$0")/lib.sh"

[ $# -eq 2 ] || { echo "uso: restore.sh <caminho.dump|latest|r2:nome.dump> <banco-destino>" >&2; exit 2; }
source="$1"
target="$2"

case "$source" in
  latest|r2:*)
    r2_enabled || { echo "R2 não configurado" >&2; exit 1; }
    r2_setup
    if [ "$source" = latest ]; then
      name="$(rclone lsf "$R2_PATH" --include 'carmine-*.dump' | sort | tail -n 1)"
      [ -n "$name" ] || { echo "nenhum dump no R2" >&2; exit 1; }
    else
      name="${source#r2:}"
    fi
    dest="/tmp/restore-$name"
    log "baixando $name do R2"
    rclone copyto "$R2_PATH/$name" "$dest"
    if rclone copyto "$R2_PATH/$name.sha256" "$dest.sha256" 2>/dev/null; then
      (cd /tmp && sed "s#carmine-#restore-carmine-#" "$dest.sha256" | sha256sum -c -) || { echo "sha256 não confere" >&2; exit 1; }
    fi
    file="$dest"
    ;;
  *) file="$source" ;;
esac

[ -f "$file" ] || { echo "arquivo não encontrado: $file" >&2; exit 1; }
pg_restore --list "$file" >/dev/null || { echo "dump ilegível" >&2; exit 1; }

if ! psql -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname = '$target'" | grep -q 1; then
  log "criando o banco $target"
  createdb "$target"
fi
tables="$(psql -d "$target" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema')")"
[ "$tables" = 0 ] || { echo "o banco $target já tem tabelas ($tables): use um banco vazio" >&2; exit 1; }

log "restaurando $file em $target"
pg_restore --no-owner --no-privileges --exit-on-error -d "$target" "$file"

log "restaurado. Tabelas por número de linhas:"
psql -d "$target" -Atc "SELECT format('%s.%s', schemaname, relname) || ': ' || n_live_tup FROM pg_stat_user_tables ORDER BY relname"
psql -d "$target" -Atc "ANALYZE" >/dev/null
log "pronto (ANALYZE feito)."
