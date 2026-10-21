import { axeViolations, BG, expect, ROUTES, saveTheme, settle, test, WIDTHS } from './fixtures';

const mainNav = (page: import('@playwright/test').Page) =>
  page.getByRole('navigation', { name: 'Principal' });

for (const theme of ['dark', 'light'] as const) {
  test(`home renderiza com os tokens da Liberty no tema ${theme}`, async ({ page }) => {
    await saveTheme(page, theme);
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: 'Servidores' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.locator('body')).toHaveCSS('background-color', BG[theme]);
    await expect(page.getByRole('region', { name: 'Servidores Carmine' })).toBeVisible();

    await expect(mainNav(page).getByRole('link')).toHaveCount(4);
    await expect(mainNav(page).getByRole('link', { name: 'Servidores' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    const footer = page.getByRole('navigation', { name: 'Rodapé' });
    await expect(footer.getByRole('link', { name: 'Termos de uso' })).toHaveAttribute(
      'href',
      '/termos',
    );
    await expect(footer.getByRole('link', { name: 'Política de privacidade' })).toHaveAttribute(
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

test('o destaque da navegação acompanha a página atual', async ({ page }) => {
  await page.goto('/inventario');
  const current = mainNav(page).locator('[data-slot="motion-highlight"]');
  await expect(current).toHaveCount(1);
  const link = mainNav(page).getByRole('link', { name: 'Inventário' });
  await expect(async () => {
    const [h, l] = await Promise.all([current.boundingBox(), link.boundingBox()]);
    expect(Math.round(h?.x ?? -1)).toBe(Math.round(l?.x ?? -2));
  }).toPass();
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

for (const route of ['/regras', '/contato'] as const) {
  test(`a página ${route} existe e é alcançável pelo rodapé`, async ({ page }) => {
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Rodapé' }).locator(`a[href="${route}"]`).click();
    await expect(page).toHaveURL(route);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
}

for (const width of WIDTHS) {
  test(`sem scroll horizontal em ${width}px`, async ({ page }) => {
    // Uma carga por rota: com mais rotas que o teste de 30 s comporta, ele passa a depender da máquina.
    test.setTimeout(90_000);
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

test('container global de 1080 px com margem mínima de 36 px (21 px no mobile)', async ({
  page,
}) => {
  // A largura útil desconta a barra de rolagem; o container centraliza dentro dela.
  const measure = async () =>
    page.locator('header .container-page').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, width: r.width, viewport: document.documentElement.clientWidth };
    });
  const expectContainer = async (margin: number) => {
    const { left, width, viewport } = await measure();
    expect(width).toBeCloseTo(Math.min(1080, viewport - 2 * margin), 0);
    expect(left).toBeCloseTo((viewport - width) / 2, 0);
    expect(left).toBeGreaterThanOrEqual(margin - 0.5);
  };

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expectContainer(36);

  await page.setViewportSize({ width: 1100, height: 900 });
  await expectContainer(36);

  await page.setViewportSize({ width: 390, height: 844 });
  await expectContainer(21);
});

// Uma rota por teste: todas juntas passavam dos 30 s num runner mais lento.
for (const theme of ['dark', 'light'] as const) {
  for (const width of [390, 1440] as const) {
    for (const route of ROUTES) {
      test(`axe sem violações WCAG 2.2 AA em ${route} (${theme}, ${width}px)`, async ({ page }) => {
        await saveTheme(page, theme);
        await page.setViewportSize({ width, height: 900 });
        await page.goto(route);
        expect(await axeViolations(page)).toEqual([]);
      });
    }
  }
}

test('os contadores animados expõem só o valor ao leitor de tela', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight }));
  const status = page.getByRole('status', { name: 'Estado dos servidores' });
  const tree = await status.ariaSnapshot();
  // Os rolos de dígitos (0 a 9 de cada casa) nunca aparecem na árvore de acessibilidade.
  expect(tree).not.toMatch(/\d \d \d \d/);
  expect(tree).toMatch(/\d+ servidor(es)? online/);

  await page.goto('/dev/componentes');
  const gallery = await page.locator('main').ariaSnapshot();
  expect(gallery).not.toMatch(/\d \d \d \d/);
});
