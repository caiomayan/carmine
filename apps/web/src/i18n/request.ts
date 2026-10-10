import { getRequestConfig } from 'next-intl/server';
import messages from '../../messages/pt-BR.json';

/** Só PT-BR por enquanto e sem prefixo de idioma na URL; outro idioma entra com roteamento. */
export const locale = 'pt-BR';

export default getRequestConfig(async () => ({
  locale,
  messages,
  timeZone: 'America/Sao_Paulo',
}));
