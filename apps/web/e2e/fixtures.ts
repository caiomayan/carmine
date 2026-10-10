import AxeBuilder from '@axe-core/playwright';
import { test as base, expect, type Page } from '@playwright/test';

export type Theme = 'dark' | 'light';

export const ROUTES = ['/', '/inventario', '/termos', '/privacidade', '/nao-existe'] as const;
export const WIDTHS = [390, 820, 1440] as const;

/** Cor de fundo (--bg) de cada tema, como o navegador a calcula. */
export const BG: Record<Theme, string> = {
  dark: 'rgb(15, 13, 11)',
  light: 'rgb(242, 235, 220)',
};

/** O Chrome registra a resposta 404 do próprio documento como erro de console. */
const EXPECTED_ERRORS = [/status of 404 \(Not Found\)/];

type Fixtures = {
  /** Erros de console e exceções da página; o teste falha se sobrar algum inesperado. */
  consoleErrors: string[];
};

export const test = base.extend<Fixtures>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(`${msg.text()} @ ${msg.location().url}`);
      });
      page.on('pageerror', (err) => errors.push(err.message));
      await use(errors);
      const unexpected = errors.filter(
        (e) => !(e.includes('/nao-existe') && EXPECTED_ERRORS.some((re) => re.test(e))),
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

/** Espera as animações finitas (entradas, fades) terminarem. */
export async function settle(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY)
        .map((a) => a.finished),
    ),
  );
}

export async function axeViolations(page: Page) {
  await settle(page);
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  return violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}
