# Rascunho S14d: VIP, pagamentos, guarda dos Itens VIP e reembolso automático

> Rascunho redigido com IA para revisão do dono e do advogado. Não é parecer jurídico. **Não é publicado**: fica fora de `apps/web/src/lib/legal/load.ts` e entra nos quatro documentos **junto com a cobrança** (`PAYMENTS_ENABLED=true`) e a guarda dos Itens VIP (`VIP_HOLD_ENABLED=true`), no mesmo dia. Hoje os Termos e a Política de Reembolso dizem que os Itens VIP "continuam no Inventário": ligar a guarda sem trocar esse texto seria descumprir o que está publicado. Ao publicar, suba `updatedAt` e a versão menor de cada documento e tire os marcadores `[VALIDAR COM ADVOGADO]` só depois da revisão profissional.

O que a implementação faz (ADR 0023 e a spec da S14), que o texto abaixo precisa refletir:

| Decisão do dono (2026-10-27) | O que o texto diz |
| --- | --- |
| D1 Reembolso de 7 dias automático pelo site | "Pedir reembolso" em "Minhas compras" estorna na hora, sem análise |
| D2 Sem presente para outra Conta | A compra é iniciada de dentro da Conta beneficiada; o Pagador (pai, mãe) só paga |
| D3 Só StatTrak e nametag são guardados nas skins; agente e music kit saem inteiros; 30 dias | Guarda de 30 dias, devolução se o VIP voltar, apagamento depois |
| D4 Compensação de indisponibilidade pela Staff, em lote | Os dias são somados pela Staff a todos os VIPs ativos, sem pedido |
| D5 Cartão pelo Checkout Pro | Os dados do cartão ficam na página do Mercado Pago |
| D6 Contestação bloqueia novas compras até a Staff revisar | Consequência descrita nos Termos e na Política |
| D7 Recibo sem nota fiscal | Comprovante da compra em "Minhas compras" (não é nota fiscal) |

---

## 1. `termos-de-uso.md`

### Seção 8 · abertura (troca o primeiro parágrafo)

O VIP é o único plano pago do Carmine. Ele é vendido em **Pacotes VIP** de 1, 3 ou 6 meses (cada "mês" são 30 dias), pagos por **Pix ou cartão de crédito** através do Mercado Pago. O preço e a duração aparecem na tela antes do pagamento.

### Seção 8 · "Como funciona a compra" (troca a lista)

- **Pagamento único, sem renovação automática.** Nada é cobrado de novo sem você pagar outro Pacote.
- **A compra é feita de dentro da Conta que vai receber o VIP.** Não é possível comprar VIP para outra Conta. Quem paga (o Pagador) pode ser outra pessoa, como pai, mãe ou responsável, que paga o QR Code do Pix da compra; o VIP é sempre da Conta que iniciou a compra.
- **Antes de pagar**, a tela mostra a Conta que vai receber o VIP (avatar, nome e link do Perfil), o valor, a duração e a nova data de fim.
- **O VIP começa quando o pagamento é confirmado** pelo Mercado Pago, normalmente em segundos. Se demorar mais de 10 minutos, fale com a gente com o identificador do pagamento (aparece em "Minhas compras").
- **Pacotes se somam:** comprar com o VIP ativo estende a data de fim, até no máximo 2 anos de VIP à frente.
- **O VIP é da Conta beneficiada**, não de quem pagou, e não pode ser transferido.
- **Limites de segurança:** até 10 compras iniciadas por dia por Conta. Um pagamento que o Mercado Pago deixa em análise precisa terminar antes de uma nova compra.
- Avisamos 3 dias antes do fim e no dia, no site e no chat do jogo (o `!vip` mostra até quando vai o seu VIP).

### Seção 8 · logo depois (nova subseção "Quando o VIP acaba")

### Quando o VIP acaba

- Os **Itens VIP** (agentes, music kits, StatTrak e nametag) saem do seu Inventário e do seu Loadout e **ficam guardados por 30 dias**. Quem está conectado os mantém até a próxima troca de mapa, `!ws` ou reconexão.
- **Skins comuns não são guardadas nem perdidas:** a skin continua no Inventário e no Loadout. Só o StatTrak e a nametag dela são guardados.
- Se você voltar a ter VIP em até 30 dias, os Itens VIP voltam, nos mesmos lugares do seu Loadout. Passados os 30 dias, são apagados e não podem ser recuperados.
- Presets extras ficam somente leitura enquanto não há VIP.

### Seção 8 · "Quem pode pagar" (ajuste do segundo marcador)

- Antes de pagar, o Pagador declara ser maior de idade e informa o CPF ao Mercado Pago. O Carmine guarda o CPF **cifrado**, mostra só os últimos dígitos e usa o dado para registrar a compra e cumprir obrigações legais. [VALIDAR COM ADVOGADO]

### Seção 8 · "Reembolso" (troca o texto)

Você pode desistir de qualquer Pacote VIP em até 7 dias depois do pagamento e recebe o valor de volta, como manda o Código de Defesa do Consumidor (art. 49). **Pelo site é imediato:** em "Minhas compras", use **Pedir reembolso**. Os detalhes estão na [Política de Reembolso](/reembolso).

### Seção 9 · "Indisponibilidade" (troca a lista)

- **Mais de 24 horas seguidas:** a Staff soma ao VIP de todas as Contas com VIP ativo os dias da indisponibilidade, sem você precisar pedir.
- **Mais de 7 dias seguidos:** além da compensação, você pode pedir o **reembolso proporcional** dos dias de VIP que ainda não usou.

### Seção 10 · "Punições e VIP" (acrescenta)

- **Contestar um pagamento legítimo** (chargeback ou MED do Pix) retira do VIP os dias daquela compra e **bloqueia novas compras da Conta** até a Staff revisar o caso. Para evitar isso, peça o reembolso a nós primeiro.
- O ban permanente, por qualquer motivo, encerra o VIP **e impede novas compras**.

---

## 2. `politica-de-reembolso.md`

### Resumo (troca a lista)

- **Desistiu em até 7 dias?** Pelo site, em "Minhas compras", devolvemos 100% do valor na hora, sem precisar explicar o motivo.
- **Servidores fora do ar por mais de 24 h?** A Staff soma ao seu VIP os dias do problema, sem você pedir.
- **Fora do ar por mais de 7 dias?** Você pode pedir o reembolso proporcional dos dias que não usou.
- O dinheiro volta pelo Mercado Pago, pelo mesmo meio que pagou, para quem pagou.

### Seção 1 · "Quem pede" (troca)

- **Quem pede:** quem tem a Conta beneficiada, em "Minhas compras" (o botão **Pedir reembolso** aparece em até 7 dias depois da aprovação). O dinheiro sempre volta para quem pagou, pelo mesmo meio.

### Seção 2 · "Como pedir" (troca o item 1 e o fecho)

1. **Pelo site, em "Minhas compras":** use **Pedir reembolso** no pagamento. É automático: pedimos o estorno ao Mercado Pago na hora, sem análise, e o pagamento passa a "Reembolsado". É o caminho principal e o mesmo meio da compra (Decreto 7.962/2013, art. 5º, § 1º).
2. (itens 2 e 3 como estão)

Depois dos 7 dias, ou se o botão não aparecer, os outros caminhos continuam valendo para os casos da seção 5 e 6.

### Seção 3 · "Prazos" (troca)

- **No site:** o estorno é pedido ao Mercado Pago no momento do clique.
- **Por contato ou Discord:** a Staff faz o estorno em até 2 dias úteis depois do pedido. [VALIDAR COM ADVOGADO]
- **Quando o dinheiro chega:** o estorno de um Pix volta para a conta de quem pagou, normalmente no mesmo dia. No cartão, o valor volta na fatura, em um ou dois ciclos, conforme o banco emissor. [CONFIRMAR: prazo do cartão no Mercado Pago]
- **Resposta:** qualquer pedido sobre o VIP tem resposta em até 5 dias (Decreto 7.962/2013, art. 4º).

### Seção 4 · "O que acontece com o VIP" (troca o terceiro marcador)

- Os **Itens VIP** (agentes, music kits, StatTrak e nametag) saem do Inventário e do Loadout quando o VIP acaba, e ficam guardados por 30 dias (veja os [Termos](/termos), seção 8). As skins comuns continuam com você.

### Seção 5 · "Indisponibilidade" (troca os dois primeiros marcadores)

- **Mais de 24 horas seguidas:** a Staff soma ao VIP de todas as Contas com VIP ativo os dias da indisponibilidade. Você não precisa pedir.
- **Mais de 7 dias seguidos:** além disso, você pode pedir o reembolso proporcional dos dias de VIP ainda não usados, pelo mesmo caminho da seção 2. O valor é: valor pago pelo Pacote × dias não usados ÷ dias do Pacote. [VALIDAR COM ADVOGADO]

### Seção 7 · "Contestação no banco" (acrescenta ao fim)

Enquanto a Staff revisa uma contestação, a Conta fica sem poder fazer novas compras. Se o pagamento era legítimo e foi contestado para ficar com o VIP sem pagar, vale a seção 10 dos [Termos](/termos).

---

## 3. `politica-de-privacidade.md`

### "Quando alguém paga o VIP" (troca a tabela e o parágrafo seguinte)

| Dado | Para quê |
| --- | --- |
| Conta beneficiada e Pacote comprado | Conceder o VIP certo |
| **Nome e CPF do Pagador**, informados ao Mercado Pago. O CPF fica **cifrado**; só os 3 últimos dígitos aparecem na tela | Registrar que a compra foi feita por um maior de idade e cumprir obrigações legais e fiscais |
| Declaração de maioridade do Pagador (com data e hora e a versão do texto) | Provar que a regra de Pagador adulto foi seguida |
| Identificador, valor, meio (Pix ou cartão), data, situação e reembolsos do pagamento | Conceder, reembolsar e conferir pagamentos |
| Registro dos avisos do Mercado Pago sobre o pagamento (data e resultado) | Garantir que cada pagamento conceda o VIP uma só vez e investigar falhas |
| Bloqueio de compras da Conta e o motivo, quando há contestação | Evitar fraude até a Staff revisar |

Os dados do Pix e do cartão ficam com o Mercado Pago: o cartão é digitado na página dele, e o Carmine **nunca recebe** número, validade nem código do cartão. O Carmine não recebe nem guarda dados bancários.

### Nova linha em "Quem recebe os seus dados" (troca a do Mercado Pago)

| **Mercado Pago** | Valor, Conta beneficiada e os dados que o Pagador informa a ele | Processar o Pix, o cartão e os reembolsos |

### Nova linha em "O que guardamos e por quanto tempo"

| Itens VIP guardados (agente, music kit, StatTrak e nametag) | 30 dias depois do fim do VIP; voltam se o VIP voltar nesse prazo e são apagados depois |
| Registro dos avisos de pagamento | 12 meses |

(O registro do pagamento, o CPF cifrado e a declaração de maioridade continuam guardados por 5 anos.)

### "Exclusão da Conta" (acrescenta à lista do que é apagado)

Os Itens VIP guardados são apagados junto com o Inventário. Os registros de pagamento ficam pelo prazo legal, sem ligação com o seu nome de exibição.

---

## O que falta para publicar

1. Revisão do advogado nos pontos `[VALIDAR COM ADVOGADO]` (em especial: reembolso integral mesmo usando o VIP, declaração de maioridade como controle, guarda dos Itens VIP, CPF por 5 anos).
2. `[CONFIRMAR]` o prazo de estorno no cartão com o Mercado Pago.
3. A lista do dono da cobrança (verificação de idade, identificação do fornecedor, tributação) e a S14c (adaptador do Mercado Pago).
4. No mesmo deploy: `PAYMENTS_ENABLED=true`, `VIP_HOLD_ENABLED=true` e os quatro documentos atualizados.
