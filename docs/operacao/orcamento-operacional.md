# Orçamento operacional mensal

Registro vivo do custo de manter o Carmine no ar. **Revise a cada fatia que aumente o consumo** (novo serviço, mais armazenamento, mais servidores de CS2, mais tráfego) e atualize a tabela e a data.

Última revisão: 2026-10-17 (S09a, S09b). Valores em USD; os de fornecedores brasileiros em reais. Itens marcados *estimativa* vêm de pesquisa de 2026-10-10 e não de fatura.

## Site, API e dados (esta fatia)

| Item | Plano | Custo/mês | Observação |
| --- | --- | --- | --- |
| Oracle Cloud, VM A1 (2 OCPU, 12 GB, ARM, São Paulo) | Always Free | 0 | Limite de 2 OCPU / 12 GB desde 2026-06-15. A Oracle recolhe instância ociosa (CPU, rede e memória abaixo de 20% por 7 dias): ver "Riscos". |
| Cloudflare (DNS, Tunnel, Access, proxy, regras) | Free | 0 | Access grátis até 50 usuários. |
| Cloudflare R2 (backups do Postgres) | Free tier | 0 | 10 GB-mês grátis; um dump é de poucos MB e guardamos 30 dias. Operações dentro da cota grátis. |
| Cloudflare R2 (fotos de perfil, ADR 0022) | Free tier | 0 | Dois buckets (público e privado), ~60 kB por Conta nos 4 tamanhos: 10 mil Contas ≈ 600 MB, dentro dos 10 GB grátis. Saída grátis; operações dentro da cota. *Conferido na página oficial de preços do R2 em 2026-10-26.* |
| GHCR (imagens) e GitHub Actions | GitHub Pro (conta do dono) | ~4 | Repositório privado: minutos de Actions e pacotes dentro da cota do plano. *estimativa de preço* |
| Domínio `stcarmine.com` | anual | ~1 (≈ US$ 10–12/ano) | *estimativa*; renovação anual. |
| Sentry | Developer (grátis) | 0 | Cota de eventos pequena; só erros. Se estourar, filtrar ruído antes de pagar. |
| Monitor externo (UptimeRobot ou Better Stack) | Free | 0 | Monitores a cada 1–5 min bastam. |
| Discord (webhooks) | Free | 0 | |
| **Subtotal site/API/dados** | | **~US$ 5** | |

## Servidores de CS2: beta na AWS (S09b)

Decisão do dono: até o fim do beta (~26/11/2026, ~10 amigos) os dois perfis rodam numa instância EC2 em sa-east-1, **ligada só nas sessões**, paga com os US$ 72 de créditos. Passo a passo e conta detalhada: `aws-beta-cs2.md`. Tarifas lidas na lista pública da AWS em 2026-10-15 (Linux sob demanda, São Paulo).

| Item | Custo | Observação |
| --- | --- | --- |
| EC2 `m6a.xlarge` (4 vCPU, 16 GiB) ligada | US$ 0,2754/h + IPv4 US$ 0,005/h | Só nas sessões. `c6a.xlarge` (8 GiB) seria US$ 0,2358/h. |
| Disco gp3 de 100 GB | US$ 15,20/mês (US$ 0,152/GB-mês) | Cobra ligada ou desligada. |
| Elastic IP | US$ 3,65/mês (US$ 0,005/h) | Cobra sempre; o endereço fica no cadastro da API. |
| Tráfego de saída | US$ 0,15/GB após 100 GB/mês grátis *(estimativa)* | ~1 GB por sessão de 3 h com 10 jogadores. |
| **Parada** | **~US$ 19/mês (~US$ 0,03/h)** | Disco + IP. |
| **Fixos até 26/11** | **~US$ 25** | ~40 dias de disco e IP. |
| **Saldo para jogar** | **~US$ 47 ≈ 170 h** | De US$ 72, descontados os fixos. Alarmes de gasto em US$ 10/20/40. |

Depois dos créditos o custo da instância parada continua: encerrar o beta é terminar a instância, liberar o IP e apagar o disco (`aws-beta-cs2.md`, "Encerrando o beta").

## Servidores de CS2: VPS definitiva (a partir do fim de 2026, ainda não contratada)

| Item | Custo/mês | Observação |
| --- | --- | --- |
| VPS BR x86 com anti-DDoS e root (4 vCPU, 8 GB, ≥ 120 GB de disco) | R$ 100–200 (≈ US$ 20–40) *estimativa* | Enxadahost 4c/8GB (promo R$ 100, cheio R$ 200); RazeHost 5c/8GB ≈ R$ 200. Retake + DM no mesmo host. |
| Tokens GSLT | 0 | Grátis, mas exigem contas Steam com telefone (ADR 0002). |
| **Total previsto no lançamento** | **~US$ 25–45** | Meta registrada na pesquisa de hospedagem: US$ 20–45/mês. |

## Consumo de recursos da VM (Oracle A1)

Limites de memória do `infra/prod/compose.yml`: Postgres 2,5 GB, API 1,5 GB, web 1,5 GB, backup 0,5 GB, migração 0,5 GB (só durante o deploy), Valkey 0,4 GB, cloudflared 0,25 GB: **7,3 GB de 12 GB**, deixando ~4,7 GB para o sistema, o Docker e picos. Consumo real em repouso (smoke test local): ~0,4 GB no total. Disco: 96 GB; o Postgres e o Valkey são pequenos, e o que cresce é o log do Docker (limitado a 3 × 10 MB por serviço) e as imagens (podadas no deploy).

## Riscos que viram custo

- **Reclamação da instância ociosa pela Oracle.** Com uso real de CPU/rede/memória muito abaixo de 20%, a A1 pode ser recolhida. Mitigação conhecida: converter a conta para *Pay As You Go* (continua sem cobrança enquanto se usa só os recursos Always Free) e/ou manter carga constante. Decisão do dono, registrada em `docs/operacao/checklist-do-dono.md`.
- **Sentry acima da cota**: o plano pago começa em ~US$ 26/mês; antes, reduza ruído.
- **R2**: operações/armazenamento acima da cota grátis custam centavos; revise se mudar a retenção ou o tamanho do banco.
- **Instância AWS do beta esquecida ligada**: US$ 0,28/h ≈ US$ 6,7/dia ≈ 4 dias de créditos de jogo. Mitigações: alarmes de gasto (US$ 10/20/40), o hábito de `cs2-beta.ps1 stop` e, opcional, o desligamento por CPU ociosa (`aws-beta-cs2.md`, passo 7).
- **Mais slots/servidores de CS2**: cada servidor extra pesa na VPS (3–6 GB de RAM por servidor); reavalie o plano da VPS antes de lançar um terceiro perfil.
