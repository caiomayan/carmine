# Servidores CS2 no Linux (Ubuntu 24.04 x86_64)

Equivalente Linux de `infra/scripts/install-cs2-server.ps1`: mesmas versões e SHA-256 (`versions.sh`), mesmos perfis (`infra/cs2/profiles`), uma unidade systemd por perfil. Nada aqui é específico de nuvem — serve para a instância AWS do beta (`docs/operacao/aws-beta-cs2.md`) e para a VPS definitiva.

```sh
sudo ./infra/cs2/linux/install.sh --download-cs2     # primeira vez (~69 GB)
sudo systemctl start carmine-cs2.target              # depois de pôr chave e GSLT nos .env
```

Opções e etapas: `install.sh --help` e o cabeçalho do script. Todas as etapas são idempotentes.

## Decisões

| Pergunta | Escolha | Por quê |
| --- | --- | --- |
| Como os perfis dividem os ~69 GB? | **Hardlinks** dos arquivos do CS2 em árvores de diretórios reais (`cp -al`); só `addons/`, `cfg/` e `gameinfo.gi` são da instância. | O Source 2 monta os caminhos do jogo a partir do executável e, no Linux, `/proc/self/exe` é sempre o caminho **resolvido**: com symlinks de diretório, o `cs2` das duas instâncias estaria, na prática, na instalação base, e ambas carregariam os mesmos `addons` (config e banco compartilhados). Com hardlinks, o executável de cada instância mora no caminho da própria instância. (Raciocínio pelo comportamento do kernel; não verificado com um CS2 real, veja o fim.) Hardlinks dão o mesmo efeito da junção+hardlink do Windows com custo zero de disco (o teste confere que os arquivos têm o mesmo inode da instalação base). *Overlayfs* exigiria montagem como root no início de cada serviço (o usuário do serviço é sem privilégio) e é indefinido modificar a camada base com ela montada, justamente o que o update do CS2 faz. |
| E depois de um update do CS2? | `install.sh --steps cs2,metamod,css,build,profiles,services` com os servidores parados. | A etapa `profiles` apaga e refaz os hardlinks: arquivo trocado não fica ocupando disco em dobro, arquivo removido pela Valve some. Exige os dois servidores parados porque o SteamCMD troca arquivos que ambos usam (`docs/operacao/atualizacao-do-cs2.md`). |
| De onde vem o Carmine.Core? | **De uma release da CI** (`--core-release`, sem SDK no host), ou compilado no próprio host (`dotnet publish`, SDK 10.0.400 pinado em `/opt/dotnet`), ou `--plugin-dir` com um build pronto. | O plugin é IL puro (`net10.0`), então o binário vale em qualquer SO; compilar no host dispensa um fluxo de release na CI e garante o mesmo commit para plugin e perfis. O custo é um SDK de ~240 MB e ~2 min de compilação. |
| Onde ficam os segredos? | `/etc/carmine-cs2/<perfil>.env` (0600 root, fora do git): `CARMINE_API_KEY`, `CS2_GSLT`, `CARMINE_API_BASE_URL`. | Um lugar só por servidor. O `prestart.sh` (ExecStartPre) regrava a cada início `Carmine.Core.json` e `cfg/carmine/inventory-simulator.cfg` a partir dele; o GSLT vira `+sv_setsteamaccount` na linha de comando. Trocar token ou chave = editar e `systemctl restart`. |
| Usuário | `carmine-cs2` (sistema, sem shell, home `/srv/carmine-cs2`); unidade com `NoNewPrivileges`, `ProtectSystem=full`, `PrivateTmp`, `ProtectHome` etc. | Sem privilégio; o serviço só escreve na própria instância. |

## Layout

```
/srv/carmine-cs2/
  steamcmd/            SteamCMD
  server/              o CS2 (app 730), uma vez
  profiles/<perfil>/   game/ = hardlinks de server/game + addons/ e cfg/ próprios; profile.env (porta, mapa...)
  downloads/           zips verificados por SHA-256 (reaproveitados)
  build/Carmine.Core/  saída do dotnet publish
/etc/carmine-cs2/<perfil>.env    segredos
/usr/local/lib/carmine-cs2/prestart.sh
/etc/systemd/system/carmine-cs2@.service  carmine-cs2.target
```

## Release do plugin e espelho dos terceiros

- **Carmine.Core** vira uma GitHub Release por tag `core-vX.Y.Z` (`.github/workflows/release-plugin.yml`): `carmine-core-X.Y.Z.zip`, `manifest.json` (versão, commit, SHA-256 do zip, terceiros fixados), `SHA256SUMS` e uma atestação de proveniência. Sai sozinha quando o `ModuleVersion` sobe e o CI do `main` fica verde (ou à mão, por *Run workflow*) e nasce como pré-lançamento; só a release marcada *Latest* chega aos servidores. A promoção a *Latest* também é automática (`infra/cs2/release/promote-plugin.sh`): o `manifest.json` diz o commit em que foi construída e a promoção só acontece quando esse commit já está em produção (tag móvel `prod-live`, movida pelo `deploy.yml` depois do teste de fumaça verde). Freio: variável do repositório `PLUGIN_PROMOTION_PAUSED=true`.
- **Terceiros** continuam em `versions.sh` (URL + SHA-256). O `.github/workflows/versions-check.yml` confere toda semana que o oficial ainda entrega esse SHA-256 e, com os secrets `MIRROR_*`, mantém uma cópia **privada** no R2 do dono (`assets/<sha256>`, só de uso nosso: o RockTheVote não tem licença). O `install.sh` tenta o oficial e, se falhar ou vier com outro conteúdo, o espelho (`/etc/carmine-cs2/mirror.env`: `MIRROR_URL`, `MIRROR_ACCESS_KEY_ID`, `MIRROR_SECRET_ACCESS_KEY`, token só de leitura). Cair no espelho nunca troca a versão fixada: o objeto é endereçado pelo próprio SHA-256.
- Teste sem rede (manifesto, espelho e o `versions-check`): `bash infra/cs2/test/release-and-mirror.test.sh` (jq, curl, python3; roda no `verify` do CI).

## Entrega do plugin aos servidores (`carmine-plugin-deploy`)

Instalado pela etapa `services` em `/usr/local/sbin/carmine-plugin-deploy`. Sem compilar nada no host:

```sh
sudo install.sh --core-release latest --steps build,profiles,services   # instala a release Latest (e liga o timer)
sudo carmine-plugin-deploy                      # entrega a Latest, Retake e depois Deathmatch, um de cada vez
sudo carmine-plugin-deploy --version 0.12.0 --server deathmatch   # um número vale mesmo em pré-lançamento: teste num servidor
sudo carmine-plugin-deploy --rollback           # cada servidor volta à versão de antes do último deploy (sem rede)
sudo carmine-plugin-deploy --dry-run
```

- "Latest" é a release `core-v*` que **não** é pré-lançamento: promover a release no GitHub (depois do release da API em produção) é o que a libera. O `carmine-plugin-sync.timer` (a cada 10 min) roda `--version latest --when-empty --no-wait`: só mexe em servidor **vazio** (A2S local, sem contar bots) e adia o ocupado (saída 75, sem erro). `systemctl disable --now carmine-plugin-sync.timer` congela as versões.
- Por servidor: confere a release (SHA-256 contra o `SHA256SUMS` e o manifesto, atestação se o `gh` existir), para o serviço, troca `plugins/Carmine.Core` (cópia, sem links), sobe e espera ficar saudável: serviço de pé, o Carmine.Core falou no journal e nenhum erro de carga. Não ficou saudável: devolve a pasta anterior, sobe, **para** (os outros servidores não são tocados), marca a versão em `releases/failed-versions` (o timer não a repete) e avisa no Discord (`DISCORD_ALERT_WEBHOOK_URL` em `/etc/carmine-cs2/alerts.env`).
- Não há aviso no chat do jogo antes de reiniciar (o servidor não expõe RCON); por isso o `--when-empty` do timer. Um deploy manual derruba o servidor por ~1 min.
- Estado: `releases/core-X.Y.Z/` (as 3 mais novas e as em uso), `profiles/<perfil>/carmine-core.version` e `carmine-core.previous`.
- Testes sem CS2 nem GitHub: `bash infra/cs2/test/plugin-deploy.test.sh` e `python3 -m unittest infra/cs2/test/test_a2s.py` (rodam no `verify` do CI).

## Preparar uma VPS nova (um clone, um comando)

```sh
git clone https://github.com/caiomayan/carmine /opt/carmine-src
sudo /opt/carmine-src/infra/cs2/linux/vps-bootstrap.sh --ssh-from <seu IP>/32
```

O `vps-bootstrap.sh` roda o `carmine-vps-check` (x86-64, Ubuntu 24.04, RAM, disco, CPU, banda; FALHA aborta antes de gastar 69 GB), endurece a máquina (SSH só por chave, **somente se já houver uma chave autorizada**; ufw com o UDP do jogo e o 22 só do seu IP; fail2ban; atualizações de segurança sem reboot; chrony; swap; buffers UDP), instala os comandos e dispara o download do CS2 como unidade do systemd. Depois:

| Comando | Para quê |
| --- | --- |
| `carmine-secrets profile <perfil>` | chave do servidor e GSLT, digitados sem eco, direto em `/etc/carmine-cs2/<perfil>.env` (0600) |
| `carmine-secrets gslt <perfil>` | troca de token banido; reinicia só esse servidor |
| `carmine-secrets alerts` / `mirror` / `show` | webhook do Discord, espelho R2 dos terceiros, o que já está preenchido |
| `carmine-vps-smoke --start` | sobe e confere cada servidor: serviço, Metamod, Carmine.Core, GSLT, A2S e a lista pública do site |
| `carmine-cs2-update` | atualiza o CS2 sozinho (timer a cada 10 min): ver abaixo |

**Atualização automática do CS2** (`carmine-cs2-update.timer`): compara o buildid do app 730 na Steam com o instalado. Build novo: espera os servidores esvaziarem (até 20 min; depois atualiza assim mesmo, porque a Valve já barra a entrada), avisa no Discord, faz `git pull --ff-only` do clone, para tudo, roda `install.sh --download-cs2 --steps cs2,metamod,css,build,profiles,services` com a mesma release do Carmine.Core, sobe e confere a saúde de cada servidor. Deu certo: aviso verde. Falhou: os servidores **ficam parados** (subir sem o CounterStrikeSharp funcionando enganaria o jogador), o build fica marcado e o aviso vermelho traz o trecho do log; depois de corrigir (versão do plugin em `versions.sh` ou release nova do Carmine.Core), `carmine-cs2-update --force`.

Testes sem CS2 nem VPS: `bash infra/cs2/test/{cs2-update,vps-tools,plugin-deploy}.test.sh` (rodam no `verify` do CI).

## Operação

```sh
systemctl status carmine-cs2.target carmine-cs2@retake carmine-cs2@deathmatch
journalctl -u carmine-cs2@retake -f
systemctl restart carmine-cs2@deathmatch         # só um
systemctl stop carmine-cs2.target                # antes de atualizar o CS2
```

O CounterStrikeSharp no Linux precisa do `steamclient.so` em `~/.steam/sdk64` (a etapa `steamcmd` cria o link) e do `libicu` (etapa `deps`).

## Teste sem baixar o CS2

`test/docker-smoke.sh` sobe um `ubuntu:24.04` amd64, põe um esqueleto no lugar do CS2 e roda o instalador de verdade (apt, SteamCMD, Metamod e CounterStrikeSharp com SHA-256, SDK do .NET, plugins, perfis, systemd) conferindo hardlinks, idempotência, update simulado, o `prestart.sh` e `systemd-analyze verify`. Precisa de Docker e ~600 MB de downloads. Lint: `shellcheck -x -s bash infra/cs2/linux/*.sh infra/cs2/linux/test/*.sh`.

O que o teste **não** cobre (precisa de um CS2 real): o servidor abrir de fato com a instância em hardlinks, o Metamod/CounterStrikeSharp carregarem e a conexão com a Steam — isso é a conferência manual do runbook da AWS.
