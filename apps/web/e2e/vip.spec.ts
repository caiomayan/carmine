import { axeViolations, expect, saveTheme, test } from './fixtures';

/**
 * A página do VIP (/vip, S14b). A compra nasce desligada e depende da Conta, então os estados vêm da vitrine
 * `/dev/vip?estado=` (dados de exemplo no formato do contrato `GET /api/vip/packages`); a rota de verdade é
 * conferida contra a API do E2E.
 */

const state = (name: string) => `/dev/vip?estado=${name}`;

const noHorizontalScroll = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe('/vip com a API de verdade', () => {
  test('mostra os três Pacotes com preço da API; o visitante entra para comprar e avisa que é teste', async ({
    page,
  }) => {
    await page.goto('/vip');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Jogue com o Loadout completo.',
    );
    const packs = page.getByTestId('vip-package');
    await expect(packs).toHaveCount(3);
    const prices = await page.getByTestId('vip-price').allInnerTexts();
    expect(prices.map((price) => price.replace(/\s/g, ' '))).toEqual([
      'R$ 9,90',
      'R$ 26,90',
      'R$ 49,90',
    ]);
    // O E2E roda com o provedor falso: a cobrança está aberta, o visitante entra com a Steam e o aviso de teste aparece.
    await expect(page.getByTestId('vip-signin')).toHaveCount(3);
    await expect(page.getByTestId('vip-sandbox')).toContainText('de mentira');
    await expect(page.getByTestId('vip-compare')).toContainText('Vaga reservada');
  });
});

test.describe('/vip, estados (vitrine)', () => {
  test('compra aberta: três links de compra, melhor preço e economia calculados', async ({
    page,
  }) => {
    await page.goto(state('aberta'));
    const buy = page.getByTestId('vip-buy');
    await expect(buy).toHaveCount(3);
    await expect(buy.nth(0)).toHaveAttribute('href', '/vip/comprar?pacote=vip-1m');
    await expect(buy.nth(1)).toHaveAttribute('href', '/vip/comprar?pacote=vip-3m');
    await expect(buy.nth(2)).toHaveAttribute('href', '/vip/comprar?pacote=vip-6m');
    await expect(page.locator('[data-package="vip-6m"]')).toHaveAttribute('data-best', 'true');
    await expect(page.locator('[data-package="vip-6m"]')).toContainText('Melhor preço');
    await expect(page.locator('[data-package="vip-3m"]')).toContainText('Economize 9%');
    await expect(page.locator('[data-package="vip-6m"]')).toContainText('Economize 16%');
    await expect(page.locator('[data-package="vip-1m"]')).not.toContainText('Economize');
    await expect(page.getByTestId('vip-notice-reason')).toHaveCount(0);
  });

  test('visitante: entra com a Steam e volta para a confirmação do Pacote', async ({ page }) => {
    await page.goto(state('visitante'));
    const signIn = page.getByTestId('vip-signin');
    await expect(signIn).toHaveCount(3);
    const href = (await signIn.nth(1).getAttribute('href')) ?? '';
    expect(decodeURIComponent(href)).toContain('/vip/comprar?pacote=vip-3m');
  });

  test('"Em breve" e cada motivo de bloqueio: botões parados e o aviso certo', async ({ page }) => {
    const cases: [string, string, RegExp][] = [
      ['em-breve', 'soon', /ainda não abriu/],
      ['banido', 'banned', /ban permanente/],
      ['bloqueado', 'purchases_blocked', /bloqueadas/],
      ['em-analise', 'purchase_in_progress', /em análise/],
      ['limite', 'daily_limit', /limite de compras/],
    ];
    for (const [name, reason, text] of cases) {
      await page.goto(state(name));
      await expect(page.getByTestId('vip-disabled')).toHaveCount(3);
      await expect(page.getByTestId('vip-buy')).toHaveCount(0);
      const notice = page.getByTestId('vip-notice-reason');
      await expect(notice).toHaveAttribute('data-reason', reason);
      await expect(notice).toContainText(text);
    }
    // Só o "Em breve" diz "Em breve" nos botões; quem está bloqueado vê "Comprar" parado.
    await page.goto(state('em-breve'));
    await expect(page.getByTestId('vip-disabled').first()).toHaveText('Em breve');
    await page.goto(state('banido'));
    await expect(page.getByTestId('vip-disabled').first()).toHaveText('Comprar');
    await expect(page.getByTestId('vip-disabled').first()).toBeDisabled();
    // Quem tem pagamento em análise ou bateu o limite vai direto às compras.
    await page.goto(state('em-analise'));
    await expect(page.getByRole('link', { name: 'Ver minhas compras' })).toBeVisible();
  });

  test('o VIP da Conta: ativo, acabando (aviso) e acabado', async ({ page }) => {
    await page.goto(state('vip-ativo'));
    await expect(page.getByTestId('vip-yours')).toContainText('Seu VIP vai até');
    await expect(page.getByTestId('vip-notice')).toHaveCount(0);

    await page.goto(state('vip-acabando'));
    await expect(page.getByTestId('vip-notice')).toHaveAttribute('data-notice', 'ending_soon');

    await page.goto(state('vip-acabou'));
    await expect(page.getByTestId('vip-yours')).toContainText('Seu VIP acabou em');
  });

  test('ambiente de teste avisa que o pagamento é de mentira; API fora não mostra Pacote nenhum', async ({
    page,
  }) => {
    await page.goto(state('sandbox'));
    await expect(page.getByTestId('vip-sandbox')).toContainText('de mentira');
    await page.goto(state('indisponivel'));
    await expect(page.getByTestId('vip-unavailable')).toContainText('Não deu para carregar');
    await expect(page.getByTestId('vip-package')).toHaveCount(0);
  });
});

for (const theme of ['dark', 'light'] as const) {
  test.describe(`/vip: acessibilidade e 390 px (${theme})`, () => {
    for (const name of ['aberta', 'em-breve', 'vip-acabando', 'sandbox', 'indisponivel']) {
      test(`"${name}": axe sem violações e sem rolagem lateral`, async ({ page }) => {
        await saveTheme(page, theme);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(state(name));
        await expect(page.getByTestId('vip-page')).toBeVisible();
        expect(await noHorizontalScroll(page)).toBe(true);
        expect(await axeViolations(page)).toEqual([]);
        await page.setViewportSize({ width: 1440, height: 900 });
        expect(await noHorizontalScroll(page)).toBe(true);
        expect(await axeViolations(page)).toEqual([]);
      });
    }
  });
}
