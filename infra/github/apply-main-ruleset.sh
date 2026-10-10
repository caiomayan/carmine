#!/usr/bin/env bash
# Cria (ou atualiza) o ruleset que protege o main: merge só por PR e com os checks
# node, dotnet e api-image verdes. Altera a configuração do repositório: rodar só com
# o ok do dono. Requer `gh` autenticado com permissão de admin no repositório.
#
#   infra/github/apply-main-ruleset.sh [owner/repo]
set -euo pipefail

repo="${1:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
ruleset_file="$(dirname "$0")/main-ruleset.json"
name="main protegido" # o mesmo "name" de main-ruleset.json

existing_id="$(gh api "repos/$repo/rulesets" --jq ".[] | select(.name == \"$name\") | .id")"
if [[ -n "$existing_id" ]]; then
  gh api --method PUT "repos/$repo/rulesets/$existing_id" --input "$ruleset_file" >/dev/null
  echo "Ruleset \"$name\" atualizado em $repo (id $existing_id)."
else
  gh api --method POST "repos/$repo/rulesets" --input "$ruleset_file" --jq '"Ruleset \"\(.name)\" criado em '"$repo"' (id \(.id))."'
fi
