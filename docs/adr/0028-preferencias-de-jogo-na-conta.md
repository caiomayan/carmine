# Preferências de jogo moram na Conta, não no servidor

Os plugins de jogo guardam as escolhas do jogador onde convém a eles: o RetakesAllocator num SQLite local do servidor, o Deathmatch só na memória da sessão (no nosso perfil, `Save Players Weapons` está desligado), o cs2-retakes em memória. Quem troca de servidor, ou volta amanhã, perde tudo, e cada servidor de Retake sabe um pouco diferente do mesmo jogador. O dono decidiu em 2026-10-29: **nenhuma preferência de jogador nos plugins fica presa a um servidor**. Toda **Preferência de jogo** (`CONTEXT.md`) fica na Conta, guardada pela API, e vale em qualquer servidor do Carmine daquele Modo. O inventário, plugin por plugin, está em [`docs/specs/pesquisas-2026-10-30/preferencias-de-plugin.md`](../specs/pesquisas-2026-10-30/preferencias-de-plugin.md).

## Decisão

- **A API é a fonte.** Tabela `account_game_preferences` (Conta, Modo, chave, valor em JSON, `updated_at`), uma linha por preferência que a Conta mudou; sem linha vale o padrão da chave, que mora em `packages/contracts` (`GAME_PREFERENCE_DEFAULTS`) junto com os Modos onde ela existe (`GAME_PREFERENCE_MODES`). Sem SteamID na linha (ADR 0007): apagar a Conta apaga as preferências. O connect devolve as do Modo do servidor (`preferences`); a escrita é `PUT /api/server/players/{steamId}/preferences/{key}` (valor explícito, idempotente) e `POST …/toggle` (a API inverte e devolve o novo valor, atômico no banco).
- **O Carmine.Core aplica e captura**, um adaptador por preferência. **Aplica** o valor da Conta no plugin no primeiro spawn de cada conexão (o plugin só conhece o jogador então), sempre com um comando ou uma chamada que ligue ou desligue **de forma explícita**, nunca um que alterne; assim o plugin acaba igual à Conta sem precisar ler o estado dele. **Captura** o que o jogador muda e leva à API.
- **O primeiro caso é a AWP do Retake** (`awp_raffle`, padrão fora do sorteio): o Core é dono do `!awp`; aplica com `css_gun awp ct` (liga) e `css_removegun awp ct` (desliga) do alocador.
- **Deathmatch: um patch pequeno sobre a versão fixada, aplicado no build** (`infra/cs2`). O Deathmatch (MIT) só deixa alternar as preferências, sem ler nem escrever de fora, e a instância guarda tudo em memória. O patch traz **só** `GetPreference`/`SetPreference` por jogador na `IDeathmatchAPI` e um evento de mudança. Não é um repositório divergente: o build baixa o release pinado (`versions.sh`), aplica o patch e empacota. **Reflexão sobre o campo privado está descartada** (frágil a qualquer atualização).
  - **Como atualizar o plugin:** trocar a tag e o SHA256 em `versions.sh`, rodar o build do perfil; se o patch ainda aplica, está feito; se não aplica, refazer o patch sobre a versão nova (são poucas linhas) e conferir os testes.
  - **O teste que quebra se o patch não aplicar:** um teste do build (`infra/cs2/test`) baixa o zip fixado, aplica o patch e compila a API do plugin; falha a CI se o patch não aplica ou se a assinatura `GetPreference`/`SetPreference` sumiu. Vale também como aviso de que a atualização de versão pede atenção. O patch e o teste entram no PR do mecanismo geral.
  - Vale propor o patch ao autor do plugin; enquanto não entra, ele fica conosco.
- **RetakesAllocator, `!guns`: leitura do SQLite só para ler.** O menu `!guns` grava direto no SQLite do alocador, sem passar por comando. O Core pode **ler** esse arquivo para capturar a mudança: abre **read-only**, com **transação curta**, **tolerando `busy`** (tenta de novo depois, nunca bloqueia o jogo) e **nunca escreve nele**. A aplicação continua pelos comandos explícitos do alocador (`css_gun <arma> <time>` e `css_removegun`). A leitura é só do estado que o jogador alterou, na saída dele e a cada fim de round.
- **Exceções conhecidas, fora da v1:** o `!voices` do cs2-retakes e o `!zeus` do RetakesAllocator só alternam e não têm leitura, então não dá para aplicar um valor explícito. Ficam presos ao servidor e constam na spec (Contexto) como exceção, com este motivo. Entram quando houver leitura (patch ou outra via).

## Consequences

- Cada preferência nova precisa de uma chave no contrato (padrão e Modos), de um adaptador no Core e de um jeito de aplicar de forma explícita; um plugin sem isso fica de fora da regra até ter (como `!voices` e zeus).
- Um plugin que alterna e só ele mexe no estado (como o `!voices`) poderia ser seguido por contagem, mas a regra "aplicar explícito" é a que não desvia, então não usamos.
- O alocador e o Deathmatch continuam com a sua cópia local (SQLite, memória); a API manda: o valor da Conta é reaplicado a cada connect e substitui o que a cópia tiver. Uma mudança pelo menu do plugin que a captura ainda não vê (a AWP pelo menu `!guns`, antes da captura do SQLite entrar) volta ao valor da Conta no próximo connect.
- O padrão de cada preferência por Modo é decisão do dono e mora no contrato; mudar o padrão afeta só quem nunca mudou a escolha.
- Na hora de apagar a Conta (S08), as preferências somem junto (`account-erasure`).
- Aplicar dá trabalho de comando por jogador a cada connect (um `ExecuteClientCommandFromServer` por preferência); as preferências por Modo são poucas, então o custo é pequeno.
- A coluna `accounts.awp_default_applied_at` (da primeira versão da AWP, que nunca foi para a produção) fica sem uso e sai numa migração própria.

## Considered Options

- **Apontar o RetakesAllocator para um MySQL comum a todos os servidores** (ele aceita `DatabaseProvider: MySql`): resolve só o Retake, deixa a fonte fora da API e do site, e não ajuda o Deathmatch (cujo MySQL próprio é outro esquema).
- **Reflexão sobre a instância do Deathmatch:** zero patch, mas depende de nomes privados que mudam a cada versão; descartada.
- **Fork do Deathmatch como repositório próprio:** estável, mas é um plugin a mais para manter e atualizar do zero; o patch pequeno aplicado no build mantém "subir de versão é trocar a tag".
- **Seguir o estado por contagem de comandos (`!voices`):** frágil quando existe outro caminho de mudança (menu, restart).
- **Escrever direto no SQLite do alocador:** descartado desde o início (nunca escrever no banco de outro plugin); a leitura read-only é a exceção aprovada.
- **Deixar cada servidor com a sua preferência:** é o que existe hoje, e é o problema.
