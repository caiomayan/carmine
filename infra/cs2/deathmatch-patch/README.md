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
pasta e compila. O `install.sh` troca o `Deathmatch.dll` e o `DeathmatchAPI.dll` do zip oficial pelos patchados; o
resto do zip (idiomas, configs, dependências) fica como veio.

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
- O job `dotnet`: o fonte patchado não compila.

Vale propor o patch ao autor do plugin; enquanto não entra, ele fica conosco.
