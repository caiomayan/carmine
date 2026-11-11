import { axeViolations, expect, saveTheme, test } from './fixtures';

/**
 * A página do VIP (/plans, S14b). A compra nasce desligada e depende da Conta, então os estados vêm da vitrine
 * `/dev/vip?estado=` (dados de exemplo no formato do contrato `GET /api/vip/packages`); a rota de verdade é
 * conferida contra a API do E2E.
 */

const state = (name: string) => `/dev/vip?estado=${name}`;

const noHorizontalScroll = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe('/plans com a API de verdade', () => {
  test('mostra os três Pacotes com preço da API; o visitante entra para comprar e avisa que é teste', async ({
    page,
  }) => {
    await page.goto('/plans');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Jogue com o Loadout completo.',
    );
    // Dois planos, três Pacotes cada: o Capo primeiro, o Padrinho depois.
    await expect(page.getByTestId('vip-plan-group')).toHaveCount(2);
    const packs = page.getByTestId('vip-package');
    await expect(packs).toHaveCount(6);
    const prices = await page.getByTestId('vip-price').allInnerTexts();
    expect(prices.map((price) => price.replace(/\s/g, ' '))).toEqual([
      'R$ 9,90',
      'R$ 26,90',
      'R$ 49,90',
      'R$ 19,90',
      'R$ 53,90',
      'R$ 99,90',
    ]);
    // O E2E roda com o provedor falso: a cobrança está aberta, o visitante entra com a Steam e o aviso de teste aparece.
    await expect(page.getByTestId('vip-signin')).toHaveCount(6);
    await expect(page.getByTestId('vip-sandbox')).toHaveText(
      'Beta: compra de teste. Nada é cobrado.',
    );
    await expect(page.getByTestId('vip-compare')).toContainText('Vaga reservada');
    // A comparação mostra os três: grátis, Capo (6 Presets) e Padrinho (25).
    await expect(page.getByTestId('vip-compare').locator('[data-plan]')).toHaveCount(3);
    await expect(page.getByTestId('vip-compare').locator('[data-plan="capo"]')).toContainText(
      'Até 6 Presets',
    );
    await expect(page.getByTestId('vip-compare').locator('[data-plan="padrinho"]')).toContainText(
      'Até 25 Presets',
    );
  });
});

test.describe('/plans, estados (vitrine)', () => {
  test('compra aberta: três links de compra, melhor preço e economia calculados', async ({
    page,
  }) => {
    await page.goto(state('aberta'));
    const buy = page.getByTestId('vip-buy');
    await expect(buy).toHaveCount(6);
    await expect(buy.nth(0)).toHaveAttribute('href', '/plans/checkout?pacote=vip-1m');
    await expect(buy.nth(1)).toHaveAttribute('href', '/plans/checkout?pacote=vip-3m');
    await expect(buy.nth(2)).toHaveAttribute('href', '/plans/checkout?pacote=vip-6m');
    await expect(buy.nth(3)).toHaveAttribute('href', '/plans/checkout?pacote=padrinho-1m');
    await expect(buy.nth(5)).toHaveAttribute('href', '/plans/checkout?pacote=padrinho-6m');
    await expect(page.locator('[data-package="padrinho-6m"]')).toHaveAttribute('data-best', 'true');
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
    await expect(signIn).toHaveCount(6);
    const href = (await signIn.nth(1).getAttribute('href')) ?? '';
    expect(decodeURIComponent(href)).toContain('/plans/checkout?pacote=vip-3m');
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
      await expect(page.getByTestId('vip-disabled')).toHaveCount(6);
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
    await expect(page.getByTestId('vip-yours')).toContainText('Seu plano é o Capo até');
    await expect(page.getByTestId('vip-notice')).toHaveCount(0);

    await page.goto(state('vip-acabando'));
    await expect(page.getByTestId('vip-notice')).toHaveAttribute('data-notice', 'ending_soon');

    await page.goto(state('vip-acabou'));
    await expect(page.getByTestId('vip-yours')).toContainText('Seu plano acabou em');
    // Com a guarda dos Itens VIP ligada (S14a), eles saem do Inventário e ficam guardados 30 dias.
    await expect(page.getByTestId('vip-yours')).toContainText('guardados por 30 dias');
    await expect(page.getByTestId('vip-yours')).not.toContainText('continuam no seu Inventário');

    // Com ela desligada, seguem no Inventário (só deixam de ir para o jogo).
    await page.goto(state('vip-acabou-sem-guarda'));
    await expect(page.getByTestId('vip-yours')).toContainText('continuam no seu Inventário');
  });

  test('ambiente de teste avisa que o pagamento é de mentira; API fora não mostra Pacote nenhum', async ({
    page,
  }) => {
    await page.goto(state('sandbox'));
    await expect(page.getByTestId('vip-sandbox')).toHaveText(
      'Beta: compra de teste. Nada é cobrado.',
    );
    await page.goto(state('indisponivel'));
    await expect(page.getByTestId('vip-unavailable')).toContainText('Não deu para carregar');
    await expect(page.getByTestId('vip-package')).toHaveCount(0);
  });
});

for (const theme of ['dark', 'light'] as const) {
  test.describe(`/plans: acessibilidade e 390 px (${theme})`, () => {
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
