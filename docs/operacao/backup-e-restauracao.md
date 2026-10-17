# Backup e restauração do Postgres

Aceite da S09: "uma restauração de backup num banco limpo recupera os dados do dia anterior". Arquivos: `infra/prod/ops/` (scripts), `infra/docker/ops.Dockerfile`, `infra/prod/test/backup-restore.sh`.

## Como funciona

- O serviço `backup` do compose roda `scheduler.sh`, que dispara `backup.sh` todo dia às **03:00 de Brasília (06:00 UTC)**, `BACKUP_HOUR_UTC` muda.
- `pg_dump -Fc -Z 6`: formato custom (comprimido, permite restaurar tabelas isoladas). Antes de valer, `pg_restore --list` confere que o dump é legível.
- O dump fica em `/backups` (volume `backups`, os 3 mais novos) e vai para o **Cloudflare R2**, em `postgres/carmine-<AAAAMMDDTHHMMSSZ>.dump` com o `.sha256`. O envio é conferido (`rclone check`).
- **Retenção**: `BACKUP_RETENTION_DAYS` (padrão 30 dias no R2; a poda roda a cada backup).
- **Falha** (dump, R2 não configurado, envio): aviso no Discord (`DISCORD_ALERT_WEBHOOK_URL`) e exit 1. Silêncio também é falha: configure `BACKUP_HEARTBEAT_URL` com um *heartbeat* (Better Stack, healthchecks.io); o backup o chama ao concluir e o monitor avisa quando o ping para de chegar.
- O Valkey **não** entra no backup: guarda sessões, limites e presença, tudo recriável (as pessoas só precisariam entrar de novo).
- Antes de cada deploy com migração, o `deploy.sh` faz um dump local (`backup.sh local`).

Credenciais do R2 vêm do ambiente (`R2_BUCKET`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`); nenhum arquivo com segredo no disco.

## Rodar um backup agora

`/opt/carmine/bin/dc` é o `docker compose` já apontado para a release no ar (compose, `.env` e tag certos):

```bash
/opt/carmine/bin/dc exec backup /opt/ops/backup.sh full
```

## Restaurar

`restore.sh <origem> <banco-destino>` restaura **num banco novo ou vazio e recusa um banco que já tem tabelas** (nada é sobrescrito por engano). Origem: `latest` (o mais novo do R2), `r2:carmine-AAAA....dump` ou um caminho de `.dump`.

### Ensaio (não afeta a produção)

Restaura o último backup num banco ao lado e confere os números:

```bash
/opt/carmine/bin/dc exec backup \
  /opt/ops/restore.sh latest carmine_ensaio
/opt/carmine/bin/dc exec postgres \
  psql -U carmine -d carmine_ensaio -c 'SELECT count(*) FROM accounts'
/opt/carmine/bin/dc exec postgres \
  dropdb -U carmine carmine_ensaio
```

Faça isso uma vez por mês: backup que nunca foi restaurado não é backup.

### Desastre (perdeu o banco ou os dados estão corrompidos)

1. Pare quem escreve: `/opt/carmine/bin/dc stop web api`.
2. Restaure para um banco novo: `... exec backup /opt/ops/restore.sh latest carmine_restaurado`. Confira as contagens que o script imprime.
3. Troque os bancos (o `postgres` fica no ar):

   ```bash
   /opt/carmine/bin/dc exec postgres psql -U carmine -d postgres -c \
     "ALTER DATABASE carmine RENAME TO carmine_antigo" -c "ALTER DATABASE carmine_restaurado RENAME TO carmine"
   ```

   (se houver conexões abertas, `stop` já as derrubou; se o rename reclamar, termine-as com `pg_terminate_backend`).
4. Suba: `/opt/carmine/bin/dc up -d --wait` (ou *Run workflow* no commit atual). A migração do deploy leva o schema à versão do código.
5. Depois de confirmar o site, `DROP DATABASE carmine_antigo`.

Perda possível: tudo desde o último backup (até 24 h). Se o dump local do último deploy for mais novo (`/opt/carmine/bin/dc run --rm --no-deps --entrypoint ls backup -l /backups`), restaure dele: `restore.sh /backups/carmine-....dump carmine_restaurado`.

Disco do Postgres inteiro perdido (VM nova): `bootstrap.sh`, `.env` de novo, `bin/tunnel` (o deploy chega pelo túnel), deploy, e então os passos acima a partir do 2.

## Teste local (aceite)

`infra/prod/test/backup-restore.sh` faz o ciclo completo com Docker e sem tocar em produção: Postgres 18 migrado com as migrações da API, dados gravados, backup noturno de verdade para um S3 de mentira (`rclone serve s3`, no lugar do R2), banco original apagado, `restore.sh latest` num banco limpo, conferência de tabelas e linhas, e a recusa de restaurar por cima de um banco com dados. Rodou verde em 2026-10-17.
