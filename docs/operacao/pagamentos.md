# Pagamentos e VIP (operação)

Como operar a venda de Pacotes VIP (S14). Decisões: ADR 0023. A cobrança nasce **desligada**.

## Chaves de configuração (`.env` da VM)

| Variável | O que faz |
| --- | --- |
| `PAYMENTS_ENABLED` | `true` abre a compra. Padrão `false`: a página do VIP mostra "Em breve" e a API responde 503 `payments_disabled`. **Só vira `true` depois** da decisão sobre a verificação de idade, da identificação do fornecedor e da tributação (lista do dono). |
| `PAYMENTS_PROVIDER` | `mercadopago` ou `fake`. O `fake` só roda em `dev.stcarmine.com`/`localhost` (a API se recusa a subir em outro host). |
| `PAYMENTS_DATA_KEY` | 32 bytes em base64 (`openssl rand -base64 32`): cifra o CPF do Pagador. Guarde uma cópia: sem ela os CPFs guardados não se leem. |
| `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET` | Credenciais do app no Mercado Pago (S14c, o adaptador está pronto e desligado: o passo a passo do dono e o que só o sandbox prova estão em [mercadopago.md](mercadopago.md)). Nunca no repositório ou no chat. |
| `PAYMENTS_DATA_KEY_FILE` | Caminho de um arquivo com a chave, usado quando `PAYMENTS_DATA_KEY` está vazia (a homologação). |
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

A homologação (`dev.stcarmine.com`) vende com o **provedor falso**: a página de simulação paga, recusa, expira, estorna e contesta, e o webhook assinado percorre o caminho real. **Não há nada a configurar no `.env` da VM**: `PAYMENTS_ENABLED`, `PAYMENTS_PROVIDER=fake` e `VIP_HOLD_ENABLED` vêm do `infra/hml/compose.yml` (não são segredo), e a chave de dados é sorteada sozinha pelo serviço `payments-key` na primeira subida (cria o arquivo só se não existir, num volume da pilha, e a API o lê por `PAYMENTS_DATA_KEY_FILE`; a chave não passa por `.env`, variável de ambiente nem log). O `reset` apaga o volume junto com o banco, então o CPF cifrado nunca sobrevive à chave.

## "Minhas compras" e o recibo (S14b)

- **Onde:** Configurações > **Compras** (`/configuracoes/compras`) e o recibo (`/configuracoes/compras/<id>`). A tela lê a lista da Conta e, para cada compra em aberto, o detalhe (que pergunta ao provedor), e se atualiza sozinha até o pagamento resolver; o Pix pendente volta com o QR e o código.
- **"Processando":** a API só diz o estado e as datas. A regra é da tela: passados `PURCHASE_PROCESSING_MINUTES` (10) da criação sem a compra mudar, aparece o suporte com o identificador (o `id` inteiro, para copiar).
- **Recibo:** o número é o identificador da compra, sem nota fiscal (pessoa física). Só existe para compra aprovada (mesmo devolvida depois). Imprime em papel/PDF só com o recibo. O fornecedor vem das variáveis `RECEIPT_SUPPLIER_*` do web.
- **E2E:** `apps/web/e2e/compras.spec.ts`, com o provedor falso ligado em `playwright.config.ts`.

## Painel da Staff nos pagamentos (S14)

- **Onde:** `/staff/pagamentos`, aba **Pagamentos** do painel. **Só o Dono e o Admin** (permissão `payments.manage`); Moderador e jogador recebem 404, e o Moderador nem vê a aba.
- **Lista:** do mais recente ao mais antigo, com abas por estado e a contagem de cada um (sempre o total, não só a página). Cada linha mostra o estado, a Conta, o valor, o Pacote, o meio e a data; "Carregar mais" pagina pelo cursor.
- **Ficha** (`/staff/pagamentos/<id>`): valores, Pacote, Conta beneficiada, Pagador (CPF mascarado), provedor e id lá, o fim do Período VIP gerado, os **webhooks recebidos** (quando, tópico, assinatura, o que a API fez) e o que a Staff já fez nesse pagamento.
- **Reembolsar:** com motivo e confirmação; sem dias devolve o que resta, com dias é parcial (valor × dias ÷ dias do Pacote). O provedor estorna e os dias saem do VIP. Se o provedor não confirmar, nada é devolvido (erro 502, tente de novo). É o mesmo `payments refund`, com o mesmo log de auditoria (`payment_refund`).
- **Compras bloqueadas:** se a Conta foi bloqueada por contestação, a ficha mostra o bloqueio e o botão **Reabrir as compras** (motivo obrigatório; `purchase_unblock`).
- **Conciliar agora:** confere com o provedor os pagamentos dos últimos N dias (padrão 8) e diz quantos foram conferidos e quantos mudaram (o `payments reconcile`).
- **Compensação em lote (D4):** o painel mostra quantas Contas têm VIP ativo agora, pede os dias (1 a 30), a chave única da queda (sugere `queda-AAAA-MM-DD`) e o motivo, e **confirma com os números** antes de aplicar. Repetir a chave não soma de novo. Avisa no Discord e entra no log (`vip_compensation`); as últimas compensações ficam listadas.
- **API:** `GET/POST /api/staff/payments*` e `POST /api/staff/accounts/{publicId}/purchases/unblock` (contrato em `packages/contracts/src/staff-payments.ts`). Testes: `apps/api/test/staff-payments.int-spec.ts` e `apps/web/e2e/staff-pagamentos.spec.ts` (a compensação não é aplicada no E2E, porque soma dias a todos os VIPs do banco compartilhado).
