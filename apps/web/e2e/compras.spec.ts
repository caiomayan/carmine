import { createUnclaimedAccount, signInByRequest } from './accounts';
import { axeViolations, expect, saveTheme, test, WIDTHS } from './fixtures';
import { createPurchase, simulate } from './payments-api';

/**
 * "Minhas compras" e o recibo (S14b). O provedor de pagamento é o FALSO do E2E: a compra nasce pela
 * API e a "página de simulação" (`/api/dev/payments/...`) paga, recusa, vence, estorna, e cada ação
 * dispara o webhook assinado contra o tratador de verdade. A tela só lê e se atualiza sozinha.
 */

async function signedIn(
  page: import('@playwright/test').Page,
  request: import('@playwright/test').APIRequestContext,
  name: string,
) {
  const account = await createUnclaimedAccount(request, name);
  await signInByRequest(page, account.steamId);
  return account;
}

const purchaseCard = (page: import('@playwright/test').Page) => page.getByTestId('purchase');

test('sem compras: estado vazio, a seção no menu e o aviso do ambiente de teste', async ({
  page,
  request,
}) => {
  await signedIn(page, request, 'Compras Vazio');
  await page.goto('/settings/purchases');

  await expect(page.getByTestId('settings-compras')).toBeVisible();
  await expect(page.getByTestId('purchases-empty')).toContainText('Nenhuma compra ainda');
  // O provedor do E2E é o falso: a tela avisa que o pagamento é de mentira.
  await expect(page.getByTestId('purchases-sandbox')).toContainText('ninguém é cobrado');
  await expect(
    page.getByRole('navigation', { name: 'Seções das configurações' }).getByRole('link', {
      name: 'Compras',
    }),
  ).toHaveAttribute('aria-current', 'page');
});

test('Pix pendente: o QR e o código voltam ao reabrir a página, e a tela percebe o pagamento sozinha', async ({
  page,
  request,
}) => {
  await signedIn(page, request, 'Compras Pix');
  const purchase = await createPurchase(page, { package: 'vip-1m', method: 'pix' });

  await page.goto('/settings/purchases');
  const card = purchaseCard(page);
  await expect(card).toHaveCount(1);
  await expect(card.getByTestId('purchase-status')).toHaveText('Aguardando o pagamento');
  await expect(card.getByTestId('purchase-amount')).toHaveText('R$ 9,90');
  await expect(card.getByTestId('pix-code')).toHaveText(purchase.pix?.copyPaste ?? '');
  await expect(card.getByTestId('pix-qr')).toBeVisible();
  await expect(card.getByTestId('pix-countdown')).toContainText('O QR vale por mais');
  await expect(card.getByTestId('purchase-processing')).toContainText('Já pagou?');
  await expect(card.getByTestId('purchase-id')).toContainText(purchase.id.slice(0, 8));

  // "Fechar a página e voltar em Minhas compras recupera o QR" (aceite da S14).
  await page.goto('/');
  await page.goto('/settings/purchases');
  await expect(purchaseCard(page).getByTestId('pix-code')).toHaveText(
    purchase.pix?.copyPaste ?? '',
  );

  // Pagou: o webhook chega e a página muda sem recarregar.
  await simulate(page, purchase, 'pay');
  await expect(purchaseCard(page).getByTestId('purchase-status')).toHaveText('Pago', {
    timeout: 20_000,
  });
  await expect(purchaseCard(page).getByTestId('pix-code')).toHaveCount(0);
  await expect(purchaseCard(page).getByTestId('purchase-vip-until')).toContainText('VIP até');
  await expect(purchaseCard(page).getByTestId('purchase-receipt')).toBeVisible();
  await expect(purchaseCard(page).getByTestId('refund-open')).toBeVisible();
});

test.describe('copiar o código do Pix', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('o botão copia o código inteiro e diz que copiou', async ({ page, request }) => {
    await signedIn(page, request, 'Compras Copiar');
    const purchase = await createPurchase(page);

    await page.goto('/settings/purchases');
    await page.getByTestId('pix-copy').click();

    await expect(page.getByTestId('pix-copy')).toContainText('Código copiado');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(purchase.pix?.copyPaste);
  });
});

test('QR vencido e pagamento recusado terminam sem cobrança, em palavras', async ({
  page,
  request,
}) => {
  await signedIn(page, request, 'Compras Fim');
  const expired = await createPurchase(page, { method: 'pix' });
  await simulate(page, expired, 'expire');
  await page.goto('/settings/purchases');
  await expect(purchaseCard(page).getByTestId('purchase-status')).toHaveText('Expirado');
  await expect(purchaseCard(page).getByTestId('purchase-note')).toContainText('nada foi cobrado');
  await expect(purchaseCard(page).getByTestId('pix-code')).toHaveCount(0);

  // Cartão: o botão leva ao checkout; recusado, a nota diz que nada foi cobrado.
  const card = await createPurchase(page, { method: 'card', package: 'vip-3m' });
  await page.reload();
  const pending = page.locator(`[data-purchase-id="${card.id}"]`);
  await expect(pending.getByTestId('purchase-status')).toHaveText('Aguardando o pagamento');
  await expect(pending.getByTestId('card-continue')).toHaveAttribute(
    'href',
    card.redirectUrl ?? '',
  );
  await expect(pending.getByTestId('purchase-amount')).toHaveText('R$ 26,90');
  await simulate(page, card, 'reject');
  await expect(pending.getByTestId('purchase-status')).toHaveText('Recusado', { timeout: 20_000 });
  await expect(pending.getByTestId('purchase-note')).toContainText('foi recusado');
});

test('o recibo: número, pagador com o CPF mascarado, valor, fornecedor por informar e sem nota fiscal', async ({
  page,
  request,
}) => {
  await signedIn(page, request, 'Compras Recibo');
  const purchase = await createPurchase(page, { package: 'vip-6m' });
  await simulate(page, purchase, 'pay');
  await page.goto('/settings/purchases');
  await expect(purchaseCard(page).getByTestId('purchase-status')).toHaveText('Pago', {
    timeout: 20_000,
  });

  await purchaseCard(page).getByTestId('purchase-receipt').click();

  await expect(page).toHaveURL(new RegExp(`/settings/purchases/${purchase.id}$`));
  const receipt = page.getByTestId('receipt');
  await expect(receipt.getByTestId('receipt-number')).toContainText(purchase.id);
  await expect(receipt.getByTestId('receipt-amount')).toHaveText('R$ 49,90');
  await expect(receipt.getByTestId('receipt-payer')).toHaveText('Pagador de Mentira');
  await expect(receipt.getByTestId('receipt-payer-document')).toHaveText('***.***.909-**');
  await expect(receipt.getByTestId('receipt-status')).toHaveText('Pago');
  await expect(receipt.getByTestId('receipt-buyer')).toContainText('Compras Recibo');
  // O dono ainda vai informar o fornecedor: sem dado inventado.
  await expect(receipt.getByTestId('receipt-supplier-placeholder')).toContainText('a informar');
  await expect(receipt.getByTestId('receipt-no-invoice')).toContainText('não é nota fiscal');
  // O CPF inteiro nunca está na página.
  await expect(page.locator('body')).not.toContainText('12345678909');

  // No papel: só o recibo (sem a navegação, o cabeçalho e os botões).
  await page.emulateMedia({ media: 'print' });
  await expect(receipt).toBeVisible();
  await expect(page.getByRole('navigation').first()).toBeHidden();
  await expect(page.getByTestId('receipt-print')).toBeHidden();
});

test('o recibo de uma compra pendente ainda não existe, e o de outra Conta responde 404', async ({
  page,
  request,
}) => {
  await signedIn(page, request, 'Compras Dono');
  const pending = await createPurchase(page);
  await page.goto(`/settings/purchases/${pending.id}`);
  await expect(page.getByTestId('receipt-not-available')).toContainText(
    'O recibo ainda não está disponível',
  );

  const paid = await createPurchase(page, { package: 'vip-1m' });
  await simulate(page, paid, 'pay');

  // Outra Conta, outro navegador: não enxerga a compra.
  const other = await page.context().browser()?.newContext();
  if (!other) throw new Error('sem navegador');
  const stranger = await other.newPage();
  const strangerAccount = await createUnclaimedAccount(request, 'Compras Intruso');
  await signInByRequest(stranger, strangerAccount.steamId);
  const response = await stranger.goto(`/settings/purchases/${paid.id}`);
  expect(response?.status()).toBe(404);
  await other.close();
});

test('reembolso dentro dos 7 dias: pergunta, devolve e a compra fica como reembolsada', async ({
  page,
  request,
}) => {
  await signedIn(page, request, 'Compras Reembolso');
  const purchase = await createPurchase(page);
  await simulate(page, purchase, 'pay');
  await page.goto('/settings/purchases');
  await expect(purchaseCard(page).getByTestId('purchase-status')).toHaveText('Pago', {
    timeout: 20_000,
  });

  await purchaseCard(page).getByTestId('refund-open').click();
  const dialog = page.getByTestId('refund-dialog');
  await expect(dialog).toContainText('Pedir o reembolso?');
  await expect(dialog).toContainText('R$ 9,90');
  await dialog.getByRole('button', { name: 'Pedir reembolso' }).click();

  await expect(purchaseCard(page).getByTestId('purchase-status')).toHaveText('Reembolsado', {
    timeout: 20_000,
  });
  await expect(purchaseCard(page).getByTestId('purchase-note')).toContainText(
    'Os dias saíram do seu VIP',
  );
  await expect(purchaseCard(page).getByTestId('refund-open')).toHaveCount(0);
  // O recibo continua existindo, agora com o valor devolvido.
  await purchaseCard(page).getByTestId('purchase-receipt').click();
  await expect(page.getByTestId('receipt-refunded')).toHaveText('R$ 9,90');
});

for (const theme of ['dark', 'light'] as const) {
  test(`Compras e recibo sem violações do axe e sem scroll horizontal (${theme})`, async ({
    page,
    request,
  }) => {
    await saveTheme(page, theme);
    await signedIn(page, request, 'Compras Acessibilidade');
    const paid = await createPurchase(page, { package: 'vip-3m' });
    await simulate(page, paid, 'pay');
    // Um Pacote ou meio novo cancela o pendente anterior: o cartão fica cancelado e o Pix, pendente.
    await createPurchase(page, { method: 'card' });
    await createPurchase(page, { method: 'pix' });

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/settings/purchases');
      await expect(purchaseCard(page)).toHaveCount(3);
      await expect(page.getByTestId('pix-qr')).toBeVisible();
      expect(await axeViolations(page), `${width}px, lista`).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
        `${width}px, lista`,
      ).toBe(0);

      await page.goto(`/settings/purchases/${paid.id}`);
      await expect(page.getByTestId('receipt')).toBeVisible();
      expect(await axeViolations(page), `${width}px, recibo`).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
        `${width}px, recibo`,
      ).toBe(0);
    }
  });
}
