import { getRequestConfig } from 'next-intl/server';
import messages from '../../messages/pt-BR.json';

/** Só PT-BR por enquanto e sem prefixo de idioma na URL; outro idioma entra com roteamento. */
export const locale = 'pt-BR';

/**
 * No E2E (CARMINE_STRICT_I18N=1) um texto que falha (variável faltando, chave inexistente)
 * derruba a página: no build de produção o next-intl só registraria no log do servidor, que o
 * Playwright não vê. Fora disso, registra e mostra a chave, como o padrão do next-intl.
 */
const strict = process.env.CARMINE_STRICT_I18N === '1';

export default getRequestConfig(async () => ({
  locale,
  messages,
  timeZone: 'America/Sao_Paulo',
  onError(error) {
    if (strict) throw error;
    console.error(error);
  },
}));
