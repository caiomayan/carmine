#!/usr/bin/env bash
# `docker compose` já apontado para a release no ar (compose.yml, .env e IMAGE_TAG certos).
# Instalado em /opt/carmine/bin/dc. Exemplos:
#   /opt/carmine/bin/dc ps
#   /opt/carmine/bin/dc logs -f api
#   /opt/carmine/bin/dc exec backup /opt/ops/backup.sh full
set -euo pipefail
ROOT="${CARMINE_ROOT:-/opt/carmine}"
TAG="$(<"$ROOT/state/current.tag")"
export IMAGE_TAG="$TAG"
exec docker compose -p carmine --env-file "$ROOT/.env" -f "$ROOT/releases/$TAG/compose.yml" "$@"
