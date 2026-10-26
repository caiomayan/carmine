#!/usr/bin/env bash
# Aplica infra/hml/tunnel/ingress.json ao túnel `carmine-hml` gerenciado pelo painel (a rota passa a
# valer na hora). NUNCA o túnel de produção: confira o TUNNEL_ID. Opcional: dá para colar as mesmas
# regras no painel (Zero Trust > Networks > Tunnels > o túnel > Published application routes).
#
#   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... TUNNEL_ID=... infra/hml/tunnel/apply-ingress.sh
#
# O token de API precisa só da permissão Account > Cloudflare Tunnel > Edit.
set -euo pipefail
: "${CLOUDFLARE_API_TOKEN:?}" "${CLOUDFLARE_ACCOUNT_ID:?}" "${TUNNEL_ID:?}"
HERE="$(cd "$(dirname "$0")" && pwd)"
curl -fsS -X PUT \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary "@$HERE/ingress.json" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/cfd_tunnel/$TUNNEL_ID/configurations" \
  | grep -q '"success":true' && echo "Ingress aplicado." || { echo "A API recusou o ingress" >&2; exit 1; }
