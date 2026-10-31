#!/usr/bin/env bash
# Testa o carmine-cs2-update sem CS2, Steam nem systemd: steamcmd, install.sh, systemctl, journalctl e A2S de
# mentira, e um webhook do Discord de mentira que guarda os avisos. Confere: em dia (nada a fazer), --check, a
# atualização completa (ordem: parar, install, subir, conferir; avisos amarelo e verde), install que falha
# (servidores PARADOS, build marcado, aviso vermelho, o timer não repete), --force, e servidor que não fica saudável.
# Precisa de bash, jq, curl e python3. Da raiz do repositório: bash infra/cs2/test/cs2-update.test.sh
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CS2="$REPO/infra/cs2"
T="$(mktemp -d)"
trap 'kill $(jobs -p) 2>/dev/null || true; rm -rf "$T"' EXIT
pass() { echo "ok   - $1"; }
fail() { echo "FALHOU - $1" >&2; echo "--- saída ---" >&2; cat "$T/out.txt" >&2 2>/dev/null || true; exit 1; }

mkdir -p "$T/bin" "$T/state" "$T/etc" "$T/home/server/steamapps"
PORT=$((20000 + RANDOM % 20000))
python3 "$CS2/test/webhook-sink.py" "$T/alerts.log" "$PORT" &
sleep 1
printf 'DISCORD_ALERT_WEBHOOK_URL=http://127.0.0.1:%s/hook\n' "$PORT" >"$T/etc/alerts.env"

set_installed() { printf '"AppState"\n{\n\t"appid"\t\t"730"\n\t"buildid"\t\t"%s"\n}\n' "$1" >"$T/home/server/steamapps/appmanifest_730.acf"; }
set_installed 100
echo 100 >"$T/steam-buildid"

for spec in retake:27015 deathmatch:27016; do
  name="${spec%%:*}"
  mkdir -p "$T/home/profiles/$name"
  printf 'PORT=%s\n' "${spec##*:}" >"$T/home/profiles/$name/profile.env"
  echo 0.11.0 >"$T/home/profiles/$name/carmine-core.version"
  touch "$T/state/carmine-cs2@$name.service.active"
done
mkdir -p "$T/home/releases"
echo 0.11.0 >"$T/home/releases/installed"

# ---- fakes ---------------------------------------------------------------------------------------
cat >"$T/bin/steamcmd" <<'EOF'
#!/usr/bin/env bash
# imprime um app_info_print mínimo: o ramo "beta" vem ANTES do "public" para provar que só vale o public
cat <<VDF
"730"
{
	"depots"
	{
		"branches"
		{
			"beta"
			{
				"buildid"		"999999"
			}
			"public"
			{
				"buildid"		"$(cat "$FAKE_STATE/../steam-buildid")"
				"timeupdated"		"1700000000"
			}
		}
	}
}
VDF
EOF
cat >"$T/bin/install.sh" <<'EOF'
#!/usr/bin/env bash
echo "$*" >>"$FAKE_STATE/../install.args"
echo "install" >>"$FAKE_STATE/calls.log"
[[ ! -f "$FAKE_STATE/../install-fail" ]] || exit 1
printf '"AppState"\n{\n\t"buildid"\t\t"%s"\n}\n' "$(cat "$FAKE_STATE/../steam-buildid")" >"$FAKE_HOME/server/steamapps/appmanifest_730.acf"
EOF
cat >"$T/bin/systemctl" <<'EOF'
#!/usr/bin/env bash
state="$FAKE_STATE"
case "$1" in
  is-active) [[ -f "$state/${3}.active" ]] ;;
  start | stop)
    if [[ "$2" == carmine-cs2.target ]]; then
      for u in "$FAKE_HOME"/profiles/*/; do n="$(basename "$u")"; if [[ "$1" == start ]]; then touch "$state/carmine-cs2@$n.service.active"; else rm -f "$state/carmine-cs2@$n.service.active"; fi; done
    fi
    echo "$1 ${2#carmine-cs2@}" >>"$state/calls.log" ;;
  *) exit 0 ;;
esac
EOF
cat >"$T/bin/journalctl" <<'EOF'
#!/usr/bin/env bash
if [[ -f "$FAKE_STATE/badlog" ]]; then
  echo "Failed to load plugin Carmine.Core: signature not found"
else
  echo "Carmine.Core: API no ar (Postgres 2 ms, Valkey 1 ms)"
fi
EOF
cat >"$T/bin/a2s" <<'EOF'
#!/usr/bin/env bash
f="$FAKE_STATE/players-$1"
if [[ -f "$f" ]]; then cat "$f"; else echo 0; fi
EOF
chmod +x "$T/bin/"*
export FAKE_STATE="$T/state" FAKE_HOME="$T/home"
export CARMINE_CS2_HOME="$T/home" CARMINE_CS2_ETC="$T/etc" CARMINE_CS2_USER=root CARMINE_SYSTEMCTL="$T/bin/systemctl" \
  CARMINE_JOURNALCTL="$T/bin/journalctl" CARMINE_A2S="$T/bin/a2s" CARMINE_STEAMCMD="$T/bin/steamcmd" \
  CARMINE_INSTALL="$T/bin/install.sh" CARMINE_SRC="$T/nao-e-um-clone" CARMINE_UPDATE_LOCK="$T/lock" \
  CARMINE_HEALTH_TIMEOUT=4 CARMINE_HEALTH_STABLE=0
UPDATE="$CS2/linux/cs2-update.sh"

run() { # run <código esperado> <args...>
  local want="$1" rc=0
  shift
  bash "$UPDATE" "$@" >"$T/out.txt" 2>&1 || rc=$?
  [[ "$rc" == "$want" ]] || fail "cs2-update $* saiu com $rc (esperado $want)"
}
alerts() { cat "$T/alerts.log" 2>/dev/null || true; }

# ---- em dia, --check ----------------------------------------------------------------------------------
run 0
grep -q 'em dia' "$T/out.txt" || fail "deveria estar em dia"
[[ ! -f "$T/install.args" ]] || fail "em dia não deveria rodar o install.sh"
pass "build igual: em dia, nada a fazer"

echo 200 >"$T/steam-buildid"
run 0 --check
grep -q 'haveria atualização' "$T/out.txt" || fail "--check deveria dizer que haveria atualização"
[[ ! -f "$T/install.args" ]] || fail "--check não deveria rodar o install.sh"
grep -q 'Steam 200' "$T/out.txt" || fail "o buildid lido deveria ser o do ramo público (200), não o do beta"
pass "--check lê o build do ramo público e não muda nada"

# ---- atualização completa -----------------------------------------------------------------------------
: >"$T/state/calls.log"
echo 3 >"$T/state/players-27015"
run 0 --wait 0
for arg in '--download-cs2' '--steps cs2,metamod,css,build,profiles,services' '--core-release installed'; do
  grep -q -- "$arg" "$T/install.args" || fail "argumentos do install.sh sem '$arg': $(cat "$T/install.args")"
done
order="$(tr '\n' ',' <"$T/state/calls.log")"
[[ "$order" == stop\ carmine-cs2.target,install,start\ carmine-cs2.target, ]] || fail "ordem errada: $order"
grep -q 'ainda há jogadores' "$T/out.txt" || fail "deveria atualizar mesmo com jogadores depois do prazo"
[[ "$(alerts | grep -c '🟡')" == 1 && "$(alerts | grep -c '✅')" == 1 ]] || fail "avisos amarelo e verde: $(alerts)"
alerts | grep -q 'build 200' || fail "o aviso deveria citar o build"
grep -q 'retake: Carmine.Core 0.11.0' "$T/alerts.log" || fail "o aviso verde deveria trazer as versões do plugin"
[[ ! -f "$T/home/releases/cs2-update-failed" ]] || fail "sobrou marca de falha"
pass "atualização: espera, avisa, para, instala (mesma release do plugin), sobe e confere"
run 0
grep -q 'em dia' "$T/out.txt" || fail "depois de atualizar deveria estar em dia"

# ---- o install.sh falha -------------------------------------------------------------------------------
rm -f "$T/install.args" "$T/state/players-27015"
: >"$T/state/calls.log"
: >"$T/alerts.log"
echo 300 >"$T/steam-buildid"
touch "$T/install-fail"
run 1 --wait 0
[[ ! -f "$T/state/carmine-cs2@retake.service.active" && ! -f "$T/state/carmine-cs2@deathmatch.service.active" ]] || fail "os servidores deveriam ficar PARADOS"
grep -qx 300 "$T/home/releases/cs2-update-failed" || fail "o build ruim deveria ficar marcado"
[[ "$(alerts | grep -c '🔴')" == 1 ]] || fail "faltou o aviso vermelho: $(alerts)"
grep -q 'start carmine-cs2.target' "$T/state/calls.log" && fail "não pode subir depois de o install falhar"
pass "install.sh que falha: servidores parados, build marcado, aviso vermelho"

rm -f "$T/install.args"
run 0
grep -q 'já falhou' "$T/out.txt" || fail "o timer não deveria repetir o build que falhou"
[[ ! -f "$T/install.args" ]] || fail "o timer rodou o install.sh de novo"
pass "o timer não repete o build que falhou"

rm -f "$T/install-fail"
: >"$T/state/calls.log"
run 0 --force --wait 0
[[ -f "$T/state/carmine-cs2@retake.service.active" && -f "$T/state/carmine-cs2@deathmatch.service.active" ]] || fail "--force deveria ter subido os servidores"
[[ ! -f "$T/home/releases/cs2-update-failed" ]] || fail "a marca de falha deveria sair depois do sucesso"
pass "--force tenta de novo e, dando certo, limpa a marca"

# ---- subiu mas o plugin não carregou --------------------------------------------------------------------
echo 400 >"$T/steam-buildid"
touch "$T/state/badlog"
: >"$T/alerts.log"
run 1 --wait 0
[[ ! -f "$T/state/carmine-cs2@retake.service.active" ]] || fail "servidor com plugin quebrado deveria ficar parado"
alerts | grep -q 'não ficou saudável' || fail "o aviso deveria dizer qual servidor não ficou saudável: $(alerts)"
alerts | grep -q 'Failed to load' || fail "o aviso deveria trazer o trecho do log"
pass "plugin que não carrega no CS2 novo: servidores parados e aviso com o trecho do log"

echo "### TUDO CERTO"
