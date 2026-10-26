#!/usr/bin/env bash
# Sobe SÓ o cloudflared da homologação, antes do primeiro deploy (o deploy da homologação chega pelo
# túnel de PRODUÇÃO, ssh.stcarmine.com, mas o site dev.stcarmine.com sai deste). Instalado em
# /opt/carmine-hml/bin/tunnel pelo bootstrap.sh; rode depois de colar CLOUDFLARE_TUNNEL_TOKEN no .env:
#
#   sudo /opt/carmine-hml/bin/tunnel
#
# O deploy normal adota esse contêiner (mesmo projeto, serviço e configuração). Seguro repetir.
set -euo pipefail
ROOT="${CARMINE_HML_ROOT:-/opt/carmine-hml}"
COMPOSE="$ROOT/releases/bootstrap/compose.yml"

[[ $EUID -eq 0 ]] || { echo "rode como root (sudo)" >&2; exit 1; }
[[ -f "$COMPOSE" ]] || { echo "falta $COMPOSE (rode o bootstrap.sh)" >&2; exit 1; }
[[ -f "$ROOT/.env" ]] || { echo "falta $ROOT/.env" >&2; exit 1; }
grep -Eq '^CLOUDFLARE_TUNNEL_TOKEN=.+' "$ROOT/.env" \
  || { echo "preencha CLOUDFLARE_TUNNEL_TOKEN em $ROOT/.env (sudoedit $ROOT/.env)" >&2; exit 1; }

# IMAGE_TAG só satisfaz a interpolação do arquivo; nenhuma imagem do Carmine é usada aqui.
IMAGE_TAG=bootstrap docker compose -p carmine-hml --env-file "$ROOT/.env" -f "$COMPOSE" \
  up -d --no-deps --wait --wait-timeout 90 cloudflared
echo "Túnel da homologação de pé. Confira: sudo docker ps --filter name=carmine-hml-cloudflared"
