# Lançamento dos servidores CS2 na VPS (o dia da compra)

Runbook de uma tarde: do "comprei a VPS" até Retake (27015) e Deathmatch (27016) no ar, com o plugin e o CS2 se atualizando sozinhos. Proposta e decisões: `carmine-lancamento-cs2.md` (Maestri). O que existe: `infra/cs2/linux/README.md`. Substitui, para a VPS definitiva, a parte da AWS de `aws-beta-cs2.md`.

**Tempo no dia: ~2,5 a 4 h**, quase tudo espera do download de ~69 GB (25 a 90 min conforme a banda). A parte ativa é de ~40 min.

## Antes do dia (só o dono; cada item tem o seu "como")

| # | O quê | Como |
| --- | --- | --- |
| 1 | **Comprar a VPS** (Enxadahost VPS.4 Plano II) e **conferir antes de pagar** | Ubuntu 24.04 no modelo de instalação; KVM; ≥ 120 GB de NVMe; 4 vCPU e 8 GB; CPU de clock alto (o CS2 depende de um núcleo, prefira ≥ 3 GHz); IPv4 fixo; **mitigação de DDoS que cubra UDP 27015-27016** (de jogo, não só HTTP); acesso root por SSH com chave; franquia de banda (os updates do CS2 são centenas de MB). Pergunte ao suporte o que não estiver na página. O `carmine-vps-check` confere o que dá no dia. |
| 2 | **Dois tokens GSLT** + 1 a 3 de reserva | <https://steamcommunity.com/dev/managegameservers>, App ID 730, **contas Steam distintas** com telefone, memo `carmine-retake-1` etc. Guarde no gerenciador de senhas (`troca-de-token-gslt.md`). Nunca no chat. |
| 3 | **DNS** `retake.stcarmine.com` e `dm.stcarmine.com` | Cloudflare > DNS > registros **A** para o IP da VPS, **Proxy status: DNS only (nuvem cinza)**: a Cloudflare não faz proxy de UDP. Trocar de VPS no futuro vira mudar o registro, sem `servers create` de novo. Pode ser feito no dia, assim que souber o IP. |
| 4 | **Webhook do Discord** dos alertas da VPS | Pode ser o mesmo do `DISCORD_ALERT_WEBHOOK_URL` da API (formato `https://discord.com/api/webhooks/<id>/<token>`). Vai para o `carmine-secrets alerts`. |
| 5 | **Espelho dos terceiros (bucket R2 privado)** | Cloudflare > R2 > *Create bucket* (ex.: `carmine-cs2-espelho`, **privado**: nunca ative acesso público, o RockTheVote não tem licença para redistribuir). Depois *Manage R2 API Tokens* > dois tokens **só desse bucket**: um de **leitura e escrita** (vai para o GitHub) e um **só de leitura** (vai para a VPS). Anote o endereço S3 `https://<conta>.r2.cloudflarestorage.com`. |
| 6 | **Secrets do espelho no GitHub** | *Settings > Secrets and variables > Actions*: `MIRROR_URL` = `https://<conta>.r2.cloudflarestorage.com/<bucket>`, `MIRROR_ACCESS_KEY_ID` e `MIRROR_SECRET_ACCESS_KEY` (o token de escrita). Depois *Actions > Terceiros do CS2 > Run workflow*: ele confere os terceiros e **envia as cópias** ao bucket (a primeira vez prova que o R2 aceita o envio). O relatório sai no resumo do job; uma issue abre sozinha se algo faltar. |
| 7 | Aprovar o download de ~69 GB e a banda da VPS | Ok para você? Há franquia? |

**Com o maestro:** `servers create` na VM de produção (passo 3a do dia) e a validação no jogo. A release do Carmine.Core é automática (abaixo): basta o `ModuleVersion` estar no `main` e a API dele em produção.

### A release do Carmine.Core (automática)

O plugin chega à VPS por **release do GitHub** (`infra/cs2/linux/README.md`) e **ninguém precisa criar tag nem clicar em nada**:

1. **Subir o `ModuleVersion`** em `plugins/src/Carmine.Core/CorePlugin.cs` num PR é o gatilho. Quando o CI do `main` termina verde, o workflow *Release do plugin* vê que ainda não existe a tag `core-vX.Y.Z`, testa, publica e cria a release como **pré-lançamento** (`carmine-core-X.Y.Z.zip`, `carmine-deathmatch-X.Y.Z.zip`, `manifest.json`, `SHA256SUMS`, atestação). O zip do Deathmatch traz as duas DLLs do plugin de Deathmatch com o patch do Carmine, **compiladas pela CI** (ADR 0028, `infra/cs2/deathmatch-patch`): o host de CS2 só baixa e confere o hash, não compila nada; o `install.sh --steps profiles` (servidores parados) é que troca as DLLs do Deathmatch. Mexer no plugin **sem** subir o `ModuleVersion` não gera release. (À mão: *Actions > Release do plugin > Run workflow*.)
2. **A promoção a *Latest* também é automática** e é a regra "plugin só depois da API em produção": o `manifest.json` traz o **commit** em que a release foi construída; quando esse commit já está em produção (igual ou ancestral do commit implantado), o `promote-plugin.sh` marca a release como *Latest*. Ele roda no fim do `deploy.yml`, **só depois do teste de fumaça verde** (um deploy que falha não promove), e no fim do próprio workflow de release (plugin que só muda o plugin, com a API já no ar). O deploy registra o commit no ar na tag móvel `prod-live`.
3. A partir daí a VPS pega a *Latest* sozinha (`carmine-plugin-sync`, servidor vazio por vez, com volta). O log de cada passo está nas execuções dos workflows *Deploy* (job "promover o plugin do CS2") e *Release do plugin*.

**Freio:** a variável do repositório `PLUGIN_PROMOTION_PAUSED=true` (*Settings > Secrets and variables > Actions > Variables*) suspende a promoção; as releases continuam saindo como pré-lançamento e dá para promover à mão (*Releases > editar > "Set as the latest release"*). **Se a API for desfeita** (deploy de volta) depois de uma promoção, a release já promovida continua *Latest* e os servidores que a pegaram a mantêm: despromova à mão (marque "pre-release") se o plugin não funciona com a API anterior.

## No dia, passo a passo

Faça a compra primeiro; o resto segue. Os comandos rodam na VPS como root (ou `sudo`).

### 1. Primeiro acesso (5 a 15 min)

1. Pelo painel do provedor, instale o **Ubuntu 24.04**, ponha a **sua chave SSH pública** e anote o IP.
2. Entre: `ssh root@<IP>` (ou o usuário que o provedor criou). Se o provedor só aceitou senha, copie a chave antes de seguir: `ssh-copy-id root@<IP>`. **O bootstrap só desliga a senha do SSH se achar uma chave autorizada**, justamente para não te trancar para fora.
3. No painel do provedor, **abra UDP 27015-27016** no firewall/anti-DDoS, se ele tiver um.
4. Crie os dois registros DNS (item 3 acima) com o IP.

### 2. Bootstrap (10 min ativos + o download)

```sh
apt-get update && apt-get install -y git
git clone https://github.com/caiomayan/carmine /opt/carmine-src
sudo /opt/carmine-src/infra/cs2/linux/vps-bootstrap.sh --ssh-from <seu IP público>/32
```

(`--ssh-from` limita o SSH ao seu IP; se o seu IP muda, omita a opção: a porta 22 fica aberta com limite de taxa e fail2ban. `--dry-run` mostra o plano sem mexer em nada.)

Ele, nesta ordem: roda o **`carmine-vps-check`** (e **para** se a máquina não serve: x86-64, Ubuntu 24.04, RAM, disco, banda; leia o relatório, um AVISO de CPU lenta ou banda baixa não bloqueia, mas vale pensar), **endurece** (SSH, ufw, fail2ban, atualizações de segurança sem reboot, chrony, swap, buffers UDP), instala os comandos e dispara o **download do CS2 em segundo plano**. Acompanhe:

```sh
journalctl -fu carmine-install        # termina com "Pronto."
```

### 3. Enquanto baixa (10 min ativos)

**a. Cadastrar os servidores na API** (VM de produção, Oracle; quem conduz faz):

```sh
/opt/carmine/bin/dc exec api node dist/game-servers/servers.cli.js create --name retake-1 --mode retake --address retake.stcarmine.com:27015
/opt/carmine/bin/dc exec api node dist/game-servers/servers.cli.js create --name dm-1 --mode deathmatch --address dm.stcarmine.com:27016
```

Cada comando imprime a **chave uma única vez**: copie e cole direto no passo seguinte.

**b. Segredos na VPS** (digitados sem eco; nada no histórico do shell nem no chat):

```sh
sudo carmine-secrets profile retake        # chave do retake-1 + GSLT 1
sudo carmine-secrets profile deathmatch    # chave do dm-1 + GSLT 2
sudo carmine-secrets alerts                # webhook do Discord
sudo carmine-secrets mirror                # espelho R2: URL do bucket + token de LEITURA
sudo carmine-secrets show                  # o que está preenchido (só os 4 últimos caracteres)
```

O espelho é opcional na primeira instalação (sem ele, o instalador usa só os endereços oficiais), mas **configure-o**: é ele que salva o dia em que um terceiro some do endereço oficial.

### 4. Subir e conferir (15 min)

Quando o `journalctl` mostrar "Pronto.":

```sh
sudo carmine-vps-smoke --start
```

Sobe os dois servidores e confere, por servidor: serviço de pé, Metamod e Carmine.Core no log, sem erro de carga, sem recusa do GSLT pela Steam, consulta A2S respondendo e o servidor **online na lista pública do site**. Qualquer FALHA vem com a causa provável e o comando para consertar (por exemplo, GSLT recusado: `carmine-secrets gslt <perfil>`).

### 5. Teste final com o dono jogando (30 min)

Na home do site os dois aparecem online. No CS2: `connect retake.stcarmine.com:27015` e `connect dm.stcarmine.com:27016`. Confira:

- [ ] o nome de exibição e o Loadout aplicado (skin da arma) e `!ws`;
- [ ] `!vip` (e o aviso do fim do VIP, se a Conta tiver VIP perto do fim);
- [ ] Retake: escolhe bombsite e armas; Deathmatch: recebe as armas;
- [ ] votação de mapa (`!rtv`) funcionando;
- [ ] saiu e entrou de novo: a sessão aparece na página do servidor e no Perfil.

## Depois do lançamento

- **Encerrar a AWS** (`aws-beta-cs2.md`, "Encerrando o beta"): avise os amigos, `servers retire --name retake-beta` e `dm-beta`, termine a instância, **libere o Elastic IP** e **apague o volume** (cobram parados). Tire o hábito de `cs2-beta.ps1 stop`.
- Reinicie a VPS **uma vez** numa janela combinada para aplicar um eventual kernel novo (as atualizações de segurança não reiniciam sozinhas): `reboot`; os servidores sobem sozinhos.

## O que roda sozinho

| O quê | Como | Para congelar |
| --- | --- | --- |
| **CS2** | `carmine-cs2-update.timer` (10 min): build novo na Steam => espera esvaziar (até 20 min), avisa no Discord, `git pull`, atualiza, sobe, confere. **Falhou: servidores parados** e aviso 🔴 com o trecho do log | `systemctl disable --now carmine-cs2-update.timer` |
| **Carmine.Core** | `carmine-plugin-sync.timer` (10 min): a release *Latest* nova => entrega num servidor **vazio** por vez (Retake primeiro), volta sozinha se não ficar saudável | `systemctl disable --now carmine-plugin-sync.timer` |
| Terceiros (versões fixas) | `versions-check` toda semana no GitHub: abre uma issue se um terceiro mudou ou sumiu do endereço oficial, e mantém o espelho | — |
| Segurança | atualizações de segurança do Ubuntu (sem reboot), fail2ban | — |

Comandos úteis: `systemctl status carmine-cs2.target carmine-cs2@retake carmine-cs2@deathmatch`, `journalctl -u carmine-cs2@retake -f`, `carmine-cs2-update --check`, `carmine-plugin-deploy --dry-run`, `carmine-plugin-deploy --rollback`, `carmine-vps-smoke`.

## Quando algo dá errado

| Sintoma | O que fazer |
| --- | --- |
| `carmine-vps-check` com FALHA | A máquina não serve para o que foi comprado (ARM, pouca RAM/disco, banda): fale com o provedor **antes** do download. |
| O smoke acusa **GSLT** recusado | Token inválido ou banido: `sudo carmine-secrets gslt <perfil>` com um de reserva (`troca-de-token-gslt.md`); reinicia só aquele servidor. |
| O smoke acusa **cadastro** (porta ausente na API) | Falta o `servers create` com o `host:porta` certo (passo 3a). |
| O smoke acusa **batimento** (offline no site) | Chave do servidor errada (`carmine-secrets profile <perfil>`) ou a VPS não alcança `stcarmine.com` (`curl -I https://stcarmine.com/api/health`). |
| A2S não responde | O jogo ainda carregando (espere 1 a 2 min) ou o firewall/anti-DDoS do provedor barra o UDP: abra 27015-27016. |
| Alerta 🔴 "atualização do CS2 FALHOU" | Os servidores estão **parados de propósito**. Veja `journalctl -u carmine-cs2-update` e o trecho do aviso; em geral é plugin quebrado pelo update da Valve: espere o PR de versão do CounterStrikeSharp/plugin (ou a release nova do Carmine.Core), `git -C /opt/carmine-src pull`, e `carmine-cs2-update --force`. Comunique a indisponibilidade (acima de 24 h os dias de VIP são compensados pela Staff, `docs/operacao/pagamentos.md`). |
| Alerta 🔴 "Carmine.Core não ficou saudável" | O deploy voltou a versão anterior sozinho e parou. Veja `journalctl -u carmine-cs2@<perfil>`; a versão fica marcada e o timer não a repete; depois de corrigir, `carmine-plugin-deploy --version X.Y.Z`. |
| Instalação do zero falha com "SHA-256 não confere" / 404 de um terceiro | O oficial mudou ou sumiu: o instalador cai no **espelho R2** (se configurado). Sem espelho, abra a issue "Terceiros do CS2" e troque URL+hash em `versions.sh`. |
| Servidores não sobem depois do reboot | `systemctl status carmine-cs2.target`; as unidades sobem sozinhas (`WantedBy`), exceto se estiverem **paradas por falha de atualização** (acima). |

## Referências

`infra/cs2/linux/README.md` (comandos e decisões), `atualizacao-do-cs2.md` (staging e a atualização manual), `troca-de-token-gslt.md`, `aws-beta-cs2.md` (o beta), `orcamento-operacional.md` (custos), ADR 0002 (risco de GSLT) e ADR 0009 (hospedagem).
