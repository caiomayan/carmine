import type { Page } from '@playwright/test';
import { expect, saveTheme, test } from './fixtures';
import { fakeServer, routeLiveServers } from './live-servers';

/** Acabamento dos cartões da home (U3c-4): o botão "Offline (n)" e o fundo do cartão de servidor. */

const row = (page: Page, name: string) => page.locator(`li[data-server="${name}"]`);

for (const theme of ['dark', 'light'] as const) {
  for (const width of [390, 1440]) {
    test(`o botão "Offline (n)" cabe na caixa do conteúdo, sem corte nem no hover (${theme}, ${width} px)`, async ({
      page,
    }) => {
      await saveTheme(page, theme);
      await page.setViewportSize({ width, height: 900 });
      await routeLiveServers(page, [
        fakeServer({ name: 'fixo-no-ar' }),
        ...[1, 2, 3].map((n) =>
          fakeServer({
            name: `fixo-off-${n}`,
            state: 'offline',
            players: 0,
            map: null,
            lastHeartbeatAt: null,
          }),
        ),
      ]);
      await page.goto('/');
      const toggle = page.getByTestId('offline-group').getByRole('button', { name: 'Offline (3)' });
      await expect(toggle).toBeVisible();
      // O fundo do hover é o que aparece cortado quando o botão passa da borda do conteúdo.
      await toggle.hover();

      const result = await toggle.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const container = el.closest('.container-page')?.getBoundingClientRect();
        // Um ponto colado em cada borda do botão: se algum pai o recorta, o ponto cai em outro elemento.
        const y = box.top + box.height / 2;
        const hit = (x: number) => {
          const found = document.elementFromPoint(x, y);
          return found !== null && el.contains(found);
        };
        return {
          container: container ? { left: container.left, right: container.right } : null,
          left: box.left,
          right: box.right,
          leftEdgeVisible: hit(box.left + 1),
          rightEdgeVisible: hit(box.right - 1),
        };
      });
      expect(result.container, 'o botão está dentro de um container da página').not.toBeNull();
      expect(result.left).toBeGreaterThanOrEqual((result.container?.left ?? 0) - 0.5);
      expect(result.right).toBeLessThanOrEqual((result.container?.right ?? 0) + 0.5);
      expect(result.leftEdgeVisible, 'a borda esquerda do fundo não está cortada').toBe(true);
      expect(result.rightEdgeVisible, 'a borda direita do fundo não está cortada').toBe(true);
    });
  }
}

for (const theme of ['dark', 'light'] as const) {
  test(`o cartão de servidor recorta a imagem e o escurecido numa camada só, sem filete no zoom (${theme})`, async ({
    page,
  }) => {
    await saveTheme(page, theme);
    await page.setViewportSize({ width: 1440, height: 900 });
    await routeLiveServers(page, [fakeServer({ name: 'fixo-camada', map: 'de_mirage' })]);
    await page.goto('/');
    const card = row(page, 'fixo-camada');
    await expect(card).toBeVisible();

    // A causa do filete: o cartão tinha fundo e anel próprios por baixo de uma imagem que, escalada,
    // vira camada própria e deixa a borda antialiased à mostra. Com arte, o cartão não tem nenhum dos dois.
    await expect(card).toHaveCSS('box-shadow', 'none');
    await expect(card).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(card).toHaveCSS('overflow', 'hidden');
    await expect(card.locator('picture')).toHaveCount(1);
    await expect(card.locator('.vh-wash')).toHaveCount(1);

    // Imagem e escurecido passam 1 px da borda do cartão: nenhum subpixel deixa vão.
    const bleed = await card.evaluate((el) => {
      const cardBox = el.getBoundingClientRect();
      const inner = (selector: string) => {
        const box = el.querySelector(selector)?.getBoundingClientRect();
        return box
          ? {
              left: cardBox.left - box.left,
              top: cardBox.top - box.top,
              right: box.right - cardBox.right,
              bottom: box.bottom - cardBox.bottom,
            }
          : null;
      };
      return { picture: inner('picture'), wash: inner('.vh-wash') };
    });
    for (const [name, sides] of Object.entries(bleed)) {
      expect(sides, name).not.toBeNull();
      for (const [side, value] of Object.entries(sides ?? {})) {
        expect(value, `${name}: ${side}`).toBeGreaterThanOrEqual(0.9);
      }
    }

    // No meio do zoom do hover (a transição dura 600 ms): a imagem fica anexada para conferir a borda.
    await card.hover();
    await page.waitForTimeout(250);
    await test.info().attach(`cartao-no-meio-do-zoom-${theme}`, {
      body: await card.screenshot(),
      contentType: 'image/png',
    });
  });
}
