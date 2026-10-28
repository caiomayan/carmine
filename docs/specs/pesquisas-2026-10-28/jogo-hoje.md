# Levantamento da experiência no jogo (Q8 do grilling, 2026-10-28)

Fonte: `origin/dev` (plugins/src/Carmine.Core, infra/cs2/profiles). Leitura do código, sem testar no servidor.

## Hoje
- **Ao conectar:** nome de exibição da Conta no lugar do nome Steam; hostname "Carmine | vitrine | código".
- **Primeiro spawn:** boas-vindas só no 1º connect ("Bem-vindo ao Carmine… termos"); avisos de Loadout fora, chat oculto e fim de VIP. Tudo no chat, sem cor e sem prefixo.
- **Comandos do Carmine:** `!chat off/on`, `!vip`, `!report`/`!denunciar` (menu de 3 passos no chat, expira em 45 s).
- **Skins:** inventory-simulator 3.5.2, `!ws` com 30 s de cooldown, aplica no próximo spawn.
- **Punições:** ban/kick com motivo e link de recurso; mute; gag (repete a mensagem inteira a cada tentativa); aviso.
- **Vaga reservada:** Retake retira espectador → AFK → último a entrar, no fim do round; DM com 2 vagas extras.
- **Ranking/estatísticas no jogo:** nada (só coleta).
- **Ajuda:** sem `!help`.
- **Votação de mapa:** RTV 60%, mín. 2 jogadores; menus no chat.
- **Retake:** 9 públicas + 1 VIP; round 1:15; 30 rounds por mapa (~45 min); 7 mapas, votação com 4, 2 em cooldown; 15% pistola / 25% meia / 60% cheia.
- **DM:** 16 + 2 VIP; FFA, mapa de 15 min, +20 HP por kill, +40 por HS; 3 mapas (dust2, mirage, inferno), votação com 3 e 1 em cooldown; sons de hit/HS existem mas desligados.

## Candidatos (por impacto no jogador)
1. **Provável bug:** nada concede `@css/vip`; a AWP do Retake exige essa flag, então talvez ninguém receba AWP (spec: 1 AWP por time). Verificar.
2. Boas-vindas melhor + lembrete: "monte suas skins em stcarmine.com e use !ws".
3. `!rank` / `!stats`: posição semanal e o que falta para o mínimo.
4. `!help` em português com todos os comandos.
5. Servidor em português (RTV, retakes, allocator, DM).
6. Prefixo e cor "[Carmine]" em todas as mensagens.
7. Resumo de fim de mapa (top 3, K/D, HS%) com link do Perfil.
8. Pool do DM maior (votação com 3 opções reais).
9. Retake com menos rounds por mapa (ex.: 20).
10. Sons de hit e HS ligados por padrão no DM, e anunciar `!hs`/`!dmg`.
11. `!report` com menu clicável (CS2MenuManager já instalado).
12. Aviso ao assinante no spawn: "plano ativo até dd/MM, vaga garantida".
13. Gag/mute com mensagem curta e tempo restante.
14. Fila do Retake mostrando posição e estimativa.
15. `!site` / `!perfil` com o link da própria Conta.
