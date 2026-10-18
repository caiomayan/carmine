#!/usr/bin/env bash
# Teste de fumaça do instalador Linux SEM os ~69 GB do CS2: sobe um contêiner ubuntu:24.04 (amd64),
# põe um esqueleto mínimo no lugar do CS2 e roda todas as outras etapas do install.sh de verdade
# (apt, SteamCMD, Metamod e CounterStrikeSharp com SHA-256, SDK do .NET + dotnet publish, plugins de
# gameplay, perfis, unidades systemd). Depois confere o resultado em in-container.sh.
#
#   ./infra/cs2/linux/test/docker-smoke.sh
#   SMOKE_CACHE=1 ./infra/cs2/linux/test/docker-smoke.sh    # reaproveita downloads entre rodadas
#
# Precisa de Docker e de internet (~600 MB: apt, SteamCMD, SDK do .NET e os zips dos plugins).
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cache=()
if [[ "${SMOKE_CACHE:-0}" == 1 ]]; then
  cache=(-v carmine-cs2-smoke-downloads:/srv/carmine-cs2/downloads -v carmine-cs2-smoke-dotnet:/opt/dotnet)
fi
MSYS_NO_PATHCONV=1 docker run --rm --platform linux/amd64 \
  -v "$REPO_ROOT:/repo:ro" "${cache[@]}" \
  ubuntu:24.04 bash /repo/infra/cs2/linux/test/in-container.sh
