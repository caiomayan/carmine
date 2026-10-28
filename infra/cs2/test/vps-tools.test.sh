#!/usr/bin/env bash
# Testa, sem VPS, os comandos de preparação da VPS: carmine-secrets (valida, grava 0600, não ecoa, só reinicia o
# servidor trocado), carmine-vps-check (itens e formato), vps-bootstrap (a trava que impede desligar a senha do SSH
# sem chave, e o plano do --dry-run) e carmine-vps-smoke (serviço, log, A2S e o site, com falha de cada tipo).
# Precisa de bash, jq, curl e python3. Da raiz do repositório: bash infra/cs2/test/vps-tools.test.sh
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
LINUX="$REPO/infra/cs2/linux"
T="$(mktemp -d)"
trap 'kill $(jobs -p) 2>/dev/null || true; rm -rf "$T"' EXIT
pass() { echo "ok   - $1"; }
fail() { echo "FALHOU - $1" >&2; echo "--- saída ---" >&2; cat "$T/out.txt" >&2 2>/dev/null || true; exit 1; }

# ---- carmine-secrets ----------------------------------------------------------------------------------
mkdir -p "$T/etc" "$T/bin" "$T/state"
export CARMINE_CS2_ETC="$T/etc" CARMINE_SYSTEMCTL="$T/bin/systemctl" FAKE_STATE="$T/state"
cat >"$T/bin/systemctl" <<'EOF'
#!/usr/bin/env bash
case "$1" in
  is-active) [[ -f "$FAKE_STATE/${3}.active" ]] ;;
  restart) echo "restart $2" >>"$FAKE_STATE/calls.log" ;;
  *) exit 0 ;;
esac
EOF
chmod +x "$T/bin/systemctl"
printf 'CARMINE_API_KEY=\nCS2_GSLT=\nCARMINE_API_BASE_URL=https://stcarmine.com\n' >"$T/etc/retake.env"
chmod 0644 "$T/etc/retake.env"
cp "$T/etc/retake.env" "$T/etc/deathmatch.env"
SECRETS="$LINUX/secrets.sh"
APIKEY='chave-do-servidor_123.ABC'
GSLT='0123456789ABCDEF0123456789ABCDEF'

out="$(printf '%s\n%s\n' "$APIKEY" "$GSLT" | bash "$SECRETS" profile retake 2>&1)"
grep -q "^CARMINE_API_KEY=$APIKEY$" "$T/etc/retake.env" || fail "profile não gravou a chave"
grep -q "^CS2_GSLT=$GSLT$" "$T/etc/retake.env" || fail "profile não gravou o GSLT"
grep -q '^CARMINE_API_BASE_URL=https://stcarmine.com$' "$T/etc/retake.env" || fail "profile apagou as outras linhas"
[[ "$(stat -c %a "$T/etc/retake.env")" == 600 ]] || fail "o arquivo deveria ficar 0600"
[[ "$out" != *"$APIKEY"* && "$out" != *"$GSLT"* ]] || fail "o comando imprimiu o segredo"
pass "secrets profile: grava, mantém o resto, 0600 e não ecoa"

printf '\n\n' | bash "$SECRETS" profile retake >/dev/null 2>&1
grep -q "^CS2_GSLT=$GSLT$" "$T/etc/retake.env" || fail "Enter deveria manter o valor atual"
pass "secrets profile: Enter mantém o valor atual"

if printf 'com espaço e "aspas"\n%s\n' "$GSLT" | bash "$SECRETS" profile deathmatch >"$T/out.txt" 2>&1; then fail "aceitou chave com caracteres perigosos"; fi
grep -q '^CARMINE_API_KEY=$' "$T/etc/deathmatch.env" || fail "valor inválido não pode ser gravado"
if printf '%s\nnão-é-gslt!\n' "$APIKEY" | bash "$SECRETS" profile deathmatch >"$T/out.txt" 2>&1; then fail "aceitou GSLT inválido"; fi
pass "secrets: recusa formato inválido (sem injeção no JSON/cfg)"

: >"$T/state/calls.log"
touch "$T/state/carmine-cs2@retake.service.active" "$T/state/carmine-cs2@deathmatch.service.active"
NEW='FEDCBA9876543210FEDCBA9876543210'
printf '%s\n' "$NEW" | bash "$SECRETS" gslt retake >/dev/null 2>&1
grep -q "^CS2_GSLT=$NEW$" "$T/etc/retake.env" || fail "gslt não trocou"
[[ "$(cat "$T/state/calls.log")" == 'restart carmine-cs2@retake.service' ]] || fail "gslt deveria reiniciar SÓ o retake: $(cat "$T/state/calls.log")"
pass "secrets gslt: troca o token e reinicia só esse servidor"

printf 'https://discord.com/api/webhooks/123456/abc_DEF-ghi\n' | bash "$SECRETS" alerts >/dev/null 2>&1
grep -q '^DISCORD_ALERT_WEBHOOK_URL=https://discord.com/api/webhooks/123456/abc_DEF-ghi$' "$T/etc/alerts.env" || fail "alerts não gravou"
if printf 'https://evil.example/hook\n' | bash "$SECRETS" alerts >/dev/null 2>&1; then fail "aceitou um webhook que não é do Discord"; fi
printf 'https://abc.r2.cloudflarestorage.com/meu-bucket\nAKID123\nSECRET456\n' | bash "$SECRETS" mirror >/dev/null 2>&1
grep -q '^MIRROR_URL=https://abc.r2.cloudflarestorage.com/meu-bucket$' "$T/etc/mirror.env" || fail "mirror não gravou"
bash "$SECRETS" show >"$T/out.txt" 2>&1
grep -q 'retake: GSLT *preenchido (...3210)' "$T/out.txt" || fail "show: retake deveria estar preenchido"
grep -q 'deathmatch: GSLT *FALTA' "$T/out.txt" || fail "show: deathmatch deveria faltar"
grep -q "$NEW" "$T/out.txt" && fail "show mostrou o segredo inteiro"
pass "secrets alerts, mirror e show"

# ---- carmine-vps-check ----------------------------------------------------------------------------------
bash "$LINUX/vps-check.sh" --no-network --machine --home "$T/home" >"$T/out.txt" 2>&1 || true
for item in arquitetura sistema root systemd núcleos CPU memória swap 'disco livre' relógio 'portas UDP'; do
  grep -q "|$item|" "$T/out.txt" || fail "vps-check sem o item '$item'"
done
grep -Eq '^(OK|AVISO|FALHA)\|arquitetura\|' "$T/out.txt" || fail "formato --machine"
pass "vps-check: todos os itens, no formato STATUS|item|detalhe"

# ---- vps-bootstrap: a trava do SSH e o plano --dry-run ------------------------------------------------
# shellcheck source=../linux/vps-bootstrap.sh
source "$LINUX/vps-bootstrap.sh"
mkdir -p "$T/ssh"
export CARMINE_AUTHORIZED_KEYS_GLOB="$T/ssh/*"
if has_ssh_key; then fail "sem chave nenhuma deveria dizer que não há"; fi
echo 'comentário e nada de chave' >"$T/ssh/vazio"
if has_ssh_key; then fail "um arquivo sem chave não conta"; fi
echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIexemplo dono@pc' >"$T/ssh/authorized_keys"
has_ssh_key || fail "com uma chave ed25519 deveria dizer que há"
pass "bootstrap: só desliga a senha do SSH se existir uma chave autorizada"
unset CARMINE_AUTHORIZED_KEYS_GLOB

bash "$LINUX/vps-bootstrap.sh" --dry-run --skip-check --skip-harden --core-release 0.11.0 >"$T/out.txt" 2>&1 || fail "dry-run falhou"
for expected in 'install.sh --steps deps,user,services' 'systemd-run --unit=carmine-install' '--core-release 0.11.0'; do
  grep -q -- "$expected" "$T/out.txt" || fail "plano do dry-run sem '$expected'"
done
if bash "$LINUX/vps-bootstrap.sh" --dry-run --ssh-from 'não é ip' >"$T/out.txt" 2>&1; then fail "aceitou --ssh-from inválido"; fi
bash "$LINUX/vps-bootstrap.sh" --dry-run --skip-check --ssh-from 203.0.113.7/32 >"$T/out.txt" 2>&1 || fail "dry-run com --ssh-from falhou"
grep -q 'ufw allow from 203.0.113.7/32 to any port 22' "$T/out.txt" || fail "o firewall deveria liberar o 22 só do IP informado"
grep -q 'ufw allow 27015:27016/udp' "$T/out.txt" || fail "faltou liberar o UDP do jogo"
pass "bootstrap --dry-run: plano, SSH só do IP informado e UDP do jogo"

# ---- carmine-vps-smoke -------------------------------------------------------------------------------------
H="$T/shome"
for spec in retake:27015 deathmatch:27016; do
  mkdir -p "$H/profiles/${spec%%:*}"
  printf 'PORT=%s\n' "${spec##*:}" >"$H/profiles/${spec%%:*}/profile.env"
  touch "$T/state/carmine-cs2@${spec%%:*}.service.active"
done
cat >"$T/bin/journalctl" <<'EOF'
#!/usr/bin/env bash
unit="$2"
if [[ -f "$FAKE_STATE/nolog-${unit}" ]]; then echo "[INFO] só o servidor"; exit 0; fi
echo "Metamod:Source version 2.0.0"
echo "Carmine.Core: API no ar (Postgres 2 ms, Valkey 1 ms)"
EOF
cat >"$T/bin/a2s" <<'EOF'
#!/usr/bin/env bash
[[ ! -f "$FAKE_STATE/noa2s-$1" ]] && echo 0
EOF
chmod +x "$T/bin/journalctl" "$T/bin/a2s"
mkdir -p "$T/web/api"
cat >"$T/web/api/servers" <<'EOF'
{"servers":[{"address":"retake.stcarmine.com:27015","state":"online"},{"address":"dm.stcarmine.com:27016","state":"offline"}],"summary":{"online":1,"players":0},"generatedAt":"2026-10-28T00:00:00Z"}
EOF
WPORT=$((20000 + RANDOM % 20000))
python3 -m http.server "$WPORT" --bind 127.0.0.1 --directory "$T/web" >/dev/null 2>&1 &
sleep 1
export CARMINE_CS2_HOME="$H" CARMINE_JOURNALCTL="$T/bin/journalctl" CARMINE_A2S="$T/bin/a2s" CARMINE_API_BASE_URL="http://127.0.0.1:$WPORT"
smoke() { bash "$LINUX/vps-smoke.sh" "$@"; }

if smoke >"$T/out.txt" 2>&1; then fail "o deathmatch está offline no site: deveria falhar"; fi
grep -q 'OK     retake: aparece online na lista do site' "$T/out.txt" || fail "retake deveria estar online"
grep -q 'FALHA  deathmatch: batimento' "$T/out.txt" || fail "deveria acusar o batimento do deathmatch"
pass "smoke: serviço, log e A2S ok; o servidor offline no site é acusado"

smoke --no-api >"$T/out.txt" 2>&1 || fail "sem a API deveria passar: $(grep FALHA "$T/out.txt")"
grep -q 'Tudo certo' "$T/out.txt" || fail "smoke --no-api sem a mensagem final"
pass "smoke --no-api passa quando serviço, log e A2S estão certos"

touch "$T/state/nolog-carmine-cs2@retake.service"
if smoke --no-api >"$T/out.txt" 2>&1; then fail "sem o Carmine.Core no log deveria falhar"; fi
grep -q 'FALHA  retake: Carmine.Core' "$T/out.txt" || fail "deveria acusar o Carmine.Core"
grep -q 'FALHA  retake: Metamod' "$T/out.txt" || fail "deveria acusar o Metamod"
rm -f "$T/state/nolog-carmine-cs2@retake.service"
touch "$T/state/noa2s-27016"
if smoke --no-api >"$T/out.txt" 2>&1; then fail "sem A2S deveria falhar"; fi
grep -q 'FALHA  deathmatch: A2S' "$T/out.txt" || fail "deveria acusar o A2S do deathmatch"
rm -f "$T/state/carmine-cs2@deathmatch.service.active" "$T/state/noa2s-27016"
if smoke --no-api >"$T/out.txt" 2>&1; then fail "serviço parado deveria falhar"; fi
grep -q 'FALHA  deathmatch: serviço' "$T/out.txt" || fail "deveria acusar o serviço parado"
pass "smoke: acusa Metamod/Carmine.Core ausentes, A2S mudo e serviço parado"

echo "### TUDO CERTO"
