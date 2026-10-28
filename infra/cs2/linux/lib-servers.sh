# shellcheck shell=bash
# Funções dos servidores CS2 compartilhadas pelo carmine-plugin-deploy e pelo carmine-cs2-update: quais perfis
# existem, se um servidor está vazio, se ficou saudável depois de uma troca e o alerta no Discord. Lido com
# `source`; quem lê define `log`, `die` e SCRIPT_DIR (a pasta dos scripts instalados), e pode definir ONLY
# (um perfil só), NO_WAIT e WAIT_MIN antes de chamar `wait_until_empty`.

HOME_DIR="${CARMINE_CS2_HOME:-/srv/carmine-cs2}"
ETC_DIR="${CARMINE_CS2_ETC:-/etc/carmine-cs2}"
SYSTEMCTL="${CARMINE_SYSTEMCTL:-systemctl}"
JOURNALCTL="${CARMINE_JOURNALCTL:-journalctl}"
HEALTH_TIMEOUT="${CARMINE_HEALTH_TIMEOUT:-90}"
HEALTH_STABLE="${CARMINE_HEALTH_STABLE:-15}"
A2S="${CARMINE_A2S:-$SCRIPT_DIR/a2s-players.py}"
ONLY="${ONLY:-}"
NO_WAIT="${NO_WAIT:-0}"
WAIT_MIN="${WAIT_MIN:-120}"

# Alertas: DISCORD_ALERT_WEBHOOK_URL em $ETC_DIR/alerts.env (opcional).
alert() { # alert <mensagem>
  local url=''
  if [[ -r "$ETC_DIR/alerts.env" ]]; then
    url="$(sed -n 's/^DISCORD_ALERT_WEBHOOK_URL=//p' "$ETC_DIR/alerts.env" | head -n 1 | tr -d "\"'\r")"
  fi
  [[ -n "$url" ]] || return 0
  curl -fsS --max-time 10 -H 'Content-Type: application/json' \
    -d "$(jq -n --arg c "$1" '{content: $c}')" "$url" >/dev/null 2>&1 || true
}

# Os perfis instalados, Retake primeiro.
profiles() {
  local dir name list=()
  for dir in "$HOME_DIR"/profiles/*/; do
    [[ -d "$dir" ]] || continue
    name="$(basename "$dir")"
    [[ -z "$ONLY" || "$name" == "$ONLY" ]] && list+=("$name")
  done
  [[ ${#list[@]} -gt 0 ]] || return 0
  printf '%s\n' "${list[@]}" | awk '$0 == "retake" { print "0 " $0; next } { print "1 " $0 }' | sort | cut -d' ' -f2-
}

port_of() { sed -n 's/^PORT=//p' "$HOME_DIR/profiles/$1/profile.env" 2>/dev/null | head -n 1; }

# 0 = vazio (ou desligado), 1 = há gente (ou não deu para saber: não arrisca).
is_empty() {
  local port count
  port="$(port_of "$1")"
  [[ -n "$port" ]] || return 1
  "$SYSTEMCTL" is-active --quiet "carmine-cs2@$1.service" || return 0
  count="$("$A2S" "$port" 2>/dev/null)" || return 1
  [[ "$count" == 0 ]]
}

wait_until_empty() { # 0 vazio; 75 adiado
  local name="$1" deadline
  deadline=$((SECONDS + WAIT_MIN * 60))
  while ! is_empty "$name"; do
    if ((NO_WAIT)) || ((SECONDS >= deadline)); then
      log "$name: há jogadores; adiado"
      return 75
    fi
    log "$name: esperando esvaziar (verifica a cada 30 s, até $WAIT_MIN min)"
    sleep 30
  done
}

# Saudável = o serviço de pé durante HEALTH_STABLE s, o Carmine.Core falou no log desde o início e nenhum erro de carga.
healthy() { # healthy <perfil> <desde (data para o journalctl)>
  local name="$1" since="$2" deadline text
  deadline=$((SECONDS + HEALTH_TIMEOUT))
  while ((SECONDS < deadline)); do
    if ! "$SYSTEMCTL" is-active --quiet "carmine-cs2@$name.service"; then
      sleep 2
      "$SYSTEMCTL" is-active --quiet "carmine-cs2@$name.service" || { log "$name: o serviço não ficou de pé"; return 1; }
    fi
    text="$("$JOURNALCTL" -u "carmine-cs2@$name.service" --since "$since" --no-pager -o cat 2>/dev/null || true)"
    if grep -Eiq '(failed to load|error loading|could not load|unhandled exception).*Carmine\.Core|Carmine\.Core.*(failed to load|error loading|could not load|unhandled exception)' <<<"$text"; then
      log "$name: o log mostra erro ao carregar o Carmine.Core"
      return 1
    fi
    if grep -q 'Carmine\.Core: ' <<<"$text"; then
      sleep "$HEALTH_STABLE"
      "$SYSTEMCTL" is-active --quiet "carmine-cs2@$name.service" || { log "$name: caiu logo depois de subir"; return 1; }
      return 0
    fi
    sleep 3
  done
  log "$name: o Carmine.Core não deu sinal no log em ${HEALTH_TIMEOUT}s"
  return 1
}

