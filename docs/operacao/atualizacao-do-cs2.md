# Atualização do CS2

Um update do CS2 pode quebrar o Metamod, o CounterStrikeSharp ou os plugins (assinaturas de memória mudam). A regra: **valide no staging local antes de tocar na produção**. O staging é o servidor CS2 do PC do autor (`infra/scripts/install-cs2-server.ps1`).

> Os servidores de produção entram na S09b; os passos de produção abaixo são o contrato desse runbook, e o S09b os completa com o caminho exato na VPS.

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
5. Se algo quebrou: veja os releases/issues do CounterStrikeSharp e do plugin que falhou (a maioria dos updates da Valve é corrigida em horas ou dias). **Não atualize a produção** enquanto o staging não estiver verde; atualize a versão fixada do plugin no script (`install-cs2-server.ps1`, versões e SHA-256) num PR e valide de novo.

## 2. Produção (S09b)

1. Staging verde → comunique no Discord uma janela curta ("manutenção, 15 min") e escolha um horário de menor movimento (a home mostra o pico).
2. Atualize um servidor por vez (o outro segue no ar): pare o serviço, rode a atualização do app 730 no usuário do servidor (`steamcmd +force_install_dir ... +app_update 730 validate +quit`), rode as mesmas etapas de Metamod/plugins do staging com as versões validadas, inicie.
3. Confira como no staging (batimento na home, entrar, Loadout) e só então atualize o seguinte.
4. Se o update quebrar a produção antes de você validar (a Valve força a atualização), siga o passo 1 com urgência e comunique a indisponibilidade; acima de 24 h os dias de VIP congelam sozinhos (Termos).

## Depois

- Anote a versão do CS2/CounterStrikeSharp/plugins que passou na validação (nota do Maestri) e atualize as versões fixadas no repositório.
- Não é preciso mexer no site: web e API não dependem da versão do CS2.
