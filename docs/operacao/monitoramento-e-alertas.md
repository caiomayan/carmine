# Monitoramento e alertas

Quem avisa o quê, e onde cai. Tudo chega num canal de alertas do Discord (webhook em `DISCORD_ALERT_WEBHOOK_URL`).

| O que quebra | Quem percebe | Em quanto tempo | Onde chega |
| --- | --- | --- | --- |
| Servidor CS2 offline | a própria API (`src/alerts/`) | ~2 min (45 s de presença + 60 s de confirmação + varredura de 15 s) | Discord, 🔴 e depois 🟢 ao voltar |
| Site (web) ou API fora do ar | monitor externo (grátis, passo do dono) | 1 a 5 min | Discord / e-mail do monitor |
| Backup do Postgres falhou | o `backup.sh` | na hora | Discord 🔴 |
| Backup não rodou | heartbeat do backup (opcional) | até 24 h + tolerância | monitor de cron |
| Exceção no web ou na API | Sentry | na hora | Sentry (e-mail/Discord se ligar) |
| Deploy falhou | GitHub Actions (job vermelho) | na hora | e-mail do GitHub |

## Servidor CS2 offline (aceite da S09: "até 5 minutos")

A Presença já marca o Servidor Carmine offline quando passa `SERVER_OFFLINE_AFTER_SECONDS` (45 s) sem batimento do Carmine.Core. `ServerAlerts` (a cada `ALERT_SWEEP_SECONDS`, 15 s, com ou sem visitantes no site) lê a mesma lista da home e entrega as transições ao `ServerOfflineTracker`:

- offline contínuo por `ALERT_SERVER_OFFLINE_CONFIRM_SECONDS` (60 s) → **um** aviso "🔴 *nome* está offline há N min";
- voltou depois de avisado → "🟢 *nome* voltou depois de N min";
- uma queda curta (troca de mapa, reinício rápido) não avisa nem gera "voltou".

O estado fica em memória. Depois de reiniciar a API (todo deploy), um servidor que continua fora avisa de novo uma vez. Sem `DISCORD_ALERT_WEBHOOK_URL`, nada roda. Falha do Discord ou do Valkey vai para o log e nunca derruba a API. Teste de aceite: `apps/api/test/server-alerts.int-spec.ts` (webhook falso, batimento que para e volta).

Cobre a queda do **processo/plugin** (some o batimento). Servidor travado mas com o processo vivo, ou rede UDP ruim, não: para isso o plano é a consulta A2S da S09b.

## Site e API fora do ar: monitor externo

Alerta que mora na própria VM não avisa quando a VM cai. Crie, em UptimeRobot ou Better Stack (planos grátis bastam), dois monitores HTTP a cada 1–5 min:

- `https://stcarmine.com/` (esperar 200; palavra-chave opcional "Carmine").
- `https://stcarmine.com/api/health` (esperar 200; devolve 503 quando Postgres ou Valkey estão fora).

Ligue o aviso a um webhook do Discord (os dois têm integração pronta) ou a e-mail. Um terceiro monitor, tipo *heartbeat*, recebe o ping do backup noturno (`BACKUP_HEARTBEAT_URL`).

## Sentry

- **API** (`@sentry/node`, só erros): `API_SENTRY_DSN`. Captura erro inesperado e 5xx; 4xx não. Sem DSN, desligado.
- **Web**: `WEB_SENTRY_DSN`. Servidor (`instrumentation.ts`, erros de renderização e do proxy) e navegador (SDK carregado depois da hidratação, fora da primeira carga; a CSP ganha a origem de ingestão do DSN sozinha). O DSN é lido em tempo de execução, não no build.
- Sem tracing, sem replay, sem breadcrumbs no navegador, e sem dados pessoais (LGPD): IP/usuário, cookies, cabeçalhos, corpos e query string desligados (`dataCollection`). O `SENTRY_RELEASE` é a tag da imagem, então cada erro mostra em qual deploy nasceu.
- Teste de fumaça da API na VM: `/opt/carmine/bin/dc exec api node dist/sentry/test-event.cli.js` (deve imprimir "Evento entregue ao Sentry" e o evento aparece no projeto).
- **Plugins .NET**: ficam para a S09b, junto com o servidor de produção (o `Sentry` para .NET entra no Carmine.Core).
