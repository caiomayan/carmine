#!/usr/bin/env bash
# Sobe SÓ o cloudflared, antes do primeiro deploy. O deploy chega à VM pelo próprio túnel
# (SSH em ssh.stcarmine.com), então no primeiro deploy o túnel já precisa estar de pé.
# Instalado em /opt/carmine/bin/tunnel pelo bootstrap.sh; rode depois de preencher o .env
# (CLOUDFLARE_TUNNEL_TOKEN e as senhas, que o compose exige para interpolar o arquivo):
#
#   sudo /opt/carmine/bin/tunnel
#
# O deploy normal adota esse contêiner: o projeto (`carmine`), o serviço e a configuração do
# cloudflared são os mesmos (a tag das imagens não entra nela), então o `up` seguinte o deixa
# como está, sem reiniciar o túnel no meio da sessão SSH do próprio deploy. Seguro repetir.
set -euo pipefail
ROOT="${CARMINE_ROOT:-/opt/carmine}"
COMPOSE="$ROOT/releases/bootstrap/compose.yml"

[[ $EUID -eq 0 ]] || { echo "rode como root (sudo)" >&2; exit 1; }
[[ -f "$COMPOSE" ]] || { echo "falta $COMPOSE (rode o bootstrap.sh)" >&2; exit 1; }
[[ -f "$ROOT/.env" ]] || { echo "falta $ROOT/.env (sudoedit $ROOT/.env)" >&2; exit 1; }
grep -Eq '^CLOUDFLARE_TUNNEL_TOKEN=.+' "$ROOT/.env" \
  || { echo "preencha CLOUDFLARE_TUNNEL_TOKEN em $ROOT/.env" >&2; exit 1; }

# IMAGE_TAG só satisfaz a interpolação do arquivo; nenhuma imagem do Carmine é usada aqui.
IMAGE_TAG=bootstrap docker compose -p carmine --env-file "$ROOT/.env" -f "$COMPOSE" \
  up -d --no-deps --wait --wait-timeout 90 cloudflared
echo "Túnel de pé. Confira: sudo docker ps --filter name=cloudflared"
