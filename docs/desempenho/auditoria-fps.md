# Auditoria de fps por página

Meta do dono: 120 fps no mínimo, sem travar, também em notebook com GPU integrada (Intel Iris Xe). Esta nota guarda o método, o que já foi medido e o que falta. Os números vêm do Chrome com janela na Iris Xe, CPU 4× mais lenta (CDP `Emulation.setCPUThrottlingRate`), build de produção, semeado como o E2E (`apps/web/e2e/fps.spec.ts`).

## Como medir

`apps/web/scripts/fps-audit.mjs`, chamado por `apps/web/e2e/fps.spec.ts` (`pnpm --filter @carmine/web fps:audit`). Precisa do Docker (`pnpm infra:up`), `contracts` e `api` buildados e `pnpm build` no web. A stack sobe sozinha (portas 3000/3333, Steam falsa). Os modos vêm em `FPS_ARGS`:

| Modo | O que mede |
|---|---|
| (sem `FPS_ARGS`) `--guard` | A verificação da CI: parada, a página não pode ocupar a thread principal além de 15%, refazer layout mais de 4×/s, escrever texto mais de 2×/s nem manter animação contínua fora do compositor. |
| `--headed --seconds 3` | fps, p95, tarefas longas, camadas, vidro visível e animações fora do compositor, em repouso, rolagem e ponteiro. |
| `--headed --animations --repeat 3` | As animações contínuas de cada página ordenadas pelo ganho de pausar cada uma, mais o rastro do repouso (quem invalida estilo, quem muda texto). |
| `--headed --ablate sem-hover,sem-transicao,sem-cortina,sem-vidro --repeat 3` | O custo de cada efeito neutralizado por CSS, com rodadas intercaladas (base e condições alternadas). |
| `--scroll-trace --cpu 1` | O que invalida estilo e layout durante a rolagem e o ponteiro, com as pilhas de JS. |
| `--hydration --cpu 4` | Carga fria: TBT e os scripts que ocupam a thread (Long Animation Frames). |
| `--hidden` | Aba em segundo plano (headed): pedidos, recálculos, mutações do DOM por segundo. |
| `--components` | Render por componente, num build `next build --profile` (ver "Falta"). |

Opções comuns: `--only Home,Ranking,...`, `--cpu N` (padrão 4), `--seconds N`, `--repeat N`, `--windows ocioso,rolagem,ponteiro`.

Cuidados que custaram tempo: o `Chromium` roda sem limite de quadros (o fps é o teto do pipeline); o fps de rolagem e ponteiro varia até 3× entre execuções com a máquina ocupada, então só vale ablação com rodadas intercaladas e mediana; e o `pnpm build` do web pede 2 GB livres (o Docker segura ~1,4 GB).

## Resultado até aqui

Parado, antes → depois dos PRs de efeito do Verniz (#170, #172, #173, #174, #178) e do `Ticker`: Home 8 → 120 fps, Servidor 20 → 116, Ranking 89 → 119, Editor 87 → 113, Perfil 113 → 115. Pausar todas as animações contínuas agora economiza ~0 ms por quadro (antes 5 a 318).

### Causas achadas

1. **`Ticker` reescrevia o mesmo número 50 a 74 vezes por segundo, para sempre** (a mola do framer-motion nunca declara repouso). Cada `textContent =` troca o nó de texto, o que invalida `:root:has([data-vida])` (vida.css) e refaz estilo e layout do documento. Corrigido: só escreve se o texto mudou, encerra a mola quando o arredondado já é o alvo e atualiza o `nodeValue` do mesmo nó.
2. **Animações de pintura** (`background-position` em esqueletos e brilho de texto), pulsos e spin infinitos, Ken Burns e blobs do brilho ambiente: tratadas pelo Verniz.
3. **Ponteiro** (o maior gargalo restante): desligar o hover leva a Home de 19,5 para 106 fps e o Ranking de 59 para 116. Causa em `vida/effects.tsx`: `getBoundingClientRect()` a cada `pointermove` depois de escrever `--px/--py` força estilo e layout síncronos (845 ms de CPU em 3 s só movendo o mouse na Home), e cada escrita repinta o painel inteiro do `.v-spot` (gradiente radial que muda de posição).
4. **Rolagem**: desligar todas as transições dá +29% a +59%; vidro do header e cortina não pesam (dentro do ruído). O header anima `top/width` (propriedades de layout) ao cruzar o limiar; `:root:has([data-vida])` invalida `html` e `body` a cada nó inserido.
5. **Hidratação** (CPU 4×, TBT em ms): Editor 2885, Configurações 2111, Ranking 1949, Servidor 1887, Home 1656, Perfil 1198, Loadout 1042, Inventário 669. Entre 55% e 95% é o scheduler do React em poucas tarefas gigantes (a maior, 1157 ms, em Configurações), mais o parse do payload RSC (Editor, Ranking) e o Zod na primeira carga de Configurações (336 ms, tratado no #186 do Lume).

## Falta (retomar daqui)

1. **Render por componente para o Lume** (pedido: o shell comum, o Editor e a Home). O build `next build --profile` funciona, mas o React 19.3 não grava `performance.measure`: usa `console.timeStamp` com a trilha "Components ⚛", e o rastro do Chrome (`TimeStamp` em `devtools.timeline`) só trouxe entradas "Blocked" (a duração está em microssegundos, não ms; o script ainda a mostra sem converter). Os nomes dos componentes não vieram. Opções: (a) envolver o shell, o Editor e a Home em `<Profiler onRender>` num build de profiling e coletar `actualDuration`; (b) usar o hook do React DevTools no Playwright; (c) conferir se faltam categorias do rastro (`devtools.timeline.async`, `disabled-by-default-devtools.timeline`). O modo `--components --raw` imprime os eventos crus.
2. **Ranking de ablação da rolagem para o Verniz**: já enviado (rodadas intercaladas, 3 repetições, Home, Ranking e Configurações). Falta repetir depois que ele troque o `effects.tsx` e o header, e medir a Perfil, o Servidor e o Loadout.
3. **Antes/depois do #176 e do #177 do Lume** (timers e SSE com a aba oculta): rodar `--hidden` no `dev` com cada PR; os dois já estão no `dev`, então o "antes" exige build da base anterior.
4. **Transformar a verificação da CI em reprovação** depois de algumas execuções estáveis no runner (hoje `continue-on-error`).
5. Medir de novo o scroll da Home e do Ranking com o `Ticker` novo (nodeValue) e a Home com a lista de amigos carregada.
