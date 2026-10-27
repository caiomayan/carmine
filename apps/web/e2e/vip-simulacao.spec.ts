import { ADULT_DECLARATION_VERSION } from '@carmine/contracts/payments';
import type { Page } from '@playwright/test';
import { csrfToken, newSteamId, signInByRequest } from './accounts';
import { axeViolations, expect, saveTheme, test } from './fixtures';

/**
 * A página do provedor de pagamento FALSO (/dev/pagamento/{providerId}, S14b parte c). O E2E roda com o provedor falso
 * ligado: a compra nasce pela API (como o botão de pagar faria) e a simulação aprova, recusa, reembolsa... pela página.
 */

type CreatedPurchase = { id: string; status: string; simulationUrl: string | null };

/** Cria uma compra por API na Conta logada, como a tela de confirmação faz, e devolve a compra. */
async function buy(page: Page, method: 'pix' | 'card'): Promise<CreatedPurchase> {
  const response = await page.request.post('/api/me/purchases', {
    headers: { 'x-csrf-token': await csrfToken(page.context()) },
    data: {
      package: 'vip-1m',
      method,
      adultDeclaration: true,
      declarationVersion: ADULT_DECLARATION_VERSION,
    },
  });
  expect(response.status(), await response.text()).toBeLessThan(300);
  return (await response.json()) as CreatedPurchase;
}

async function purchaseStatus(page: Page, id: string) {
  const response = await page.request.get(`/api/me/purchases/${id}`);
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { status: string }).status;
}

async function vipActive(page: Page) {
  const me = (await (await page.request.get('/api/me')).json()) as { vip: { active: boolean } };
  return me.vip.active;
}

test.describe('provedor falso', () => {
  test('aprova um Pix, libera o VIP e depois reembolsa', async ({ page }) => {
    await signInByRequest(page, newSteamId());
    const purchase = await buy(page, 'pix');
    expect(purchase.simulationUrl).toContain('/dev/pagamento/');
    expect(await vipActive(page)).toBe(false);

    await page.goto(purchase.simulationUrl as string);
    await expect(page.getByTestId('fake-status')).toHaveAttribute('data-status', 'pending');
    await expect(page.getByTestId('fake-amount')).toHaveText(/R\$\s9,90/);
    // Esperando o pagamento: pagar, recusar e expirar; reembolsar ainda não.
    await expect(page.getByTestId('fake-action-pay')).toBeVisible();
    await expect(page.getByTestId('fake-action-reject')).toBeVisible();
    await expect(page.getByTestId('fake-action-expire')).toBeVisible();
    await expect(page.getByTestId('fake-action-refund')).toHaveCount(0);

    await page.getByTestId('fake-action-pay').click();
    await expect(page.getByTestId('fake-status')).toHaveAttribute('data-status', 'approved');
    await expect(page.getByTestId('fake-back')).toHaveAttribute(
      'href',
      `/vip/compra/${purchase.id}`,
    );
    await expect.poll(() => purchaseStatus(page, purchase.id)).toBe('approved');
    expect(await vipActive(page)).toBe(true);

    // Aprovada: reembolsar e contestar; pagar não.
    await expect(page.getByTestId('fake-action-pay')).toHaveCount(0);
    await expect(page.getByTestId('fake-action-chargeback')).toBeVisible();
    await page.getByTestId('fake-action-refund').click();
    await expect(page.getByTestId('fake-status')).toHaveAttribute('data-status', 'refunded');
    await expect(page.getByTestId('fake-no-actions')).toBeVisible();
    await expect.poll(() => purchaseStatus(page, purchase.id)).toBe('refunded');
  });

  test('cartão recusado: nada é liberado e o link volta com o retorno do checkout', async ({
    page,
  }) => {
    await signInByRequest(page, newSteamId());
    const purchase = await buy(page, 'card');
    await page.goto(purchase.simulationUrl as string);
    await page.getByTestId('fake-action-reject').click();
    await expect(page.getByTestId('fake-status')).toHaveAttribute('data-status', 'rejected');
    await expect(page.getByTestId('fake-back')).toHaveAttribute(
      'href',
      `/vip/compra/${purchase.id}?retorno=cartao`,
    );
    await expect.poll(() => purchaseStatus(page, purchase.id)).toBe('rejected');
    expect(await vipActive(page)).toBe(false);
  });

  test('uma cobrança que não existe, ou um id fora do formato, dá 404', async ({ page }) => {
    const missing = await page.goto('/dev/pagamento/nao-existe-000000');
    expect(missing?.status()).toBe(404);
    const malformed = await page.goto('/dev/pagamento/a%20b');
    expect(malformed?.status()).toBe(404);
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`acessibilidade e 390 px (${theme})`, async ({ page }) => {
      await saveTheme(page, theme);
      await signInByRequest(page, newSteamId());
      const purchase = await buy(page, 'pix');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(purchase.simulationUrl as string);
      await expect(page.getByTestId('fake-provider')).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
      expect(await axeViolations(page)).toEqual([]);
    });
  }
});
