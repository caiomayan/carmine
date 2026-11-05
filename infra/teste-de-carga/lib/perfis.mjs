// Os Perfis que o roteiro visita. Parte pura (testada); o k6 só faz o pedido do Ranking e chama isto.

/**
 * Os IDs públicos das linhas do Ranking (`GET /api/ranking/{modo}`, contrato `Ranking` em
 * packages/contracts). O id mora em `entry.player.publicId`; Perfil privado vem com `publicId` nulo e fica
 * de fora. Foi ler `entry.publicId` (que não existe) que deixou a rodada 1 sem pedir nenhum Perfil.
 */
export function idsDoRanking(ranking) {
  const ids = [];
  for (const entrada of ranking?.entries ?? []) {
    const id = entrada?.player?.publicId;
    if (Number.isInteger(id) && id > 0) ids.push(id);
  }
  return ids;
}
