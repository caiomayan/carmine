import { axeViolations, BG, expect, ROUTES, saveTheme, settle, test, WIDTHS } from './fixtures';

const mainNav = (page: import('@playwright/test').Page) =>
  page.getByRole('navigation', { name: 'Principal' });

for (const theme of ['dark', 'light'] as const) {
  test(`home renderiza com os tokens da 2c no tema ${theme}`, async ({ page }) => {
    await saveTheme(page, theme);
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: 'Servidores' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('body')).toHaveCSS('background-color', BG[theme]);
    await expect(page.getByText('Nenhum servidor no ar ainda')).toBeVisible();

    await expect(mainNav(page).getByRole('link')).toHaveCount(2);
    await expect(mainNav(page).getByRole('link', { name: 'Servidores' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    const footer = page.getByRole('navigation', { name: 'Rodapé' });
    await expect(footer.getByRole('link', { name: 'Termos' })).toHaveAttribute('href', '/termos');
    await expect(footer.getByRole('link', { name: 'Privacidade' })).toHaveAttribute(
      'href',
      '/privacidade',
    );
  });
}

test('sem preferência salva, abre no escuro mesmo com o sistema no claro', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('o tema salvo é aplicado antes da primeira pintura', async ({ page }) => {
  // Registra cada valor de data-theme e se o <body> já existia naquele momento.
  await page.addInitScript(() => {
    const seen: { theme?: string; bodyExists: boolean }[] = [];
    Object.assign(window, { __themeLog: seen });
    new MutationObserver(() => {
      seen.push({ theme: document.documentElement.dataset.theme, bodyExists: !!document.body });
    }).observe(document, { attributes: true, subtree: true, attributeFilter: ['data-theme'] });
  });
  await saveTheme(page, 'light');
  await page.goto('/');

  const log: { theme?: string; bodyExists: boolean }[] = await page.evaluate(() =>
    Reflect.get(window, '__themeLog'),
  );
  const first = log.findIndex((e) => e.theme === 'light');
  expect(first, 'o claro foi aplicado').toBeGreaterThanOrEqual(0);
  expect(log[first]?.bodyExists, 'aplicado antes do <body> existir').toBe(false);
  expect(
    log.slice(first).every((e) => e.theme === 'light'),
    'nunca volta ao escuro',
  ).toBe(true);
});

test('a troca de tema alterna, salva e sobrevive ao recarregar', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Usar tema claro' }).click();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('body')).toHaveCSS('background-color', BG.light);
  await expect(page.getByRole('button', { name: 'Usar tema escuro' })).toBeVisible();

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.getByRole('button', { name: 'Usar tema escuro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('carmine-theme'))).toBe('dark');
});

test('a troca de tema funciona com movimento reduzido', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Usar tema claro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('html')).not.toHaveClass(/no-tx/);
});

test('o skip link leva o foco ao conteúdo', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Pular para o conteúdo' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
});

test('navega para o Inventário pela barra superior', async ({ page }) => {
  await page.goto('/');
  await mainNav(page).getByRole('link', { name: 'Inventário' }).click();
  await expect(page).toHaveURL('/inventario');
  await expect(page.getByRole('heading', { level: 1, name: 'Inventário' })).toBeVisible();
  await expect(mainNav(page).getByRole('link', { name: 'Inventário' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('rota inexistente mostra a 404 própria', async ({ page }) => {
  const response = await page.goto('/nao-existe');
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Página não encontrada' }),
  ).toBeVisible();
  await expect(page).toHaveTitle('Página não encontrada · Carmine');

  await page.getByRole('link', { name: 'Ver servidores' }).click();
  await expect(page).toHaveURL('/');
});

for (const width of WIDTHS) {
  test(`sem scroll horizontal em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const route of ROUTES) {
      await page.goto(route);
      await settle(page);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${route} em ${width}px`).toBe(0);
    }
  });
}

for (const theme of ['dark', 'light'] as const) {
  for (const width of [390, 1440] as const) {
    test(`axe sem violações WCAG 2.2 AA (${theme}, ${width}px)`, async ({ page }) => {
      await saveTheme(page, theme);
      await page.setViewportSize({ width, height: 900 });
      for (const route of ROUTES) {
        await page.goto(route);
        expect(await axeViolations(page), `${route} (${theme}, ${width}px)`).toEqual([]);
      }
    });
  }
}
