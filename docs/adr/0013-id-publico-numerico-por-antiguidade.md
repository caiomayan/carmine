# ID público numérico, crescente por antiguidade, em blocos com sorteio

A Conta é identificada publicamente por um número curto (`stcarmine.com/<id>`), não por um username. IDs de 1 a 9.999 são reservados e atribuídos manualmente (fundador, beta, Staff, números bonitos). As Contas novas recebem `10.000 + n × 3 + aleatório(0..2)`, onde `n` é um contador monotônico: o número é sempre crescente (menor = mais antigo), nunca colide (cada Conta tem um bloco exclusivo de 3) e não revela a contagem exata de Contas. Não há teto de dígitos. Números bonitos acima de 10.000 ficam numa lista de bloqueio para a atribuição automática.

## Considered Options

- Sequencial puro: mais simples, mas revela quantas Contas existem.
- Aleatório de 7 dígitos: esconde a contagem, mas perde a leitura de antiguidade pedida pelo produto.
- Permutação Feistel: elegante, mas também perde a ordem e custa mais código.
