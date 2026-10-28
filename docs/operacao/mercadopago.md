# Mercado Pago (S14c): o adaptador, as fontes e o que falta para ligar

O adaptador do Mercado Pago da porta `Payments` (S14, ADR 0023) está em `apps/api/src/payments/mercadopago/`. **Nada liga sozinho**: sem `PAYMENTS_PROVIDER=mercadopago` e sem as duas chaves (`MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`) a compra fica indisponível, e a cobrança só abre com `PAYMENTS_ENABLED=true` (decisão do dono). Este documento diz **de onde vem cada chamada**, **o que o dono precisa fazer** e **o que só se prova com o sandbox**.

## O que o adaptador faz

| Porta | Mercado Pago | Observação |
|---|---|---|
| `createCharge` (Pix) | `POST /v1/payments` (`payment_method_id: pix`, `date_of_expiration`, `external_reference` = o id do nosso pagamento) | QR em `point_of_interaction.transaction_data.qr_code_base64`, "copia e cola" em `qr_code`. O vencimento vai com no mínimo 31 min (o mínimo da documentação é 30). `X-Idempotency-Key: charge-<id>` |
| `createCharge` (cartão) | `POST /checkout/preferences` (Checkout Pro) | Só cartão (exclui `ticket`, `atm`, `bank_transfer`), `binary_mode`, `expires`, `auto_return: approved`, `back_urls` para a nossa tela. O link é o `init_point`. O `providerPaymentId` do cartão é `ref:<id do nosso pagamento>` (a preferência não tem pagamento ainda) |
| `getPayment` | `GET /v1/payments/{id}` (Pix) ou `GET /v1/payments/search?external_reference=` (cartão) | A única fonte para conceder VIP. Entre tentativas de cartão fica a aprovada, antes da pendente, antes das recusadas |
| `cancelCharge` | `PUT /v1/payments/{id}` com `{"status":"cancelled"}` | Cartão não tem o que cancelar (a preferência vence sozinha). 400 e 404 não são erro |
| `refund` | `POST /v1/payments/{id}/refunds` | Total: sem `amount`. Parcial: `amount` em reais. A chave de idempotência leva o valor |
| `verifyWebhook` | cabeçalho `x-signature` (`ts=...,v1=...`), `x-request-id`, `data.id` da URL | HMAC-SHA256 do manifesto `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`, tolerância de 5 min, comparação em tempo constante (`webhook-signature.ts`, da S14a) |
| `resolvePaymentId` | `payment` → o próprio id; `topic_merchant_order_wh` → `GET /merchant_orders/{id}` (a referência); `topic_chargebacks_wh` → `GET /v1/chargebacks/{id}` com `X-Caller-Id` | Contestação sem a conta vendedora conhecida é ignorada e a conciliação a pega (o `charged_back` aparece na consulta do pagamento) |

Estados: `pending`→pendente; `approved`→aprovado (com valor devolvido, parcial ou total); `authorized`, `in_process`, `in_mediation`→em análise (nada é concedido); `rejected`; `cancelled` com `status_detail: expired`→expirado, senão cancelado; `refunded`; `charged_back`. Um status fora dessa lista **levanta erro**: o webhook responde 5xx e o Mercado Pago reenvia, em vez de o pagamento ficar parado sem ninguém ver.

Sem SDK: são seis chamadas, e o cliente (`mercadopago-client.ts`) é só `fetch` com o Access Token e os cabeçalhos da documentação, e nunca deixa o token numa mensagem de erro.

## Fontes oficiais (lidas em 2026-10-28)

Só `mercadopago.com.br/developers/pt` (o host `api.mercadopago.com` responde 403 a leitores automáticos; as chamadas abaixo são as da referência). O manifesto da assinatura **não está nas páginas de documentação lidas**: está no código do SDK oficial (`github.com/mercadopago/sdk-nodejs`, `src/utils/webhook/index.ts`), que o adaptador reproduz.

- **Pix:** `/docs/checkout-api-payments/integration-configuration/integrate-pix` (corpo do POST, resposta com QR, vencimento padrão de 24 h e de 30 min a 30 dias), `/docs/checkout-api-payments/payment-management/cancellations-and-refunds/refund-pix`.
- **Pagamentos (referência):** `/reference/online-payments/checkout-api-payments/create-payment/post`, `.../get-payment/get`, `.../search-payments/get`, `.../create-cancellation/put`, `.../create-refund/post`.
- **Estados:** `/docs/checkout-api-payments/response-handling/query-results` (tabela de `status` e `status_detail`).
- **Reembolsos e cancelamento:** `/docs/checkout-api-payments/payment-management/cancellations-and-refunds` (180 dias; cancela só `pending`/`in_process`; Pix vencido vira `cancelled` + `expired`).
- **Contestação:** `/reference/online-payments/checkout-api-payments/chargebacks/get-chargeback/get` (o `X-Caller-Id` é obrigatório), `/docs/checkout-api-payments/payment-management/chargebacks`.
- **Checkout Pro:** `/reference/online-payments/checkout-pro-preferences/create-preference/post`, `/docs/checkout-pro-preferences/create-payment-preference`, `.../additional-settings/{payment-methods,binary-mode,expiration-date,term-of-preference,invoice-description}`, `.../configure-back-urls`, `.../payment-notifications`, `/reference/online-payments/checkout-pro/merchant_orders/get-merchant-order/get`.
- **Webhooks:** `/docs/your-integrations/notifications/webhooks` (corpo, `x-signature`, resposta 200/201 em 22 s, reenvio em 15 min, 30 min, 6 h, 48 h e 96 h; tópicos `payment`, `topic_merchant_order_wh`, `topic_chargebacks_wh`).
- **Teste e produção:** `/docs/your-integrations/test/accounts`, `/docs/your-integrations/test/cards`, `/docs/your-integrations/credentials`, `/docs/checkout-pro-preferences/integration-test/test-purchases`, `/docs/checkout-pro-preferences/go-to-production`, `/docs/integration-quality`, `/docs/checkout-api-orders/integration-test/pix`.
- **Payments API x Orders API:** `/docs/checkout-api-payments/overview` diz que quem começa agora deve usar a Orders API e que a Payments API "continua funcionando normalmente", mas "não receberá novas funcionalidades, apenas correções de segurança e estabilidade"; **não há data de descontinuação** nas páginas lidas. A S14c usa a Payments API (a que a proposta da S14 e o contrato da S14a descrevem); migrar para Orders é uma decisão futura, atrás da mesma porta.

As respostas dos testes (`mercadopago.fixtures.ts`) vêm dessas páginas: cada constante diz se é **literal** (copiada da página) ou **montada** (o formato da página, com o valor escolhido a partir da tabela de estados). Nenhuma foi gravada de uma conta real.

## O que o dono precisa fazer (para só colar as credenciais)

1. **Conta Mercado Pago** em nome da pessoa física, **verificada**, com **chave Pix** cadastrada.
2. **Criar a aplicação** em *Suas integrações* (developers). Nela ficam as credenciais de **teste** (criadas junto com a aplicação) e, depois de ativar o ambiente, as de **produção**.
3. **Credenciais de teste:** em *Credenciais*, seletor *Teste*, copiar o **Access Token de teste**. Rodar o teste de contrato (abaixo) com ele. Criar uma **conta de teste compradora** (*Contas de teste*) para o Checkout Pro.
4. **Ativar o ambiente de produção** (*Credenciais* > *Produção* > *Ativar*: setor, o site `https://stcarmine.com`, termos, reCAPTCHA) e copiar o **Access Token de produção**.
5. **Webhook:** em *Webhooks* > *Configurar notificações*, URL de produção `https://stcarmine.com/api/webhooks/mercadopago` (a URL de teste fica em branco: a homologação está atrás do Access, que barra o webhook), eventos **Pagamentos**, **Ordens comerciais** e **Contestações**; revelar a **assinatura secreta**. A Carmine **não** manda `notification_url` na cobrança: a assinatura só está documentada para a URL configurada no painel.
6. **`.env` da VM** (nunca no repositório nem no chat): `PAYMENTS_PROVIDER=mercadopago`, `MERCADOPAGO_ACCESS_TOKEN` (o de **produção**), `MERCADOPAGO_WEBHOOK_SECRET`, `PAYMENTS_DATA_KEY` (`openssl rand -base64 32`, com uma cópia guardada) e, no web, `RECEIPT_SUPPLIER_*`. `PAYMENTS_ENABLED` fica `false` até as decisões do `docs/operacao/pagamentos.md` (verificação de idade, fornecedor, tributação) saírem. O compose de produção agora repassa essas variáveis à API (antes só a homologação as repassava).
7. **Primeiro pagamento de verdade:** com `PAYMENTS_ENABLED=true` por um instante (ou em janela combinada), o próprio dono compra o pacote mais barato por **Pix**, confere o VIP, o recibo e os webhooks recebidos no painel (Staff > Pagamentos) e pede o **reembolso** pelo site. Faça o mesmo por **cartão**. É a única prova de ponta a ponta do Pix (ver abaixo).
8. **Medir a qualidade da integração** (*Qualidade* > *Iniciar medição*) com o *payment ID* desse primeiro pagamento: o mínimo é 73 pontos. É o que o Mercado Pago pede para a integração valer em produção.

## O que só o sandbox (ou um pagamento real) prova

Tudo abaixo está implementado do jeito que a documentação diz, mas **nenhuma resposta foi vista de uma conta real**. O teste de contrato (`mercadopago.contract.spec.ts`) cobre o que dá para provar sem pagar; o resto precisa do primeiro pagamento real.

**Prova o teste de contrato com o Access Token de teste** (`MP_SANDBOX_ACCESS_TOKEN=APP_USR-... pnpm --filter @carmine/api exec vitest run mercadopago.contract`):
- o POST do Pix é aceito e devolve QR e "copia e cola"; a consulta o vê `pending`, com o valor e a nossa referência; o cancelamento funciona;
- a preferência do Checkout Pro é aceita (os `excluded_payment_types`, `binary_mode`, `expires`, `statement_descriptor`) e devolve um `init_point`.

**Só um pagamento real (ou a conta de teste comprando) prova:**
1. **Pagador do Pix.** A documentação diz que a criação do Pix pede e-mail do pagador **e documento (tipo e número)**. A Carmine manda só um e-mail por pagamento (`pagamentos+<id>@<domínio do site>`, porque não guarda e-mail de ninguém) e **sem CPF**, já que o pagador pode ser outra pessoa e o CPF só aparece no pagamento aprovado. Se o Mercado Pago recusar sem o documento, a decisão é de produto: pedir o CPF na compra. O teste de contrato mostra isso na hora (o POST do Pix falha com 400).
2. **Pix de teste.** A documentação só descreve o teste de Pix para a Orders API (um pagador de nome `APRO`); **não há como simular o pagamento de um Pix na Payments API**. A aprovação do Pix, o webhook, a concessão do VIP e o reembolso do Pix só se veem com um pagamento real (item 7 acima).
3. **Link do Checkout Pro em teste.** A documentação não diz se com credenciais de teste vale o `init_point` ou o `sandbox_init_point`; o adaptador usa sempre o `init_point`.
4. **Ids dos tipos a excluir.** `ticket` está literal no exemplo e `bank_transfer` é o tipo do Pix na referência de meios de pagamento; **`atm` não foi confirmado**. Conferir com `GET /v1/payment_methods` e, se o id não existir, ver se o Mercado Pago recusa a preferência.
5. **Notificações em teste.** Duas páginas oficiais se contradizem (uma manda conferir as notificações do teste; outra diz que pagamentos de teste não enviam notificações). A assinatura do webhook se prova **offline** (`mercadopago.spec.ts`), mas a chegada real do webhook só com o painel configurado.
6. **Contestação.** O tópico `topic_chargebacks_wh` e a consulta com `X-Caller-Id` seguem a referência; o `X-Caller-Id` vem do `user_id` de um aviso assinado ou do `collector_id` de um pagamento lido. Sem isso o aviso é ignorado e a conciliação pega o `charged_back`. Também **não há página oficial lida sobre contestação de Pix (MED)**.
7. **Reembolso de Pix em contingência.** A referência diz que o Pix pode ficar em contingência (erro 400) e que o cabeçalho `X-Render-In-Process-Refunds: true` devolve 201 `in_process`; o adaptador **não** o usa (o 400 sobe como "o provedor não confirmou", e a pessoa tenta de novo). Se acontecer em produção, vale reavaliar.
8. **Idempotência.** A documentação não diz a janela da chave nem o que acontece ao repetir; o adaptador usa uma chave por pagamento (e por valor, no estorno).
9. **Formato da data de vencimento.** A documentação mostra dois formatos (`yyyy-MM-dd'T'HH:mm:ssz` e `...ss.SSSZ`); o adaptador usa o dos exemplos (`2026-10-28T11:31:00.000-03:00`, sempre em -03:00).
10. **Webhook assinado e `notification_url`.** Só a URL do painel está documentada com assinatura; por isso a cobrança não leva `notification_url`.

## Operação

- Conciliar: `payments reconcile` (ou Staff > Pagamentos > Conciliar agora) consulta no provedor e aplica o que faltar; cobre webhook perdido e a contestação sem o `X-Caller-Id`.
- Webhook com assinatura inválida: 401, registrado em `payment_events`, alerta no Discord a partir de 5 em 10 min.
- Rotacionar a assinatura secreta: redefinir no painel do Mercado Pago e trocar `MERCADOPAGO_WEBHOOK_SECRET` na VM no mesmo momento (avisos entre uma troca e outra falham a assinatura e são reenviados em 15 min).
