import type { Page } from '@playwright/test';
import { axeViolations, expect, test } from './fixtures';

/**
 * O protótipo da direção do Painel da Staff (S25, PR A) em /dev/staff: uma vitrine que só existe com
 * CARMINE_UI_GALLERY=1 (dev local, E2E e homologação), com dados fictícios. Confere a casca (trilho, Ctrl+K), o Início
 * (hero, cartões, destaque), a tabela de Denúncias (filtro, ordenação, paginação, detalhe com a linha do tempo), as
 * Fotos e o celular de 390 px.
 */

const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

const nav = (page: Page, view: 'inicio' | 'denuncias' | 'fotos') =>
  page.getByTestId(`stp-nav-${view}`).click();

/** No celular o trilho vira as abas de baixo. */
const tab = (page: Page, label: 'Início' | 'Denúncias' | 'Fotos') =>
  page
    .getByRole('navigation', { name: 'Atalhos' })
    .getByRole('button', { name: new RegExp(`^${label}`) })
    .click();

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
    // O hero com a saudação e os cartões do Início da spec: online, servidores, denúncias, fotos, compras e as Salas.
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      /Bom dia|Boa tarde|Boa noite/,
    );
    const home = page.getByTestId('stp-home');
    for (const label of [
      'Jogadores online',
      'Servidores no ar',
      'Denúncias esperando',
      'Fotos denunciadas',
      'Compras hoje',
      'Salas ao vivo',
    ]) {
      await expect(home.getByRole('heading', { name: label, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('heading', { name: 'Alertas' })).toBeVisible();
    await expect(page.getByTestId('stp-pending').getByRole('button').first()).toContainText(
      /venceu há|restantes/,
    );
    // O valor do dia, com a parte decimal apagada.
    await expect(page.getByTestId('stp-sales')).toContainText('R$ 187,10');
  });

  test('os cartões levam à tela do assunto pelo botão ↗', async ({ page }) => {
    await page.getByRole('button', { name: 'Abrir Denúncias' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Denúncias');
    await nav(page, 'inicio');
    await page.getByRole('button', { name: 'Abrir Fotos' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Fotos denunciadas');
  });

  test('os chips de Modo trocam os números do Início; as Salas ainda não existem', async ({
    page,
  }) => {
    const online = page.getByTestId('stp-online');
    await expect(online).toHaveText('142');
    await page.getByTestId('stp-mode-retake').click();
    await expect(page.getByTestId('stp-mode-retake')).toHaveAttribute('aria-pressed', 'true');
    await expect(online).toHaveText('91');
    await page.getByTestId('stp-mode-rooms').click();
    await expect(page.getByText('As Salas chegam com a S23.')).toBeVisible();
  });

  test('o cartão de denúncias vira destaque cheio quando algo passa de 20 h', async ({ page }) => {
    await expect(page.getByTestId('stp-card-reports')).toHaveAttribute('data-hl', '');
    await expect(page.getByTestId('stp-card-photos')).not.toHaveAttribute('data-hl', '');
  });

  test('o trilho recolhe (botão e tecla [) e guarda os nomes nos botões', async ({ page }) => {
    const panel = page.getByTestId('stp');
    await expect(panel).not.toHaveAttribute('data-collapsed', /.*/);
    await page.getByTestId('stp-collapse').click();
    await expect(panel).toHaveAttribute('data-collapsed', '');
    await expect(page.getByTestId('stp-nav-denuncias')).toHaveAttribute('aria-label', 'Denúncias');
    // Recolhido, o trilho fica mais fino.
    const width = await page
      .getByTestId('stp-nav-inicio')
      .evaluate((el) => el.getBoundingClientRect().width);
    expect(width).toBeLessThan(40);
    await page.keyboard.press('[');
    await expect(panel).not.toHaveAttribute('data-collapsed', /.*/);
  });

  test('Ctrl+K abre a paleta do painel (não a busca do site), busca e navega', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const palette = page.getByTestId('stp-palette');
    await expect(palette).toBeVisible();
    await expect(page.getByTestId('search-palette')).toHaveCount(0);
    await page.keyboard.type('foto');
    await expect(palette.getByRole('option').first()).toContainText(/foto/i);
    await page.keyboard.press('Enter');
    await expect(palette).toBeHidden();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Fotos denunciadas');
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

    test('filtros: busca, abas de status e "vencem em 3 h" reduzem a lista, e limpar volta', async ({
      page,
    }) => {
      await page.getByTestId('stp-query').fill('retake #1');
      await expect(page.getByTestId('stp-range')).toHaveText('1–8 de 10');
      await page.getByTestId('stp-query').fill('nao-existe-este-nome');
      await expect(page.getByTestId('stp-empty')).toBeVisible();
      await expect(page.getByTestId('stp-range')).toHaveText('0–0 de 0');
      await page.getByRole('button', { name: 'Limpar' }).click();
      await expect(page.getByTestId('stp-range')).toHaveText('1–8 de 37');

      await page.getByTestId('stp-tab-done').click();
      await expect(page.getByTestId('stp-tab-done')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('stp-range')).toHaveText('1–3 de 3');
      await page.getByTestId('stp-tab-all').click();

      await page.getByTestId('stp-urgent').click();
      await expect(page.getByTestId('stp-urgent')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('stp-range')).toHaveText('1–2 de 2');
    });

    test('abre o detalhe ao lado com a linha do tempo, resolve e a fila diminui', async ({
      page,
    }) => {
      const badge = page.getByTestId('stp-nav-denuncias').locator('.stp-badge');
      await expect(badge).toHaveText('34');
      await page.getByTestId('stp-row').first().click();
      const detail = page.getByTestId('stp-detail');
      await expect(detail).toBeVisible();
      await expect(detail.getByRole('list', { name: 'Linha do tempo da denúncia' })).toBeVisible();
      await expect(detail.getByText('Denúncia recebida')).toBeVisible();
      await expect(detail.getByText('Fim do prazo de revisão')).toBeVisible();
      await detail.getByRole('button', { name: 'Resolver' }).click();
      await expect(detail).toBeHidden();
      await expect(page.getByTestId('stp-toast')).toContainText('resolvida');
      await expect(badge).toHaveText('33');
    });
  });

  test('Fotos: manter tira da fila e Desfazer devolve', async ({ page }) => {
    await nav(page, 'fotos');
    await expect(page.getByTestId('stp-photo')).toHaveCount(6);
    await page.getByTestId('stp-photo').first().getByRole('button', { name: 'Manter' }).click();
    await expect(page.getByTestId('stp-photo')).toHaveCount(5);
    await page.getByTestId('stp-toast').getByRole('button', { name: 'Desfazer' }).click();
    await expect(page.getByTestId('stp-photo')).toHaveCount(6);
  });

  test('Fotos: a fila vazia explica', async ({ page }) => {
    await nav(page, 'fotos');
    for (let i = 0; i < 6; i++) {
      await page.getByTestId('stp-photo').first().getByRole('button', { name: 'Remover' }).click();
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
    await tab(page, 'Denúncias');
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
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(389);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThanOrEqual(843);
  });

  test('o Início cabe em 390 px, com o hero e os chips de Modo', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      /Bom dia|Boa tarde|Boa noite/,
    );
    await expect(page.getByTestId('stp-mode-retake')).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
    const overflow = await page.evaluate(() => {
      const main = document.getElementById('stp-content');
      return main ? main.scrollWidth - main.clientWidth : 0;
    });
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('Fotos no celular: um cartão por linha com os botões grandes', async ({ page }) => {
    await tab(page, 'Fotos');
    await expect(page.getByTestId('stp-photos')).toBeVisible();
    const keep = page.getByTestId('stp-photo').first().getByRole('button', { name: 'Manter' });
    expect((await keep.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect(await noHorizontalScroll(page)).toBe(true);
  });
});

for (const theme of ['dark', 'light'] as const) {
  for (const width of [1440, 390]) {
    test(`acessibilidade: Início, Denúncias, Fotos, detalhe e paleta (${theme}, ${width} px)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto('/dev/staff');
      await expect(page.getByTestId('stp')).toBeVisible();
      if (theme === 'light') await page.getByTestId('stp-theme').click();
      const go = async (view: 'inicio' | 'denuncias' | 'fotos') => {
        if (width === 390) {
          await tab(
            page,
            { inicio: 'Início', denuncias: 'Denúncias', fotos: 'Fotos' }[view] as 'Início',
          );
        } else await nav(page, view);
      };
      for (const view of ['inicio', 'denuncias', 'fotos'] as const) {
        await go(view);
        expect(await axeViolations(page), `${view}`).toEqual([]);
      }
      await go('denuncias');
      if (width === 390) await page.getByTestId('stp-cards').getByRole('button').first().click();
      else await page.getByTestId('stp-row').first().click();
      await expect(page.getByTestId('stp-detail')).toBeVisible();
      expect(await axeViolations(page), 'detalhe').toEqual([]);
      if (width === 390) await page.keyboard.press('Escape');
      await page.getByTestId('stp-search').click();
      await expect(page.getByTestId('stp-palette')).toBeVisible();
      expect(await axeViolations(page), 'paleta').toEqual([]);
    });
  }
}
