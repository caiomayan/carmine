'use client';

import { themeInitScript } from '@/lib/theme';

/**
 * Aplica o tema salvo antes da primeira pintura. O HTML do servidor traz o script executável;
 * no cliente ele vira `text/plain`, porque o React (em desenvolvimento) acusa todo `<script>`
 * executável que ele mesmo renderiza ("Encountered a script tag..."), e ele já rodou. A
 * diferença de `type` entre servidor e cliente é esperada.
 */
export function ThemeScript() {
  return (
    <script
      suppressHydrationWarning
      type={typeof window === 'undefined' ? undefined : 'text/plain'}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: string constante, aplica o tema salvo antes da primeira pintura
      dangerouslySetInnerHTML={{ __html: themeInitScript }}
    />
  );
}
