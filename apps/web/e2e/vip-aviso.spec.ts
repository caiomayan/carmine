import type { Page } from '@playwright/test';
import { grantVip, newSteamId, revokeVip, signInFromHeader } from './accounts';
import { axeViolations, expect, saveTheme, test } from './fixtures';

/**
 * A faixa do fim do VIP em todas as páginas (S14b): só nos 3 dias antes do fim e no dia, com o link para os Pacotes,
 * dispensável por dia, vinda do servidor (sem empurrar a página). `grantVip` com 1 dia acaba amanhã: `ending_soon`.
 */

const KEY = 'carmine:vip-ending';

/** Entra com uma Conta nova e dá VIP por `days`; fica numa página sem a faixa própria (o Ranking). */
async function signInWithVip(page: Page, days: number | null) {
  const steamId = newSteamId();
  await page.goto('/ranking');
  await signInFromHeader(page, steamId);
  await expect(page.getByTestId('account-menu')).toBeVisible();
  if (days !== null) grantVip(steamId, days);
  await page.reload();
  return steamId;
}

const band = (page: Page) => page.getByTestId('vip-ending');

test.describe('faixa do fim do VIP', () => {
  test('aparece com o link para os Pacotes e já vem no HTML do servidor', async ({ page }) => {
    await signInWithVip(page, 1);
    await expect(band(page)).toBeVisible();
    await expect(band(page)).toHaveAttribute('data-notice', 'ending_soon');
    await expect(band(page)).toContainText('Seu VIP acaba em');
    await expect(page.getByTestId('vip-ending-link')).toHaveAttribute('href', '/plans');

    // Sem layout shift: a faixa está no HTML que o servidor mandou, não nasce depois da hidratação.
    const html = await (await page.request.get('/ranking')).text();
    expect(html).toContain('data-testid="vip-ending"');
    expect(html).toContain('Seu VIP acaba em');
  });

  test('o link leva à página dos Pacotes', async ({ page }) => {
    await signInWithVip(page, 1);
    await page.getByTestId('vip-ending-link').click();
    await expect(page).toHaveURL(/\/vip$/);
    // No /plans, que já fala do VIP, a faixa não repete.
    await expect(band(page)).toHaveCount(0);
  });

  test('não aparece sem VIP', async ({ page }) => {
    await signInWithVip(page, null);
    await expect(band(page)).toHaveCount(0);
  });

  test('não aparece com o fim do VIP longe (mais de 3 dias)', async ({ page }) => {
    await signInWithVip(page, 5);
    await expect(band(page)).toHaveCount(0);
  });

  test('não aparece depois que o VIP acabou: o "acabou hoje" fica só no Loadout', async ({
    page,
  }) => {
    const steamId = await signInWithVip(page, 1);
    await expect(band(page)).toBeVisible();
    revokeVip(steamId);
    await page.reload();
    await expect(band(page)).toHaveCount(0);
  });

  test('não repete no Loadout, que já tem o próprio aviso', async ({ page }) => {
    await signInWithVip(page, 1);
    await page.goto('/loadout');
    await expect(page.getByTestId('vip-notice')).toBeVisible();
    await expect(band(page)).toHaveCount(0);
  });

  test('dispensar esconde por hoje, no recarregamento e na navegação', async ({ page }) => {
    await signInWithVip(page, 1);
    await expect(band(page)).toBeVisible();
    await page.getByTestId('vip-ending-dismiss').click();
    await expect(band(page)).toBeHidden();
    expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toMatch(
      /^\d{4}-\d{2}-\d{2}\|ending_soon$/,
    );

    // Recarregar: continua escondida (o script a esconde antes da primeira pintura).
    await page.reload();
    await expect(band(page)).toBeHidden();

    // Navegar dentro do site (passando por uma página sem a faixa): continua escondida ao voltar.
    await page.goto('/loadout');
    await page.getByRole('link', { name: 'Ranking' }).first().click();
    await expect(page).toHaveURL(/\/ranking/);
    await expect(band(page)).toBeHidden();
  });

  test('volta no dia seguinte e no dia do fim (outro aviso)', async ({ page }) => {
    await signInWithVip(page, 1);
    await page.getByTestId('vip-ending-dismiss').click();
    await expect(band(page)).toBeHidden();

    // Dispensada ontem: hoje a faixa volta.
    await page.evaluate((key) => localStorage.setItem(key, '2000-01-01|ending_soon'), KEY);
    await page.reload();
    await expect(band(page)).toBeVisible();

    // Dispensada hoje, mas para o aviso do dia do fim: este aviso é outro, a faixa aparece.
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
      key: KEY,
      value: `${today}|ending_today`,
    });
    await page.reload();
    await expect(band(page)).toBeVisible();
  });

  test('sem localStorage, a faixa aparece e dispensar não quebra', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new Error('bloqueado');
        },
      });
    });
    await signInWithVip(page, 1);
    await expect(band(page)).toBeVisible();
    await page.getByTestId('vip-ending-dismiss').click();
    await expect(band(page)).toBeHidden();
  });

  test('dispensada, a faixa nunca chega a ser pintada no recarregamento (sem piscar nem empurrar a página)', async ({
    page,
  }) => {
    await signInWithVip(page, 1);
    await page.getByTestId('vip-ending-dismiss').click();
    await expect(band(page)).toBeHidden();

    // Anota o `display` da faixa nos primeiros quadros em que ela existe, antes de qualquer JavaScript do site.
    await page.addInitScript(() => {
      const seen: string[] = [];
      (window as unknown as { __bandFrames: string[] }).__bandFrames = seen;
      const tick = () => {
        const el = document.getElementById('vip-ending');
        if (el) {
          seen.push(getComputedStyle(el).display);
          if (seen.length >= 3) return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.reload();
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { __bandFrames: string[] }).__bandFrames.length),
      )
      .toBeGreaterThanOrEqual(3);
    const frames = await page.evaluate(
      () => (window as unknown as { __bandFrames: string[] }).__bandFrames,
    );
    expect(frames).toEqual(['none', 'none', 'none']);
  });
});

for (const theme of ['dark', 'light'] as const) {
  test(`faixa: acessibilidade e 390 px (${theme})`, async ({ page }) => {
    await saveTheme(page, theme);
    await signInWithVip(page, 1);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await expect(band(page)).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
      ).toBe(true);
      expect(await axeViolations(page)).toEqual([]);
    }
  });
}
