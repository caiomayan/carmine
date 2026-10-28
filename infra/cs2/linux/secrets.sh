#!/usr/bin/env bash
# Grava os segredos dos servidores CS2 SEM passar pelo histórico do shell, por argumento de comando nem por chat:
# o valor é digitado (ou colado) sem eco e vai direto para o arquivo de ambiente em /etc/carmine-cs2 (0600 root).
# Instalado em /usr/local/sbin/carmine-secrets pelo install.sh.
#
#   carmine-secrets profile <perfil>   chave de Servidor Carmine e GSLT do perfil (Enter mantém o que já está)
#   carmine-secrets gslt <perfil>      só o GSLT (troca de token banido) e reinicia SÓ esse servidor
#   carmine-secrets alerts             webhook do Discord dos alertas da VPS (atualização do CS2, entrega do plugin)
#   carmine-secrets mirror             espelho privado dos terceiros (R2): URL do bucket e o token de LEITURA
#   carmine-secrets show               quais segredos já estão preenchidos (só os 4 últimos caracteres)
#
# Sem terminal (testes, ou `printf '%s\n' valor | carmine-secrets ...`), lê da entrada padrão, uma linha por campo.
set -euo pipefail

ETC_DIR="${CARMINE_CS2_ETC:-/etc/carmine-cs2}"
SYSTEMCTL="${CARMINE_SYSTEMCTL:-systemctl}"

die() { echo "ERRO: $*" >&2; exit 1; }
usage() { sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | sed -e '$d' -e 's/^# \{0,1\}//'; }

# Mesmas regras do prestart.sh: o valor entra em JSON e cfg sem escape, então só caracteres seguros.
RE_API_KEY='^[A-Za-z0-9._~+/=-]+$'
RE_GSLT='^[A-Za-z0-9]+$'
RE_WEBHOOK='^https://(discord|discordapp)\.com/api/webhooks/[0-9]+/[A-Za-z0-9_-]+$'
RE_MIRROR_URL='^https://[A-Za-z0-9.-]+(:[0-9]+)?/[A-Za-z0-9._-]+$'
RE_MIRROR_ID='^[A-Za-z0-9]+$'

# prompt <rótulo> <expressão> [atual?]: devolve o valor em REPLY ("" = manter). Nada é impresso com o valor.
prompt() {
  local label="$1" pattern="$2" current="${3:-}" hint=''
  [[ -n "$current" ]] && hint=" (Enter mantém ...${current: -4})"
  while true; do
    if [[ -t 0 ]]; then
      read -r -s -p "$label$hint: " REPLY
      echo >&2
    else
      IFS= read -r REPLY || REPLY=''
    fi
    REPLY="${REPLY//$'\r'/}"
    if [[ -z "$REPLY" ]]; then
      [[ -n "$current" ]] && return 0
      [[ -t 0 ]] || die "$label: valor vazio"
      echo "  vazio; digite o valor" >&2
      continue
    fi
    [[ "$REPLY" =~ $pattern ]] && return 0
    [[ -t 0 ]] || die "$label: formato inválido"
    echo "  formato inválido; tente de novo" >&2
  done
}

get_kv() { # get_kv <arquivo> <CHAVE>
  [[ -r "$1" ]] || return 0
  sed -n "s/^$2=//p" "$1" | head -n 1 | tr -d "\"'"
}

# set_kv <arquivo> <CHAVE> <valor>: troca (ou acrescenta) a linha, mantendo o resto, de forma atômica e 0600.
# O valor viaja por variável de ambiente, nunca por argumento.
set_kv() {
  local file="$1" key="$2" tmp
  [[ -d "$ETC_DIR" ]] || die "$ETC_DIR não existe (rode o install.sh)"
  (
    umask 077
    tmp="$(mktemp "$file.XXXXXX")"
    VALUE="$3" KEY="$key" awk '
      BEGIN { done = 0; line = ENVIRON["KEY"] "=" ENVIRON["VALUE"] }
      index($0, ENVIRON["KEY"] "=") == 1 { if (!done) { print line; done = 1 } next }
      { print }
      END { if (!done) print line }
    ' "$file" 2>/dev/null >"$tmp" || VALUE="$3" KEY="$key" awk 'BEGIN { print ENVIRON["KEY"] "=" ENVIRON["VALUE"] }' >"$tmp"
    chmod 0600 "$tmp"
    mv -f "$tmp" "$file"
  )
}

profile_file() {
  [[ "${1:-}" =~ ^[a-z0-9-]+$ ]] || die "informe o perfil (retake, deathmatch...)"
  [[ -f "$ETC_DIR/$1.env" ]] || die "$ETC_DIR/$1.env não existe (rode o install.sh, etapa services)"
  echo "$ETC_DIR/$1.env"
}

cmd="${1:-}"
shift || true
case "$cmd" in
  profile)
    file="$(profile_file "${1:-}")"
    prompt "Chave de Servidor Carmine de $1" "$RE_API_KEY" "$(get_kv "$file" CARMINE_API_KEY)"
    [[ -z "$REPLY" ]] || set_kv "$file" CARMINE_API_KEY "$REPLY"
    prompt "GSLT de $1" "$RE_GSLT" "$(get_kv "$file" CS2_GSLT)"
    [[ -z "$REPLY" ]] || set_kv "$file" CS2_GSLT "$REPLY"
    echo "$1: gravado em $file. Suba com: systemctl start carmine-cs2@$1 (ou carmine-cs2.target)"
    ;;
  gslt)
    file="$(profile_file "${1:-}")"
    prompt "Novo GSLT de $1" "$RE_GSLT"
    set_kv "$file" CS2_GSLT "$REPLY"
    if "$SYSTEMCTL" is-active --quiet "carmine-cs2@$1.service"; then
      "$SYSTEMCTL" restart "carmine-cs2@$1.service"
      echo "$1: GSLT trocado e só esse servidor foi reiniciado"
    else
      echo "$1: GSLT trocado (o servidor está parado; suba-o quando quiser)"
    fi
    ;;
  alerts)
    file="$ETC_DIR/alerts.env"
    prompt "Webhook do Discord" "$RE_WEBHOOK" "$(get_kv "$file" DISCORD_ALERT_WEBHOOK_URL)"
    [[ -z "$REPLY" ]] || set_kv "$file" DISCORD_ALERT_WEBHOOK_URL "$REPLY"
    echo "alertas: gravado em $file"
    ;;
  mirror)
    file="$ETC_DIR/mirror.env"
    prompt "URL do bucket (https://<conta>.r2.cloudflarestorage.com/<bucket>)" "$RE_MIRROR_URL" "$(get_kv "$file" MIRROR_URL)"
    [[ -z "$REPLY" ]] || set_kv "$file" MIRROR_URL "$REPLY"
    prompt "Access Key ID (token de LEITURA)" "$RE_MIRROR_ID" "$(get_kv "$file" MIRROR_ACCESS_KEY_ID)"
    [[ -z "$REPLY" ]] || set_kv "$file" MIRROR_ACCESS_KEY_ID "$REPLY"
    prompt "Secret Access Key" "$RE_MIRROR_ID" "$(get_kv "$file" MIRROR_SECRET_ACCESS_KEY)"
    [[ -z "$REPLY" ]] || set_kv "$file" MIRROR_SECRET_ACCESS_KEY "$REPLY"
    echo "espelho: gravado em $file"
    ;;
  show)
    show() { # show <rótulo> <arquivo> <CHAVE>
      local v
      v="$(get_kv "$2" "$3")"
      if [[ -n "$v" ]]; then printf '  %-28s preenchido (...%s)\n' "$1" "${v: -4}"; else printf '  %-28s FALTA\n' "$1"; fi
    }
    for env_file in "$ETC_DIR"/*.env; do
      name="$(basename "$env_file" .env)"
      case "$name" in
        alerts) show "alertas (Discord)" "$env_file" DISCORD_ALERT_WEBHOOK_URL ;;
        mirror) show "espelho (R2)" "$env_file" MIRROR_SECRET_ACCESS_KEY ;;
        *)
          show "$name: chave do servidor" "$env_file" CARMINE_API_KEY
          show "$name: GSLT" "$env_file" CS2_GSLT
          ;;
      esac
    done
    ;;
  -h | --help | '') usage ;;
  *) usage >&2; exit 2 ;;
esac
