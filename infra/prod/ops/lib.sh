#!/bin/sh
# Funções comuns do backup e da restauração. Só POSIX sh (Alpine/busybox).

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

# Avisa no Discord (DISCORD_ALERT_WEBHOOK_URL; vazio = só o log). Nunca falha o chamador.
notify() {
  log "$*"
  [ -n "${DISCORD_ALERT_WEBHOOK_URL:-}" ] || return 0
  curl -fsS -m 10 -H 'content-type: application/json' \
    -d "{\"username\":\"Carmine\",\"content\":\"$*\",\"allowed_mentions\":{\"parse\":[]}}" \
    "$DISCORD_ALERT_WEBHOOK_URL" >/dev/null 2>&1 || log "aviso ao Discord falhou"
  return 0
}

# O R2 é S3: o rclone lê a configuração do ambiente (sem arquivo com segredo no disco).
# R2_ENDPOINT é https://<id-da-conta>.r2.cloudflarestorage.com. R2_PROVIDER só muda nos testes (Minio).
r2_enabled() {
  [ -n "${R2_BUCKET:-}" ] && [ -n "${R2_ENDPOINT:-}" ] && [ -n "${R2_ACCESS_KEY_ID:-}" ] && [ -n "${R2_SECRET_ACCESS_KEY:-}" ]
}

r2_setup() {
  export RCLONE_LOG_LEVEL=ERROR
  export RCLONE_CONFIG_R2_TYPE=s3
  export RCLONE_CONFIG_R2_PROVIDER="${R2_PROVIDER:-Cloudflare}"
  export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
  export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
  export RCLONE_CONFIG_R2_ENDPOINT="$R2_ENDPOINT"
  export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
  R2_PATH="r2:${R2_BUCKET}/${R2_PREFIX:-postgres}"
}
