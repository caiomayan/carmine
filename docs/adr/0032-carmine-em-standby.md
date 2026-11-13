# Carmine em standby

**Data:** 2026-11-13. **Decisão do dono.**

O [ADR 0009](0009-hospedagem-oracle-arm-e-vps-x86-br.md) pôs o site na VM Oracle Always Free (ARM) e os servidores de CS2 numa VPS x86 brasileira com anti-DDoS. Os créditos da AWS do beta (S09b) acabavam em 2026-11-26. Uma VPS que aguente o que o dono quer na produção (alguns servidores fixos e as Salas privadas da S23) custa pelo menos R$ 400 por mês, e o orçamento dele é de até R$ 100 (teto de R$ 150). A pesquisa de 2026-11-13 está na memória do maestro.

A produção nunca teve uso real: ela serviu para teste, sem jogadores de fora. Por isso não há dado a guardar.

## Decisão

- **O Carmine inteiro fica em standby:** site, API, homologação, servidores de CS2 e desenvolvimento.
- **AWS:** a instância do beta, o Elastic IP, o disco e o grupo de segurança foram apagados pelo dono, e o usuário IAM do operador foi desativado.
- **VM Oracle:**
  - A produção e a homologação foram derrubadas com os volumes (sem backup final, por decisão do dono).
  - As pastas e os usuários de deploy foram removidos.
  - Fica só a pilha `infra/pausa`: o `cloudflared` do túnel de produção e um nginx que responde, no lugar do web, da API e do painel, com uma página de pausa (`/api` devolve 503).
  - O SSH pelo túnel continua, para operar a VM.
  - A VM fica livre para os projetos pessoais do dono.
- **GitHub:** os workflows Deploy, Deploy homologação, Release do plugin e Terceiros do CS2 foram desligados. A CI dos PRs continua.
- **A volta:** numa VM paga só, x86, com site e servidores de CS2 juntos.
  - Os roteiros (`docs/operacao/`), os compose e os scripts de `infra/cs2` continuam valendo.
  - O primeiro passo é a CI gerar imagens x86. Hoje ela só gera imagens arm64, da VM Oracle.
  - O ADR 0009 é substituído por um ADR novo na volta.
  - A pesquisa sugere começar pelas Salas privadas pagas por hora (DatHost ou nuvem por hora) e não por um Retake fixo. O sinal para voltar é ter grupos querendo jogar, não só o orçamento.

## Consequences

- O `stcarmine.com` mostra a página de pausa. Os endereços da homologação (`dev.`, `staff-dev.`) ficam sem resposta até o dono apagar o túnel e as aplicações do Access dela no Cloudflare.
- Os segredos dos serviços externos (Discord, Steam, Mercado Pago, R2, Sentry) não estão mais na VM, mas continuam válidos nos provedores até o dono revogá-los.
- Os PRs abertos (#300, #298, #221) e a fila de issues ficam como estão, para a volta.
- O teste de carga (`docs/operacao/teste-de-carga.md`) e o ADR 0031 (Dokploy) continuam como registro.
- O Dokploy, se entrar na VM Oracle, agora não divide a máquina com o Carmine.

## Considered Options

- **Manter o site no ar e pausar só o CS2:** o site sem servidores não coleta nada, e manter a produção exige atualização e vigilância. Descartado pelo dono.
- **VPS barata, KVM 2 da Hostinger, com 1 Retake:** os 2 núcleos compartilhados não aguentam o Retake mais uma Sala, e um servidor vazio não atrai jogador. Descartado.
- **DatHost com 1 Retake fixo e Salas por hora (~R$ 81–92 por mês):** cabe no orçamento, mas exige adaptar o deploy do plugin, e a Valve pode banir o token do servidor por causa do plugin de skins. Fica como a opção mais provável da volta.
