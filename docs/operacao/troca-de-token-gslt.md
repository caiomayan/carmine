# Troca de token GSLT

Runbook do ADR 0002: operamos com skins simuladas aceitando o risco de a Valve banir tokens GSLT. A defesa é ter tokens de reserva, em contas Steam distintas, e trocar rápido.

> Nos servidores Linux (`infra/cs2/linux/`, AWS no beta e VPS depois) o token de cada perfil fica em `/etc/carmine-cs2/<perfil>.env` (`retake`, `deathmatch`), fora do git; o serviço systemd `carmine-cs2@<perfil>` o passa ao servidor como `+sv_setsteamaccount`. No servidor local do Windows o token vai direto na linha de comando que você usa.

## Antes de precisar (preparação)

1. Mantenha **pelo menos 3 tokens** gerados, cada um numa conta Steam diferente, cada conta com telefone e proteção própria (a Valve limita tokens por conta e liga o ban à conta). Gere em <https://steamcommunity.com/dev/managegameservers> com o **App ID 730**; o campo de memo identifica o servidor (`carmine-retake-1`).
2. Guarde os tokens num gerenciador de senhas, **nunca no repositório**, no `.env` da VM de produção ou em chat (a cópia em uso fica só no `/etc/carmine-cs2/<perfil>.env` do servidor, modo 0600). Registre ali qual conta e qual servidor usam cada um.
3. Um token em uso por servidor; dois servidores nunca compartilham o mesmo.

## Sintomas de um token banido

- O servidor sobe, mas não aparece na lista da Steam, ou o log (`journalctl -u carmine-cs2@<perfil>`) mostra que o logon do servidor na Steam foi recusado (token inválido ou banido).
- Jogadores não conseguem entrar com erro de verificação de conta depois de a Steam recusar o logon do servidor.
- O Carmine.Core continua mandando batimento (a API não depende do GSLT): o alerta de servidor offline **não** dispara. A detecção vem dos logs do serviço, de reclamações no Discord e da lista de servidores da Steam.

## Trocar o token

1. **Avise** no Discord (canal de avisos) antes de reiniciar: "manutenção, 2 min".
2. Pegue o próximo token livre no gerenciador de senhas e marque o antigo como `BANIDO (data)`.
3. Aplique no servidor afetado: abra um terminal na máquina (AWS: `./infra/cs2/aws/cs2-beta.ps1 shell`; VPS: SSH), `sudoedit /etc/carmine-cs2/<perfil>.env` e troque a linha `CS2_GSLT=` pelo token novo.
4. Reinicie **só** o servidor afetado: `sudo systemctl restart carmine-cs2@<perfil>` (o outro segue no ar). Confira: `journalctl -u carmine-cs2@<perfil> -n 80` sem erro de logon na Steam e o servidor na lista de servidores do CS2 (busque pelo nome); ele volta à lista do site em até 1 min (batimento) e o alerta 🟢 não é necessário se a queda foi menor que 60 s.
5. Registre a ocorrência (data, servidor, conta de origem do token banido) numa nota do Maestri. Se for o **segundo** ban no mês, avalie desligar o módulo de skins (ADR 0002: ele deve poder ser desligado sem afetar o resto) e abra uma conversa de produto.
6. Gere um novo token de reserva para repor o estoque e, se a conta banida tiver outros tokens, **troque-os também**: a Valve costuma banir por conta.

## Prazos e consequências para os jogadores

- Indisponibilidade acima de 24 h congela os dias de VIP e os devolve automaticamente; acima de 7 dias, reembolso proporcional sob pedido (spec do MVP e Termos de Uso). Por isso o estoque de tokens importa: a troca normal leva minutos.
- Comunique no site (aviso) e no Discord se a indisponibilidade passar de 1 h.
