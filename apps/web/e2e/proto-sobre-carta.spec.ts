import { axeViolations, expect, saveTheme, test } from './fixtures';

/**
 * Os protótipos do Sobre em formato de filme (/dev/sobre) e da carta do jogador (/dev/carta): vitrines que só
 * existem com CARMINE_UI_GALLERY=1 (dev local, E2E e homologação). O Sobre é a única página com GSAP; a carta é a
 * única com three.js.
 */

const noHorizontalScroll = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe('Sobre em formato de filme', () => {
  test('o GSAP monta o filme: papel amassado na abertura, cenas presas e o trilho de cenas', async ({
    page,
  }) => {
    await page.goto('/dev/sobre');
    const sobre = page.getByTestId('sobre');
    await expect(sobre).toHaveClass(/is-film/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Saint\s*Carmine/);
    // 9 × 6 células, dois cacos por célula.
    await expect(page.locator('.sb-shard')).toHaveCount(108);
    // A abertura e os Modos grudam na tela enquanto a rolagem conta a cena.
    await expect(page.locator('.pin-spacer')).toHaveCount(2);

    // Rolando a abertura inteira, o papel sai e o título vira branco sobre o mapa.
    const title = page.locator('.sb-title');
    await expect(title).toHaveCSS('color', 'rgb(23, 22, 19)');
    await page.evaluate(() => window.scrollTo(0, 1500));
    await expect
      .poll(() => title.evaluate((el) => getComputedStyle(el).color), { timeout: 8000 })
      .toBe('rgb(255, 255, 255)');
    await expect(page.locator('.sb-shard').first()).toHaveCSS('opacity', '0');
  });

  test('o Spotlight Text: o foco segue o ponteiro (a camada clara é a que o leitor de tela não lê)', async ({
    page,
  }) => {
    await page.goto('/dev/sobre');
    const text = page.getByTestId('spotlight');
    await text.scrollIntoViewIfNeeded();
    await expect(text.locator('.sb-spot-lit')).toHaveAttribute('aria-hidden', 'true');
    const box = await text.boundingBox();
    if (!box) throw new Error('sem caixa');
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4);
    await expect
      .poll(() => text.evaluate((el) => el.style.getPropertyValue('--sx')))
      .toMatch(/^\d+(\.\d+)?%$/);
  });

  test.describe('com movimento reduzido', () => {
    test.use({ reducedMotion: 'reduce' });

    test('a página é estática e inteira legível: sem filme, sem papel, sem cena presa', async ({
      page,
    }) => {
      await page.goto('/dev/sobre');
      await expect(page.getByTestId('sobre')).not.toHaveClass(/is-film/);
      await expect(page.locator('.pin-spacer')).toHaveCount(0);
      // O texto aparece por completo (a camada apagada vira a única, com opacidade total).
      await expect(page.locator('.sb-spot-base')).toHaveCSS('opacity', '1');
      await expect(page.locator('.sb-spot-lit')).toBeHidden();
      for (const name of [
        /Dois Modos, o mesmo Loadout/i,
        'Toda segunda, o placar zera.',
        'O servidor acorda quando o primeiro entra.',
        'Servidor lotado? O VIP entra.',
        'Pronto para jogar?',
      ]) {
        await expect(page.getByRole('heading', { name })).toBeAttached();
      }
      // As duas cenas de Modo aparecem uma depois da outra, nada escondido por opacidade.
      await expect(page.locator('.sb-mode')).toHaveCount(2);
      for (const mode of await page.locator('.sb-mode').all()) {
        await expect(mode).toHaveCSS('opacity', '1');
      }
    });
  });
});

for (const theme of ['dark', 'light'] as const) {
  test.describe(`Sobre: acessibilidade e 390 px (${theme})`, () => {
    test('estático (movimento reduzido): axe sem violações, sem rolagem lateral em 390 e 1440', async ({
      browser,
    }) => {
      const context = await browser.newContext({ reducedMotion: 'reduce' });
      const page = await context.newPage();
      await saveTheme(page, theme);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/dev/sobre');
      await expect(page.getByTestId('sobre')).toBeVisible();
      expect(await noHorizontalScroll(page)).toBe(true);
      expect(await axeViolations(page)).toEqual([]);
      await page.setViewportSize({ width: 1440, height: 900 });
      expect(await noHorizontalScroll(page)).toBe(true);
      expect(await axeViolations(page)).toEqual([]);
      await context.close();
    });

    test('com o filme montado: sem rolagem lateral em 390', async ({ page }) => {
      await saveTheme(page, theme);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/dev/sobre');
      await expect(page.getByTestId('sobre')).toHaveClass(/is-film/);
      expect(await noHorizontalScroll(page)).toBe(true);
    });
  });
}

/** Largura e altura de um PNG, lidas do cabeçalho (IHDR). */
function pngSize(bytes: Buffer) {
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

test.describe('Carta do jogador', () => {
  test('a imagem compartilhável: um PNG no tamanho de cada rede', async ({ request }) => {
    const expected = {
      cartao: { width: 1080, height: 1350 },
      story: { width: 1080, height: 1920 },
      og: { width: 1200, height: 630 },
    };
    for (const [format, size] of Object.entries(expected)) {
      const response = await request.get(`/dev/carta/imagem?formato=${format}`, {
        timeout: 60_000,
      });
      expect(response.status(), format).toBe(200);
      expect(response.headers()['content-type']).toBe('image/png');
      expect(pngSize(await response.body())).toEqual(size);
    }
    // O Perfil privado e o Deathmatch também geram imagem.
    for (const query of ['formato=og&privado=1', 'formato=cartao&modo=deathmatch']) {
      const response = await request.get(`/dev/carta/imagem?${query}`, { timeout: 60_000 });
      expect(response.status(), query).toBe(200);
    }
  });

  test('a página: formatos, privacidade, og:image e o botão de compartilhar', async ({ page }) => {
    await page.goto('/dev/carta');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('A sua carta da semana');
    const image = page.getByTestId('carta-imagem');
    await expect(image).toHaveAttribute('src', '/dev/carta/imagem?formato=cartao&modo=retake');
    await expect(page.getByTestId('carta-compartilhar')).toBeVisible();
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      /\/dev\/carta\/imagem\?formato=og&modo=retake$/,
    );

    await page.getByRole('link', { name: 'Story', exact: true }).click();
    await expect(image).toHaveAttribute('src', '/dev/carta/imagem?formato=story&modo=retake');
    await page.getByRole('link', { name: 'Perfil privado' }).click();
    await expect(image).toHaveAttribute(
      'src',
      '/dev/carta/imagem?formato=story&modo=retake&privado=1',
    );
    // O ID público nunca aparece na carta nem na página.
    await expect(page.getByTestId('carta')).not.toContainText(/#\d{2,}/);
  });

  test('o Lanyard: three.js só aqui; com WebGL o cartão pende e balança, sem ele a imagem parada', async ({
    page,
  }) => {
    await page.goto('/dev/carta');
    const stage = page.getByTestId('lanyard');
    await expect(stage).toHaveAttribute('data-mode', /live|static/, { timeout: 30_000 });
    if ((await stage.getAttribute('data-mode')) === 'live') {
      await expect(stage.locator('canvas')).toBeVisible();
    } else {
      await expect(stage.locator('img.lc-static')).toBeVisible();
    }
  });

  test.describe('com movimento reduzido', () => {
    test.use({ reducedMotion: 'reduce' });

    test('o cartão aparece parado, como imagem (a mesma que vai para o WhatsApp)', async ({
      page,
    }) => {
      await page.goto('/dev/carta');
      const stage = page.getByTestId('lanyard');
      await expect(stage).toHaveAttribute('data-mode', 'static');
      await expect(stage.locator('canvas')).toHaveCount(0);
      await expect(stage.locator('img.lc-static')).toBeVisible();
    });
  });
});

for (const theme of ['dark', 'light'] as const) {
  test.describe(`Carta: acessibilidade e 390 px (${theme})`, () => {
    test('axe sem violações e sem rolagem lateral em 390 e 1440 (cartão parado)', async ({
      browser,
    }) => {
      const context = await browser.newContext({ reducedMotion: 'reduce' });
      const page = await context.newPage();
      await saveTheme(page, theme);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/dev/carta');
      await expect(page.getByTestId('lanyard')).toHaveAttribute('data-mode', 'static');
      expect(await noHorizontalScroll(page)).toBe(true);
      expect(await axeViolations(page)).toEqual([]);
      await page.setViewportSize({ width: 1440, height: 900 });
      expect(await noHorizontalScroll(page)).toBe(true);
      expect(await axeViolations(page)).toEqual([]);
      await context.close();
    });
  });
}
