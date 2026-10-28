#!/usr/bin/env bash
# Testa o promote-plugin.sh com um `gh` de mentira (releases, manifestos, tag prod-live e comparação de commits em
# arquivos): promove só quando o commit de construção da release já está em produção, a maior versão primeiro,
# nunca rebaixa, não promove release incompleta e respeita a pausa.
# Precisa de bash e jq. Da raiz do repositório: bash infra/cs2/test/promote-plugin.test.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PROMOTE="$REPO_ROOT/infra/cs2/release/promote-plugin.sh"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
pass() { echo "ok   - $1"; }
fail() { echo "FALHOU - $1" >&2; echo "--- saída ---" >&2; cat "$T/out.txt" >&2 2>/dev/null || true; exit 1; }

mkdir -p "$T/bin" "$T/fx/manifests" "$T/fx/compare"
cat >"$T/bin/gh" <<'EOF'
#!/usr/bin/env bash
# fake: gh api repos/R/releases?per_page=100 | gh api repos/R/git/ref/tags/prod-live --jq .. | gh api repos/R/compare/A...B --jq ..
#       gh release download TAG --repo R --pattern manifest.json --output - | gh release edit TAG ...
fx="$FAKE_GH"
case "$1 $2" in
  "api repos/"*)
    path="$2"
    case "$path" in
      */releases\?*) cat "$fx/releases.json" ;;
      */git/ref/tags/prod-live) [[ -f "$fx/prod-live" ]] || exit 1; printf '%s\n' "$(cat "$fx/prod-live")" ;;
      */compare/*)
        pair="${path##*/compare/}"
        [[ -f "$fx/compare/$pair" ]] || exit 1
        cat "$fx/compare/$pair" ;;
      *) exit 1 ;;
    esac ;;
  "release download")
    [[ -f "$fx/manifests/$3.json" ]] || exit 1
    cat "$fx/manifests/$3.json" ;;
  "release edit")
    [[ "${FAKE_GH_EDIT_FAIL:-0}" != 1 ]] || exit 1
    echo "$*" >>"$fx/edits.log" ;;
  *) exit 1 ;;
esac
EOF
chmod +x "$T/bin/gh"
export PATH="$T/bin:$PATH" FAKE_GH="$T/fx" REPO=caiomayan/carmine

sha() { printf '%040d' "$1"; }
LIVE="$(sha 50)"
OLD="$(sha 10)"   # ancestral do que está no ar
NEW="$(sha 90)"   # ainda não está no ar

release() { # release <versão> <prerelease: true|false> [assets completos: sim|nao]
  local v="$1" pre="$2" complete="${3:-sim}"
  local assets='["carmine-core-'"$v"'.zip","manifest.json","SHA256SUMS"]'
  [[ "$complete" == sim ]] || assets='["carmine-core-'"$v"'.zip"]'
  jq -n --arg t "core-v$v" --argjson pre "$pre" --argjson a "$assets" \
    '{tag_name: $t, prerelease: $pre, draft: false, assets: ($a | map({name: .}))}'
}
manifest() { # manifest <versão> <commit>
  jq -n --arg c "$2" '{schema: 1, commit: $c}' >"$T/fx/manifests/core-v$1.json"
}
compare() { printf '%s\n' "$3" >"$T/fx/compare/$1...$2"; } # compare <base> <head> <status>
reset() { rm -f "$T/fx/edits.log" "$T/fx/prod-live" "$T/fx/compare/"* "$T/fx/manifests/"*; }
run() {
  bash "$PROMOTE" "$@" >"$T/out.txt" 2>&1 || fail "promote-plugin $* saiu com erro"
}
edits() { cat "$T/fx/edits.log" 2>/dev/null || true; }

# 1. a API do plugin já está no ar: promove o pré-lançamento
reset
jq -s '.' <(release 0.11.0 false) <(release 0.12.0 true) >"$T/fx/releases.json"
echo "$LIVE" >"$T/fx/prod-live"
manifest 0.12.0 "$OLD"
compare "$OLD" "$LIVE" ahead
run
[[ "$(edits)" == "release edit core-v0.12.0 --repo caiomayan/carmine --prerelease=false --latest" ]] || fail "deveria promover a 0.12.0: $(edits)"
pass "API no ar (commit de construção ancestral do commit em produção): promove"

# 2. construída num commit que a produção ainda não tem
reset
echo "$LIVE" >"$T/fx/prod-live"
manifest 0.12.0 "$NEW"
compare "$NEW" "$LIVE" behind
run
[[ -z "$(edits)" ]] || fail "não pode promover antes da API"
grep -q 'AINDA NÃO está em produção' "$T/out.txt" || fail "faltou o log do motivo"
pass "API ainda não no ar: não promove e diz por quê"

# 3. o mesmo commit (identical) também vale
reset
echo "$LIVE" >"$T/fx/prod-live"
manifest 0.12.0 "$LIVE"
compare "$LIVE" "$LIVE" identical
run
[[ -n "$(edits)" ]] || fail "commit idêntico deveria promover"
pass "commit idêntico ao de produção: promove"

# 4. várias candidatas: a maior versão com a API no ar; a que ainda não está no ar fica esperando
reset
jq -s '.' <(release 0.11.0 false) <(release 0.12.0 true) <(release 0.13.0 true) <(release 0.14.0 true) >"$T/fx/releases.json"
echo "$LIVE" >"$T/fx/prod-live"
manifest 0.12.0 "$OLD"; compare "$OLD" "$LIVE" ahead
manifest 0.13.0 "$(sha 20)"; compare "$(sha 20)" "$LIVE" ahead
manifest 0.14.0 "$NEW"; compare "$NEW" "$LIVE" behind
run
[[ "$(edits)" == *"core-v0.13.0 "* && "$(edits)" != *"core-v0.12.0 "* && "$(edits)" != *"core-v0.14.0 "* ]] || fail "deveria promover só a 0.13.0: $(edits)"
pass "várias candidatas: promove a maior com a API no ar e deixa a 0.14.0 esperando"

# 5. não rebaixa: pré-lançamento mais antigo que a Latest não é promovido
reset
jq -s '.' <(release 0.13.0 false) <(release 0.12.0 true) >"$T/fx/releases.json"
echo "$LIVE" >"$T/fx/prod-live"
manifest 0.12.0 "$OLD"; compare "$OLD" "$LIVE" ahead
run
[[ -z "$(edits)" ]] || fail "não pode promover versão menor que a Latest"
pass "nunca rebaixa: pré-lançamento mais velho que a Latest fica quieto"

# 6. release incompleta
reset
jq -s '.' <(release 0.11.0 false) <(release 0.12.0 true nao) >"$T/fx/releases.json"
echo "$LIVE" >"$T/fx/prod-live"
manifest 0.12.0 "$OLD"; compare "$OLD" "$LIVE" ahead
run
[[ -z "$(edits)" ]] || fail "release incompleta não pode ser promovida"
grep -q 'faltam arquivos' "$T/out.txt" || fail "faltou no log: faltam arquivos"
pass "release sem os três arquivos: não promove"

# 7. sem prod-live (deploy ainda não registrou), com --deployed, pausa e dry-run
reset
jq -s '.' <(release 0.11.0 false) <(release 0.12.0 true) >"$T/fx/releases.json"
manifest 0.12.0 "$OLD"; compare "$OLD" "$LIVE" ahead
run
[[ -z "$(edits)" ]] || fail "sem prod-live não pode promover"
grep -q 'prod-live ainda não existe' "$T/out.txt" || fail "faltou no log: prod-live ainda não existe"
run --deployed "$LIVE"
[[ -n "$(edits)" ]] || fail "--deployed deveria bastar"
rm -f "$T/fx/edits.log"
PLUGIN_PROMOTION_PAUSED=true run --deployed "$LIVE"
[[ -z "$(edits)" ]] || fail "a pausa deveria impedir a promoção"
grep -q 'suspensa' "$T/out.txt" || fail "faltou no log: suspensa"
run --deployed "$LIVE" --dry-run
[[ -z "$(edits)" ]] || fail "--dry-run não pode promover"
grep -q 'dry-run' "$T/out.txt" || fail "faltou no log: dry-run"
pass "sem prod-live nada; --deployed; PLUGIN_PROMOTION_PAUSED congela; --dry-run só mostra"

# 8. manifesto sem commit / nada para promover / manifesto ausente
reset
jq -s '.' <(release 0.11.0 false) <(release 0.12.0 true) >"$T/fx/releases.json"
echo "$LIVE" >"$T/fx/prod-live"
echo '{"schema":1}' >"$T/fx/manifests/core-v0.12.0.json"
run
[[ -z "$(edits)" ]] || fail "manifesto sem commit não promove"
grep -q 'não traz o commit' "$T/out.txt" || fail "faltou no log: não traz o commit"
jq -s '.' <(release 0.11.0 false) >"$T/fx/releases.json"
run
grep -q 'nenhum pré-lançamento' "$T/out.txt" || fail "sem candidatas deveria dizer isso"
pass "manifesto sem commit é pulado; sem candidatas não faz nada"

echo "### TUDO CERTO"
