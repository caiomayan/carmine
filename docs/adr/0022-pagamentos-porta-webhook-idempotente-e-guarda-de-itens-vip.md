# Pagamentos atrás de uma porta, webhook assinado e idempotente, e Itens VIP guardados por 30 dias

O VIP é vendido em Pacotes avulsos (1, 3 e 6 meses; Pix e cartão; conta CPF no Mercado Pago; ADR 0010 e 0011). Esta decisão fixa como a venda entra no sistema sem que um provedor, um webhook repetido ou um bug conceda VIP de graça ou o tire de quem pagou.

## Decisão

- **Porta `Payments`** (`apps/api/src/payments/gateway.ts`): `createCharge`, `getPayment`, `cancelCharge`, `refund`, `verifyWebhook`, `resolvePaymentId`. Só o adaptador conhece o provedor. Há dois: o do **Mercado Pago** (S14c) e um **falso** (dev, E2E e homologação), que guarda as cobranças no Valkey, simula pagamento, recusa, vencimento, estorno e contestação, e entrega o webhook **assinado de verdade** ao tratador real, pela mesma verificação. A configuração recusa o provedor falso fora de host de homologação (`dev.stcarmine.com`, `localhost`) ou com `SENTRY_ENVIRONMENT=production`, mesmo com a cobrança desligada.
- **A cobrança nasce desligada** (`PAYMENTS_ENABLED=false`); ligada, exige provedor e `PAYMENTS_DATA_KEY` (32 bytes em base64, cifra o CPF do Pagador).
- **O VIP só nasce do que o PROVEDOR diz.** O webhook valida a assinatura (HMAC-SHA256 do manifesto `id;request-id;ts`, comparação em tempo constante, tolerância de 5 min), mas **nunca** vale pelo corpo: a API consulta o pagamento no provedor, confere `external_reference` e valor com o Pacote e só então aplica. Assinatura inválida: 401, registrada em `payment_events`, com alerta a partir de 5 em 10 min.
- **Idempotência pela chave, não por memória.** `applyProvider` trava a linha do pagamento e só avança estados; `vip_periods.payment_id` é **único**, então a mesma confirmação (webhook repetido, conciliação, reentrega) não concede duas vezes. O pagamento que chega depois de o QR vencer ainda concede (o dinheiro entrou). Valor diferente do Pacote não concede (`mismatch`, alerta).
- **Estados:** `created`, `pending`, `in_review`, `approved`, `rejected`, `expired`, `cancelled`, `refunded`, `partially_refunded`, `charged_back`. A varredura (a cada minuto) vence os QR expirados depois de consultar o provedor, abandona cobranças que nunca chegaram a ser criadas e, de ~30 em ~30 min, reconcilia os aprovados dos últimos 8 dias (pega estorno e contestação sem webhook); `payments reconcile` faz o mesmo sob demanda (backup restaurado).
- **Os dias de UM Pacote saem do VIP** por `VipPeriods.removePackage`: encurta o Período dele e recua os que vêm depois, então a data de fim recua exatamente esses dias, mesmo que parte já tenha sido usada (reembolso de 7 dias, estorno parcial por dias, contestação). `refunded_days` impede tirar duas vezes.
- **Reembolso de 7 dias pelo site, automático** (D1): a API estorna no provedor e os dias saem; depois dos 7 dias, ou parcial por indisponibilidade, é a Staff (`payments refund`), com auditoria (`payment_refund`).
- **Contestação** (D6): tira os dias, marca `charged_back`, **bloqueia novas compras da Conta** (`accounts.purchase_blocked_at`) até a Staff revisar (`payments unblock`) e alerta. **Todo ban permanente** (J2) encerra o VIP sem reembolso e impede a compra.
- **Compensação por indisponibilidade** (D4): ação da Staff em lote (`payments compensate --key`), idempotente pela chave, com UMA linha de auditoria (`vip_compensation`) e alerta.
- **Itens VIP guardados 30 dias** (D3): ao fim do VIP, o agente e o kit de música saem do Inventário e do Loadout, e o StatTrak e a nametag saem das skins (que ficam), para `vip_held_items` (com os slots onde estavam); voltam inteiros, nos mesmos slots, se o VIP voltar; apagados após 30 dias do fim do VIP. Tirar de verdade, em vez de filtrar na leitura, garante que nenhuma tela nem o jogo enxergam o guardado. Roda por varredura (e na hora, quando um pagamento muda o VIP) e **nasce desligada** (`VIP_HOLD_ENABLED`): liga junto com os Termos novos.
- **Dados:** o CPF do Pagador fica cifrado (AES-256-GCM) com só os 3 últimos dígitos legíveis; o registro de pagamento não é apagado na anonimização (5 anos); `payment_events` dura 12 meses.

## Consequences

- O webhook perdido, repetido ou fora de ordem não concede nem tira VIP errado; o pior caso é o atraso até a próxima varredura.
- Trocar de provedor (ou ligar a assinatura quando houver CNPJ) é um adaptador novo, sem mexer no domínio.
- O falso exercita o caminho inteiro sem o Mercado Pago; o que o sandbox ainda precisa provar são as diferenças do provedor real (S14c).
- Migração `0015` só aditiva (3 tabelas, 3 valores de enum de auditoria, 3 colunas), então o rollback é de imagem.

## Considered Options

- Conceder o VIP pelo corpo do webhook assinado: mais simples, mas qualquer vazamento do segredo concede VIP; consultar o provedor custa uma chamada.
- Filtrar os Itens VIP na leitura em vez de guardá-los: poucas linhas a mais, mas cada tela e o jogo precisariam lembrar de filtrar, e um esquecimento vaza o Item.
- Reembolso de 7 dias só pela Staff, no painel do provedor: mais lento e contra o espírito do CDC (art. 49 e Decreto 7.962, art. 5º).
