import type { Page } from '@playwright/test';
import { newSteamId, signInFromHeader } from './accounts';
import { axeViolations, expect, saveTheme, settle, test } from './fixtures';
import { hydrated } from './hydration';

/**
 * O header fixo: sem linha em repouso; ao rolar vira uma pílula de vidro (fundo, desfoque e raio)
 * solta 8 px do topo, a partir de 768 px. E a busca do header, que cresce para a esquerda no hover e
 * no foco sem empurrar nada.
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

    test('ao rolar vira pílula de vidro, sem borda; ao voltar ao topo, volta ao normal', async ({
      page,
    }) => {
      await page.goto(LONG_PAGE);
      await settle(page);
      await page.mouse.wheel(0, 400);
      const bar = header(page);
      await expect(bar).toHaveAttribute('data-scrolled', '');
      await expect.poll(async () => (await glass(page)).opacity).toBe(1);
      // Com "reduzir transparência" no sistema (o Windows com efeitos desligados) o vidro vira opaco, sem desfoque.
      const opaque = await page.evaluate(
        () => matchMedia('(prefers-reduced-transparency: reduce)').matches,
      );
      expect((await glass(page)).blur).toContain(opaque ? 'none' : 'blur');
      expect(await bar.evaluate((el) => getComputedStyle(el).borderBottomWidth)).toBe('0px');
      // Fica no alto da tela enquanto a página rola, solta 8 px do topo e arredondada; a pegada de cima
      // (o que o resto da página usa para grudar logo abaixo) continua a de antes de rolar.
      expect((await bar.boundingBox())?.y).toBe(8);
      expect(await bar.evaluate((el) => getComputedStyle(el, '::before').borderTopLeftRadius)).toBe(
        '999px',
      );
      expect(
        await page.evaluate(() => document.documentElement.style.getPropertyValue('--site-hdr-h')),
      ).toBe('60px');
      // Mede o header rolado, com o fundo e o desfoque, ainda fixo.
      expect(await axeViolations(page, { fixedHeader: true })).toEqual([]);

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

  type Box = { x: number; y: number; width: number; height: number };
  const intersects = (a: Box, b: Box) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  const lastNavItem = async (page: Page) => {
    const box = await page.locator('header nav a').last().boundingBox();
    if (!box) throw new Error('item da navegação sem caixa');
    return box;
  };

  /**
   * Hover e foco do teclado: o campo cresce para a esquerda, só até o espaço livre, sem cobrir o
   * último item da navegação e sem mexer em nada em volta.
   */
  async function checkGrowth(page: Page) {
    const rest = await trigger(page).boundingBox();
    const around = await neighbours(page);
    expect(rest?.width).toBeCloseTo(160, 0);

    await trigger(page).hover();
    await expect.poll(() => width(page)).toBeGreaterThan(165);
    await page.waitForTimeout(500);
    const hovered = await trigger(page).boundingBox();
    expect(hovered?.width ?? 0).toBeLessThanOrEqual(280);
    // Cresce para a esquerda: a borda direita e a altura ficam.
    expect((hovered?.x ?? 0) + (hovered?.width ?? 0)).toBeCloseTo(
      (rest?.x ?? 0) + (rest?.width ?? 0),
      0,
    );
    expect(hovered?.height).toBeCloseTo(rest?.height ?? 0, 0);
    expect(intersects(hovered as Box, await lastNavItem(page))).toBe(false);
    expect(await neighbours(page)).toEqual(around);

    await page.mouse.move(5, 500);
    await expect.poll(() => width(page)).toBeCloseTo(160, 0);

    // Teclado: Tab até a busca cresce igual, também sem cobrir a navegação.
    // O Tab só entra na busca depois de o header hidratar (a navegação rica troca a ordem do Tab ao hidratar):
    // espere o React assumir os dois e repita o par Shift+Tab / Tab até pousar, em vez de apostar numa
    // única sequência durante a transição.
    await hydrated(trigger(page));
    await hydrated(page.locator('header nav a').first());
    await trigger(page).focus();
    await expect(async () => {
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(trigger(page)).toBeFocused({ timeout: 1_000 });
    }).toPass({ timeout: 10_000 });
    await expect.poll(() => width(page)).toBeGreaterThan(165);
    await page.waitForTimeout(500);
    expect(intersects((await trigger(page).boundingBox()) as Box, await lastNavItem(page))).toBe(
      false,
    );
    expect(await neighbours(page)).toEqual(around);
  }

  for (const size of [
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
  ]) {
    test(`compacta em repouso; no hover e no foco cresce sem cobrir a navegação (${size.width} px)`, async ({
      page,
    }) => {
      await page.setViewportSize(size);
      await page.goto('/');
      await settle(page);
      await checkGrowth(page);
    });
  }

  test('com a Conta logada (o campo começa mais à esquerda) ele ainda não cobre a navegação', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await signInFromHeader(page, newSteamId());
    await settle(page);
    await checkGrowth(page);
  });

  test('em 1024 px o campo é só o ícone e não cobre a navegação nem aberto', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/');
    await settle(page);
    const icon = await width(page);
    expect(icon).toBeLessThan(60);
    await trigger(page).hover();
    await page.waitForTimeout(500);
    expect(await width(page)).toBeCloseTo(icon, 0);
    expect(intersects((await trigger(page).boundingBox()) as Box, await lastNavItem(page))).toBe(
      false,
    );
  });

  test('com movimento reduzido não anima', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await settle(page);
    // Sem propriedade em transição: o campo cresce de uma vez, sem animar.
    expect(await trigger(page).evaluate((el) => getComputedStyle(el).transitionProperty)).toBe(
      'none',
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

test('no celular o header rola junto com a página e não reserva altura fixa', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(LONG_PAGE);
  await settle(page);
  const bar = header(page);
  expect(await bar.evaluate((el) => getComputedStyle(el).position)).not.toBe('sticky');
  expect(
    await page.evaluate(() => document.documentElement.style.getPropertyValue('--site-hdr-h')),
  ).toBe('0px');
  await page.mouse.wheel(0, 600);
  await expect.poll(async () => (await bar.boundingBox())?.y ?? 0).toBeLessThan(-20);
});

test('a partir de 768 px o header é fixo e avisa a altura dele', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 900 });
  await page.goto(LONG_PAGE);
  await settle(page);
  const bar = header(page);
  expect(await bar.evaluate((el) => getComputedStyle(el).position)).toBe('sticky');
  const height = await bar.evaluate((el) => el.getBoundingClientRect().height);
  const reported = await page.evaluate(() =>
    Number.parseFloat(document.documentElement.style.getPropertyValue('--site-hdr-h')),
  );
  expect(reported).toBeCloseTo(height, 0);
});
