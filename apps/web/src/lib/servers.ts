/** Resumo dos Servidores Carmine para a casca (rodapé, contadores). */
export type ServersSummary = { online: number; players: number };

/**
 * Até a leitura ao vivo (S06) a casca mostra o pré-lançamento: nenhum servidor no ar.
 * Quando a API expuser o resumo, ele substitui esta constante sem mudar os componentes.
 */
export const PRELAUNCH_SUMMARY: ServersSummary = { online: 0, players: 0 };

export const isLive = (summary: ServersSummary) => summary.online > 0;
