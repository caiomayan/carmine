import type { Page } from '@playwright/test';
import { axeViolations, expect, saveTheme, settle, test } from './fixtures';

/**
 * O header fixo: sem linha em repouso; ao rolar, fundo levemente mais claro e desfoque. E a busca
 * do header, que cresce para a esquerda no hover e no foco sem empurrar nada.
 */

const header = (page: Page) => page.locator('header[data-site-header]');

/** O fundo do header vive no ::before (opacidade 0 em repouso, 1 rolado). */
const glass = (page: Page) =>
  header(page).evaluate((el) => {
    const style = getComputedStyle(el, '::before');
    return {
      opacity: Number(style.opacity),
      blur: style.backdropFilter,
      transition: style.transitionDuration,
    };
  });

/** Uma página com rolagem de sobra. */
const LONG_PAGE = '/termos';

for (const theme of ['dark', 'light'] as const) {
  test.describe(`header (${theme})`, () => {
    test.beforeEach(async ({ page }) => {
      await saveTheme(page, theme);
    });

    test('em repouso não tem linha embaixo nem fundo; fica fixo no topo', async ({ page }) => {
      await page.goto(LONG_PAGE);
      await settle(page);
      const bar = header(page);
      expect(await bar.evaluate((el) => getComputedStyle(el).borderBottomWidth)).toBe('0px');
      expect(await bar.evaluate((el) => getComputedStyle(el).position)).toBe('sticky');
      await expect(bar).not.toHaveAttribute('data-scrolled', /.*/);
      expect((await glass(page)).opacity).toBe(0);
    });

    test('ao rolar ganha fundo e desfoque, sem borda; ao voltar ao topo, some', async ({
      page,
    }) => {
      await page.goto(LONG_PAGE);
      await settle(page);
      await page.mouse.wheel(0, 400);
      const bar = header(page);
      await expect(bar).toHaveAttribute('data-scrolled', '');
      await expect.poll(async () => (await glass(page)).opacity).toBe(1);
      expect((await glass(page)).blur).toContain('blur');
      expect(await bar.evaluate((el) => getComputedStyle(el).borderBottomWidth)).toBe('0px');
      // Fica no alto da tela enquanto a página rola.
      expect((await bar.boundingBox())?.y).toBe(0);
      expect(await axeViolations(page)).toEqual([]);

      await page.evaluate(() => window.scrollTo(0, 0));
      await expect(bar).not.toHaveAttribute('data-scrolled', /.*/);
      await expect.poll(async () => (await glass(page)).opacity).toBe(0);
    });

    test('com movimento reduzido o fundo entra sem transição', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(LONG_PAGE);
      await settle(page);
      expect((await glass(page)).transition).toBe('0s');
    });

    test('o foco não deixa o conteúdo escondido atrás do header fixo', async ({ page }) => {
      await page.goto(LONG_PAGE);
      await settle(page);
      await page.mouse.wheel(0, 900);
      const barBottom = await header(page).evaluate((el) => el.getBoundingClientRect().bottom);
      // O foco do teclado em um link que está logo abaixo do header o leva para fora dele.
      await page.evaluate(() => window.scrollTo(0, 2000));
      const top = await page.evaluate(() => {
        const links = [...document.querySelectorAll<HTMLElement>('main a')];
        const target = links.find((el) => el.getBoundingClientRect().top < 40) ?? links[0];
        target?.focus();
        return target?.getBoundingClientRect().top ?? 0;
      });
      expect(top).toBeGreaterThanOrEqual(barBottom - 0.5);
    });
  });
}

test.describe('busca do header', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  const trigger = (page: Page) => page.getByTestId('search-trigger');
  const width = async (page: Page) => (await trigger(page).boundingBox())?.width ?? 0;
  /** As caixas de tudo que fica em volta da busca: a navegação, o tema e a Conta. */
  const neighbours = (page: Page) =>
    page
      .locator('header nav a, header button:not([data-testid="search-trigger"])')
      .evaluateAll((els) =>
        els.map((el) => {
          const box = el.getBoundingClientRect();
          return [Math.round(box.x), Math.round(box.y), Math.round(box.width)];
        }),
      );

  test('compacta em repouso; no hover e no foco cresce para a esquerda, sem empurrar nada', async ({
    page,
  }) => {
    await page.goto('/');
    await settle(page);
    const rest = await trigger(page).boundingBox();
    const around = await neighbours(page);
    expect(rest?.width).toBeCloseTo(160, 0);

    await trigger(page).hover();
    await expect.poll(() => width(page)).toBeCloseTo(280, 0);
    const hovered = await trigger(page).boundingBox();
    // Cresce para a esquerda: a borda direita e a altura ficam.
    expect((hovered?.x ?? 0) + (hovered?.width ?? 0)).toBeCloseTo(
      (rest?.x ?? 0) + (rest?.width ?? 0),
      0,
    );
    expect(hovered?.height).toBeCloseTo(rest?.height ?? 0, 0);
    expect(await neighbours(page)).toEqual(around);

    await page.mouse.move(5, 500);
    await expect.poll(() => width(page)).toBeCloseTo(160, 0);

    // Teclado: Tab até a busca (modo teclado) cresce igual.
    await page.keyboard.press('Tab');
    await trigger(page).focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(trigger(page)).toBeFocused();
    await expect.poll(() => width(page)).toBeCloseTo(280, 0);
    expect(await neighbours(page)).toEqual(around);
  });

  test('com movimento reduzido não anima', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await settle(page);
    expect(await trigger(page).evaluate((el) => getComputedStyle(el).transitionDuration)).toBe(
      '0s',
    );
  });
});

test('no celular a busca continua só o ícone, e a página passa no axe nos dois temas', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const theme of ['dark', 'light'] as const) {
    await saveTheme(page, theme);
    await page.goto('/');
    await settle(page);
    const box = await page.getByTestId('search-trigger').boundingBox();
    expect(box?.width).toBeCloseTo(44, 0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(0);
    expect(await axeViolations(page)).toEqual([]);
  }
});
