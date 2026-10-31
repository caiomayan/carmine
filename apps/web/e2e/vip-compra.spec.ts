import type { Locator, Page } from '@playwright/test';
import { newSteamId, signInFromHeader } from './accounts';
import { axeViolations, expect, saveTheme, test } from './fixtures';

/**
 * A confirmação da compra (/plans/checkout) e a página da compra (/plans/purchase/{id}), S14b parte (b). O E2E roda com o provedor
 * FALSO: o fluxo de verdade (Conta, confirmação, Pix, recuperação pelo id) vai pela API; os estados raros (limite à
 * frente, bloqueios, cada status final, QR ausente) vêm das vitrines `/dev/vip/comprar` e `/dev/vip/compra`.
 */

const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

/** O controle só responde a clique depois que o React hidratou o nó (o `next dev` demora). */
async function hydrated(control: Locator) {
  await expect
    .poll(() => control.evaluate((el) => Object.keys(el).some((k) => k.startsWith('__reactProps'))))
    .toBe(true);
}

const confirm = (state: string, pack = 'vip-3m') =>
  `/dev/vip/comprar?estado=${state}&pacote=${pack}`;
const purchase = (state: string) => `/dev/vip/compra?estado=${state}`;

test.describe('confirmação (vitrine)', () => {
  test('mostra a Conta, o valor, a duração, o novo fim e o aviso do ban em destaque', async ({
    page,
  }) => {
    await page.goto(confirm('padrao'));
    await expect(page.getByTestId('vip-beneficiary')).toContainText('F00L1SH_N1NJ4');
    await expect(page.getByTestId('vip-beneficiary')).toContainText('ID 1042');
    await expect(
      page.getByTestId('vip-beneficiary').getByRole('link', { name: 'Ver perfil' }),
    ).toHaveAttribute('href', '/1042');
    const summary = page.getByTestId('vip-summary');
    await expect(summary).toContainText('VIP, 3 meses');
    await expect(summary).toContainText('90 dias');
    await expect(page.getByTestId('vip-confirm-price')).toHaveText(/R\$\s26,90/);
    await expect(summary).toContainText('Pagamento único, sem renovação automática');
    // O novo fim: hoje + 90 dias (mesma conta da API).
    const end = new Date(Date.now() + 90 * 86_400_000);
    await expect(page.getByTestId('vip-new-end')).toContainText(String(end.getFullYear()));
    // O aviso do ban permanente e o do reembolso, antes do pagamento.
    const ban = page.getByTestId('vip-ban-notice');
    await expect(ban).toContainText('ban permanente encerra o VIP');
    await expect(ban).toContainText('não são reembolsados');
    await expect(ban).toContainText('7 dias');
    // Pix vem marcado; a declaração, desmarcada; o botão diz o valor.
    await expect(page.getByTestId('vip-method-pix')).toBeChecked();
    await expect(page.getByTestId('vip-declaration')).not.toBeChecked();
    await expect(page.getByTestId('vip-submit')).toHaveText(/Pagar R\$\s26,90/);
  });

  test('os Pacotes se somam: com VIP ativo, o novo fim vem depois do fim atual', async ({
    page,
  }) => {
    await page.goto(confirm('vip-ativo', 'vip-1m'));
    await expect(page.getByTestId('vip-summary')).toContainText('Soma ao seu VIP atual');
    const end = new Date(Date.now() + 71 * 86_400_000);
    await expect(page.getByTestId('vip-new-end')).toContainText(String(end.getFullYear()));
  });

  test('passar do limite à frente troca o formulário pelo aviso', async ({ page }) => {
    await page.goto(confirm('horizonte', 'vip-6m'));
    await expect(page.getByTestId('vip-confirm-horizon')).toContainText('730 dias');
    await expect(page.getByTestId('vip-form')).toHaveCount(0);
    // O aviso do ban continua: ele vale para qualquer compra.
    await expect(page.getByTestId('vip-ban-notice')).toBeVisible();
  });

  test('cada motivo de bloqueio vira aviso no lugar do formulário', async ({ page }) => {
    const cases: [string, string][] = [
      ['banido', 'ban permanente'],
      ['bloqueado', 'bloqueadas'],
      ['em-analise', 'em análise'],
      ['limite', 'limite de compras'],
    ];
    for (const [state, text] of cases) {
      await page.goto(confirm(state));
      await expect(page.getByTestId('vip-confirm-blocked')).toContainText(text);
      await expect(page.getByTestId('vip-form')).toHaveCount(0);
    }
  });

  test('sem marcar a declaração, não paga e diz por quê', async ({ page }) => {
    await page.goto(confirm('padrao'));
    const submit = page.getByTestId('vip-submit');
    await hydrated(submit);
    await submit.click();
    await expect(page.getByTestId('vip-form-error')).toHaveAttribute('data-code', 'declaration');
    await expect(page.getByTestId('vip-form-error')).toContainText('Marque a declaração');
    await page.getByTestId('vip-declaration').check();
    await expect(page.getByTestId('vip-form-error')).toHaveCount(0);
  });
});

test.describe('página da compra (vitrine)', () => {
  test('Pix: QR em PNG da API, copia e cola, relógio e simulação (ambiente de teste)', async ({
    page,
  }) => {
    await page.goto(purchase('pix'));
    await expect(page.getByTestId('vip-purchase')).toHaveAttribute('data-view', 'waiting');
    const qr = page.getByTestId('vip-pix-qr');
    await expect(qr).toBeVisible();
    await expect(qr).toHaveAttribute('src', /^data:image\/png;base64,/);
    expect(await qr.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(
      true,
    );
    await expect(page.getByTestId('vip-pix-code')).not.toHaveValue('');
    await expect(page.getByTestId('vip-pix-clock')).toContainText('27:00');
    await expect(page.getByTestId('vip-simulate')).toBeVisible();
    await expect(page.getByTestId('vip-sandbox')).toBeVisible();
  });

  test('Pix sem QR: só o copia e cola, nada quebrado', async ({ page }) => {
    await page.goto(purchase('pix-sem-qr'));
    await expect(page.getByTestId('vip-pix-qr')).toHaveCount(0);
    await expect(page.getByTestId('vip-pix-code')).not.toHaveValue('');
  });

  test('Pix com o prazo vencido avisa que está confirmando com o banco', async ({ page }) => {
    await page.goto(purchase('pix-vencido'));
    await expect(page.getByTestId('vip-pix-expired')).toContainText('prazo do QR Code acabou');
  });

  test('cartão: continua no checkout; ao voltar, confirma; passado o prazo, "processando"', async ({
    page,
  }) => {
    await page.goto(purchase('cartao'));
    await expect(page.getByTestId('vip-checkout')).toBeVisible();
    await page.goto(purchase('cartao-volta'));
    await expect(page.getByTestId('vip-card')).toContainText('Voltou do checkout');
    await page.goto(purchase('processando'));
    await expect(page.getByTestId('vip-purchase')).toHaveAttribute('data-view', 'processing');
    await expect(page.getByTestId('vip-outcome')).toContainText('Ainda estamos processando');
  });

  test('cada estado final diz o que aconteceu e o que fazer', async ({ page }) => {
    const cases: [string, string, string, string | null][] = [
      ['em-analise', 'in_review', 'Pagamento em análise', null],
      ['aprovada', 'approved', 'VIP liberado', '/loadout'],
      ['recusada', 'rejected', 'Pagamento recusado', '/plans/checkout?pacote=vip-3m'],
      ['expirada', 'expired', 'O prazo acabou', '/plans/checkout?pacote=vip-3m'],
      ['cancelada', 'cancelled', 'Compra cancelada', '/plans/checkout?pacote=vip-3m'],
      ['reembolsada', 'refunded', 'Compra reembolsada', '/plans'],
      ['parcial', 'partially_refunded', 'Reembolso parcial', null],
      ['contestada', 'charged_back', 'Pagamento contestado', null],
    ];
    for (const [state, status, title, link] of cases) {
      await page.goto(purchase(state));
      await expect(page.getByTestId('vip-purchase')).toHaveAttribute('data-status', status);
      const outcome = page.getByTestId('vip-outcome');
      await expect(outcome).toContainText(title);
      if (link) await expect(outcome.locator(`a[href="${link}"]`).first()).toBeVisible();
    }
    await page.goto(purchase('aprovada'));
    await expect(page.getByTestId('vip-until')).toContainText('Seu VIP vai até');
  });
});

test.describe('o fluxo de verdade (provedor falso)', () => {
  test('visitante vai à Steam e volta para a confirmação do Pacote', async ({ page }) => {
    await page.goto('/plans/checkout?pacote=vip-1m');
    await expect(page).toHaveURL(/\/login/);
    expect(decodeURIComponent(page.url())).toContain('/plans/checkout?pacote=vip-1m');
  });

  test('Pacote desconhecido volta ao /plans', async ({ page }) => {
    await page.goto('/plans/checkout?pacote=vip-9m');
    await expect(page).toHaveURL(/\/plans$/);
  });

  test('compra por Pix: confirma, vê o QR, recupera pelo id e repete sem duplicar', async ({
    page,
    browser,
  }) => {
    const steamId = newSteamId();
    await page.goto('/plans');
    await signInFromHeader(page, steamId);
    await expect(page.getByTestId('account-menu')).toBeVisible();
    await page.goto('/plans');
    const buy = page.locator('[data-package="vip-3m"]').getByTestId('vip-buy');
    await buy.click();
    await expect(page).toHaveURL(/\/plans\/checkout\?pacote=vip-3m$/);

    // A Conta que recebe o VIP é a da sessão.
    const me = (await (await page.request.get('/api/me')).json()) as {
      account: { displayName: string; publicId: number };
    };
    await expect(page.getByTestId('vip-beneficiary')).toContainText(me.account.displayName);
    await expect(page.getByTestId('vip-beneficiary')).toContainText(`ID ${me.account.publicId}`);
    await expect(page.getByTestId('vip-confirm-price')).toHaveText(/R\$\s26,90/);
    await expect(page.getByTestId('vip-ban-notice')).toBeVisible();

    // Sem a declaração, não cria nada.
    const submit = page.getByTestId('vip-submit');
    await hydrated(submit);
    await submit.click();
    await expect(page.getByTestId('vip-form-error')).toContainText('Marque a declaração');
    await expect(page).toHaveURL(/\/plans\/checkout/);

    await page.getByTestId('vip-declaration').check();
    await submit.click();
    await expect(page).toHaveURL(/\/plans\/purchase\/[0-9a-f-]{36}$/);
    const id = page.url().split('/').pop() as string;

    await expect(page.getByTestId('vip-purchase')).toHaveAttribute('data-status', 'pending');
    await expect(page.getByTestId('vip-pix-qr')).toHaveAttribute('src', /^data:image\/png;base64,/);
    await expect(page.getByTestId('vip-pix-code')).not.toHaveValue('');
    await expect(page.getByTestId('vip-simulate')).toBeVisible();

    // Recuperação pelo id: recarregar (ou voltar depois) mostra a mesma compra.
    await page.reload();
    await expect(page.getByTestId('vip-pix-qr')).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${id}$`));

    // Comprar o mesmo Pacote por Pix de novo devolve a MESMA pendente (idempotente).
    await page.goto('/plans/checkout?pacote=vip-3m');
    await hydrated(page.getByTestId('vip-submit'));
    await page.getByTestId('vip-declaration').check();
    await page.getByTestId('vip-submit').click();
    await expect(page).toHaveURL(new RegExp(`/plans/purchase/${id}$`));

    // A compra é só da Conta que comprou: outra Conta não a vê.
    const other = await browser.newContext({ baseURL: new URL(page.url()).origin });
    try {
      const otherPage = await other.newPage();
      await otherPage.goto('/plans');
      await signInFromHeader(otherPage, newSteamId());
      await expect(otherPage.getByTestId('account-menu')).toBeVisible();
      const response = await otherPage.goto(`/plans/purchase/${id}`);
      expect(response?.status()).toBe(404);
    } finally {
      await other.close();
    }
  });

  test('o endereço de uma compra que não existe (ou não é sua) dá 404', async ({
    page,
    expectedConsoleErrors,
  }) => {
    // O navegador registra o 404 do próprio documento no console.
    expectedConsoleErrors.push(/status of 404/);
    await page.goto('/plans');
    await signInFromHeader(page, newSteamId());
    await expect(page.getByTestId('account-menu')).toBeVisible();
    const response = await page.goto('/plans/purchase/3b1f5e1c-8d0a-4a39-9a55-0f3a7a1c2b10');
    expect(response?.status()).toBe(404);
    const malformed = await page.goto('/plans/purchase/nao-e-um-id');
    expect(malformed?.status()).toBe(404);
  });
});

for (const theme of ['dark', 'light'] as const) {
  test.describe(`acessibilidade e 390 px (${theme})`, () => {
    const pages = [
      confirm('padrao'),
      confirm('vip-ativo'),
      confirm('horizonte'),
      confirm('banido'),
      purchase('pix'),
      purchase('pix-sem-qr'),
      purchase('cartao'),
      purchase('processando'),
      purchase('aprovada'),
      purchase('recusada'),
      purchase('contestada'),
    ];
    for (const path of pages) {
      test(`${path}: axe sem violações e sem rolagem lateral`, async ({ page }) => {
        await saveTheme(page, theme);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(path);
        await expect(
          page.getByTestId(path.includes('comprar') ? 'vip-confirm' : 'vip-purchase-page'),
        ).toBeVisible();
        expect(await noHorizontalScroll(page)).toBe(true);
        expect(await axeViolations(page)).toEqual([]);
        await page.setViewportSize({ width: 1440, height: 900 });
        expect(await noHorizontalScroll(page)).toBe(true);
        expect(await axeViolations(page)).toEqual([]);
      });
    }
  });
}
