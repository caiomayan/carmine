# Deathmatch patchado (ADR 0028)

O Deathmatch (NockyCZ/CS2-Deathmatch, MIT) guarda as preferências do jogador (sons, HUD, `!hs`, `!noprimary`...) só
na memória da sessão e não deixa ler nem gravar de fora. A regra do Carmine é que **nenhuma preferência fica presa a
um servidor** ([ADR 0028](../../../docs/adr/0028-preferencias-de-jogo-na-conta.md)), então o plugin precisa de duas
coisas pequenas, que este patch acrescenta:

- `IDeathmatchAPI.GetPlayerPreference(player, name)` e `SetPlayerPreference(player, name, value)`: ler e gravar o
  valor de uma preferência de um jogador, sem avisar o jogador nem disparar o evento (é o Carmine aplicando o valor
  da Conta).
- O evento `IDeathmatchEventsAPI.OnPlayerPreferenceChanged(player, name, value)`, disparado quando o jogador muda uma
  preferência pelo menu ou por um atalho de comando (os dois passam por `SwitchBooleanPrefsValue` e
  `SwitchStringPrefsValue`, que é onde o patch o dispara).

Não é um repositório divergente nem um plugin novo: o `build.sh` baixa o fonte da **tag pinada em
`infra/cs2/linux/versions.sh`** (`DM_SRC_TAG`, com o commit conferido em `DM_SRC_COMMIT`), aplica os `.patch` desta
pasta e compila.

## Como chega ao servidor (o host não compila nada)

1. **A CI compila.** O workflow `release-plugin.yml` roda o `build.sh` e põe as duas DLLs num zip da release do
   Carmine.Core (`carmine-deathmatch-X.Y.Z.zip`), junto do zip do plugin. O `manifest.json` registra o hash do zip, o hash de
   cada DLL, a tag e o commit do fonte e o hash de cada patch; o `SHA256SUMS` e a atestação de proveniência cobrem o zip.
2. **O host só baixa e confere.** `release_fetch` (`lib-release.sh`) baixa o zip, confere o `SHA256SUMS`, o hash do manifesto, a
   atestação e o hash de cada DLL, e extrai em `releases/core-X.Y.Z/deathmatch/`.
3. **O `install.sh` troca as DLLs.** Na etapa `profiles`, o `Deathmatch.dll` e o `DeathmatchAPI.dll` do zip oficial são
   trocados pelos da release instalada (`--core-release`); o resto do zip (idiomas, configs, dependências) fica como veio.
   Se a release foi feita com outro commit do plugin que o do zip instalado, o `install.sh` recusa. Sem release (instalação com
   `--plugin-dir`) ou numa release antiga sem o Deathmatch, ele só avisa e o Deathmatch fica sem o patch.
4. **O `carmine-plugin-deploy` troca só o Carmine.Core.** As DLLs do Deathmatch chegam ao servidor pelo `install.sh --steps profiles` (com
   os servidores parados); o patch muda raramente.

## Como atualizar o plugin

1. Em `infra/cs2/linux/versions.sh`, troque **juntos** `GP_URL[Deathmatch]` (e o hash), `DM_SRC_TAG` e `DM_SRC_COMMIT`
   (`git ls-remote https://github.com/NockyCZ/CS2-Deathmatch.git refs/tags/<tag>`).
2. `bash infra/cs2/test/deathmatch-patch.test.sh`. Se passar, o patch aplica na versão nova e acabou.
3. Se não aplicar, refaça o patch sobre a versão nova (são poucas linhas, em 4 arquivos):
   ```
   git clone --depth 1 --branch <tag> https://github.com/NockyCZ/CS2-Deathmatch.git /tmp/dm
   # edite os 4 arquivos como o patch antigo faz, mantendo os CRLF do fonte
   git -C /tmp/dm diff > infra/cs2/deathmatch-patch/0001-preferencias-por-jogador.patch
   ```
   O `.gitattributes` marca `*.patch` desta pasta como `-text`: o git não converte os CR do patch.
4. `bash infra/cs2/deathmatch-patch/build.sh --out /tmp/dm-out` (precisa do SDK do .NET) e confira que gera as duas DLLs.

## O que quebra a CI

- `infra/cs2/test/deathmatch-patch.test.sh` (job de servidores CS2): o patch não aplica na tag pinada, o commit da tag
  mudou, a versão do zip e a do fonte divergem, ou o fonte patchado perdeu a API nova.
- O job `dotnet`: o fonte patchado não compila. A release roda o mesmo `build.sh`: se ele falhar, a release não sai (e não chega nada quebrado ao servidor).

Vale propor o patch ao autor do plugin; enquanto não entra, ele fica conosco.
