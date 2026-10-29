# Regra única de denúncia: prazo por tipo, peso de quem denuncia, teto por dia e casos agrupados

O [ADR 0019](0019-denuncias-e-log-de-chat.md) criou a Denúncia de jogo (`!report`) com os seus limites, e o [ADR 0025](0025-foto-de-perfil-no-beta-historico-e-moderacao-por-fila.md) criou, só para a foto de perfil, o peso de quem denuncia. A decisão do dono de 2026-10-29 (S18 da [spec do beta aberto](../specs/beta-aberto.md), "Regra única de denúncia"), pensando numa Staff de uma pessoa só no começo, estende isso a **toda** Denúncia: de jogo, de chat, de foto e de logo. Este ADR registra o que muda no 0019 e no 0025. O resto de cada um segue valendo.

## O que muda

| Antes | Agora |
|---|---|
| Prazo da Staff: 72 h (jogo, ADR 0019), 24 h (foto, ADR 0022) | **Por tipo, num lugar só** (`REPORT_REVIEW_DEADLINE_HOURS`, `packages/contracts/src/reports.ts`): foto e logo 24 h, jogo e chat 72 h. Cada item da fila traz o seu `deadlineAt` para o painel |
| Peso de quem denuncia só nas fotos (3 mantidas em 90 dias, ADR 0025), definido em `avatar-rules.ts` | **Vale para toda Denúncia e conta todas juntas**: 3 arquivadas sem Punição em 90 dias e mais arquivadas do que confirmadas (`REPORTER_ARCHIVED_MIN`, `REPORTER_WINDOW_DAYS`). As denúncias da Conta vão para o fim da fila e **não têm prazo correndo** (`deadlineAt` nulo, `lowWeight` verdadeiro) |
| Limites da Denúncia de jogo: 1 por alvo a cada 10 min, 5 por hora; da foto: 5 por hora (cada tipo no seu) | Os mesmos, **mais um teto de 10 por dia por Conta, somando todos os tipos** (`REPORT_DAILY_LIMIT`, `report-limits.ts`) |
| Uma linha na fila por Denúncia de jogo; uma por foto | **Um item por caso**: Denúncias contra a mesma Conta, pelo mesmo motivo, no mesmo Mapa jogado (ou contra a mesma imagem) viram um item, com a contagem e as provas juntas; arquivar ou punir resolve todas |

## Decisões

**O peso é um só e soma os tipos.** Uma Conta que teve 2 fotos mantidas e 1 Denúncia de jogo arquivada perde peso nas duas filas. "Arquivada" é a de jogo em `archived` e a de foto mantida pela Staff; "confirmada" é a de jogo que virou Punição e a de foto cuja imagem foi removida. A consulta é uma só (`report-weight.ts`), usada pelas duas filas. A janela conta pela data de criação da Denúncia (como já fazia para as fotos).

**O que ordena a fila aberta.** Dois grupos: o normal (pelo menos uma Denúncia aberta do caso é de Conta de peso normal) e o do fim (todas são de quem perdeu peso). Dentro de cada grupo, pela Denúncia **de peso normal** mais antiga do caso, que é a do prazo (no grupo do fim, pela mais antiga). Assim a ordem da fila é a ordem dos prazos. Isto ajusta o ADR 0025, que ordenava pela mais antiga de todas.

**O prazo corre da Denúncia de peso normal mais antiga.** Se uma Denúncia de quem perdeu peso entra antes e uma de peso normal depois, o prazo conta da segunda. Sem nenhuma de peso normal, não há prazo.

**O teto por dia é por dia de Brasília** (meia-noite de Brasília, a mesma do mapa de calor, ADR 0018), porque o texto da spec fala em "hoje" e "amanhã". Conta só as Denúncias aceitas (a descartada por imagem já aprovada não grava nada e não conta). No jogo a mensagem é `Carmine · Você já enviou 10 denúncias hoje. Tente amanhã.` (vem pronta da API, como as outras recusas, e o plugin só a repassa); no site é o mesmo texto sem o prefixo (`report_daily_limit`, 429). Quando o teto do dia e o da hora valem juntos, vale o prazo mais longo, como já era. O teto vale **antes** do descarte por imagem aprovada, assim como os outros limites: a resposta é a mesma para quem denuncia uma imagem aprovada e uma que não é (isto corrige a ordem do #201, em que o descarte vinha antes do limite por hora). O limite por hora segue sendo por tipo, como era.

**O Mapa jogado do caso.** Duas Denúncias são do mesmo Mapa jogado quando têm o mesmo `mapPlayId` (S17, [ADR 0024](0024-coleta-por-round-eventos-brutos-e-resumos.md)). O `POST /api/server/reports` aceita o campo (opcional); **o plugin ainda não o envia**, e enquanto isso o caso se define pelo servidor e pelo nome do mapa, o que junta, na pior hipótese, dois Mapas jogados do mesmo mapa no mesmo servidor com Denúncias abertas ao mesmo tempo (a janela é a do prazo de 72 h). As provas ficam todas lá, com horário. Mandar o `mapPlayId` é uma mudança pequena do plugin, fora desta fatia.

**Decidir uma vez vale para todas.** Arquivar ou punir uma Denúncia fecha, na mesma instrução, todas as abertas do caso naquele instante; o log de auditoria tem uma entrada, com os IDs de todas. Uma Denúncia do mesmo caso que chegue **depois** da decisão abre um caso novo. A que chegar durante a análise da Staff é fechada junto sem ter sido vista; é a mesma Conta, o mesmo motivo e o mesmo mapa, e a prova dela está na cópia do chat, que a Staff pode rever no histórico. No histórico (arquivadas e punidas), o caso decidido junto continua um item, com a contagem.

**Foto e logo já eram um caso por imagem.** A fila de fotos agrupa por imagem desde o ADR 0025 (contagem de contas e motivos); só ganha `deadlineAt` e `lowWeight`. A Denúncia de chat e a de logo entram com as suas fatias (S23 e S30) e herdam estas regras; `ReportKind` já as nomeia.

**O contrato.** `GET /api/staff/reports` devolve casos: `kind`, `count`, `members` (cada Denúncia, com quem denunciou, o round e o peso), `deadlineAt`, `lowWeight`, o `chat` das Denúncias juntas sem linha repetida, e `openCount` passa a contar **casos**. O `id` do item é o da Denúncia mais antiga e continua sendo o que o painel usa para arquivar e punir. O painel de hoje (`/staff`) só ganhou a contagem no cartão; o painel novo é da S25 PR B.

## Consequences

- Migração `0022`: coluna `reports.map_play_id` (sem chave estrangeira: o resumo do Mapa jogado pode não existir).
- O cursor da fila de Denúncias mudou de formato (uma página aberta antes do deploy recebe `400` ao pedir a próxima e recarrega).
- O teto por dia soma duas tabelas e trava o denunciante (`pg_advisory_xact_lock`, a mesma chave do ADR 0019) tanto na Denúncia de jogo quanto na de foto, então dois tipos ao mesmo tempo não passam juntos do teto.
- As constantes do peso saíram de `avatar-rules.ts` (`AVATAR_REPORTER_KEPT_MIN` e `AVATAR_REPORTER_WINDOW_DAYS`) e viraram gerais; o ADR 0025 diz "ajustáveis em `avatar-rules.ts`" e hoje é em `reports.ts`.
- Os números (3, 90 e 10) são escolha da spec e se ajustam nas constantes.

## Considered Options

- **Peso separado por tipo:** descartado; a spec fala em "as Denúncias da Conta" e quem abusa de um tipo abusa dos outros.
- **Agrupar com uma coluna de caso (`case_id`) gravada na criação:** descartado; o agrupamento dinâmico não precisa de migração de dados nem de reabrir casos quando a Staff decide, e a fila aberta é pequena.
- **Teto por 24 h corridas:** descartado; "hoje" e "amanhã" no texto pedem o dia de calendário, e a meia-noite de Brasília já é usada nas estatísticas.
