# Mercado Pago no CPF, com Pacotes VIP via Pix em vez de Pix Automático

O VIP é vendido pelo Mercado Pago em nome de pessoa física: Pix a 0,99% com crédito imediato, SDK oficial em TypeScript e chave de idempotência. Pix Automático exige CNPJ ativo há 6 meses ou mais (Res. BCB 482/2025), então o Pix é vendido como Pacote VIP pré-pago (1, 3 ou 6 meses). No MVP não há cartão nem recorrência: a Assinatura VIP no cartão multiplica estados (renovação, falha, cancelamento, sobreposição com Pix, chargeback) e fica para depois. Benefícios só são concedidos depois que o webhook é confirmado consultando o pagamento.

## Considered Options

- Asaas: tem Pix Automático, mas cobra R$ 1,99 fixo por Pix (cerca de 13% de um ticket de R$ 15).
- Stripe Brasil: Pix só por convite, e venda de itens de jogo é categoria restrita.
