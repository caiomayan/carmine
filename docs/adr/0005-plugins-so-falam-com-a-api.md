# Plugins nunca acessam o banco; só a API

Os plugins dos Servidores Carmine falam exclusivamente com a API, via HTTPS, autenticados por uma chave por servidor. Isso contraria o padrão da comunidade (o WeaponPaints lê o MySQL direto), mas mantém as regras de negócio (VIP, Punições, permissões de Staff) num único lugar e permite trocar o banco ou o host sem tocar nos servidores de jogo.
