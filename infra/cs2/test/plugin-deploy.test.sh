#!/usr/bin/env bash
# Testa o carmine-plugin-deploy sem CS2, systemd nem GitHub: um GitHub de mentira (servidor estático com as
# releases), systemctl/journalctl/A2S de mentira e dois perfis em pastas temporárias. Confere a ordem (Retake
# primeiro), o "Latest" (pré-lançamento ignorado), o servidor ocupado, a volta quando o plugin novo não fica
# saudável, a versão marcada como falha, o --rollback, a release adulterada e o servidor parado.
# Precisa de bash, jq, curl, python3, unzip e zip. Da raiz do repositório: bash infra/cs2/test/plugin-deploy.test.sh
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CS2="$REPO/infra/cs2"
T="$(mktemp -d)"
trap 'kill $(jobs -p) 2>/dev/null || true; rm -rf "$T"' EXIT
pass() { echo "ok   - $1"; }
fail() { echo "FALHOU - $1" >&2; echo "--- saída ---" >&2; cat "$T/out.txt" >&2 2>/dev/null || true; exit 1; }

PORT=$((20000 + RANDOM % 20000))
GH="$T/gh"
mkdir -p "$GH/releases" "$GH/dl" "$T/state" "$T/etc" "$T/bin"
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$GH" >/dev/null 2>&1 &
sleep 1
URL="http://127.0.0.1:$PORT"

# ---- releases de mentira ---------------------------------------------------------------------------
declare -A KIND
# Variáveis opcionais do make_release (cada chamada zera): WITH_DM=1 inclui o Deathmatch patchado;
# DM_TAMPER=1 adultera o zip dele; DM_SWAP=1 troca uma DLL por dentro do zip sem atualizar o manifesto.
WITH_DM=0 DM_TAMPER=0 DM_SWAP=0
make_release() { # make_release <versão> <conteúdo da dll> [adulterar]
  local v="$1" content="$2" tamper="${3:-}" w="$T/rel-$1"
  rm -rf "$w"
  mkdir -p "$w/pub" "$w/out"
  printf '%s' "$content" >"$w/pub/Carmine.Core.dll"
  printf '{}' >"$w/pub/Carmine.Core.deps.json"
  (cd "$w/pub" && zip -qr "$w/out/carmine-core-$v.zip" .)
  local dm_args=() sums=("carmine-core-$v.zip" manifest.json) assets=("carmine-core-$v.zip" manifest.json SHA256SUMS)
  if [[ "$WITH_DM" == 1 ]]; then
    mkdir -p "$w/dm"
    printf 'deathmatch-%s' "$v" >"$w/dm/Deathmatch.dll"
    printf 'api-%s' "$v" >"$w/dm/DeathmatchAPI.dll"
    (cd "$w/dm" && zip -qr "$w/out/carmine-deathmatch-$v.zip" Deathmatch.dll DeathmatchAPI.dll)
    dm_args=(--deathmatch-zip "$w/out/carmine-deathmatch-$v.zip")
    sums+=("carmine-deathmatch-$v.zip")
    assets+=("carmine-deathmatch-$v.zip")
  fi
  printf '{"openapi":"3"}' >"$w/openapi.json"
  VERSIONS_FILE='' bash "$CS2/release/make-manifest.sh" --version "$v" --commit "c$v" \
    --zip "$w/out/carmine-core-$v.zip" "${dm_args[@]}" --openapi "$w/openapi.json" --out "$w/out/manifest.json" >/dev/null
  if [[ "$DM_SWAP" == 1 ]]; then
    # o zip passa a ter outra DLL, e o manifesto aponta para o zip novo (o hash do zip confere; o da DLL não)
    printf 'dll-trocada' >"$w/dm/Deathmatch.dll"
    rm -f "$w/out/carmine-deathmatch-$v.zip"
    (cd "$w/dm" && zip -qr "$w/out/carmine-deathmatch-$v.zip" Deathmatch.dll DeathmatchAPI.dll)
    jq --arg s "$(sha256sum "$w/out/carmine-deathmatch-$v.zip" | cut -d' ' -f1)" '.deathmatch.asset.sha256 = $s' "$w/out/manifest.json" >"$w/out/m.tmp"
    mv "$w/out/m.tmp" "$w/out/manifest.json"
  fi
  (cd "$w/out" && sha256sum "${sums[@]}" >SHA256SUMS)
  if [[ -n "$tamper" ]]; then printf 'adulterado' >>"$w/out/carmine-core-$v.zip"; fi
  if [[ "$DM_TAMPER" == 1 ]]; then printf 'adulterado' >>"$w/out/carmine-deathmatch-$v.zip"; fi
  mkdir -p "$GH/dl/$v"
  cp "$w/out/"* "$GH/dl/$v/"
  jq -n --arg v "$v" --arg u "$URL/dl/$v" --argjson assets "$(printf '%s\n' "${assets[@]}" | jq -R . | jq -s .)" '{
    tag_name: ("core-v" + $v), draft: false, prerelease: false,
    assets: $assets | map({name: ., browser_download_url: ($u + "/" + .)})}' >"$w/release.json"
}
publish() { # publish <versão> <prerelease: true|false>: reescreve a lista e a página da tag
  local v="$1" pre="$2"
  KIND[$v]="$pre"
  mkdir -p "$GH/releases/tags/core-v$v"
  jq --argjson pre "$pre" '.prerelease = $pre' "$T/rel-$v/release.json" >"$GH/releases/tags/core-v$v/index.html"
  local files=() k
  for k in "${!KIND[@]}"; do files+=("$(jq --argjson pre "${KIND[$k]}" '.prerelease = $pre' "$T/rel-$k/release.json")"); done
  # a mais nova primeiro (a lista do GitHub vem assim)
  printf '%s\n' "${files[@]}" | jq -s 'sort_by(.tag_name) | reverse' >"$GH/releases/index.html"
}

# ---- fakes -----------------------------------------------------------------------------------------
cat >"$T/bin/systemctl" <<'EOF'
#!/usr/bin/env bash
# fake: is-active --quiet U | start U | stop U
state="$FAKE_STATE"
case "$1" in
  is-active) [[ -f "$state/${3}.active" ]] ;;
  start) touch "$state/${2}.active"; echo "start ${2#carmine-cs2@}" >>"$state/calls.log" ;;
  stop) rm -f "$state/${2}.active"; echo "stop ${2#carmine-cs2@}" >>"$state/calls.log" ;;
  *) exit 0 ;;
esac
EOF
cat >"$T/bin/journalctl" <<'EOF'
#!/usr/bin/env bash
# fake: -u carmine-cs2@PERFIL.service ...; o log depende do conteúdo da dll instalada no perfil
unit="$2"; name="${unit#carmine-cs2@}"; name="${name%.service}"
dll="$FAKE_HOME/profiles/$name/game/csgo/addons/counterstrikesharp/plugins/Carmine.Core/Carmine.Core.dll"
if grep -q BROKEN "$dll" 2>/dev/null; then
  echo "Failed to load plugin Carmine.Core: System.TypeLoadException"
elif grep -q SILENT "$dll" 2>/dev/null; then
  echo "[INFO] outra coisa qualquer"
else
  echo "Carmine.Core: API no ar (Postgres 2 ms, Valkey 1 ms)"
fi
EOF
cat >"$T/bin/a2s" <<'EOF'
#!/usr/bin/env bash
f="$FAKE_STATE/players-$1"
if [[ -f "$f" ]]; then cat "$f"; else echo 0; fi
EOF
cat >"$T/bin/gh" <<'EOF'
#!/usr/bin/env bash
# fake: gh attestation verify <arquivo> --repo X; FAKE_GH_FAIL=1 simula uma atestação que não confere
[[ "${FAKE_GH_FAIL:-0}" != 1 ]]
EOF
chmod +x "$T/bin/"*
export PATH="$T/bin:$PATH"
export FAKE_STATE="$T/state" FAKE_HOME="$T/home"

# ---- dois perfis instalados ------------------------------------------------------------------------
for spec in retake:27015 deathmatch:27016; do
  name="${spec%%:*}"
  port="${spec##*:}"
  d="$T/home/profiles/$name/game/csgo/addons/counterstrikesharp/plugins/Carmine.Core"
  mkdir -p "$d"
  printf 'dll-0.10.0' >"$d/Carmine.Core.dll"
  printf 'PORT=%s\n' "$port" >"$T/home/profiles/$name/profile.env"
  echo 0.10.0 >"$T/home/profiles/$name/carmine-core.version"
  touch "$T/state/carmine-cs2@$name.service.active"
done

export CARMINE_CS2_HOME="$T/home" CARMINE_CS2_ETC="$T/etc" CARMINE_CS2_USER=root \
  CARMINE_RELEASES_BASE="$URL" CARMINE_SYSTEMCTL="$T/bin/systemctl" CARMINE_JOURNALCTL="$T/bin/journalctl" \
  CARMINE_A2S="$T/bin/a2s" CARMINE_DEPLOY_LOCK="$T/lock" CARMINE_HEALTH_TIMEOUT=5 CARMINE_HEALTH_STABLE=0
DEPLOY="$CS2/linux/plugin-deploy.sh"
dll_of() { cat "$T/home/profiles/$1/game/csgo/addons/counterstrikesharp/plugins/Carmine.Core/Carmine.Core.dll"; }
version_of() { cat "$T/home/profiles/$1/carmine-core.version"; }

run() { # run <código esperado> <args...>
  local want="$1" rc=0
  shift
  bash "$DEPLOY" "$@" >"$T/out.txt" 2>&1 || rc=$?
  [[ "$rc" == "$want" ]] || fail "plugin-deploy $* saiu com $rc (esperado $want)"
}

make_release 0.10.5 dll-0.10.5
make_release 0.11.0 dll-0.11.0
publish 0.10.5 false
publish 0.11.0 true      # a mais nova é pré-lançamento: o Latest ainda é 0.10.5

: >"$T/state/calls.log"
run 0 --version latest
[[ "$(version_of retake)" == 0.10.5 && "$(version_of deathmatch)" == 0.10.5 ]] || fail "latest deveria ser 0.10.5 (a 0.11.0 é pré-lançamento)"
[[ "$(dll_of retake)" == dll-0.10.5 && "$(dll_of deathmatch)" == dll-0.10.5 ]] || fail "a pasta do plugin não foi trocada"
order="$(awk '{sub(/\.service/, "", $2); print $2}' "$T/state/calls.log" | uniq | tr '\n' ' ')"
[[ "$order" == 'retake deathmatch ' ]] || fail "ordem errada: $order"
[[ "$(version_of retake)" == 0.10.5 && "$(cat "$T/home/profiles/retake/carmine-core.previous")" == 0.10.0 ]] || fail "versão anterior não registrada"
[[ ! -e "$T/home/profiles/retake/game/csgo/addons/counterstrikesharp/plugins/Carmine.Core.rollback" ]] || fail "sobrou a pasta .rollback"
pass "latest ignora o pré-lançamento e entrega Retake e depois Deathmatch"

run 0 --version latest
grep -q 'nada a fazer' "$T/out.txt" || fail "segunda vez deveria não fazer nada"
pass "idempotente: mesma versão, nada a fazer"

publish 0.11.0 false      # promovida
echo 3 >"$T/state/players-27015"
run 75 --version latest --when-empty --no-wait
[[ "$(version_of retake)" == 0.10.5 && "$(version_of deathmatch)" == 0.11.0 ]] || fail "servidor ocupado deveria ser pulado e o vazio atualizado"
echo 0 >"$T/state/players-27015"
run 0 --version latest --when-empty --no-wait
[[ "$(version_of retake)" == 0.11.0 ]] || fail "o adiado não foi atualizado quando esvaziou"
pass "--when-empty adia o ocupado (75), atualiza o vazio e volta nele depois"

# ---- release que não fica saudável -----------------------------------------------------------------
make_release 0.12.0 dll-BROKEN
publish 0.12.0 false
run 1 --version latest
[[ "$(version_of retake)" == 0.11.0 && "$(dll_of retake)" == dll-0.11.0 ]] || fail "o Retake deveria ter voltado para 0.11.0"
[[ "$(version_of deathmatch)" == 0.11.0 ]] || fail "o Deathmatch não deveria ter sido tocado"
[[ -f "$T/state/carmine-cs2@retake.service.active" ]] || fail "o Retake deveria estar de pé depois da volta"
grep -qx 0.12.0 "$T/home/releases/failed-versions" || fail "a versão ruim não foi marcada"
pass "plugin que não carrega: volta sozinho, para, e não toca no outro servidor"
run 0 --version latest
grep -q 'já falhou' "$T/out.txt" || fail "o timer não deveria repetir a versão que falhou"
pass "a versão que falhou não é repetida sozinha"

make_release 0.12.1 dll-SILENT
publish 0.12.1 false
run 1 --version latest
[[ "$(version_of retake)" == 0.11.0 ]] || fail "plugin mudo (sem sinal no log) deveria voltar"
pass "plugin sem sinal no log também volta"

# ---- rollback --------------------------------------------------------------------------------------
run 0 --version 0.11.0 --server deathmatch   # já está: nada
run 0 --rollback --server retake
[[ "$(version_of retake)" == 0.10.5 && "$(dll_of retake)" == dll-0.10.5 ]] || fail "--rollback não voltou o Retake"
[[ "$(cat "$T/home/profiles/retake/carmine-core.previous")" == 0.11.0 ]] || fail "--rollback não guardou a versão de onde saiu"
[[ "$(version_of deathmatch)" == 0.11.0 ]] || fail "--rollback --server mexeu no outro servidor"
pass "--rollback volta um servidor à versão anterior, sem rede"

# ---- release adulterada ----------------------------------------------------------------------------
make_release 0.13.0 dll-0.13.0 tamper
publish 0.13.0 false
run 1 --version 0.13.0
grep -q 'SHA-256' "$T/out.txt" || fail "faltou o erro de SHA-256"
[[ "$(version_of retake)" == 0.10.5 && "$(version_of deathmatch)" == 0.11.0 ]] || fail "release adulterada mexeu nos servidores"
[[ ! -d "$T/home/releases/core-0.13.0" ]] || fail "release adulterada ficou no disco"
pass "zip adulterado: recusado antes de tocar em qualquer servidor"

# ---- atestação de proveniência que não confere ------------------------------------------------------
make_release 0.14.0 dll-0.14.0
publish 0.14.0 false
FAKE_GH_FAIL=1 run 1 --version 0.14.0
grep -q 'atestação' "$T/out.txt" || fail "faltou o erro da atestação"
[[ "$(version_of retake)" == 0.10.5 && "$(version_of deathmatch)" == 0.11.0 ]] || fail "atestação ruim mexeu nos servidores"
[[ ! -d "$T/home/releases/core-0.14.0" ]] || fail "release sem atestação ficou no disco"
pass "atestação de proveniência que não confere: recusada antes de tocar em qualquer servidor"

# ---- servidor parado, dry-run ----------------------------------------------------------------------
run 0 --version 0.11.0 --dry-run
grep -q 'faria' "$T/out.txt" || fail "dry-run sem 'faria'"
[[ "$(version_of retake)" == 0.10.5 ]] || fail "dry-run mexeu no servidor"
rm -f "$T/state/carmine-cs2@retake.service.active"
run 0 --version 0.11.0 --server retake
[[ "$(version_of retake)" == 0.11.0 && ! -f "$T/state/carmine-cs2@retake.service.active" ]] || fail "servidor parado deveria só trocar os arquivos"
pass "--dry-run não muda nada; servidor parado só troca os arquivos"

# ---- o Deathmatch patchado na release (ADR 0028) ----------------------------------------------------
WITH_DM=1 make_release 0.15.0 dll-0.15.0
publish 0.15.0 true
run 0 --version 0.15.0
[[ "$(version_of retake)" == 0.15.0 && "$(version_of deathmatch)" == 0.15.0 ]] || fail "a release com o Deathmatch não foi instalada nos servidores"
[[ "$(cat "$T/home/releases/core-0.15.0/deathmatch/Deathmatch.dll")" == deathmatch-0.15.0 ]] || fail "o Deathmatch patchado não foi baixado e extraído"
[[ "$(cat "$T/home/releases/core-0.15.0/deathmatch/DeathmatchAPI.dll")" == api-0.15.0 ]] || fail "a DeathmatchAPI patchada não foi extraída"
pass "a release traz o Deathmatch patchado: baixado, conferido e extraído ao lado do plugin"

WITH_DM=1 DM_TAMPER=1 make_release 0.15.1 dll-0.15.1
publish 0.15.1 true
run 1 --version 0.15.1
grep -q 'SHA-256' "$T/out.txt" || fail "faltou o erro de SHA-256 do zip do Deathmatch adulterado"
[[ ! -d "$T/home/releases/core-0.15.1" ]] || fail "release com o Deathmatch adulterado ficou no disco"
pass "zip do Deathmatch adulterado: recusado"

WITH_DM=1 DM_SWAP=1 make_release 0.15.2 dll-0.15.2
publish 0.15.2 true
run 1 --version 0.15.2
grep -q 'não bate com o manifesto' "$T/out.txt" || fail "faltou o erro da DLL que não bate com o manifesto"
[[ ! -d "$T/home/releases/core-0.15.2" ]] || fail "release com DLL trocada ficou no disco"
pass "DLL do Deathmatch que não bate com o manifesto: recusada"

echo "### TUDO CERTO"
