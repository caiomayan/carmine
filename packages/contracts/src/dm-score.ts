/**
 * Pontuação DM (S21, ADR 0030): o número de desempenho do Deathmatch. O DM não tem round, time nem
 * vitória, então não tem Rating; a Pontuação compara quatro taxas (abates por minuto, K/D, dano por
 * minuto e HS%) com as da população do DM, numa escala própria que não se confunde com o 1,00 do Rating.
 */

/** A média da população: quem joga como a média tem 100. */
export const DM_SCORE_MEAN = 100;

/**
 * Quanto cada desvio padrão (da média das quatro partes) vale em pontos. Com 15, uma Conta um desvio
 * acima da população tem 115; as quatro partes andam juntas, então o espalhamento real fica um pouco
 * abaixo disso.
 */
export const DM_SCORE_SPREAD = 15;

/** A janela do número do Perfil e da população: os últimos 90 dias (a mesma do Rating, S21). */
export const DM_SCORE_WINDOW_DAYS = 90;

/**
 * Amostra pequena: a pontuação é puxada para 100 por `minutos ÷ (minutos + DM_SCORE_PULL_MINUTES)`.
 * Com 15 min, quem acabou de cumprir o mínimo do Ranking (30 min) fica 2/3 do caminho entre 100 e o
 * bruto, e com 5 horas jogadas, 95%.
 */
export const DM_SCORE_PULL_MINUTES = 15;

/** Quantas Contas elegíveis a população precisa ter; abaixo disso não há média nem desvio que valham. */
export const DM_SCORE_MIN_POPULATION = 20;
