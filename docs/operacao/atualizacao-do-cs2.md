# Atualização do CS2

Um update do CS2 pode quebrar o Metamod, o CounterStrikeSharp ou os plugins (assinaturas de memória mudam). A regra: **valide no staging local antes de tocar na produção**. O staging é o servidor CS2 do PC do autor (`infra/scripts/install-cs2-server.ps1`).

> Em produção os servidores rodam em Linux (`infra/cs2/linux/`): na instância AWS do beta (`aws-beta-cs2.md`) e, depois, na VPS definitiva, com o mesmo procedimento.

## Como saber que saiu update

O servidor dedicado reclama ("Your server is out of date and must be restarted") e os jogadores não conseguem entrar até atualizar. Siga também o SteamDB (app 730) e os releases do CounterStrikeSharp e do Metamod (`docs/specs/mvp.md`, tabela de plugins).

## 1. Staging local (Windows)

1. Avise-se: o staging pode ficar fora do ar por 10–30 minutos, o download pode ter gigabytes.
2. Atualize o CS2 do staging: `./infra/scripts/install-cs2-server.ps1 -DownloadCs2` (baixa só a diferença; o app 730 inteiro tem ~60 GB, **só rode quando o dono aprovar o download**).
3. Todo update sobrescreve o `gameinfo.gi`: rode de novo as etapas `Metamod` e `Profiles` (`-Steps Metamod,Profiles`).
4. Suba cada perfil (`infra/scripts/start-cs2-profile.ps1 -Name retake` e `-Name deathmatch`) e confira, nesta ordem:
   - o servidor sobe sem erro de assinatura no log e o `meta list` mostra o Metamod; `css_plugins list` mostra o Carmine.Core, o inventory-simulator e os plugins do perfil carregados;
   - o batimento chega (a home do site local mostra o servidor online);
   - entrar na partida, ver o Loadout aplicado (skin da arma), o nome de exibição e a Vaga reservada;
   - o fluxo do perfil: Retake escolhe bombsite e armas; Deathmatch dá as armas; votação de mapa (RTV) funciona.
5. Se algo quebrou: veja os releases/issues do CounterStrikeSharp e do plugin que falhou (a maioria dos updates da Valve é corrigida em horas ou dias). **Não atualize a produção** enquanto o staging não estiver verde; atualize a versão fixada do plugin nos dois instaladores (`install-cs2-server.ps1` e `infra/cs2/linux/versions.sh`: versões e SHA-256 juntos) num PR e valide de novo.

## 2. Produção (Linux: AWS no beta, VPS depois)

Os dois perfis usam **uma só instalação do CS2** (`/srv/carmine-cs2/server`) e as instâncias são hardlinks dela. Por isso o update é **dos dois ao mesmo tempo**: o SteamCMD troca arquivos que os dois servidores têm abertos. Conte 10–30 minutos fora do ar.

1. Staging verde → comunique no Discord uma janela curta ("manutenção, 15 min") e escolha um horário de menor movimento (a home mostra o pico). No beta, combine com os amigos.
2. Chegue na máquina: na AWS, `./infra/cs2/aws/cs2-beta.ps1 start` (se estiver desligada) e `... shell`; na VPS, SSH. Depois `sudo -i`.
3. Pare tudo: `systemctl stop carmine-cs2.target`.
4. Traga as versões validadas no staging (URL e SHA-256 em `infra/cs2/linux/versions.sh`, as mesmas do `.ps1`):

   ```sh
   cd /opt/carmine-src
   GIT_SSH_COMMAND='ssh -i /root/.ssh/carmine_deploy -o IdentitiesOnly=yes' git pull
   ```

5. Atualize e remonte, numa unidade do systemd para o terminal não derrubar o processo:

   ```sh
   systemd-run --unit=carmine-update --collect \
     /opt/carmine-src/infra/cs2/linux/install.sh --download-cs2 --steps cs2,metamod,css,build,profiles,services
   journalctl -fu carmine-update        # termina com "Pronto."
   ```

   O que cada etapa faz: `cs2` roda `steamcmd +app_update 730 validate` (baixa só a diferença); `metamod` registra o Metamod de novo no `gameinfo.gi` que o update sobrescreveu; `css` e `build` reinstalam o CounterStrikeSharp e recompilam o Carmine.Core; `profiles` refaz os hardlinks das instâncias (um arquivo trocado pela Valve deixa de ocupar o disco em dobro) **mantendo** `addons/…/data` (banco do alocador) e os arquivos de ambiente; `services` atualiza as unidades. O instalador se recusa a remontar uma instância cujo serviço esteja ativo.
6. Suba: `systemctl start carmine-cs2.target` e confira como no staging (batimento na home, entrar, Loadout, o fluxo do perfil). `journalctl -u carmine-cs2@retake -n 100` mostra erros de assinatura.
7. Se o update quebrar a produção antes de você validar (a Valve força a atualização), siga o passo 1 com urgência e comunique a indisponibilidade; acima de 24 h os dias de VIP congelam sozinhos (Termos). Não há como voltar a versão do CS2: a saída é esperar a correção do CounterStrikeSharp/plugin e repetir os passos 3–6 com a versão nova.
8. Na AWS, desligue ao fim da sessão (`cs2-beta.ps1 stop`).

## Depois

- Anote a versão do CS2/CounterStrikeSharp/plugins que passou na validação (nota do Maestri) e atualize as versões fixadas no repositório.
- Não é preciso mexer no site: web e API não dependem da versão do CS2.
