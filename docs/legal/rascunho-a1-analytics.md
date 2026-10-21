# Rascunho: trechos da Política de Privacidade para a A1 (analytics)

> **NÃO PUBLICAR ainda.** Este arquivo **não** é lido pelo web (só os quatro documentos listados em `docs/legal/README.md` são publicados) e os trechos abaixo só entram em `politica-de-privacidade.md` **no mesmo PR que liga o PostHog** (A1). Quando entrarem: subir a versão para 0.6.0, atualizar `updatedAt` e avisar no site e no Discord (seção 11 da Política).
>
> Decisões que sustentam o texto: [ADR 0021](../adr/0021-analytics-posthog-ga4-metabase.md). Lista dos eventos: [plano de eventos](../analytics/plano-de-eventos.md). Marcas: **[ENTRA COM A A1]** = vai com a A1; **[ENTRA NA ABERTURA]** = vai com o GA4, não com a A1; **[VALIDAR COM ADVOGADO]**, **[DONO: …]** e **[CONFIRMAR: …]** seguem o padrão da Política atual. Rascunho redigido com IA; não é parecer jurídico.

## Resumo das mudanças na Política atual

| Onde (seção da Política v0.5.0) | O que muda |
|---|---|
| Resumo, no começo | Uma frase nova sobre a análise de uso |
| 2. Que dados usamos, "Quando você usa o site" | Duas linhas novas na tabela e a troca da frase "Não usamos cookies de publicidade… [CONFIRMAR: o site não tem analytics de terceiros]" |
| 2. (novo subtítulo) | "Análise de uso do produto" |
| 3. Bases legais | Uma linha nova e um parágrafo sobre menores |
| 5. Com quem compartilhamos | Uma linha nova para o PostHog |
| 6. Onde os dados ficam | Um parágrafo sobre o PostHog |
| 7. Por quanto tempo guardamos | Uma linha nova |
| 8. Os seus direitos | Como se opor à análise e o que acontece na exclusão |
| 10. Crianças e adolescentes | Duas frases |

---

## 1. Resumo (acrescentar ao parágrafo "O resumo:")  **[ENTRA COM A A1]**

> Também medimos, de forma agregada e sem gravar a sua tela, como o Carmine é usado, para melhorar o site e os servidores. Você pode desligar isso em Configurações.

## 2. Seção 2, "Quando você usa o site": novas linhas da tabela  **[ENTRA COM A A1]**

| Dado | Para quê |
|---|---|
| **Eventos de uso do produto**: o que você fez no Carmine (por exemplo, entrou, adicionou um Item, equipou, conectou num servidor, quanto tempo durou a sua Sessão de jogo, vinculou o Discord), com a data e hora e um identificador interno e aleatório da sua Conta. **Não** incluem o seu SteamID64, o seu ID público, o seu nome, o seu avatar, o seu IP, o que você escreveu no chat nem o texto de nametags | Entender onde as pessoas travam, o que funciona e o que não, para corrigir e melhorar o site e os servidores |
| **Contagem de páginas** (sem cookies): qual parte do site foi aberta (por exemplo, "Ranking" ou "Perfil", sem o número do Perfil), de que site você veio, o tipo de aparelho e navegador, e o país (descoberto a partir do IP, que é descartado em seguida) | Saber quantas pessoas visitam o site e por onde chegam |

**Troque** a frase atual "Não usamos cookies de publicidade nem ferramentas de rastreamento para anúncios. [CONFIRMAR: o site não tem analytics de terceiros]" por:

> Não usamos cookies de publicidade nem ferramentas de rastreamento para anúncios. A análise de uso descrita abaixo **não usa cookies nem guarda nada no seu navegador**.

### Novo subtítulo, logo antes de "Quando alguém paga o VIP"  **[ENTRA COM A A1]**

> ### Análise de uso do produto
>
> Para saber se o Carmine está funcionando bem, usamos o PostHog, um serviço de análise de uso. Quando você faz algo no Carmine, a nossa API manda ao PostHog um aviso curto ("entrou", "equipou um Item", "conectou num servidor"), sem passar pelo seu navegador. O aviso é ligado a um **identificador interno e aleatório da sua Conta** que não é o seu SteamID64 nem o seu ID público, e só serve para a gente contar, por exemplo, quantas pessoas que montaram um Inventário chegaram a jogar com as skins.
>
> **O que nós não fazemos:** não gravamos a sua tela, os seus cliques nem o seu mouse; não guardamos o que você escreve (nem o chat, nem nametags, nem o nome que você escolhe); não mandamos ao PostHog nada sobre punições, denúncias ou a Staff; não usamos esses dados para anúncios, nem para criar perfis de comportamento, e não os vendemos nem os repassamos a ninguém.
>
> **No navegador**, o site só conta que uma página foi aberta, sem cookies, sem guardar nada no seu aparelho e sem identificar você.
>
> **Você pode desligar** a análise de uso a qualquer momento em Configurações → Dados e conta → "Participar da análise de uso". Desligada, o Carmine deixa de mandar qualquer aviso sobre a sua Conta. Isso não muda o seu jogo, o seu Perfil, as Estatísticas nem o Ranking: esses dados continuam, porque são o próprio serviço.

## 3. Seção 3, "Por que podemos usar esses dados"  **[ENTRA COM A A1] [VALIDAR COM ADVOGADO]**

Nova linha da tabela:

| Uso | Base legal na LGPD |
|---|---|
| Análise de uso do produto (eventos, contagem de páginas) | Legítimo interesse (art. 7º, IX), com o seu direito de se opor a qualquer momento (seção 8) |

Acrescentar ao parágrafo "**Sobre o legítimo interesse.**":

> A análise de uso também se apoia no legítimo interesse: queremos melhorar o Carmine, só enviamos o mínimo (sem nome, sem SteamID64, sem texto), não gravamos a tela, e você pode desligar. Avaliamos esse uso por escrito, como recomenda a ANPD.

Acrescentar a "**Sobre crianças e adolescentes.**":

> A análise de uso nunca é usada para publicidade nem para criar perfis de comportamento para anúncios, conforme o ECA Digital (art. 26), e não grava a tela de ninguém.

## 4. Seção 5, "Com quem compartilhamos": nova linha  **[ENTRA COM A A1]**

| Quem | O que recebe | Por quê |
|---|---|---|
| **PostHog** (região da União Europeia) | Os avisos de uso descritos acima, ligados a um identificador interno e aleatório da sua Conta (nunca o SteamID64 nem o ID público), e a contagem de páginas sem identificação | Entender e melhorar o uso do Carmine. O PostHog não recebe o seu nome, o seu avatar, o seu IP (o da contagem de páginas é descartado depois de ler o país), o que você escreve no chat nem punições |

## 5. Seção 6, "Onde os dados ficam": novo parágrafo  **[ENTRA COM A A1] [VALIDAR COM ADVOGADO: transferência internacional]**

> Os avisos de uso vão para o PostHog, que os guarda na **União Europeia** (os dados da análise de uso ficam fora do Brasil). A transferência segue a LGPD (art. 33) e a Resolução CD/ANPD nº 19/2024, por meio das cláusulas-padrão contratuais da ANPD [CONFIRMAR: DPA do PostHog com as cláusulas-padrão da ANPD aceito pelo Dono].

Atualizar a frase que lista "alguns serviços" para incluir "o PostHog, na União Europeia".

## 6. Seção 7, "Por quanto tempo guardamos": nova linha  **[ENTRA COM A A1]**

| Dado | Por quanto tempo |
|---|---|
| Avisos de uso (PostHog) | Até 13 meses [CONFIRMAR: retenção configurável no plano do PostHog; se não der, informar a retenção real]. Se você excluir a Conta, os avisos ligados a ela são apagados no PostHog (a limpeza dos eventos roda em lote no PostHog, em geral em até alguns dias) |

## 7. Seção 8, "Os seus direitos": acrescentar  **[ENTRA COM A A1]**

> **Opor-se à análise de uso:** desligue em Configurações → Dados e conta → "Participar da análise de uso", ou peça pelo e-mail do encarregado (seção 1). Passamos a não mandar mais nada sobre a sua Conta ao PostHog.

No parágrafo "**Exclusão da Conta:**", acrescentar à lista do que deixa de estar ligado a você:

> …e os avisos de uso ligados à sua Conta no PostHog.

## 8. Seção 10, "Crianças e adolescentes": acrescentar  **[ENTRA COM A A1]**

> - A análise de uso não grava a tela, não guarda texto escrito por você e não é usada para anúncios nem para perfis de comportamento.
> - Pais e responsáveis podem pedir que a análise de uso seja desligada na Conta de um menor pela página de [contato](/contato).

## 9. Base legal e fontes: acrescentar  **[ENTRA COM A A1]**

- Lei nº 15.211/2025 (ECA Digital), art. 26 (já listado na Política): vedação de perfilamento de crianças e adolescentes para direcionar publicidade comercial.
- Resolução CD/ANPD nº 19/2024 (já listada): cláusulas-padrão da transferência internacional.

---

## Bloco da abertura (GA4)  **[ENTRA NA ABERTURA, não com a A1]**

Só vale quando o GA4 for ligado (ADR 0021). Condições do código: o script do Google só carrega depois do aceite; tudo "negado por padrão"; sem Google Signals nem personalização de anúncios; sem User-ID; retenção de 2 meses.

**Seção 2, nova linha da tabela "Quando você usa o site":**

| Dado | Para quê |
|---|---|
| **Estatísticas de visita do Google Analytics** (só se você aceitar no aviso de cookies): páginas visitadas, de onde você veio, aparelho, navegador e local aproximado, ligados a um identificador do Google guardado em cookies (`_ga*`) no seu navegador. **Não** ligamos esse identificador à sua Conta | Entender de onde vêm as visitas, medir campanhas e patrocínios |

**Seção 2, "Cookies":** trocar "Cookies essenciais (sessão e proteção CSRF)…" por "Cookies essenciais (…) e, **somente se você aceitar**, cookies do Google Analytics".

**Seção 5, nova linha:** **Google (Google Analytics 4)**: o que está na linha acima, quando você aceita. Não usamos o Google para anúncios, audiências nem para saber quem você é. Os dados ficam em servidores do Google, inclusive nos Estados Unidos (seção 6).

**Aviso de cookies (texto do banner):** "O Carmine usa o Google Analytics para saber de onde vêm as visitas. Ele só liga se você aceitar e usa cookies. Não usamos para anúncios e não ligamos à sua Conta. Aceitar / Recusar." Os dois botões com o mesmo peso visual; recusar não pode ser mais difícil do que aceitar; a escolha fica gravada em armazenamento local e pode ser mudada no rodapé.

**Seção 6:** o Google Analytics trata dados nos EUA; mesma base de transferência (art. 33 e cláusulas-padrão da ANPD). **[VALIDAR COM ADVOGADO]** Confirmar também que o termo de uso do Google Analytics aceita um site que não é direcionado a menores de 13 anos, mas é usado por adolescentes de 13 a 17.
