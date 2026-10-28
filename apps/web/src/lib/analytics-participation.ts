/**
 * Se esta Conta participa da análise de uso (`GET/PUT /api/me/analytics`), no navegador. `null` é "ainda não se
 * sabe": quem está logado só é contado depois de a preferência chegar, e a chave de /configuracoes atualiza aqui na
 * hora (o opt-out vale já no navegador; a API leva até 1 min). Um valor só por aba, compartilhado entre a contagem de
 * páginas e a chave.
 */
type Listener = () => void;

let participation: boolean | null = null;
const listeners = new Set<Listener>();

export const getParticipation = () => participation;

export function setParticipation(value: boolean | null) {
  if (participation === value) return;
  participation = value;
  for (const listener of listeners) listener();
}

export function subscribeParticipation(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
