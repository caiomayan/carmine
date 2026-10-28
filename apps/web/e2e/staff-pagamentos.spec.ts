import type { Browser, Page } from '@playwright/test';
import { createUnclaimedAccount, grantStaffRole, signInByRequest } from './accounts';
import { axeViolations, expect, saveTheme, test, WIDTHS } from './fixtures';
import { createPurchase, simulate } from './payments-api';

/**
 * Pagamentos no painel da Staff (S14): a lista com filtro e contagem por estado, a ficha com os
 * webhooks, reembolsar com motivo e confirmação, reabrir as compras depois de uma contestação, a
 * conciliação e o formulário de compensação em lote. Só o Dono e o Admin. O provedor é o falso do E2E.
 * A compensação não é aplicada aqui: ela soma dias a TODOS os VIPs ativos e os testes compartilham o banco.
 */

const NOT_FOUND = /404 \(Not Found\)/;

async function member(page: Page, request: Page['request'], name: string) {
  const account = await createUnclaimedAccount(request, name);
  await signInByRequest(page, account.steamId);
  return account;
}

/** Uma Conta de Staff num contexto próprio (o comprador fica na `page` do teste). */
async function staffMember(browser: Browser, role: 'owner' | 'admin' | 'moderator') {
  const context = await browser.newContext();
  const page = await context.newPage();
  const account = await createUnclaimedAccount(page.request, `Staff ${role}`);
  await signInByRequest(page, account.steamId);
  grantStaffRole(account.steamId, role);
  return { page, context, ...account };
}

test.describe('Pagamentos da Staff', () => {
  test.beforeEach(({ expectedConsoleErrors }) => {
    expectedConsoleErrors.push(NOT_FOUND);
  });

  test('quem não é Dono nem Admin recebe 404, e o Moderador nem vê a aba', async ({
    page,
    request,
    browser,
  }) => {
    expect((await page.goto('/staff/pagamentos'))?.status()).toBe(404);

    await member(page, request, 'Pagamentos Jogador');
    expect((await page.goto('/staff/pagamentos'))?.status()).toBe(404);

    const moderator = await staffMember(browser, 'moderator');
    await moderator.page.goto('/staff');
    await expect(moderator.page.getByTestId('staff-panel')).toBeVisible();
    await expect(
      moderator.page
        .getByRole('navigation', { name: 'Seções do painel da Staff' })
        .getByRole('link', {
          name: 'Pagamentos',
        }),
    ).toHaveCount(0);
    expect((await moderator.page.goto('/staff/pagamentos'))?.status()).toBe(404);
    await moderator.context.close();
  });

  test('a lista filtra por estado e mostra a contagem; a linha abre a ficha com os webhooks', async ({
    page,
    request,
    browser,
  }) => {
    await member(page, request, 'Pagamentos Lista');
    const paid = await createPurchase(page, { package: 'vip-3m' });
    await simulate(page, paid, 'pay');
    const staff = await staffMember(browser, 'admin');

    await staff.page.goto('/staff/pagamentos');
    await expect(
      staff.page.getByRole('navigation', { name: 'Seções do painel da Staff' }).getByRole('link', {
        name: 'Pagamentos',
      }),
    ).toHaveAttribute('aria-current', 'page');
    const row = staff.page.locator(`[data-payment-id="${paid.id}"]`);
    await expect(row).toBeVisible();
    await expect(row).toContainText('Aprovado');
    await expect(row).toContainText('R$ 26,90');
    await expect(row).toContainText('Pagamentos Lista');

    // O filtro por estado: "Aprovados" mantém a linha; "Contestados" não a tem.
    await staff.page.getByRole('link', { name: /^Aprovados/ }).click();
    await expect(staff.page).toHaveURL(/status=approved$/);
    await expect(staff.page.locator(`[data-payment-id="${paid.id}"]`)).toBeVisible();
    for (const status of await staff.page
      .getByTestId('payment-row')
      .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-status')))) {
      expect(status).toBe('approved');
    }
    await staff.page.getByRole('link', { name: /^Contestados/ }).click();
    await expect(staff.page.locator(`[data-payment-id="${paid.id}"]`)).toHaveCount(0);

    await staff.page.goto('/staff/pagamentos?status=approved');
    await staff.page.locator(`[data-payment-id="${paid.id}"]`).click();
    await expect(staff.page).toHaveURL(new RegExp(`/staff/pagamentos/${paid.id}$`));
    const sheet = staff.page.getByTestId('payment-sheet');
    await expect(sheet.getByTestId('payment-status')).toContainText('Aprovado');
    await expect(sheet).toContainText('R$ 26,90');
    await expect(sheet).toContainText('***.***.909-**');
    await expect(sheet.getByTestId('payment-account')).toHaveText('Pagamentos Lista');
    // O webhook da aprovação chegou com a assinatura válida e foi aplicado.
    await expect(sheet.getByTestId('payment-events')).toContainText('Aplicado');
    await expect(sheet.getByTestId('payment-events')).toContainText('válida');
    await expect(sheet.getByTestId('refundable')).toContainText('90 dia(s)');
    await staff.context.close();
  });

  test('reembolsar exige motivo e confirmação; devolve os dias e deixa o registro na ficha', async ({
    page,
    request,
    browser,
  }) => {
    await member(page, request, 'Pagamentos Reembolso');
    const paid = await createPurchase(page, { package: 'vip-1m' });
    await simulate(page, paid, 'pay');
    const staff = await staffMember(browser, 'owner');

    await staff.page.goto(`/staff/pagamentos/${paid.id}`);
    await staff.page.getByRole('button', { name: 'Reembolsar este pagamento' }).click();
    const form = staff.page.getByTestId('refund-form');
    // Sem motivo, nada é enviado.
    await form.getByRole('button', { name: 'Reembolsar', exact: true }).click();
    await expect(form).toContainText('motivo');
    await expect(staff.page.getByTestId('refund-form-confirm')).toHaveCount(0);

    await form.getByTestId('reason').fill('Queda de 3 dias em outubro, pedido pelo suporte');
    await form.getByRole('button', { name: 'Reembolsar', exact: true }).click();
    const dialog = staff.page.getByTestId('refund-form-confirm');
    await expect(dialog).toContainText('Não tem volta');
    await dialog.getByRole('button', { name: 'Reembolsar agora' }).click();

    const sheet = staff.page.getByTestId('payment-sheet');
    await expect(sheet.getByTestId('payment-status')).toContainText('Reembolsado', {
      timeout: 20_000,
    });
    await expect(sheet.getByTestId('refund-unavailable')).toBeVisible();
    const audit = sheet.getByTestId('payment-audit');
    await expect(audit).toContainText('Reembolsou um pagamento');
    await expect(audit).toContainText('Queda de 3 dias em outubro, pedido pelo suporte');

    // O comprador vê o reembolso em Minhas compras.
    await page.goto('/configuracoes/compras');
    await expect(
      page.locator(`[data-purchase-id="${paid.id}"]`).getByTestId('purchase-status'),
    ).toHaveText('Reembolsado');
    await staff.context.close();
  });

  test('reembolso parcial por dias: sobra o resto para devolver', async ({
    page,
    request,
    browser,
  }) => {
    await member(page, request, 'Pagamentos Parcial');
    const paid = await createPurchase(page, { package: 'vip-3m' });
    await simulate(page, paid, 'pay');
    const staff = await staffMember(browser, 'admin');

    await staff.page.goto(`/staff/pagamentos/${paid.id}`);
    await staff.page.getByRole('button', { name: 'Reembolsar este pagamento' }).click();
    const form = staff.page.getByTestId('refund-form');
    await form.getByLabel('Dias a devolver').fill('10');
    await form.getByTestId('reason').fill('Indisponibilidade de 10 dias');
    await form.getByRole('button', { name: 'Reembolsar', exact: true }).click();
    await staff.page
      .getByTestId('refund-form-confirm')
      .getByRole('button', { name: 'Reembolsar agora' })
      .click();

    const sheet = staff.page.getByTestId('payment-sheet');
    await expect(sheet.getByTestId('payment-status')).toContainText('Reembolso parcial', {
      timeout: 20_000,
    });
    await expect(sheet.getByTestId('refundable')).toContainText('80 dia(s)');
    await staff.context.close();
  });

  test('contestação bloqueia as compras; a Staff reabre depois de revisar', async ({
    page,
    request,
    browser,
  }) => {
    await member(page, request, 'Pagamentos Contestado');
    const paid = await createPurchase(page);
    await simulate(page, paid, 'pay');
    await simulate(page, paid, 'chargeback');
    const staff = await staffMember(browser, 'owner');

    await staff.page.goto(`/staff/pagamentos/${paid.id}`);
    const sheet = staff.page.getByTestId('payment-sheet');
    await expect(sheet.getByTestId('payment-status')).toContainText('Contestado');
    const panel = sheet.getByTestId('unblock-panel');
    await expect(panel).toContainText('bloqueadas');

    await panel.getByRole('button', { name: 'Reabrir as compras' }).click();
    await panel.getByTestId('reason').fill('Contestação revisada: o pagamento era do titular');
    await panel.getByRole('button', { name: 'Reabrir', exact: true }).click();

    await expect(sheet.getByTestId('unblock-panel')).toHaveCount(0, { timeout: 20_000 });
    await expect(sheet.getByTestId('payment-audit')).toContainText('Liberou as compras');
    await staff.context.close();
  });

  test('conciliar mostra quantos foram conferidos; a compensação pede os números e a confirmação', async ({
    page,
    request,
    browser,
  }) => {
    await member(page, request, 'Pagamentos Operacoes');
    const paid = await createPurchase(page);
    await simulate(page, paid, 'pay');
    const staff = await staffMember(browser, 'owner');

    await staff.page.goto('/staff/pagamentos');
    const operations = staff.page.getByTestId('payment-operations');
    await operations.getByRole('button', { name: 'Conciliar agora' }).click();
    await expect(operations.getByTestId('reconcile-form').getByRole('status')).toContainText(
      'conferidos com o provedor',
      { timeout: 20_000 },
    );

    // A compensação: o alerta de quantas Contas ganham, e a confirmação que repete os números.
    await expect(operations.getByTestId('compensation-active')).toContainText('VIP ativo agora');
    await operations.getByRole('button', { name: 'Compensar VIPs ativos' }).click();
    const form = operations.getByTestId('compensation-form');
    await form.getByLabel('Dias a somar').fill('2');
    await form.getByLabel('Chave da queda').fill('queda-e2e-nao-aplicar');
    await form.getByTestId('reason').fill('Servidores fora por 30 horas');
    await form.getByRole('button', { name: 'Compensar', exact: true }).click();
    const dialog = staff.page.getByTestId('compensation-form-confirm');
    await expect(dialog).toContainText('2 dia(s)');
    await expect(dialog).toContainText('queda-e2e-nao-aplicar');
    await expect(dialog).toContainText('Não tem volta');
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toHaveCount(0);
    await staff.context.close();
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`lista e ficha sem violações do axe e sem scroll horizontal (${theme})`, async ({
      page,
      request,
      browser,
    }) => {
      await member(page, request, 'Pagamentos Acessibilidade');
      const paid = await createPurchase(page, { package: 'vip-6m' });
      await simulate(page, paid, 'pay');
      const staff = await staffMember(browser, 'owner');
      await saveTheme(staff.page, theme);

      for (const width of WIDTHS) {
        await staff.page.setViewportSize({ width, height: 900 });
        await staff.page.goto('/staff/pagamentos');
        await expect(staff.page.locator(`[data-payment-id="${paid.id}"]`)).toBeVisible();
        expect(await axeViolations(staff.page), `${width}px, lista`).toEqual([]);
        expect(
          await staff.page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          ),
          `${width}px, lista`,
        ).toBe(0);

        await staff.page.goto(`/staff/pagamentos/${paid.id}`);
        await expect(staff.page.getByTestId('payment-sheet')).toBeVisible();
        await staff.page.getByRole('button', { name: 'Reembolsar este pagamento' }).click();
        await expect(staff.page.getByTestId('refund-form')).toBeVisible();
        expect(await axeViolations(staff.page), `${width}px, ficha`).toEqual([]);
        expect(
          await staff.page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          ),
          `${width}px, ficha`,
        ).toBe(0);
      }
      await staff.context.close();
    });
  }
});
