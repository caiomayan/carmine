# Pagamentos e VIP (operação)

Como operar a venda de Pacotes VIP (S14). Decisões: ADR 0023. A cobrança nasce **desligada**.

## Chaves de configuração (`.env` da VM)

| Variável | O que faz |
| --- | --- |
| `PAYMENTS_ENABLED` | `true` abre a compra. Padrão `false`: a página do VIP mostra "Em breve" e a API responde 503 `payments_disabled`. **Só vira `true` depois** da decisão sobre a verificação de idade, da identificação do fornecedor e da tributação (lista do dono). |
| `PAYMENTS_PROVIDER` | `mercadopago` ou `fake`. O `fake` só roda em `dev.stcarmine.com`/`localhost` (a API se recusa a subir em outro host). |
| `PAYMENTS_DATA_KEY` | 32 bytes em base64 (`openssl rand -base64 32`): cifra o CPF do Pagador. Guarde uma cópia: sem ela os CPFs guardados não se leem. |
| `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET` | Credenciais do app no Mercado Pago (S14c). Nunca no repositório ou no chat. |
| `PAYMENTS_SWEEP_SECONDS` | Varredura de vencimento e conciliação (padrão 60; 0 desliga). |
| `RECEIPT_SUPPLIER_NAME`, `RECEIPT_SUPPLIER_DOCUMENT`, `RECEIPT_SUPPLIER_ADDRESS` | **Do web**, não da API: quem vende o VIP no recibo (nome, CPF e endereço do escritório virtual). Os três juntos; faltando algum, o recibo mostra "a informar". Preencha antes de ligar a cobrança. |
| `VIP_HOLD_ENABLED` | Liga a guarda de 30 dias dos Itens VIP (padrão `false`; liga junto com os Termos novos). `VIP_HOLD_SWEEP_SECONDS` (60) é a varredura. |

Produção não tem `PAYMENTS_PROVIDER=fake` e a API não sobe com ele em `stcarmine.com`.

## Comandos (Staff)

Na VM, pelo CLI da API (`docker exec` no contêiner da API, ou `pnpm --filter @carmine/api payments ...` em dev). Tudo que muda algo vai para o log de auditoria.

```
payments reconcile [--days 8]                       # confere com o provedor (webhook perdido, backup restaurado)
payments refund --id <pagamento> --by <SteamID64> --reason "..." [--days N]
payments unblock --steam-id <SteamID64> --by <SteamID64> --reason "..."
payments compensate --days N --key <chave única> --by <SteamID64> --reason "..."
```

- **Reembolso depois dos 7 dias, ou parcial por indisponibilidade:** `payments refund` (com `--days`, o valor é valor × dias ÷ dias do Pacote, e os dias saem do VIP). Dentro dos 7 dias a própria pessoa faz em "Minhas compras".
- **Contestação (chargeback, MED do Pix):** o pagamento vira "Contestado", os dias saem, as compras da Conta ficam **bloqueadas** e a Staff recebe o alerta. Revise; contestação de pagamento legítimo para ficar com o VIP é fraude (Termos §10, ban permanente). Para reabrir: `payments unblock`.
- **Indisponibilidade acima de 24 h:** `payments compensate` soma os dias a todos os VIPs ativos de uma vez (a chave evita aplicar duas vezes).
- **Pagou e o VIP não apareceu:** `payments reconcile`; se o pagamento existe no provedor, ele concede. Confira `payment_events` (webhooks recebidos, com o resultado).

## Alertas (Discord, `DISCORD_ALERT_WEBHOOK_URL`)

Contestação; valor aprovado diferente do Pacote; estorno parcial feito direto no provedor; 5 webhooks com assinatura inválida em 10 minutos (segredo errado ou alguém tentando); compensação aplicada.

## Homologação

A homologação (`dev.stcarmine.com`) vende com o **provedor falso**: a página de simulação paga, recusa, expira, estorna e contesta, e o webhook assinado percorre o caminho real. No `.env` da homologação: `PAYMENTS_ENABLED=true`, `PAYMENTS_PROVIDER=fake`, `PAYMENTS_DATA_KEY=<openssl rand -base64 32>` e `VIP_HOLD_ENABLED=true` (o bootstrap novo já sorteia a chave; numa homologação já criada, acrescente as linhas à mão e rode *Run workflow*).

## "Minhas compras" e o recibo (S14b)

- **Onde:** Configurações > **Compras** (`/configuracoes/compras`) e o recibo (`/configuracoes/compras/<id>`). A tela lê a lista da Conta e, para cada compra em aberto, o detalhe (que pergunta ao provedor), e se atualiza sozinha até o pagamento resolver; o Pix pendente volta com o QR e o código.
- **"Processando":** a API só diz o estado e as datas. A regra é da tela: passados `PURCHASE_PROCESSING_MINUTES` (10) da criação sem a compra mudar, aparece o suporte com o identificador (o `id` inteiro, para copiar).
- **Recibo:** o número é o identificador da compra, sem nota fiscal (pessoa física). Só existe para compra aprovada (mesmo devolvida depois). Imprime em papel/PDF só com o recibo. O fornecedor vem das variáveis `RECEIPT_SUPPLIER_*` do web.
- **E2E:** `apps/web/e2e/compras.spec.ts`, com o provedor falso ligado em `playwright.config.ts`.
