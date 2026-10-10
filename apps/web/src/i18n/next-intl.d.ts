import type messages from '../../messages/pt-BR.json';

declare module 'next-intl' {
  interface AppConfig {
    Locale: 'pt-BR';
    Messages: typeof messages;
  }
}
