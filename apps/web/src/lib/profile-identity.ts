/** Os meses do Perfil são os de Brasília, onde a Carmine mede tudo (a virada da semana, o Ranking). */
const MEMBER_SINCE = new Intl.DateTimeFormat('pt-BR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'America/Sao_Paulo',
});

/** "outubro de 2026": o mês em que a Conta nasceu, sem o dia (o Perfil não precisa de mais). */
export function memberSinceLabel(iso: string): string {
  return MEMBER_SINCE.format(new Date(iso));
}
