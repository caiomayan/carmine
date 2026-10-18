# ID público numérico, crescente por antiguidade, em blocos com sorteio

A Conta é identificada publicamente por um número curto (`stcarmine.com/<id>`), não por um username. IDs de 1 a 9.999 são reservados e atribuídos manualmente (fundador, beta, Staff, números bonitos). As Contas novas recebem `10.000 + n × 3 + aleatório(0..2)`, onde `n` é um contador monotônico: o número é sempre crescente (menor = mais antigo), nunca colide (cada Conta tem um bloco exclusivo de 3) e não revela a contagem exata de Contas. Não há teto de dígitos. Números bonitos acima de 10.000 ficam numa lista de bloqueio para a atribuição automática.

## Considered Options

- Sequencial puro: mais simples, mas revela quantas Contas existem.
- Aleatório de 7 dígitos: esconde a contagem, mas perde a leitura de antiguidade pedida pelo produto.
- Permutação Feistel: elegante, mas também perde a ordem e custa mais código.

## Adendo (2026-10-18): reatribuição para ID reservado

Decisão do dono: a Staff pode trocar o ID automático de uma Conta por um ID reservado (1 a 9.999), com `accounts assign-reserved-id`, para dar números baixos aos amigos do beta depois de as Contas já existirem. Regras:

- **Uma única vez por Conta.** Depois de reservado (ou se a Conta já nasceu com ID abaixo de 10.000), o ID é imutável; o comando recusa repetir.
- **Sem colisão.** O ID não pode ser de outra Conta nem ter sido de alguma; um ID que uma Conta já teve nunca é reaproveitado.
- **O ID antigo continua funcionando como link.** Fica em `account_public_id_history`, e `stcarmine.com/<idAntigo>` responde 301 para `stcarmine.com/<idNovo>` (o proxy do web consulta `GET /api/profiles/former-ids`, lista inteira guardada por 10 s). No jogo, o ID novo vale no próximo connect.
- **Auditoria.** A troca vai para o `staff_audit_log` (`account_reserved_id`, com `{ from, to }`).
- Contas anonimizadas (S08) não recebem ID reservado.

A garantia "crescente por antiguidade" vale para os IDs automáticos; os reservados são, por definição, escolhidos pela Staff.
