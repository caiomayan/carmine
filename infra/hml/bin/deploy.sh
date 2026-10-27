#!/usr/bin/env bash
# Deploy da HOMOLOGAÇÃO na VM de produção. Instalado pelo bootstrap.sh em /opt/carmine-hml/self/deploy
# (dono `deployhml`; /opt/carmine-hml/bin/deploy é um link para ele) e chamado SÓ como comando forçado da
# chave SSH do usuário `deployhml` (authorized_keys com `restrict,command="/opt/carmine-hml/bin/deploy"`):
# o pedido chega em
# $SSH_ORIGINAL_COMMAND, `sha-<40 hex>` com ` reset` opcional no fim (apaga o banco e o cache da
# homologação antes de subir).
#
# Entrada (stdin): linha 1 = usuário do GitHub, linha 2 = token (GITHUB_TOKEN do job, leitura de
# pacotes; só vale durante o job e nunca é gravado em disco), depois um tar.gz com infra/hml/ do
# commit.
#
# Autoatualização: se o deploy.sh da release difere do instalado, o instalado se troca pela versão da release
# (só depois de `bash -n`, com log dos dois sha256, de forma atômica) e roda de novo com ela; assim mudar este
# arquivo não pede mais que o dono rode o bootstrap. Vale só para a homologação (a produção tem deploy próprio,
# com usuário, chave e dono root); a confiança é a mesma do compose.yml que vem no mesmo tar.
#
# Parecido com infra/prod/bin/deploy.sh, mas só mexe no projeto `carmine-hml`:
#   - recusa subir se a VM está com pouca memória livre (a produção divide a máquina);
#   - sem dump antes de migrar (o banco é descartável; `reset` zera);
#   - o teste de fumaça roda DENTRO da pilha (o Access barra quem vem de fora);
#   - se algo não fica saudável, volta para a tag anterior.
set -euo pipefail

ROOT="${CARMINE_HML_ROOT:-/opt/carmine-hml}"
SELF="${CARMINE_HML_SELF:-$ROOT/self/deploy}"
# 1 quando este processo é a segunda passada, já com o script da release (o tar já foi extraído e a trava é a do pai).
REEXEC="${CARMINE_HML_REEXEC:-}"
PROJECT=carmine-hml
REQUEST="${SSH_ORIGINAL_COMMAND:-${1:-}}"
WAIT_TIMEOUT="${DEPLOY_WAIT_TIMEOUT:-300}"
MIN_AVAILABLE_MB="${DEPLOY_MIN_AVAILABLE_MB:-1200}"

log() { printf '[deploy-hml %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
die() { log "ERRO: $*"; exit 1; }

[[ "$REQUEST" =~ ^(sha-[0-9a-f]{40})(\ reset)?$ ]] || die "pedido inválido: '$REQUEST' (esperado sha-<40 hex> [reset])"
TAG="${BASH_REMATCH[1]}"
RESET=false
[[ -n "${BASH_REMATCH[2]}" ]] && RESET=true

if [[ "$REEXEC" != 1 ]]; then
  exec 9>"$ROOT/state/deploy.lock"
  flock -n 9 || die "outro deploy da homologação está em andamento"
fi

IFS= read -r GH_USER || die "faltou o usuário do GitHub no stdin"
IFS= read -r GH_TOKEN || die "faltou o token no stdin"
[[ "$GH_USER" =~ ^[A-Za-z0-9-]+$ ]] || die "usuário do GitHub inválido"
[[ -f "$ROOT/.env" ]] || die "$ROOT/.env não existe (veja docs/operacao/homologacao.md)"

# A produção manda: sem folga de memória, a homologação não sobe.
available_mb=$(awk '/^MemAvailable:/ { print int($2 / 1024) }' /proc/meminfo)
(( available_mb >= MIN_AVAILABLE_MB )) \
  || die "só ${available_mb} MB de memória disponível (mínimo ${MIN_AVAILABLE_MB} MB): deploy da homologação recusado para não apertar a produção"

# A demonstração liga por variável no .env (compose profile `demo`).
if grep -Eqx 'DEMO_ENABLED=true' "$ROOT/.env"; then export COMPOSE_PROFILES=demo; else unset COMPOSE_PROFILES; fi

REL="$ROOT/releases/$TAG"
if [[ "$REEXEC" != 1 ]]; then
  rm -rf "$REL"
  mkdir -p "$REL"
  tar -xz --no-same-owner --no-same-permissions --strip-components=2 -C "$REL"
fi
[[ -f "$REL/compose.yml" ]] || die "o tar não trouxe infra/hml/compose.yml"

# Autoatualização (ver o topo). Só na primeira passada: a segunda já É a versão da release.
if [[ "$REEXEC" != 1 && -f "$REL/bin/deploy.sh" ]] && ! cmp -s "$REL/bin/deploy.sh" "$SELF"; then
  new="$REL/bin/deploy.sh"
  if [[ ! -w "$(dirname "$SELF")" ]]; then
    log "AVISO: o deploy.sh desta release difere do instalado, mas $(dirname "$SELF") não é gravável por este usuário; rode o bootstrap.sh de novo na VM"
  elif [[ "$(head -n 1 "$new")" != '#!/usr/bin/env bash' ]] || (( $(wc -c <"$new") > 200000 )) || ! bash -n "$new"; then
    log "AVISO: o deploy.sh desta release não passou na verificação (shebang, tamanho, bash -n); sigo com o instalado"
  else
    log "deploy.sh da release difere do instalado: atualizando ($(sha256sum "$SELF" | cut -c1-12) -> $(sha256sum "$new" | cut -c1-12))"
    tmp="$(mktemp "$(dirname "$SELF")/.deploy.XXXXXX")"
    cp "$new" "$tmp"
    chmod 0755 "$tmp"
    cp -f "$SELF" "$SELF.anterior" 2>/dev/null || true
    mv -f "$tmp" "$SELF"
    # Segunda passada com o script novo: mesmo pedido, mesmos dados no stdin (o tar já está em $REL), trava herdada.
    # O token só passa por pipe, nunca por argumento nem disco.
    status=0
    printf '%s
%s
' "$GH_USER" "$GH_TOKEN" | CARMINE_HML_REEXEC=1 SSH_ORIGINAL_COMMAND="$REQUEST" "$SELF" || status=$?
    exit "$status"
  fi
fi

touch "$ROOT/state/pulled.tags"
PREVIOUS=""
[[ -f "$ROOT/state/current.tag" ]] && PREVIOUS="$(<"$ROOT/state/current.tag")"

dc() { # dc <tag> <args do compose...>
  local tag="$1"
  shift
  IMAGE_TAG="$tag" docker compose -p "$PROJECT" --env-file "$ROOT/.env" -f "$REL/compose.yml" "$@"
}

DOCKER_CONFIG="$(mktemp -d)"
export DOCKER_CONFIG
trap 'rm -rf "$DOCKER_CONFIG"' EXIT
printf '%s' "$GH_TOKEN" | docker login ghcr.io -u "$GH_USER" --password-stdin >/dev/null
unset GH_TOKEN

log "baixando as imagens de $TAG"
dc "$TAG" pull --quiet

if [[ "$RESET" == true ]]; then
  # Só o projeto carmine-hml (o -p manda): contêineres, redes e volumes dele. A produção não entra.
  log "reset pedido: apagando contêineres e volumes do projeto $PROJECT"
  dc "$TAG" down --volumes --remove-orphans
fi

# Fumaça: as mesmas páginas e APIs públicas do deploy de produção, pelo lado de dentro.
probe() { # probe <serviço> <porta> <caminho> <status esperado>
  for _ in $(seq 1 12); do
    if dc "$TAG" exec -T "$1" node -e "fetch('http://127.0.0.1:$2$3',{redirect:'manual'}).then((r)=>process.exit(r.status===$4?0:1),()=>process.exit(1))" 2>/dev/null; then
      log "ok  $3 -> $4"
      return 0
    fi
    sleep 5
  done
  log "FALHOU: $3 não respondeu $4"
  return 1
}
smoke() {
  local failed=0 path
  for path in / /healthz /ranking /entrar /loadout /inventario; do
    probe web 3000 "$path" 200 || failed=1
  done
  for path in /api/health /api/stats/week /api/activity/recent /api/servers; do
    probe api 3333 "$path" 200 || failed=1
  done
  probe web 3000 /pagina-que-nao-existe-smoke 404 || failed=1
  # O armazenamento de mídia de mentira (fotos de perfil), pela porta pública.
  probe media 8080 /healthz 200 || failed=1
  # E o caminho de ponta a ponta: o web repassa /avatars/ ao media (foto que não existe -> 404 do media).
  probe web 3000 /avatars/00000000-0000-4000-8000-000000000000/512.webp 404 || failed=1
  return "$failed"
}

log "subindo $TAG (migração, API, web, túnel${COMPOSE_PROFILES:+, demonstração})"
if dc "$TAG" up -d --remove-orphans --wait --wait-timeout "$WAIT_TIMEOUT" && smoke; then
  echo "$TAG" >"$ROOT/state/current.tag"
  [[ -n "$PREVIOUS" && "$PREVIOUS" != "$TAG" ]] && echo "$PREVIOUS" >"$ROOT/state/previous.tag"
  echo "$TAG" >>"$ROOT/state/pulled.tags"
  log "no ar: $TAG (anterior: ${PREVIOUS:-nenhuma})"
else
  log "ALGO NÃO FICOU SAUDÁVEL em $TAG"
  dc "$TAG" ps || true
  dc "$TAG" logs --tail 40 migrate api web demo-seed demo-sim || true
  if [[ -n "$PREVIOUS" && "$PREVIOUS" != "$TAG" && -d "$ROOT/releases/$PREVIOUS" ]]; then
    log "voltando para $PREVIOUS"
    REL="$ROOT/releases/$PREVIOUS"
    dc "$PREVIOUS" pull --quiet || true
    dc "$PREVIOUS" up -d --remove-orphans --wait --wait-timeout "$WAIT_TIMEOUT" \
      && log "rollback concluído: $PREVIOUS está no ar" \
      || log "O ROLLBACK TAMBÉM FALHOU: entre na VM (docs/operacao/homologacao.md); a produção não foi tocada"
  else
    log "não há tag anterior para voltar"
  fi
  exit 1
fi

# Faxina: só as 3 releases mais novas e as imagens que ESTA pilha baixou (as 2 últimas ficam). Nunca
# `prune -a`: as imagens de rollback da produção não são da homologação. Tag em uso (inclusive pela
# produção, se for a mesma imagem) o docker se recusa a remover.
ls -1dt "$ROOT"/releases/sha-* 2>/dev/null | tail -n +4 | xargs -r rm -rf
mapfile -t pulled < <(awk '!seen[$0]++' "$ROOT/state/pulled.tags")
keep=2
if (( ${#pulled[@]} > keep )); then
  for old in "${pulled[@]:0:${#pulled[@]}-keep}"; do
    for image in carmine-api carmine-web; do
      docker rmi "ghcr.io/caiomayan/$image:$old" >/dev/null 2>&1 || true
    done
  done
  printf '%s\n' "${pulled[@]: -keep}" >"$ROOT/state/pulled.tags"
fi
docker image prune -f >/dev/null || true
