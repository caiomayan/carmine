import AxeBuilder from '@axe-core/playwright';
import { test as base, expect, type Page } from '@playwright/test';
import { routeViewer, type ViewerMode } from './fake-viewer';

export type Theme = 'dark' | 'light';

export const ROUTES = [
  '/',
  '/inventario',
  '/loadout',
  '/inventario/adicionar',
  '/inventario/adicionar?tipo=weapon&arma=AK-47',
  '/inventario/adicionar?q=nada-disso-existe',
  '/inventario/adicionar/222',
  '/inventario/adicionar/1781',
  '/termos',
  '/privacidade',
  '/regras',
  '/contato',
  '/nao-existe',
  '/entrar',
  '/entrar?erro=indisponivel&motivo=sessao-expirada',
  '/entrar?erro=limite',
  '/dev/componentes',
] as const;
export const WIDTHS = [390, 820, 1100, 1440] as const;

/** Cor de fundo (--bg) de cada tema da Liberty, como o navegador a calcula. */
export const BG: Record<Theme, string> = {
  dark: 'rgb(17, 16, 13)',
  light: 'rgb(248, 237, 209)',
};

/** O Chrome registra a resposta 404 do próprio documento como erro de console. */
const EXPECTED_ERRORS = [/status of 404 \(Not Found\)/];

type Fixtures = {
  /** Erros de console e exceções da página; o teste falha se sobrar algum inesperado. */
  consoleErrors: string[];
  /**
   * Erros de console que o teste provoca de propósito (ex.: o 404 de um Perfil inexistente,
   * o 401 de uma sessão expirada). O teste acrescenta os padrões aqui.
   */
  expectedConsoleErrors: RegExp[];
  /**
   * O viewer 3D do teste: `fake` (padrão) responde ao protocolo postMessage sem rede externa;
   * `blocked` recusa o iframe, como um bloqueador ou o serviço fora do ar.
   */
  viewer: ViewerMode;
};

export const test = base.extend<Fixtures>({
  viewer: ['fake', { option: true }],
  page: async ({ page, viewer }, use) => {
    await routeViewer(page.context(), viewer);
    await use(page);
  },
  // biome-ignore lint/correctness/noEmptyPattern: o Playwright exige a desestruturação, mesmo vazia.
  expectedConsoleErrors: async ({}, use) => {
    await use([]);
  },
  consoleErrors: [
    async ({ page, expectedConsoleErrors }, use) => {
      const errors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(`${msg.text()} @ ${msg.location().url}`);
      });
      page.on('pageerror', (err) => errors.push(err.message));
      await use(errors);
      const unexpected = errors.filter(
        (e) =>
          !(e.includes('/nao-existe') && EXPECTED_ERRORS.some((re) => re.test(e))) &&
          !expectedConsoleErrors.some((re) => re.test(e)),
      );
      expect(unexpected, 'erros de console').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Grava o tema como se a pessoa já o tivesse escolhido numa visita anterior. */
export async function saveTheme(page: Page, theme: Theme) {
  await page.addInitScript((t) => {
    try {
      localStorage.setItem('carmine-theme', t);
    } catch {}
  }, theme);
}

/**
 * Espera as animações finitas no tempo (entradas, fades) terminarem. As ligadas à rolagem
 * (o rodapé) só terminam rolando a página, então ficam de fora.
 */
export async function settle(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter(
          (a) =>
            a.timeline === document.timeline &&
            a.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY,
        )
        .map((a) => a.finished),
    ),
  );
}

/** Rola até o fim real da página, onde o rodapé termina de entrar. */
export async function scrollToEnd(page: Page) {
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight }));
}

export async function axeViolations(page: Page) {
  // O rodapé só fica opaco quando entra na tela: rola até o fim para o axe medir o contraste dele.
  await scrollToEnd(page);
  await settle(page);
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}
