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
      const gap = await page.evaluate(() => {
        const main = document.querySelector('main')?.getBoundingClientRect();
        const footer = document.querySelector('footer')?.getBoundingClientRect();
        return main && footer ? Math.round(footer.top - main.bottom) : null;
      });
      expect(gap, `${route}: sem vão entre o conteúdo e o rodapé`).toBe(0);

      await scrollToEnd(page);
      const footer = page.getByRole('contentinfo');
      await expect(footer, `${route}: visível no fim`).toBeInViewport();
      await expect(footer.getByText('© ', { exact: false })).toBeInViewport();
    }
  });

  test(`em página curta o rodapé fica no pé da tela (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/nao-existe');
    await settle(page);

    // A página nunca é menor que a tela: o que sobra é do conteúdo, e o rodapé encosta no fim dela.
    const bottom = await page.evaluate(() => {
      const footer = document.querySelector('footer')?.getBoundingClientRect();
      return footer ? Math.round(footer.bottom + window.scrollY) : null;
    });
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(bottom).toBe(total);
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

test('o rodapé entra suave com a rolagem e fica parado com movimento reduzido', async ({
  page,
}) => {
  // Uma página longa: o rodapé só entra na tela com a rolagem.
  await page.goto('/termos');
  const reveal = page.locator('footer .footer-reveal');
  // Ainda fora da tela: a revelação ligada à rolagem não começou.
  expect(Number(await reveal.evaluate((el) => getComputedStyle(el).opacity))).toBeLessThan(1);
  await scrollToEnd(page);
  await expect(reveal).toHaveCSS('opacity', '1');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(reveal).toHaveCSS('opacity', '1');
  await expect(reveal).toHaveCSS('animation-name', 'none');
});
