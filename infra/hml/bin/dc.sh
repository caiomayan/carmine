#!/usr/bin/env bash
# `docker compose` já apontado para a release da homologação no ar (compose.yml, .env e IMAGE_TAG
# certos). Instalado em /opt/carmine-hml/bin/dc. Exemplos:
#   /opt/carmine-hml/bin/dc ps
#   /opt/carmine-hml/bin/dc logs -f api
#   /opt/carmine-hml/bin/dc logs demo-sim
set -euo pipefail
ROOT="${CARMINE_HML_ROOT:-/opt/carmine-hml}"
TAG="$(<"$ROOT/state/current.tag")"
export IMAGE_TAG="$TAG"
if grep -Eqx 'DEMO_ENABLED=true' "$ROOT/.env"; then export COMPOSE_PROFILES=demo; fi
exec docker compose -p carmine-hml --env-file "$ROOT/.env" -f "$ROOT/releases/$TAG/compose.yml" "$@"
