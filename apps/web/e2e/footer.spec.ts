import { expect, scrollToEnd, settle, test } from './fixtures';

for (const { width, height } of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`o rodapé vem logo depois do conteúdo, sem vão e visível no fim (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    // Fluxo natural: o rodapé começa onde o conteúdo termina, em página curta e em página longa.
    for (const route of ['/', '/termos', '/nao-existe']) {
      await page.goto(route);
      await settle(page);
      // Com a cortina (desktop) o rodapé fica fixo atrás e só se mostra no fim da rolagem: mede lá.
      await scrollToEnd(page);
      await settle(page);
      const gap = await page.evaluate(() => {
        const main = document.querySelector('[data-curtain-content]')?.getBoundingClientRect();
        const footer = document.querySelector('footer')?.getBoundingClientRect();
        return main && footer ? Math.round(footer.top - main.bottom) : null;
      });
      expect(
        Math.abs(gap ?? 99),
        `${route}: sem vão entre o conteúdo e o rodapé`,
      ).toBeLessThanOrEqual(1);

      const footer = page.getByRole('contentinfo');
      await expect(footer, `${route}: visível no fim`).toBeInViewport();
      await expect(footer.getByText('© ', { exact: false })).toBeInViewport();
    }
  });

  test(`em página curta o rodapé fica no pé da tela (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/nao-existe');
    await settle(page);
    // A revelação do rodapé (ligada à rolagem) o desloca um pouco até terminar: mede com ela pronta.
    await scrollToEnd(page);
    await settle(page);

    // A página nunca é menor que a tela: o que sobra é do conteúdo, e o rodapé encosta no fim dela.
    const bottom = await page.evaluate(() => {
      const footer = document.querySelector('footer')?.getBoundingClientRect();
      return footer ? Math.round(footer.bottom + window.scrollY) : null;
    });
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(Math.abs((bottom ?? 0) - total)).toBeLessThanOrEqual(1);
    expect(total).toBeGreaterThanOrEqual(height);
  });
}

test('o rodapé leva marca, links, estado dos servidores e o aviso sobre a Valve', async ({
  page,
}) => {
  await page.goto('/');
  const footer = page.getByRole('contentinfo');

  await expect(footer.getByRole('link', { name: 'Carmine, ir para Servidores' })).toHaveAttribute(
    'href',
    '/',
  );

  const nav = footer.getByRole('navigation', { name: 'Rodapé' });
  for (const [name, href] of [
    ['Servidores', '/'],
    ['Inventário', '/inventario'],
    ['Regras de conduta', '/regras'],
    ['Termos de uso', '/termos'],
    ['Política de privacidade', '/privacidade'],
    ['Política de reembolso', '/reembolso'],
    ['Contato e exclusão de dados', '/contato'],
  ] as const) {
    await expect(nav.getByRole('link', { name, exact: true })).toHaveAttribute('href', href);
  }

  const status = footer.getByRole('status', { name: 'Estado dos servidores' });
  // O que o leitor de tela ouve: os rolos de dígitos do contador são decorativos.
  const snapshot = await status.ariaSnapshot();
  const spoken = snapshot.replace(/\s*\n\s*-?\s*(text:)?\s*/g, ' ');
  // O resumo é o real (S06): outros testes ligam servidores em paralelo, então só a forma.
  expect(spoken).toMatch(/Ao vivo|Em breve/);
  expect(spoken).toMatch(/\d+ servidor(es)? online/);
  expect(spoken).toMatch(/\d+ jogador(es)?/);
  expect(spoken).not.toContain('São Paulo');

  await expect(footer).toContainText(`© ${new Date().getFullYear()} Carmine`);
  await expect(footer).toContainText('a Carmine não é afiliada nem endossada por ela');
});

test('no desktop o conteúdo sobe como uma cortina e revela o rodapé fixo atrás', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/termos');
  await settle(page);
  const root = page.locator('html');
  await expect(root).toHaveAttribute('data-curtain', 'on');

  const footer = page.locator('footer[data-site-footer]');
  await expect(footer).toHaveCSS('position', 'fixed');
  // O conteúdo deixa embaixo exatamente a altura do rodapé: é o espaço que ele revela.
  const height = await footer.evaluate((el) => el.getBoundingClientRect().height);
  const margin = await page
    .locator('[data-curtain-content]')
    .evaluate((el) => Number.parseFloat(getComputedStyle(el).marginBottom));
  expect(Math.abs(margin - height)).toBeLessThanOrEqual(1);

  // No fim da rolagem o rodapé aparece inteiro, logo abaixo do conteúdo.
  await scrollToEnd(page);
  await expect(footer.getByText('© ', { exact: false })).toBeInViewport();
  const box = await footer.boundingBox();
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeCloseTo(900, 0);
});

test('no celular e com movimento reduzido o rodapé fica no fluxo, sem cortina', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/termos');
  await settle(page);
  await expect(page.locator('html')).not.toHaveAttribute('data-curtain', 'on');
  await expect(page.locator('footer[data-site-footer]')).not.toHaveCSS('position', 'fixed');

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await settle(page);
  await expect(page.locator('html')).not.toHaveAttribute('data-curtain', 'on');
  await expect(page.locator('footer[data-site-footer]')).not.toHaveCSS('position', 'fixed');
});

test('SAINT CARMINE ocupa a largura toda, com a arte do mapa em destaque dentro das letras', async ({
  page,
}) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/termos');
    await settle(page);
    await scrollToEnd(page);
    const wordmark = page.getByTestId('footer-wordmark');
    await expect(wordmark).toBeVisible();
    // A arte vem de /maps/<mapa>/<variante>-1600.webp e o texto cabe sem estourar.
    const art = await wordmark.evaluate((el) => getComputedStyle(el).getPropertyValue('--art'));
    expect(art).toMatch(/\/maps\/[a-z0-9]+\/d\d+-1600\.webp/);
    const fit = await wordmark.evaluate((el) => {
      const text = el.querySelector('p');
      return text ? [text.scrollWidth, el.clientWidth] : [0, 0];
    });
    expect(fit[0]).toBeLessThanOrEqual((fit[1] ?? 0) + 1);
    expect(fit[0]).toBeGreaterThan((fit[1] ?? 0) * 0.9);
  }
});

test('a faixa viva mostra o último acontecimento e troca quando chega outro', async ({ page }) => {
  const event = (id: string, player: string) => ({
    items: [
      { id, kind: 'joined', player: { name: player }, href: '/', server: 'Retake · Rotação' },
    ],
  });
  let current = event('ev-1', 'Primeira Pessoa');
  await page.route('**/atividade/recentes', (route) => route.fulfill({ json: current }));
  await page.goto('/termos');
  const last = page.getByTestId('footer-last-event');
  // Um acontecimento novo chega na próxima leitura (a aba voltando à vista também a dispara).
  current = event('ev-2', 'Segunda Pessoa');
  await expect(async () => {
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(last).toContainText('Segunda Pessoa', { timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
  await expect(last).toContainText('entrou em Retake · Rotação');
  await expect(last.getByRole('link')).toHaveAttribute('href', '/');
});
