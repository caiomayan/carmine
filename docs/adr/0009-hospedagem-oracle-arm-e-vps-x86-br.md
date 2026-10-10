# Web, API e banco na Oracle ARM; servidores de CS2 em VPS x86 no Brasil

Web, API, Postgres e Valkey rodam em Docker Compose na instância Oracle Always Free (Ampere A1, até 2 OCPU / 12 GB), expostos só pelo Cloudflare Tunnel, que esconde o IP de origem e protege o HTTP de graça. Os servidores de CS2 não podem ficar ali: o servidor dedicado é só x86-64, e sob emulação (FEX/box64) o Metamod e o CounterStrikeSharp travam. Eles rodam numa VPS brasileira com anti-DDoS e acesso root, porque a Cloudflare não protege o UDP do CS2 nos planos acessíveis.

## Consequences

- A Oracle recolhe instâncias Always Free ociosas (menos de 20% de uso por 7 dias): manter alerta.
- O desenvolvimento usa um servidor CS2 local no Windows do autor, que também serve de staging para cada update do CS2.
