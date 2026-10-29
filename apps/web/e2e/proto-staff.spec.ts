import type { Page } from '@playwright/test';
import { axeViolations, expect, test } from './fixtures';

/**
 * O protótipo da direção do Painel da Staff (S25, PR A) em /dev/staff: uma vitrine que só existe com
 * CARMINE_UI_GALLERY=1 (dev local, E2E e homologação), com dados fictícios. Confere a casca (barra lateral, Ctrl+K),
 * o Início, a tabela de Denúncias (filtro, ordenação, paginação, painel de detalhe), as Fotos e o celular de 390 px.
 */

const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

const nav = (page: Page, view: 'inicio' | 'denuncias' | 'fotos') =>
  page.getByTestId(`stp-nav-${view}`).click();

test.describe('Painel da Staff (protótipo)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/dev/staff');
    await expect(page.getByTestId('stp')).toBeVisible();
  });

  test('o painel cobre a janela e o cabeçalho do site fica de fora', async ({ page }) => {
    await expect(page.getByTestId('stp-home')).toBeVisible();
    await expect(page.locator('[data-site-header]')).toBeHidden();
    await expect(page.locator('[data-site-footer]')).toBeHidden();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Início');
    // Os cartões do Início da spec: online, servidores, denúncias, fotos, compras e as Salas (que chegam depois).
    const home = page.getByTestId('stp-home');
    for (const label of [
      'Online agora',
      'Servidores no ar',
      'Denúncias esperando',
      'Fotos esperando',
      'Compras hoje',
      'Salas ao vivo',
    ]) {
      await expect(home.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(page.getByRole('heading', { name: 'Alertas' })).toBeVisible();
    await expect(page.getByTestId('stp-pending').getByRole('button').first()).toContainText(
      /venceu há|restantes/,
    );
  });

  test('os cartões levam à tela do assunto', async ({ page }) => {
    await page.getByRole('button', { name: /Denúncias esperando/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Denúncias');
    await nav(page, 'inicio');
    await page.getByRole('button', { name: /Fotos esperando/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Fotos de perfil');
  });

  test('a barra lateral recolhe (botão e tecla [) e guarda os nomes nos botões', async ({
    page,
  }) => {
    const panel = page.getByTestId('stp');
    await expect(panel).not.toHaveAttribute('data-collapsed', /.*/);
    await page.getByTestId('stp-collapse').click();
    await expect(panel).toHaveAttribute('data-collapsed', '');
    await expect(page.getByTestId('stp-nav-denuncias')).toHaveAttribute('aria-label', 'Denúncias');
    await page.keyboard.press('[');
    await expect(panel).not.toHaveAttribute('data-collapsed', /.*/);
  });

  test('Ctrl+K abre a paleta do painel (não a busca do site), busca e navega', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const palette = page.getByTestId('stp-palette');
    await expect(palette).toBeVisible();
    await expect(page.getByTestId('search-palette')).toHaveCount(0);
    await page.keyboard.type('foto');
    await expect(palette.getByRole('option').first()).toHaveText('Fotos de perfil');
    await page.keyboard.press('Enter');
    await expect(palette).toBeHidden();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Fotos de perfil');
    // Sem resultado, a paleta diz.
    await page.keyboard.press('Control+k');
    await page.keyboard.type('zzzzzz');
    await expect(palette.getByText('Nada encontrado')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(palette).toBeHidden();
  });

  test('o tema alterna entre escuro e claro', async ({ page }) => {
    const panel = page.getByTestId('stp');
    const before = await panel.evaluate((el) => getComputedStyle(el).backgroundColor);
    await page.getByTestId('stp-theme').click();
    await expect
      .poll(() => panel.evaluate((el) => getComputedStyle(el).backgroundColor))
      .not.toBe(before);
  });

  test.describe('Denúncias', () => {
    test.beforeEach(async ({ page }) => {
      await nav(page, 'denuncias');
      await expect(page.getByTestId('stp-reports')).toBeVisible();
    });

    test('tabela paginada: 8 por página, 37 no total', async ({ page }) => {
      await expect(page.getByTestId('stp-row')).toHaveCount(8);
      await expect(page.getByTestId('stp-range')).toHaveText('1–8 de 37');
      await page.getByRole('button', { name: 'Próxima página' }).click();
      await expect(page.getByTestId('stp-range')).toHaveText('9–16 de 37');
      await page.getByRole('button', { name: 'Página anterior' }).click();
      await expect(page.getByTestId('stp-range')).toHaveText('1–8 de 37');
    });

    test('ordenar pelo cabeçalho alterna a direção e anuncia aria-sort', async ({ page }) => {
      const header = page.getByRole('columnheader', { name: 'Denunciado' });
      await header.getByRole('button').click();
      await expect(header).toHaveAttribute('aria-sort', 'ascending');
      const first = async () =>
        (await page.getByTestId('stp-row').first().locator('td').nth(1).innerText()).toLowerCase();
      const ascending = await first();
      await header.getByRole('button').click();
      await expect(header).toHaveAttribute('aria-sort', 'descending');
      expect(await first()).not.toBe(ascending);
    });

    test('filtros: busca, status e "vencem em 3 h" reduzem a lista, e limpar volta', async ({
      page,
    }) => {
      await page.getByTestId('stp-query').fill('retake #1');
      await expect(page.getByTestId('stp-range')).toHaveText('1–8 de 10');
      await page.getByTestId('stp-query').fill('nao-existe-este-nome');
      await expect(page.getByTestId('stp-empty')).toBeVisible();
      await expect(page.getByTestId('stp-range')).toHaveText('0–0 de 0');
      await page.getByRole('button', { name: 'Limpar' }).click();
      await expect(page.getByTestId('stp-range')).toHaveText('1–8 de 37');

      await page.getByTestId('stp-status').selectOption('done');
      await expect(page.getByTestId('stp-range')).toHaveText('1–3 de 3');
      await page.getByTestId('stp-status').selectOption('all');

      await page.getByTestId('stp-urgent').click();
      await expect(page.getByTestId('stp-urgent')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('stp-range')).toHaveText('1–2 de 2');
    });

    test('abre o detalhe, resolve e a fila diminui', async ({ page }) => {
      const open = page.getByRole('button', { name: /Denúncias/ }).first();
      await expect(open.locator('.stp-count')).toHaveText('34');
      await page.getByTestId('stp-row').first().click();
      const detail = page.getByTestId('stp-detail');
      await expect(detail).toBeVisible();
      await detail.getByRole('button', { name: 'Resolver' }).click();
      await expect(detail).toBeHidden();
      await expect(page.getByTestId('stp-toast')).toContainText('resolvida');
      await expect(open.locator('.stp-count')).toHaveText('33');
    });
  });

  test('Fotos: aprovar tira da fila e Desfazer devolve', async ({ page }) => {
    await nav(page, 'fotos');
    await expect(page.getByTestId('stp-photo')).toHaveCount(6);
    await page.getByTestId('stp-photo').first().getByRole('button', { name: 'Aprovar' }).click();
    await expect(page.getByTestId('stp-photo')).toHaveCount(5);
    await page.getByTestId('stp-toast').getByRole('button', { name: 'Desfazer' }).click();
    await expect(page.getByTestId('stp-photo')).toHaveCount(6);
  });

  test('Fotos: a fila vazia explica', async ({ page }) => {
    await nav(page, 'fotos');
    for (let i = 0; i < 6; i++) {
      await page.getByTestId('stp-photo').first().getByRole('button', { name: 'Recusar' }).click();
    }
    await expect(page.getByTestId('stp-photos-empty')).toBeVisible();
  });
});

test.describe('Painel da Staff no celular (390 px)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dev/staff');
    await expect(page.getByTestId('stp')).toBeVisible();
  });

  test('Denúncias vira lista de cartões, sem rolagem lateral, e o detalhe sobe como folha', async ({
    page,
  }) => {
    expect(await noHorizontalScroll(page)).toBe(true);
    await page.getByRole('navigation', { name: 'Atalhos' }).getByText('Denúncias').click();
    await expect(page.getByTestId('stp-reports')).toBeVisible();
    await expect(page.getByTestId('stp-table')).toBeHidden();
    await expect(page.getByTestId('stp-cards')).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
    // O alvo de toque dos controles do celular: 40 px ou mais.
    const small = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.stp-chip, .stp-field, .stp-tab')]
        .filter((el) => el.offsetParent !== null)
        .map((el) => el.getBoundingClientRect().height)
        .filter((height) => height < 40),
    );
    expect(small).toEqual([]);

    await page.getByTestId('stp-cards').getByRole('button').first().click();
    const sheet = page.getByTestId('stp-detail');
    await expect(sheet).toBeVisible();
    const box = await sheet.boundingBox();
    expect(box?.width).toBe(390);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeCloseTo(844, 0);
  });

  test('Fotos no celular: um cartão por linha com os botões grandes', async ({ page }) => {
    await page.getByRole('navigation', { name: 'Atalhos' }).getByText('Fotos de perfil').click();
    await expect(page.getByTestId('stp-photos')).toBeVisible();
    const approve = page.getByTestId('stp-photo').first().getByRole('button', { name: 'Aprovar' });
    expect((await approve.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect(await noHorizontalScroll(page)).toBe(true);
  });
});

for (const theme of ['dark', 'light'] as const) {
  for (const width of [1440, 390]) {
    test(`acessibilidade: Início, Denúncias, Fotos e a paleta (${theme}, ${width} px)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto('/dev/staff');
      await expect(page.getByTestId('stp')).toBeVisible();
      if (theme === 'light') await page.getByTestId('stp-theme').click();
      const go = async (view: 'inicio' | 'denuncias' | 'fotos') => {
        if (width === 390) {
          const label = { inicio: 'Início', denuncias: 'Denúncias', fotos: 'Fotos de perfil' }[
            view
          ];
          await page.getByRole('navigation', { name: 'Atalhos' }).getByText(label).click();
        } else await nav(page, view);
      };
      for (const view of ['inicio', 'denuncias', 'fotos'] as const) {
        await go(view);
        expect(await axeViolations(page), `${view}`).toEqual([]);
      }
      await go('denuncias');
      await page
        .getByTestId(width === 390 ? 'stp-cards' : 'stp-table')
        .getByRole('button')
        .first()
        .click();
      await expect(page.getByTestId('stp-detail')).toBeVisible();
      expect(await axeViolations(page), 'detalhe').toEqual([]);
      await page.keyboard.press('Escape');
      await page.getByTestId('stp-search').click();
      await expect(page.getByTestId('stp-palette')).toBeVisible();
      expect(await axeViolations(page), 'paleta').toEqual([]);
    });
  }
}
