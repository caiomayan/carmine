#!/usr/bin/env bash
# Deploy na VM de produção. Instalado em /opt/carmine/bin/deploy (dono root) pelo bootstrap.sh e
# chamado SÓ como comando forçado da chave SSH do usuário `deploy` (authorized_keys com
# `restrict,command="/opt/carmine/bin/deploy"`): a tag chega em $SSH_ORIGINAL_COMMAND.
#
# Entrada (stdin): linha 1 = usuário do GitHub, linha 2 = token (GITHUB_TOKEN do job, leitura de
# pacotes; só vale durante o job e nunca é gravado em disco), depois um tar.gz com infra/prod/
# do commit que está sendo implantado.
#
# O que faz: extrai a release, entra no GHCR, baixa as imagens, faz um dump local do banco, sobe
# tudo com migração (docker compose up --wait) e, se alguma coisa não ficar saudável, volta para a
# tag anterior. Migrações só andam para a frente: o rollback troca as imagens, não desfaz o
# schema (docs/operacao/deploy-e-rollback.md).
set -euo pipefail

ROOT="${CARMINE_ROOT:-/opt/carmine}"
TAG="${SSH_ORIGINAL_COMMAND:-${1:-}}"
WAIT_TIMEOUT="${DEPLOY_WAIT_TIMEOUT:-240}"

log() { printf '[deploy %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
die() { log "ERRO: $*"; exit 1; }

[[ "$TAG" =~ ^sha-[0-9a-f]{40}$ ]] || die "tag inválida: '$TAG' (esperado sha-<40 hex>)"

exec 9>"$ROOT/state/deploy.lock"
flock -n 9 || die "outro deploy está em andamento"

IFS= read -r GH_USER || die "faltou o usuário do GitHub no stdin"
IFS= read -r GH_TOKEN || die "faltou o token no stdin"
[[ "$GH_USER" =~ ^[A-Za-z0-9-]+$ ]] || die "usuário do GitHub inválido"

[[ -f "$ROOT/.env" ]] || die "$ROOT/.env não existe (veja docs/operacao/checklist-do-dono.md)"

REL="$ROOT/releases/$TAG"
rm -rf "$REL"
mkdir -p "$REL"
tar -xz --no-same-owner --no-same-permissions --strip-components=2 -C "$REL"
[[ -f "$REL/compose.yml" ]] || die "o tar não trouxe infra/prod/compose.yml"

if [[ -f "$REL/bin/deploy.sh" ]] && ! cmp -s "$REL/bin/deploy.sh" "$ROOT/bin/deploy"; then
  log "AVISO: o deploy.sh desta release difere do instalado em $ROOT/bin/deploy; rode o bootstrap.sh de novo na VM quando puder"
fi

PREVIOUS=""
[[ -f "$ROOT/state/current.tag" ]] && PREVIOUS="$(<"$ROOT/state/current.tag")"

dc() { # dc <tag> <args do compose...>
  local tag="$1"
  shift
  IMAGE_TAG="$tag" docker compose -p carmine --env-file "$ROOT/.env" -f "$REL/compose.yml" "$@"
}

DOCKER_CONFIG="$(mktemp -d)"
export DOCKER_CONFIG
trap 'rm -rf "$DOCKER_CONFIG"' EXIT
printf '%s' "$GH_TOKEN" | docker login ghcr.io -u "$GH_USER" --password-stdin >/dev/null
unset GH_TOKEN

log "baixando as imagens de $TAG"
dc "$TAG" pull --quiet

if [[ -n "$PREVIOUS" ]] && docker inspect carmine-postgres-1 >/dev/null 2>&1; then
  log "dump local do banco antes de migrar"
  dc "$TAG" run --rm --no-deps --entrypoint /opt/ops/backup.sh backup local || die "o dump antes do deploy falhou; nada foi alterado"
fi

log "subindo $TAG (migração, API, web, túnel)"
if dc "$TAG" up -d --remove-orphans --wait --wait-timeout "$WAIT_TIMEOUT"; then
  echo "$TAG" >"$ROOT/state/current.tag"
  [[ -n "$PREVIOUS" && "$PREVIOUS" != "$TAG" ]] && echo "$PREVIOUS" >"$ROOT/state/previous.tag"
  log "no ar: $TAG (anterior: ${PREVIOUS:-nenhuma})"
else
  log "ALGO NÃO FICOU SAUDÁVEL em $TAG"
  dc "$TAG" ps || true
  dc "$TAG" logs --tail 40 migrate api web || true
  if [[ -n "$PREVIOUS" && "$PREVIOUS" != "$TAG" ]]; then
    log "voltando para $PREVIOUS"
    if [[ -d "$ROOT/releases/$PREVIOUS" ]]; then
      REL="$ROOT/releases/$PREVIOUS"
      dc "$PREVIOUS" pull --quiet || true
      dc "$PREVIOUS" up -d --remove-orphans --wait --wait-timeout "$WAIT_TIMEOUT" \
        && log "rollback concluído: $PREVIOUS está no ar" \
        || log "O ROLLBACK TAMBÉM FALHOU: entre na VM (docs/operacao/deploy-e-rollback.md)"
    else
      log "a release $PREVIOUS não está mais em $ROOT/releases; faça o rollback por workflow_dispatch"
    fi
  else
    log "não há tag anterior para voltar"
  fi
  exit 1
fi

# Faxina: só as 5 releases mais novas e imagens soltas com mais de 30 dias.
ls -1dt "$ROOT"/releases/sha-* 2>/dev/null | tail -n +6 | xargs -r rm -rf
docker image prune -af --filter "until=720h" >/dev/null || true
