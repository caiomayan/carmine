#!/usr/bin/env bash
# Teste local do aceite da S09: "uma restauração de backup num banco limpo recupera os dados".
# Sobe um Postgres 18 e um S3 de mentira (rclone serve s3, no lugar do R2), migra o banco com as migrações da API,
# grava dados, faz o backup noturno de verdade (backup.sh -> "R2"), apaga tudo, restaura o
# último dump num banco novo e confere os dados. Precisa de Docker; não toca em nada de produção.
#
#   infra/prod/test/backup-restore.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
# No Git Bash do Windows o Docker precisa do caminho no formato C:/...
command -v cygpath >/dev/null && ROOT="$(cygpath -m "$ROOT")"
NET="carmine-backup-test-$$"
PG="$NET-pg"
S3="$NET-s3"
OPS_IMAGE="carmine-ops:test"
PG_IMAGE="postgres:18.6-alpine"

cleanup() { docker rm -f "$PG" "$S3" >/dev/null 2>&1 || true; docker network rm "$NET" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "== construindo a imagem de operação"
docker build -q -f "$ROOT/infra/docker/ops.Dockerfile" -t "$OPS_IMAGE" "$ROOT" >/dev/null

docker network create "$NET" >/dev/null
docker run -d --name "$PG" --network "$NET" -e POSTGRES_PASSWORD=teste -e POSTGRES_USER=carmine -e POSTGRES_DB=carmine "$PG_IMAGE" >/dev/null
docker run -d --name "$S3" --network "$NET" --entrypoint rclone "$OPS_IMAGE" serve s3 /tmp --addr :9000 --auth-key minioadmin,minioadmin123 >/dev/null
until docker exec "$PG" pg_isready -U carmine -d carmine >/dev/null 2>&1; do sleep 1; done

ops() { docker run --rm --network "$NET" \
  -e PGHOST="$PG" -e PGUSER=carmine -e PGPASSWORD=teste -e PGDATABASE=carmine \
  -e R2_PROVIDER=Other -e R2_ENDPOINT="http://$S3:9000" -e R2_BUCKET=carmine-backups \
  -e R2_ACCESS_KEY_ID=minioadmin -e R2_SECRET_ACCESS_KEY=minioadmin123 \
  --entrypoint "$1" "$OPS_IMAGE" "${@:2}"; }
psql_pg() { docker exec "$PG" psql -U carmine -Atc "$1" "${2:-carmine}"; }

echo "== criando o bucket no S3 de mentira"
until docker run --rm --network "$NET" --entrypoint sh "$OPS_IMAGE" -c \
  "RCLONE_CONFIG_M_TYPE=s3 RCLONE_CONFIG_M_PROVIDER=Other RCLONE_CONFIG_M_ACCESS_KEY_ID=minioadmin RCLONE_CONFIG_M_SECRET_ACCESS_KEY=minioadmin123 RCLONE_CONFIG_M_ENDPOINT=http://$S3:9000 rclone mkdir m:carmine-backups" >/dev/null 2>&1; do sleep 1; done

echo "== migrando o banco com as migrações da API e gravando dados"
for f in $(ls "$ROOT"/apps/api/drizzle/*.sql 2>/dev/null | sort); do
  docker exec -i "$PG" psql -U carmine -q -v ON_ERROR_STOP=1 carmine < "$f" >/dev/null
done
psql_pg "CREATE TABLE IF NOT EXISTS backup_teste (id int primary key, texto text)" >/dev/null
psql_pg "INSERT INTO backup_teste SELECT g, 'linha ' || g FROM generate_series(1, 500) g" >/dev/null
before_tables="$(psql_pg "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")"
before_rows="$(psql_pg "SELECT count(*) FROM backup_teste")"
echo "   $before_tables tabelas, $before_rows linhas de teste"

echo "== backup noturno (backup.sh full -> S3 de mentira)"
docker volume create "$NET-backups" >/dev/null
docker run --rm --network "$NET" -v "$NET-backups:/backups" \
  -e PGHOST="$PG" -e PGUSER=carmine -e PGPASSWORD=teste -e PGDATABASE=carmine \
  -e R2_PROVIDER=Other -e R2_ENDPOINT="http://$S3:9000" -e R2_BUCKET=carmine-backups \
  -e R2_ACCESS_KEY_ID=minioadmin -e R2_SECRET_ACCESS_KEY=minioadmin123 \
  --entrypoint /opt/ops/backup.sh "$OPS_IMAGE" full
docker volume rm "$NET-backups" >/dev/null

echo "== desastre: apagando o banco original"
docker exec "$PG" psql -U carmine -d postgres -qc "DROP DATABASE carmine WITH (FORCE)"

echo "== restaurando o último dump do R2 num banco novo (restore.sh latest)"
ops /opt/ops/restore.sh latest carmine_restaurado

after_tables="$(psql_pg "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'" carmine_restaurado)"
after_rows="$(psql_pg "SELECT count(*) FROM backup_teste" carmine_restaurado)"
sample="$(psql_pg "SELECT texto FROM backup_teste WHERE id = 321" carmine_restaurado)"
[ "$after_tables" = "$before_tables" ] || { echo "FALHOU: tabelas $before_tables -> $after_tables"; exit 1; }
[ "$after_rows" = "$before_rows" ] || { echo "FALHOU: linhas $before_rows -> $after_rows"; exit 1; }
[ "$sample" = "linha 321" ] || { echo "FALHOU: amostra '$sample'"; exit 1; }

echo "== restaurar por cima de um banco com tabelas tem que ser recusado"
if ops /opt/ops/restore.sh latest carmine_restaurado >/dev/null 2>&1; then echo "FALHOU: sobrescreveu um banco com dados"; exit 1; fi

echo "OK: $after_tables tabelas e $after_rows linhas restauradas num banco limpo."
