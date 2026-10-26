# Rascunho: trechos da Política de Privacidade, das Regras de conduta e dos Termos para a foto de perfil

> **NÃO PUBLICAR ainda.** Este arquivo **não** é lido pelo web (só os quatro documentos listados em `docs/legal/README.md` são publicados). Os trechos abaixo entram em `politica-de-privacidade.md`, `regras-de-conduta.md` e `termos-de-uso.md` **juntos com o código**, quando a foto de perfil for ligada (a F3 do web e as variáveis `R2_MEDIA_*` na VM), e com a revisão do advogado. Ao entrar, subir a versão e a data de cada documento e avisar no site e no Discord, como dizem as próprias Regras.
>
> Decisões que sustentam o texto: [ADR 0022](../adr/0022-foto-de-perfil-publica-na-hora-moderacao-depois.md) (decisões do dono de 2026-10-26: todos enviam; **publica na hora e a moderação é depois**; a foto denunciada por 2 Contas diferentes sai do ar até a Staff decidir; Conta com menos de 24 h ou com Punição ativa não envia; a prévia do link mostra a foto; a Staff decide em até 24 h; as removidas ficam guardadas em privado por 30 dias). Operação: [foto-de-perfil.md](../operacao/foto-de-perfil.md). Marcas: **[ENTRA COM A FOTO]** = vale quando a funcionalidade for ligada; **[VALIDAR COM ADVOGADO]** = revisão profissional antes de publicar; **[DONO: ...]** = decisão do dono.

## Pontos para o advogado e para o dono (leia antes dos textos)

1. **Foto de adolescente é dado pessoal de menor** (LGPD, art. 14, melhor interesse; ECA Digital). Não há verificação de idade no Carmine hoje: o texto não promete o contrário. O que o ECA Digital exige de um serviço que deixa o usuário enviar imagem, e se a verificação de idade pendente (S14) deve valer também aqui, é pergunta para o advogado.
2. **Comunicação de material de abuso.** A Cloudflare CSAM Scanning Tool bloqueia a URL e avisa por e-mail, mas a comunicação às autoridades é nossa. O texto cita o dever legal em geral; **o procedimento exato** (a quem, como, o que guardar e por quanto tempo) precisa ser definido com o advogado e escrito para quem trata a fila da Staff.
3. **Retenção das removidas: 30 dias**, privadas. O advogado confirma se o prazo serve (por exemplo, para atender a uma ordem judicial) e se precisa guardar algo além.
4. **Localização do bucket.** O R2 oferece jurisdição "União Europeia"; o bucket de backup fica no leste dos EUA. [DONO/ADVOGADO: onde ficam as fotos.] A CDN guarda cópias nas pontas, no mundo todo, por design.
5. **Lacuna de retenção de metadados (decidir antes de ligar).** A exclusão da Conta apaga todas as fotos e denúncias de foto, mas **nenhum job apaga o registro de uma foto trocada, devolvida à Steam ou removida** (nem as denúncias contra ela) enquanto a Conta existir; os arquivos saem, a linha fica. Proposta: apagar esses registros 90 dias depois (o mesmo prazo das Denúncias do jogo). [DONO: confirmar] Vira tarefa da F2 (a limpeza roda junto da retenção de Denúncias).
6. **Prévia do link com a foto** (decisão do dono): a foto aparece no WhatsApp, Discord e outros, mesmo para quem nunca entrou no Carmine. O texto diz isso com todas as letras.
7. **Termos de Uso:** hoje não há cláusula sobre conteúdo enviado pela pessoa. O trecho do fim deste arquivo é a proposta mínima.

## Resumo das mudanças

| Onde | O que muda |
|---|---|
| **Política**, seção 2, "Quando você usa o site" | Uma linha nova na tabela |
| **Política**, seção 3 (bases legais) | Duas linhas novas e um parágrafo sobre foto de adolescente |
| **Política**, seção 4 (o que fica público) | Uma linha na tabela e um parágrafo |
| **Política**, seção 5 (com quem compartilhamos) | A linha da Cloudflare ganha as fotos e a varredura de imagens |
| **Política**, seção 6 (onde os dados ficam) | Um item sobre as fotos |
| **Política**, seção 7 (por quanto tempo guardamos) | Quatro linhas novas |
| **Política**, seção 8 (direitos) | Uma frase na exclusão da Conta e uma sobre voltar à foto da Steam |
| **Política**, seção 10 (crianças e adolescentes) | Duas frases |
| **Regras**, Resumo, "Nome de exibição e avatar", "Como denunciar" e "Como a Staff analisa" | Um item, uma seção reescrita e dois blocos novos |
| **Termos**, seção 12 | Um parágrafo |

---

## Política de Privacidade

### 2. "Quando você usa o site": nova linha da tabela  **[ENTRA COM A FOTO]**

| Dado | Para quê |
|---|---|
| **Foto de perfil** (opcional): a imagem que você envia, já recortada por você; nós a refazemos em vários tamanhos e **tiramos dela os metadados** (data, local e aparelho em que foi feita). Também ficam a data do envio, se está no ar, suspensa ou removida e, se for o caso, as denúncias que ela recebeu (a data e o motivo; quem denunciou não aparece para você) | Mostrar no seu Perfil e no site no lugar do avatar da Steam, e moderar as fotos |

### 3. Bases legais: novas linhas  **[ENTRA COM A FOTO] [VALIDAR COM ADVOGADO]**

| Uso | Base legal na LGPD |
|---|---|
| Foto de perfil que você envia | Execução do contrato (art. 7º, V): você pediu para ter uma foto no Perfil |
| Moderação das fotos (denúncias, suspensão, remoção, guardar a removida por 30 dias) e varredura de imagens contra material de abuso sexual infantil | Legítimo interesse (art. 7º, IX), para manter o site seguro, e obrigação legal (art. 7º, II), nos casos graves |

Acrescentar ao parágrafo "**Sobre crianças e adolescentes.**":

> A foto de perfil pode mostrar o rosto de um adolescente. Por isso **recomendamos usar uma arte, uma imagem de jogo ou um animal**, em vez de uma foto de rosto, e explicamos na hora do envio o que não é aceito. Não pedimos a idade de ninguém para enviar uma foto.

### 4. "O que fica público": nova linha da tabela e parágrafo  **[ENTRA COM A FOTO] [DONO: prévia do link]**

| Informação | Perfil público | Perfil privado |
|---|---|---|
| Foto de perfil (se você enviou uma) | Aparece | **Continua aparecendo** |

> **Sobre a foto de perfil.** A foto aparece onde o avatar da Steam aparecia: no seu Perfil, no Ranking (quando o Perfil é público), na busca, nas listas de amigos e de atividade, e em **qualquer lugar onde alguém compartilhe o link do seu Perfil**: a prévia do link (no WhatsApp, no Discord e em redes sociais) mostra o seu nome e a sua foto, mesmo para quem não usa o Carmine. Quem tem o link pode baixar a imagem. Se você **voltar à foto da Steam**, a sua foto é apagada na hora do nosso lado e some das cópias que a rede de entrega guardou em poucos minutos; **não temos como apagar** o que outras pessoas ou serviços já copiaram. Dentro do jogo (placar e chat do CS2), continua aparecendo a foto da Steam.

### 5. "Com quem compartilhamos": acrescentar à linha da Cloudflare  **[ENTRA COM A FOTO]**

> ... também guarda e entrega as **fotos de perfil** (Cloudflare R2 e a rede de entrega), e **confere as imagens entregues contra listas de material de abuso sexual infantil conhecido** (ferramenta de varredura da Cloudflare, que bloqueia a imagem e nos avisa se houver um acerto).

### 6. "Onde os dados ficam": novo item  **[ENTRA COM A FOTO] [VALIDAR COM ADVOGADO] [DONO: localização do bucket]**

> - **As fotos de perfil ficam no Cloudflare R2**, num bucket [DONO: jurisdição/região escolhida], separado do das cópias de segurança. A rede de entrega da Cloudflare guarda cópias das fotos em vários países enquanto elas estão no ar. [VALIDAR COM ADVOGADO: transferência internacional]

### 7. "Por quanto tempo guardamos": novas linhas  **[ENTRA COM A FOTO] [VALIDAR COM ADVOGADO]**

| Dado | Por quanto tempo |
|---|---|
| Foto de perfil no ar | Enquanto a Conta existir ou até você trocar a foto ou voltar à foto da Steam |
| Foto que você trocou ou devolveu à Steam | Apagada logo em seguida (em minutos); as cópias da rede de entrega saem pela purga, e o resto expira sozinho |
| Foto **removida pela Staff** (ou suspensa por denúncias) | 30 dias, **em um local privado** que só a Staff acessa, para analisar uma contestação ou atender a uma ordem judicial; depois, apagada. A Conta volta à foto da Steam na hora |
| Registro da foto (datas e estado) e as denúncias contra ela | [DONO: confirmar] 90 dias depois de a foto deixar de ser a da Conta; se a Conta for excluída, na hora |

### 8. "Os seus direitos": acrescentar  **[ENTRA COM A FOTO]**

- Na frase da **Exclusão da Conta**, acrescentar à lista do que deixa de estar ligado a você: "...a foto de perfil (os arquivos são apagados e a rede de entrega é avisada) ...".
- Acrescentar depois do parágrafo "Como pedir":

> **Voltar à foto da Steam:** a qualquer momento, em Configurações → Perfil, sem pedir a ninguém e sem análise. A sua foto é apagada.

### 10. "Crianças e adolescentes": acrescentar  **[ENTRA COM A FOTO] [VALIDAR COM ADVOGADO]**

> - Adolescentes podem enviar uma foto de perfil, como qualquer pessoa. Recomendamos arte, imagem de jogo ou animal em vez de uma foto de rosto, e **não é permitido** enviar foto de outras pessoas sem autorização nem imagem de menor em situação indevida.
> - Qualquer pessoa logada pode **denunciar** uma foto. Imagens que envolvam menores em situação indevida são removidas e, nos casos graves, comunicadas às autoridades (ECA Digital, art. 27).

---

## Regras de conduta

### Resumo: novo item  **[ENTRA COM A FOTO]**

> - A foto de perfil aparece na hora, mas pode sair do ar se for denunciada e a Staff decidir; nudez, violência, ódio e foto de outras pessoas não são aceitos.

### Seção "Nome de exibição e avatar": **substituir** por  **[ENTRA COM A FOTO] [VALIDAR COM ADVOGADO]**

> ### Nome de exibição e foto de perfil
>
> Nomes ofensivos são bloqueados por um filtro, e a Staff pode resetar o Nome de exibição a qualquer momento (ele volta ao seu nome Steam). Se o nome for discriminatório, vale a linha de discriminação da tabela.
>
> **A foto de perfil é opcional.** Sem ela, aparece o avatar da Steam. Qualquer Conta pode enviar uma foto, desde que tenha mais de 24 horas e nenhuma Punição ativa, em até 3 envios por dia. A foto **aparece na hora**, antes de qualquer análise, e vale a regra de sempre: a responsabilidade pelo que você envia é sua.
>
> **O que não pode numa foto de perfil:**
> - nudez ou conteúdo sexual;
> - violência explícita, ou ódio e discriminação (símbolos, ofensas, piadas com um grupo);
> - **menor de idade em situação indevida**: é o caso mais grave, a imagem é removida na hora e comunicada às autoridades;
> - foto de **outra pessoa** sem autorização, ou qualquer **dado pessoal de terceiros** (nome completo, endereço, telefone, redes sociais, documentos);
> - propaganda, spam ou qualquer coisa que enganaria outros jogadores (por exemplo, passar-se pela Staff ou por outra pessoa).
>
> **Uma dica:** prefira uma arte, uma imagem de jogo ou um animal a uma foto de rosto. O Carmine é frequentado por muitos adolescentes, e a foto fica pública.
>
> **O que acontece com uma foto que não pode:**
> 1. Qualquer pessoa logada pode **denunciar a foto**. Se **2 Contas diferentes** denunciarem a mesma foto, ela **sai do ar sozinha** (volta o avatar da Steam) até a Staff decidir. Você é avisado no site; ninguém é punido por causa de uma denúncia só.
> 2. A Staff analisa em **até 24 horas** e **mantém** a foto (ela volta ao ar) ou **remove** (você volta ao avatar da Steam). A decisão é sempre de uma pessoa da Staff, nunca de um robô. A Staff pode remover uma foto mesmo sem denúncia.
> 3. Depois de uma foto removida, **o seu envio de fotos fica bloqueado** por 7 dias; se acontecer de novo em 90 dias, por 30 dias. **Isso não é uma Punição** da tabela abaixo e não aparece no seu Perfil; só a Staff vê. Quem está bloqueado vê apenas que o envio não está disponível agora.
> 4. **Casos graves** (conteúdo sexual envolvendo menor, por exemplo) seguem a linha "Assédio sexual ou risco à segurança de menores" da tabela: ban permanente e comunicação às autoridades. [VALIDAR COM ADVOGADO]
> 5. A foto removida fica guardada em privado por **30 dias**, só para a Staff, e depois é apagada.
>
> Você pode **voltar à foto da Steam a qualquer momento**, em Configurações → Perfil. Dentro do jogo (placar e chat do CS2) continua aparecendo a foto da Steam, que o Carmine não controla.

### "Como denunciar": acrescentar ao final da seção  **[ENTRA COM A FOTO]**

> **Foto de perfil.** No Perfil de quem tem uma foto própria, use **"Denunciar foto"** (é preciso estar logado) e escolha o motivo: nudez ou conteúdo sexual, violência, ódio ou discriminação, menor em situação indevida, dado pessoal ou foto de terceiro, ou outro. Limites: 1 denúncia por foto e 5 por hora. Não dá para denunciar a própria foto. Denunciar uma foto sabendo que ela está dentro das regras, ou combinar denúncias em massa, vale como **denúncia falsa** (acima).

### "Como a Staff analisa": acrescentar um item  **[ENTRA COM A FOTO]**

> - **Foto de perfil:** a Staff vê a imagem, a Conta, as denúncias (os motivos e quantas Contas, sem o nome de quem denunciou) e o histórico de fotos removidas, e decide em até 24 h. Quem trata essa fila é só a Staff de confiança, e não encaminha a imagem para nenhum outro lugar.

---

## Termos de Uso

### 12. "O que é seu e o que é nosso": acrescentar um parágrafo  **[ENTRA COM A FOTO] [VALIDAR COM ADVOGADO]**

> **O que você envia.** A foto de perfil continua sendo sua. Ao enviá-la, você nos autoriza, de graça e sem exclusividade, a **mostrá-la no Carmine e nas prévias de link do seu Perfil** enquanto ela estiver no ar, e a guardá-la em privado pelo tempo que as [Regras de conduta](/regras) e a [Política de Privacidade](/privacidade) dizem. Você declara que **tem o direito de usar a imagem** e que ela não mostra outra pessoa sem a autorização dela. Podemos tirar do ar a foto que desrespeitar as Regras.

---

> Rascunho redigido com IA para revisão do dono. Não é parecer jurídico. Os pontos marcados com [VALIDAR COM ADVOGADO] precisam de revisão profissional antes da publicação.
