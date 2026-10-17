# Orçamento operacional mensal

Registro vivo do custo de manter o Carmine no ar. **Revise a cada fatia que aumente o consumo** (novo serviço, mais armazenamento, mais servidores de CS2, mais tráfego) e atualize a tabela e a data.

Última revisão: 2026-10-17 (S09a). Valores em USD; os de fornecedores brasileiros em reais. Itens marcados *estimativa* vêm de pesquisa de 2026-10-10 e não de fatura.

## Site, API e dados (esta fatia)

| Item | Plano | Custo/mês | Observação |
| --- | --- | --- | --- |
| Oracle Cloud, VM A1 (2 OCPU, 12 GB, ARM, São Paulo) | Always Free | 0 | Limite de 2 OCPU / 12 GB desde 2026-06-15. A Oracle recolhe instância ociosa (CPU, rede e memória abaixo de 20% por 7 dias): ver "Riscos". |
| Cloudflare (DNS, Tunnel, Access, proxy, regras) | Free | 0 | Access grátis até 50 usuários. |
| Cloudflare R2 (backups do Postgres) | Free tier | 0 | 10 GB-mês grátis; um dump é de poucos MB e guardamos 30 dias. Operações dentro da cota grátis. |
| GHCR (imagens) e GitHub Actions | GitHub Pro (conta do dono) | ~4 | Repositório privado: minutos de Actions e pacotes dentro da cota do plano. *estimativa de preço* |
| Domínio `stcarmine.com` | anual | ~1 (≈ US$ 10–12/ano) | *estimativa*; renovação anual. |
| Sentry | Developer (grátis) | 0 | Cota de eventos pequena; só erros. Se estourar, filtrar ruído antes de pagar. |
| Monitor externo (UptimeRobot ou Better Stack) | Free | 0 | Monitores a cada 1–5 min bastam. |
| Discord (webhooks) | Free | 0 | |
| **Subtotal site/API/dados** | | **~US$ 5** | |

## Servidores de CS2 (S09b, ainda não contratados)

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
- **Mais slots/servidores de CS2**: cada servidor extra pesa na VPS (3–6 GB de RAM por servidor); reavalie o plano da VPS antes de lançar um terceiro perfil.
