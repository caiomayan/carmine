#!/usr/bin/env bash
# Promove a release do Carmine.Core a *Latest* quando a API que ela precisa já está em produção. É a regra
# "o plugin só vai aos servidores depois da API em produção" tornada automática: os servidores só enxergam a release
# Latest (carmine-plugin-deploy), e o pré-lançamento criado pela CI (release-plugin.yml) só vira Latest aqui.
#
#   promote-plugin.sh [--deployed SHA] [--dry-run]
#
# A API mínima de uma release é o COMMIT em que ela foi construída (manifest.json, campo `commit`): a release sai
# do main, então a API desse commit tem tudo o que o plugin chama. Está em produção quando esse commit é igual ou
# ancestral do commit implantado agora (a tag móvel `prod-live`, que o deploy.yml move depois do teste de fumaça
# verde; ou --deployed). Entre os pré-lançamentos `core-v*` mais novos que a Latest atual e com a API no ar, promove
# o de maior versão, nunca uma menor que a Latest (não rebaixa). Idempotente; pode rodar a qualquer hora.
#
# Variáveis: REPO (owner/repo; padrão GITHUB_REPOSITORY), GH_TOKEN (para o `gh`), PLUGIN_PROMOTION_PAUSED=true
# congela (a variável do repositório de mesmo nome entra aqui pelo workflow). Saída 0 mesmo sem nada a promover.
set -euo pipefail

REPO="${REPO:-${GITHUB_REPOSITORY:-}}"
DEPLOYED=''
DRY=0
while (($#)); do
  case "$1" in
    --deployed) DEPLOYED="${2:?--deployed pede um valor}"; shift ;;
    --dry-run) DRY=1 ;;
    -h | --help) sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | sed -e '$d' -e 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "opção desconhecida: $1" >&2; exit 2 ;;
  esac
  shift
done
[[ -n "$REPO" ]] || { echo "defina REPO ou GITHUB_REPOSITORY" >&2; exit 2; }

log() { echo "promote-plugin: $*"; }

if [[ "${PLUGIN_PROMOTION_PAUSED:-}" == true ]]; then
  log "PLUGIN_PROMOTION_PAUSED=true: promoção automática suspensa (promova à mão no GitHub, se quiser)"
  exit 0
fi

if [[ -z "$DEPLOYED" ]]; then
  DEPLOYED="$(gh api "repos/$REPO/git/ref/tags/prod-live" --jq .object.sha 2>/dev/null || true)"
fi
if ! [[ "$DEPLOYED" =~ ^[0-9a-f]{40}$ ]]; then
  log "não sei qual commit está em produção (a tag prod-live ainda não existe); nada a promover"
  exit 0
fi
log "commit em produção: ${DEPLOYED:0:12}"

releases="$(gh api "repos/$REPO/releases?per_page=100")"

# Latest atual: a maior versão core-v* que não é pré-lançamento nem rascunho (0.0.0 se não houver).
current="$(jq -r '
  [.[] | select((.tag_name | test("^core-v[0-9]+\\.[0-9]+\\.[0-9]+$")) and (.prerelease | not) and (.draft | not))
       | .tag_name | ltrimstr("core-v")]
  | sort_by(split(".") | map(tonumber)) | (last // "0.0.0")' <<<"$releases")"
log "Latest atual: $current"

# Candidatas: pré-lançamentos (não rascunhos) mais novos que a Latest, da maior versão para a menor.
candidates="$(jq -r --arg cur "$current" '
  def v: split(".") | map(tonumber);
  [.[] | select((.tag_name | test("^core-v[0-9]+\\.[0-9]+\\.[0-9]+$")) and .prerelease and (.draft | not))
       | .tag_name | ltrimstr("core-v") | select((v) > ($cur | v))]
  | sort_by(v) | reverse | .[]' <<<"$releases")"
if [[ -z "$candidates" ]]; then
  log "nenhum pré-lançamento mais novo que a Latest; nada a promover"
  exit 0
fi

for version in $candidates; do
  tag="core-v$version"
  # A release precisa estar completa (o carmine-plugin-deploy exige os três arquivos).
  missing="$(jq -r --arg t "$tag" '
    .[] | select(.tag_name == $t) | [.assets[].name] as $a
    | ["carmine-core-" + ($t | ltrimstr("core-v")) + ".zip", "manifest.json", "SHA256SUMS"] - $a | join(", ")' <<<"$releases")"
  if [[ -n "$missing" ]]; then
    log "$tag: faltam arquivos na release ($missing); pulo"
    continue
  fi
  commit="$(gh release download "$tag" --repo "$REPO" --pattern manifest.json --output - 2>/dev/null | jq -r '.commit // empty' || true)"
  if ! [[ "$commit" =~ ^[0-9a-f]{40}$ ]]; then
    log "$tag: o manifesto não traz o commit de construção; pulo"
    continue
  fi
  status="$(gh api "repos/$REPO/compare/$commit...$DEPLOYED" --jq .status 2>/dev/null || echo desconhecido)"
  case "$status" in
    identical | ahead)
      log "$tag: construída em ${commit:0:12}, que já está em produção ($status): promovendo"
      if ((DRY)); then
        log "[dry-run] gh release edit $tag --prerelease=false --latest"
        exit 0
      fi
      gh release edit "$tag" --repo "$REPO" --prerelease=false --latest
      log "$tag agora é a Latest: os servidores a recebem sozinhos (carmine-plugin-sync, servidor vazio por vez)"
      exit 0
      ;;
    *)
      log "$tag: construída em ${commit:0:12}, que AINDA NÃO está em produção (status: $status); espero o deploy da API"
      ;;
  esac
done
log "nenhuma candidata com a API já no ar; nada a promover"
