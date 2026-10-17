# Troca de token GSLT

Runbook do ADR 0002: operamos com skins simuladas aceitando o risco de a Valve banir tokens GSLT. A defesa é ter tokens de reserva, em contas Steam distintas, e trocar rápido.

> Os servidores de produção (VPS de CS2) entram na S09b. Os comandos abaixo valem para o ambiente que existir; nos pontos marcados *(S09b)* o caminho exato depende da instalação na VPS.

## Antes de precisar (preparação)

1. Mantenha **pelo menos 3 tokens** gerados, cada um numa conta Steam diferente, cada conta com telefone e proteção própria (a Valve limita tokens por conta e liga o ban à conta). Gere em <https://steamcommunity.com/dev/managegameservers> com o **App ID 730**; o campo de memo identifica o servidor (`carmine-retake-1`).
2. Guarde os tokens num gerenciador de senhas, **nunca no repositório**, no `.env` da VM ou em chat. Registre ali qual conta e qual servidor usam cada um.
3. Um token em uso por servidor; dois servidores nunca compartilham o mesmo.

## Sintomas de um token banido

- O servidor sobe, mas não aparece na lista da Steam, ou o log mostra que o logon do servidor na Steam foi recusado (token inválido ou banido).
- Jogadores não conseguem entrar com erro de verificação de conta depois de a Steam recusar o logon do servidor.
- O Carmine.Core continua mandando batimento (a API não depende do GSLT): o alerta de servidor offline **não** dispara. A detecção vem dos logs do servidor, de reclamações no Discord e do `status` no console.

## Trocar o token

1. **Avise** no Discord (canal de avisos) antes de reiniciar: "manutenção, 2 min".
2. Pegue o próximo token livre no gerenciador de senhas e marque o antigo como `BANIDO (data)`.
3. Aplique no servidor afetado *(S09b: o ponto exato é o parâmetro de inicialização `+sv_setsteamaccount <token>` do serviço do servidor; o token fica em arquivo de ambiente do serviço, fora do git)*.
4. Reinicie **só** o servidor afetado e confira: no console, `status` mostra `Steam3 ... logged on`; o servidor volta à lista do site em até 1 min (batimento) e o alerta 🟢 não é necessário se a queda foi menor que 60 s.
5. Registre a ocorrência (data, servidor, conta de origem do token banido) numa nota do Maestri. Se for o **segundo** ban no mês, avalie desligar o módulo de skins (ADR 0002: ele deve poder ser desligado sem afetar o resto) e abra uma conversa de produto.
6. Gere um novo token de reserva para repor o estoque e, se a conta banida tiver outros tokens, **troque-os também**: a Valve costuma banir por conta.

## Prazos e consequências para os jogadores

- Indisponibilidade acima de 24 h congela os dias de VIP e os devolve automaticamente; acima de 7 dias, reembolso proporcional sob pedido (spec do MVP e Termos de Uso). Por isso o estoque de tokens importa: a troca normal leva minutos.
- Comunique no site (aviso) e no Discord se a indisponibilidade passar de 1 h.
