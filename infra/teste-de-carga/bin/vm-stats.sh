#!/usr/bin/env bash
# SÓ LEITURA. Roda NA VM, durante o teste de carga, e imprime em CSV a CPU e a memória de cada contêiner (os da
# homologação E os da produção), mais a memória disponível e a carga da VM inteira. Não escreve em disco, não
# mexe em contêiner nenhum. Uso (a partir do PC do dono, pelo SSH dele):
#
#   ssh vm-carmine 'bash -s -- 10 7200' < infra/teste-de-carga/bin/vm-stats.sh > vm-stats.csv
#
# Argumentos: intervalo entre amostras em segundos (padrão 10) e duração total em segundos (padrão 3600).
# A coluna cpu_pct é do `docker stats`: 100 = um núcleo inteiro (a VM tem 2, então o teto é 200).
set -euo pipefail

intervalo="${1:-10}"
duracao="${2:-3600}"
[[ "$intervalo" =~ ^[0-9]+$ && "$duracao" =~ ^[0-9]+$ ]] || { echo "uso: vm-stats.sh [intervalo_s] [duracao_s]" >&2; exit 1; }

echo "instante,nome,cpu_pct,mem_mb,mem_limite_mb"
fim=$((SECONDS + duracao))
while ((SECONDS < fim)); do
  inicio=$SECONDS
  instante="$(date -u +%FT%TZ)"
  docker stats --no-stream --format '{{.Name}};{{.CPUPerc}};{{.MemUsage}}' | awk -F';' -v t="$instante" '
    function mb(texto,   n, u) {
      n = texto + 0; u = texto; gsub(/[0-9.]/, "", u)
      if (u ~ /^GiB/) return n * 1024
      if (u ~ /^MiB/) return n
      if (u ~ /^KiB/) return n / 1024
      if (u ~ /^B/)   return n / 1048576
      return n
    }
    {
      split($3, partes, " / ")
      cpu = $2; gsub(/%/, "", cpu)
      printf "%s,%s,%s,%.1f,%.1f\n", t, $1, cpu, mb(partes[1]), mb(partes[2])
    }'
  awk -v t="$instante" '
    /^MemTotal:/ { total = $2 } /^MemAvailable:/ { livre = $2 }
    END { printf "%s,vm:memoria,,%.1f,%.1f\n", t, (total - livre) / 1024, total / 1024 }' /proc/meminfo
  awk -v t="$instante" '{ printf "%s,vm:carga-1min,%s,,\n", t, $1 }' /proc/loadavg
  gasto=$((SECONDS - inicio))
  ((gasto < intervalo)) && sleep $((intervalo - gasto))
done
