#!/usr/bin/env bash
# Roda DENTRO do contêiner (ver docker-smoke.sh). O repositório está em /repo, somente leitura.
set -euo pipefail

echo "### cópia de trabalho do repositório"
mkdir -p /work/repo
(cd /repo && tar -cf - --exclude=node_modules --exclude=.git --exclude=bin --exclude=obj --exclude=.maestri \
  infra/cs2 plugins apps/api/openapi.json) | tar -xf - -C /work/repo
INSTALL=/work/repo/infra/cs2/linux/install.sh
chmod +x "$INSTALL" /work/repo/infra/cs2/linux/prestart.sh
HOME_DIR=/srv/carmine-cs2
G="$HOME_DIR/server/game"
P="$HOME_DIR/profiles"

check() { # check <descrição> <comando...>
  local desc="$1"
  shift
  if "$@"; then echo "ok   - $desc"; else echo "FALHOU - $desc" >&2; exit 1; fi
}

echo "### 1. deps, user, steamcmd"
"$INSTALL" --steps deps,user,steamcmd
apt-get install -y -qq --no-install-recommends systemd >/dev/null
check "steamclient.so ligado em ~/.steam/sdk64" test -e "$HOME_DIR/.steam/sdk64/steamclient.so"

echo "### 2. esqueleto do CS2 (no lugar do app 730)"
mkdir -p "$G/bin/linuxsteamrt64" "$G/core" "$G/csgo/maps" "$G/csgo/cfg" "$G/csgo/bin/linuxsteamrt64"
printf '#!/bin/sh\necho cs2 falso "$@"\n' >"$G/bin/linuxsteamrt64/cs2"
chmod +x "$G/bin/linuxsteamrt64/cs2"
head -c 1048576 /dev/urandom >"$G/csgo/pak01_000.vpk"
head -c 1048576 /dev/urandom >"$G/core/pak01_000.vpk"
printf 'x' >"$G/csgo/maps/de_dust2.vpk"
# sem quebra de linha no fim, como o server.cfg real
printf '// padrao da Valve\nhostname "Valve"' >"$G/csgo/cfg/server.cfg"
printf '%s\n' '"GameInfo"' '{' $'\tFileSystem' $'\t{' $'\t\tSearchPaths' $'\t\t{' \
  $'\t\t\tGame_LowViolence\tcsgo_lv // Perfect World content override' \
  $'\t\t\tGame\t\t\tcsgo' $'\t\t}' $'\t}' '}' >"$G/csgo/gameinfo.gi"
chown -R carmine-cs2:carmine-cs2 "$HOME_DIR/server"

echo "### 3. metamod, css, build, profiles, services (de verdade)"
"$INSTALL" --steps metamod,css,build,profiles,services

verify() {
  local r
  echo "### conferências"
  check "gameinfo.gi da base registra o Metamod uma vez" test "$(grep -c 'csgo/addons/metamod' "$G/csgo/gameinfo.gi")" = 1
  check "Metamod entra logo depois do csgo_lv, com a mesma indentação" \
    grep -Pzq 'csgo_lv[^\n]*\n\t\t\tGame\tcsgo/addons/metamod\n' "$G/csgo/gameinfo.gi"
  check "Metamod linux na base" test -f "$G/csgo/addons/metamod/bin/linuxsteamrt64/metamod.2.cs2.so"
  check "CounterStrikeSharp linux na base" test -x "$G/csgo/addons/counterstrikesharp/dotnet/dotnet"
  for r in retake deathmatch; do
    check "$r: instância montada" test -x "$P/$r/game/bin/linuxsteamrt64/cs2"
    check "$r: arquivo do CS2 é hardlink (mesmo inode, sem copiar)" \
      test "$(stat -c %i "$P/$r/game/csgo/pak01_000.vpk")" = "$(stat -c %i "$G/csgo/pak01_000.vpk")"
    check "$r: gameinfo.gi é da instância e traz o Metamod" grep -q 'csgo/addons/metamod' "$P/$r/game/csgo/gameinfo.gi"
    check "$r: addons é da instância (não é a mesma árvore da base)" \
      test "$(stat -c %i "$P/$r/game/csgo/addons")" != "$(stat -c %i "$G/csgo/addons")"
    check "$r: Carmine.Core instalado" test -f "$P/$r/game/csgo/addons/counterstrikesharp/plugins/Carmine.Core/Carmine.Core.dll"
    check "$r: InventorySimulator instalado" test -f "$P/$r/game/csgo/addons/counterstrikesharp/plugins/InventorySimulator/InventorySimulator.dll"
    check "$r: RockTheVote" test -d "$P/$r/game/csgo/addons/counterstrikesharp/plugins/RockTheVote"
    check "$r: CS2MenuManager (shared)" test -d "$P/$r/game/csgo/addons/counterstrikesharp/shared/CS2MenuManager"
    check "$r: server.cfg do perfil com o exec do invsim" grep -qx 'exec carmine/inventory-simulator.cfg' "$P/$r/game/csgo/cfg/server.cfg"
    check "$r: profile.env gerado" grep -q '^PORT=270' "$P/$r/profile.env"
    check "$r: dono é o usuário do serviço" test "$(stat -c %U "$P/$r/game/csgo/addons")" = carmine-cs2
  done
  check "retake: alocador com gamedata" \
    test -f "$P/retake/game/csgo/addons/counterstrikesharp/plugins/RetakesAllocator/gamedata/RetakesAllocator_gamedata.json"
  check "retake: RetakesPlugin" test -d "$P/retake/game/csgo/addons/counterstrikesharp/plugins/RetakesPlugin"
  check "retake: {{csgoDir}} substituído na config do alocador" \
    grep -q "$P/retake/game/csgo/addons/counterstrikesharp/data/RetakesAllocator/allocator.db" \
    "$P/retake/game/csgo/addons/counterstrikesharp/configs/plugins/RetakesAllocator/config.json"
  check "deathmatch: plugin Deathmatch" test -d "$P/deathmatch/game/csgo/addons/counterstrikesharp/plugins/Deathmatch"
  # Idiomas em português (S16): o do alocador e o do Deathmatch vêm do perfil (os plugins só trazem en).
  check "retake: lang pt-BR do alocador" \
    jq -e 'has("announcement.roundtype")' "$P/retake/game/csgo/addons/counterstrikesharp/plugins/RetakesAllocator/lang/pt-BR.json"
  check "retake: lang pt-BR do RetakesPlugin e do RockTheVote (vêm nos zips)" \
    test -f "$P/retake/game/csgo/addons/counterstrikesharp/plugins/RetakesPlugin/lang/pt-BR.json" \
    -a -f "$P/retake/game/csgo/addons/counterstrikesharp/plugins/RockTheVote/lang/pt-BR.json"
  check "deathmatch: lang pt-BR do Deathmatch" \
    jq -e 'has("Chat.Prefix")' "$P/deathmatch/game/csgo/addons/counterstrikesharp/plugins/Deathmatch/lang/pt-BR.json"
  check "retake: 50 rounds por mapa" grep -qx 'mp_maxrounds 50' "$P/retake/game/csgo/cfg/cs2-retakes/retakes.cfg"
  check "deathmatch: 5 mapas na votação" \
    test "$(grep -vc '^//' "$P/deathmatch/game/csgo/addons/counterstrikesharp/plugins/RockTheVote/maplist.txt")" = 5
  check "env de exemplo criado com 0600" test "$(stat -c %a /etc/carmine-cs2/retake.env)" = 600
  check "unidade e target instalados" test -f /etc/systemd/system/carmine-cs2@.service -a -f /etc/systemd/system/carmine-cs2.target
  check "unidades habilitadas (links do enable)" test -L /etc/systemd/system/carmine-cs2.target.wants/carmine-cs2@retake.service
  check "carmine-plugin-deploy instalado e achando a biblioteca pelo link"     bash -c 'carmine-plugin-deploy --help | grep -q -- --rollback'
  check "helper A2S instalado" test -x /usr/local/lib/carmine-cs2/a2s-players.py
  for cmd in carmine-secrets carmine-vps-check carmine-vps-smoke carmine-cs2-update; do
    check "comando $cmd instalado e com --help" bash -c "$cmd --help | head -n 1 | grep -q ."
  done
  check "carmine-vps-check roda e lista os itens" bash -c "carmine-vps-check --no-network --machine | grep -q '|arquitetura|'"
  check "unidades do update do CS2 instaladas" test -f /etc/systemd/system/carmine-cs2-update.service -a -f /etc/systemd/system/carmine-cs2-update.timer
  check "versão do plugin registrada por instância (compilado no host = local)"     test "$(cat "$P/retake/carmine-core.version")" = local
  check "o timer de entrega só liga com release instalada (aqui compilou no host)"     test ! -e /etc/systemd/system/timers.target.wants/carmine-plugin-sync.timer
}
verify

echo "### 4. idempotência: rodar tudo de novo não muda nem quebra nada"
echo 'CARMINE_API_KEY=chave-do-teste-123' >>/etc/carmine-cs2/retake.env
before="$(sha256sum /etc/carmine-cs2/retake.env)"
"$INSTALL" --steps metamod,css,build,profiles,services
check "env existente foi mantido" test "$before" = "$(sha256sum /etc/carmine-cs2/retake.env)"
verify

echo "### 5. simulando um update do CS2: arquivo removido e arquivo novo"
rm "$G/csgo/maps/de_dust2.vpk"
head -c 1048576 /dev/urandom >"$G/csgo/maps/de_mirage.vpk"
"$INSTALL" --steps profiles
check "arquivo removido na base sumiu da instância" test ! -e "$P/retake/game/csgo/maps/de_dust2.vpk"
check "arquivo novo apareceu como hardlink" \
  test "$(stat -c %i "$P/retake/game/csgo/maps/de_mirage.vpk")" = "$(stat -c %i "$G/csgo/maps/de_mirage.vpk")"


echo "### 6. prestart.sh grava as configs a partir do ambiente"
run_prestart() { # run_prestart <perfil> [VAR=valor...]
  local profile="$1"
  shift
  runuser -u carmine-cs2 -- env -i HOME="$HOME_DIR" PATH="$PATH" "$@" \
    bash -c "set -a; . $HOME_DIR/profiles/$profile/profile.env; set +a; exec /usr/local/lib/carmine-cs2/prestart.sh $profile"
}
rc=0
run_prestart retake CARMINE_API_KEY= CS2_GSLT=abc123 || rc=$?
check "sem chave a unidade falha com 78 (EX_CONFIG)" test "$rc" = 78
run_prestart retake CARMINE_API_KEY=chave-do-teste-123 CS2_GSLT=ABCDEF0123456789ABCDEF0123456789
CORE="$P/retake/game/csgo/addons/counterstrikesharp/configs/plugins/Carmine.Core/Carmine.Core.json"
INVSIM="$P/retake/game/csgo/cfg/carmine/inventory-simulator.cfg"
check "Carmine.Core.json é JSON válido" jq -e . "$CORE" >/dev/null
check "ApiBaseUrl de produção" test "$(jq -r .ApiBaseUrl "$CORE")" = https://stcarmine.com
check "ApiKey veio do ambiente" test "$(jq -r .ApiKey "$CORE")" = chave-do-teste-123
check "vagas do profile.json (retake: 9 públicas, reservada retake)" \
  test "$(jq -r '"\(.PublicSlots)/\(.ReservedSlots)"' "$CORE")" = 9/retake
check "invsim_apikey no cfg" grep -q '^invsim_apikey "chave-do-teste-123"$' "$INVSIM"
check "retake: invsim_fallback_team 0" grep -q '^invsim_fallback_team 0$' "$INVSIM"
check "FollowCS2ServerGuidelines desligado" \
  grep -q '"FollowCS2ServerGuidelines": false' "$P/retake/game/csgo/addons/counterstrikesharp/configs/core.json"
check "ServerLanguage em pt-BR" \
  grep -q '"ServerLanguage": "pt-BR"' "$P/retake/game/csgo/addons/counterstrikesharp/configs/core.json"
check "config com segredo é 0600" test "$(stat -c %a "$CORE")" = 600
run_prestart deathmatch CARMINE_API_KEY=outra-chave CS2_GSLT=ABCDEF0123456789ABCDEF0123456789 CARMINE_API_BASE_URL=https://exemplo.test/api
check "deathmatch: fallback_team 1" grep -q '^invsim_fallback_team 1$' "$P/deathmatch/game/csgo/cfg/carmine/inventory-simulator.cfg"
check "deathmatch: API do ambiente (o /api do fim é removido, #34)" grep -q '^invsim_url "https://exemplo.test"$' "$P/deathmatch/game/csgo/cfg/carmine/inventory-simulator.cfg"
rc=0
run_prestart retake CARMINE_API_KEY='a"b' CS2_GSLT=x 2>/dev/null || rc=$?
check "chave com aspas é recusada (sem injeção no JSON)" test "$rc" = 78

echo "### 7. systemd-analyze verify"
printf 'CARMINE_API_KEY=k\nCS2_GSLT=g\n' >/etc/carmine-cs2/retake.env
systemd-analyze verify /etc/systemd/system/carmine-cs2@retake.service /etc/systemd/system/carmine-cs2.target \
  /etc/systemd/system/carmine-plugin-sync.service /etc/systemd/system/carmine-plugin-sync.timer \
  /etc/systemd/system/carmine-cs2-update.service /etc/systemd/system/carmine-cs2-update.timer
echo "ok   - unidades válidas"

echo "### TUDO CERTO"
