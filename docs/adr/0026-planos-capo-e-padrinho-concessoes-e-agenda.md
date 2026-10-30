# Planos Capo e Padrinho: concessões imutáveis e uma agenda calculada, com nomes legados internos

O "VIP" genérico (um plano só, ADR 0023 e S14) vira dois planos com nome próprio, **Capo** e **Padrinho** (S20, `docs/specs/beta-aberto.md`). A palavra VIP sai de tudo o que o usuário vê; o termo genérico é **Plano**. Este ADR registra duas decisões que a spec deixa em aberto: como o tempo dos dois planos se combina quando a Conta compra um sobre o outro, e como os planos de teste do beta terminam. Também registra o que **não** muda no código por segurança.

## Decisão

### 1. O que a Conta tem é calculado das concessões, não guardado como intervalos

Cada compra de pacote, concessão da Staff ou compra de teste é uma **concessão**: plano, dias, instante, e se é de teste. Ela não muda depois de gravada. O plano da Conta em qualquer instante sai de uma função pura sobre as concessões (`apps/api/src/plans/plan-timeline.ts`, testada com sequências, como a calculadora do resumo do round da S17):

- cada concessão põe os dias num **saldo** do plano; o tempo gasta primeiro o saldo do **Padrinho** e depois o do **Capo**;
- **o mesmo plano comprado com ele ativo soma ao fim**;
- **Padrinho sobre Capo** começa na hora, e os dias que sobravam do Capo **ficam guardados** e voltam a correr quando o Padrinho acabar;
- **Capo sobre Padrinho** entra na fila e começa quando o Padrinho acabar; outro Capo com o Padrinho ativo **soma aos dias de Capo que esperam**; mais Padrinho empurra a fila toda para frente;
- **reembolso ou contestação** é tirar a concessão da lista: o fim recua exatamente esses dias, sem regra à parte;
- **revogação da Staff** zera tudo naquele instante, inclusive a fila;
- a ordem das concessões na lista não importa.

Com um só plano (como o VIP de hoje) isto dá exatamente o resultado do encadeamento de Períodos atual: comprar com plano ativo soma ao fim, comprar sem ele começa agora, e a data de fim recua o que o reembolso tirou.

### 2. Planos de teste do beta: acabam no dia em que a cobrança real ligar

Até o lançamento ninguém paga de verdade, e as compras de teste do beta valem os dias do pacote. **No dia em que a cobrança real ligar, os planos de teste ativos acabam**, com **aviso ao jogador 7 dias antes** (decisão do dono, 2026-10-29). Esta fatia deixa a agenda pronta: `testsEndAt` na função de agenda tira, nessa data, só o que ainda sobrar de teste, e um teste concedido a partir dela não vale. Dentro do mesmo plano o **teste é gasto antes dos dias pagos**, então quem comprou de verdade no meio do caminho não perde o que pagou. A data e o aviso de 7 dias (`PLAN_TEST_NOTICE_DAYS`) entram junto com a cobrança real, não agora.

### 3. Nomes legados internos

(Decisão do maestro, 2026-10-29.) A tabela `vip_periods`, a tabela de pagamentos e os IDs de pacote do Capo (`vip-1m`, `vip-3m`, `vip-6m`) **continuam como são**: um rename de tabela ou de coluna quebraria o rollback de imagem, que a migração só aditiva garante. São **nomes legados internos** e **nunca aparecem para o usuário**: nem na tela, nem no recibo, nem no e-mail, nem no título do item no Mercado Pago, nem no cargo do Discord. Os pacotes novos do Padrinho já nascem com o nome novo (`padrinho-1m`, `padrinho-3m`, `padrinho-6m`). O que o usuário lê (Capo, Padrinho, Plano) vem de um mapa de exibição, não do ID.

### 4. Preços e limites

Capo R$ 9,90, 26,90 e 49,90; Padrinho R$ 19,90, 53,90 e 99,90 (1, 3 e 6 meses, com os mesmos descontos de cerca de 10% e 16%). Presets: grátis 1, Capo 6, Padrinho 25. Estão em `packages/contracts/src/plans.ts`.

## Consequences

- **Esta fatia não mexe em banco, rota nem tela.** Só o domínio (contratos e a agenda) e este ADR. O PR seguinte guarda as concessões (coluna do plano e do teste nas linhas existentes, que viram Capo) e liga a agenda à API; a revogação da Staff precisa ser registrada como uma concessão negativa ou evento próprio, já que hoje ela encurta os Períodos.
- **Um Período não tem mais "início e fim guardados" como verdade**: o fim é calculado. Os `startsAt` e `endsAt` das linhas existentes seguem coerentes e podem ser mantidos como cópia materializada, mas a verdade é a concessão (o instante em que ela foi feita e os dias).
- **A ordem Padrinho antes de Capo é fixa.** Dois Padrinhos de origens diferentes (pago e teste) se comportam como um saldo só; a distinção só existe para a data dos testes.
- **Presets acima do limite** ao trocar ou perder o plano seguem a regra de hoje (`vip-hold`, 30 dias, aviso 3 dias antes), agora com o limite do plano (`presetLimitFor`). Quem faz isso é o PR da API.
- **O Discord** troca o cargo `VIP` por `Capo` e `Padrinho` (o cargo acompanha o plano ativo). Os cargos têm de existir no servidor: passo do dono, num roteiro.

## Considered Options

- **Guardar os intervalos já divididos por plano** (o Padrinho comprado corta o Capo ativo em duas linhas e empurra as seguintes): cada compra reescreve linhas, o vínculo da linha com o pagamento (único) se perde na parte devolvida e o reembolso precisa recuar vários intervalos. A agenda calculada evita tudo isso.
- **Os dois planos correndo ao mesmo tempo:** o Capo comprado consumiria dias enquanto o Padrinho já dá tudo o que ele dá, e o jogador perderia o que pagou; a spec manda guardar os dias.
- **Renomear `vip_periods` e os IDs de pacote agora:** deixaria o código limpo e quebraria o rollback de imagem. Os nomes ficam internos e invisíveis.
- **Encerrar os testes por uma data fixa no código:** a data da cobrança real não existe ainda; fica um parâmetro, e a ligação é do PR da cobrança.

## Adendo (PR B): como ficou o armazenamento

- **Os Períodos continuam sendo intervalos em `vip_periods`** (nome legado), agora com `plan` (as linhas de antes são Capo) e `test`. A agenda das concessões vale como especificação: `planPurchase` (`apps/api/src/plans/plan-purchase.ts`) escreve a compra em Períodos (corta o Capo em curso, empurra a fila, insere o pacote e o Capo que ficou guardado), e uma prova com sequências de compras confere que o que fica guardado dá, em todo momento, o mesmo plano que a agenda. Com um plano só o resultado é idêntico ao do VIP de antes. O reembolso segue recuando os Períodos seguintes como hoje.
- **Revogação da Staff** (decisão do maestro, 2026-10-29): a tabela aditiva `plan_revocations` guarda a Conta, o instante, quem revogou e o motivo, e a agenda a lê como `revokedAt`. Condições: (1) **só o Admin revoga, e sempre com registro no log de auditoria** (`docs/specs/mvp.md`, linhas 179 e 223): a linha de `plan_revocations` e a de `staff_audit_log` saem na mesma transação, com o mesmo instante e o mesmo motivo; (2) **a revogação antiga, que encurta os Períodos, continua legível**: a revogação nova também encurta os Períodos, então a imagem antiga, que não conhece a tabela nova, vê o mesmo resultado no rollback; (3) esta nota.
- **Limite conhecido:** o Capo que fica guardado depois de um Padrinho é uma linha nova sem pagamento (o pagamento é único por Período). Reembolsar o pacote de Capo depois que ele foi dividido recua só a parte já gravada com o pagamento. Pequeno, e fica para um PR de acompanhamento junto com o reembolso por plano.
