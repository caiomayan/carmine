# Runner próprio do CI

O CI e o deploy podem rodar num runner do GitHub Actions no PC do dono, em vez dos runners do GitHub. Ele existe para quando os minutos grátis do mês acabam: o orçamento do Actions é **US$ 0**, então, sem minutos, a CI do GitHub para e nenhum merge passa no ruleset.

## Como liga e desliga

A variável do repositório `CI_RUNNER` (*Settings > Secrets and variables > Actions > Variables*) escolhe o runner de todos os jobs do `ci.yml` e do `deploy.yml`:

| `CI_RUNNER` | Onde roda |
|---|---|
| `["self-hosted","carmine"]` | No runner próprio, que precisa estar ligado |
| sem a variável | Nos runners do GitHub (`ubuntu-24.04`), gastando os minutos do mês |

Quando os minutos voltam (dia 1º), apague a variável para voltar aos runners do GitHub. Um PR que já estava aberto precisa de um push (ou *Update branch*) para a CI rodar no lugar novo.

## O runner

- **Onde:** distro `Ubuntu-24.04` do WSL, usuário `gha`, pasta `~/actions-runner`. O nome no GitHub é `carmine-pc`, com o rótulo `carmine`.
- **Isolado do Windows** (`/etc/wsl.conf`): sem os discos do Windows montados (`[automount] enabled=false`) e sem executar programas do Windows (`[interop] enabled=false`). O código da CI só enxerga o próprio Ubuntu.
- **Docker próprio:** o `dockerd` do Ubuntu, separado do Docker Desktop. Os bancos do E2E não tocam os do desenvolvimento.
- **Imagens arm64:** emuladas pelo QEMU (`tonistiigi/binfmt`), que o script de partida registra.

## Ligar

O runner só pega jobs enquanto está ligado, e o PC precisa ficar ligado durante a CI (~20–30 min por PR). Em um terminal do Windows:

```
wsl -d Ubuntu-24.04 -u gha --exec /home/gha/start-runner.sh
```

O script sobe o Docker do Ubuntu, registra o arm64 e deixa o runner em primeiro plano. Para desligar, `Ctrl+C`. Os jobs que chegarem com ele desligado ficam na fila e começam quando ele volta.

## Cuidados

- **Um job por vez.** O runner é único, então os jobs de um PR rodam em sequência.
- **Memória.** O WSL tem ~8 GB. Evite rodar a CI com vários agentes e servidores de desenvolvimento pesados ao mesmo tempo.
- **Quem pode rodar código nele:** qualquer workflow do repositório. Ele é privado e só o dono faz push, e as actions estão fixadas por commit. Não abra o repositório a colaboradores sem rever isto.
- **Segredos do deploy:** a chave SSH vai para o `RUNNER_TEMP`, que o runner apaga ao fim de cada job.

## Remover

1. *Settings > Actions > Runners > carmine-pc > Remove*.
2. Apague a variável `CI_RUNNER`.
3. Apague a distro: `wsl --unregister Ubuntu-24.04` (apaga tudo dentro dela).
