# Web, API e banco na Oracle ARM; servidores de CS2 em VPS x86 no Brasil

Web, API, Postgres e Valkey rodam em Docker Compose na instância Oracle Always Free (Ampere A1, até 2 OCPU / 12 GB), expostos só pelo Cloudflare Tunnel, que esconde o IP de origem e protege o HTTP de graça. Os servidores de CS2 não podem ficar ali: o servidor dedicado é só x86-64, e sob emulação (FEX/box64) o Metamod e o CounterStrikeSharp travam. Eles rodam numa VPS brasileira com anti-DDoS e acesso root, porque a Cloudflare não protege o UDP do CS2 nos planos acessíveis.

## Consequences

- A instalação do servidor dedicado do CS2 ocupa cerca de 69 GB (medido em 2026-10-10). A VPS precisa de no mínimo 100 GB de disco (120 GB ou mais para folga de updates); planos de 50–60 GB não servem.
- Até a VPS de produção ser contratada (previsão: fim de 2026, por orçamento), o CS2 roda no PC do autor e testes pela internet usam créditos da AWS numa instância ligada só durante as sessões.

- A Oracle recolhe instâncias Always Free ociosas (menos de 20% de uso por 7 dias): manter alerta.
- O desenvolvimento usa um servidor CS2 local no Windows do autor, que também serve de staging para cada update do CS2.
