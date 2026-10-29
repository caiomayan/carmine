import type { Locator, Page } from '@playwright/test';
import { axeViolations, expect, saveTheme, settle, test } from './fixtures';
import {
  OTHER_ID,
  routePreviews,
  SERVER_ID,
  SIGNED_IN,
  SIGNED_OUT,
  UID_KNIFE,
  UID_RIFLE,
} from './header-previews';

/** O header com prévias (U3e): painéis ao passar o mouse, no computador (a partir de 1024 px). */

const PANELS = {
  Jogar: 'play',
  Loadout: 'loadout',
  Inventário: 'inventory',
  Ranking: 'ranking',
} as const;

const nav = (page: Page) => page.getByRole('navigation', { name: 'Principal' });
const link = (page: Page, name: keyof typeof PANELS) =>
  nav(page).getByRole('link', { name, exact: true });
const panel = (page: Page, name: keyof typeof PANELS) => page.getByTestId(`panel-${PANELS[name]}`);

/** Espera o React hidratar o primeiro item (a aproximação só vale depois disso). */
async function hydrated(page: Page) {
  await page.waitForFunction(() => {
    const el = document.querySelector('header nav a');
    return !!el && Object.keys(el).some((key) => key.startsWith('__reactProps'));
  });
}

async function open(page: Page, name: keyof typeof PANELS) {
  await link(page, name).hover();
  await expect(panel(page, name)).toBeVisible();
}

/** Abre o painel, clica no destino e espera a URL. */
async function goes(
  page: Page,
  name: keyof typeof PANELS,
  target: (p: Page) => Locator,
  url: RegExp,
) {
  await page.goto('/ranking');
  await hydrated(page);
  await open(page, name);
  await target(page).click();
  await expect(page).toHaveURL(url);
}

test.describe('abrir, trocar e fechar', () => {
  test.beforeEach(async ({ page }) => {
    await routePreviews(page);
    await page.goto('/inventory/add');
    await hydrated(page);
  });

  test('passar o mouse num item abre a prévia daquela área, e sair do menu fecha', async ({
    page,
  }) => {
    await open(page, 'Jogar');
    await expect(page.getByTestId('preview-play')).toContainText('Retake · Rotação');
    await expect(page.getByTestId('preview-play')).toContainText('Seus amigos estão aqui');

    await page.mouse.move(10, 400);
    await expect(page.getByTestId('header-viewport')).toBeHidden();
  });

  test('ir de um item a outro desliza na direção do movimento e ajusta a altura', async ({
    page,
  }) => {
    await open(page, 'Jogar');
    const viewport = page.getByTestId('header-viewport');
    const playHeight = (await viewport.boundingBox())?.height ?? 0;

    await link(page, 'Inventário').hover();
    await expect(panel(page, 'Inventário')).toBeVisible();
    // Para a direita: o painel novo entra pelo fim.
    await expect(panel(page, 'Inventário')).toHaveAttribute('data-motion', 'from-end');
    await expect.poll(async () => (await viewport.boundingBox())?.height ?? 0).not.toBe(playHeight);

    await link(page, 'Loadout').hover();
    // Para a esquerda: entra pelo começo.
    await expect(panel(page, 'Loadout')).toHaveAttribute('data-motion', 'from-start');
  });

  test('clicar no nome do item navega para a página, e a pílula marca onde se está', async ({
    page,
  }) => {
    await open(page, 'Ranking');
    await link(page, 'Ranking').click();

    await expect(page).toHaveURL(/\/ranking$/);
    await expect(link(page, 'Ranking')).toHaveAttribute('aria-current', 'page');
    // Navegou: o painel fecha.
    await expect(page.getByTestId('header-viewport')).toBeHidden();
  });

  test('o painel só carrega no primeiro hover, junto com os dados', async ({ page }) => {
    const calls = await routePreviews(page);
    const scripts: string[] = [];
    page.on('response', (response) => {
      if (response.url().endsWith('.js')) scripts.push(response.url());
    });
    await page.goto('/inventory/add');
    await hydrated(page);
    await settle(page);
    const before = scripts.length;
    expect(calls).toHaveLength(0);

    await open(page, 'Jogar');

    expect(scripts.length).toBeGreaterThan(before);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]).toContain('side=ct');
  });

  test('usa o último lado do Loadout que o navegador guarda', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('carmine:loadout-side', 't'));
    const calls = await routePreviews(page);
    await page.goto('/inventory/add');
    await hydrated(page);

    await open(page, 'Loadout');

    expect(calls[0]).toContain('side=t');
  });
});

test.describe('quem entrou: tudo dentro do painel é clicável', () => {
  test.beforeEach(async ({ page }) => {
    await routePreviews(page, SIGNED_IN);
    // Só as prévias são de mentira; a sessão não. O editor de Item manda quem não entrou para
    // /login, e o `toHaveURL` só via /inventory/<uid> se pegasse a URL antes desse redirect (uma
    // corrida contra a navegação). O destino aqui só precisa existir.
    await page.route(/\/inventory\/[0-9a-f-]{36}(\?.*)?$/, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><title>Item</title>',
      }),
    );
  });

  test('Jogar: o servidor, o amigo e os outros levam ao cartão ou ao Perfil', async ({ page }) => {
    await goes(
      page,
      'Jogar',
      (p) => p.getByTestId('preview-server-link'),
      new RegExp(`/#servidor-${SERVER_ID}$`),
    );
    await goes(page, 'Jogar', (p) => p.getByTestId('preview-friend'), /\/10016$/);
    await goes(
      page,
      'Jogar',
      (p) => p.getByTestId('preview-other').first(),
      new RegExp(`/#servidor-${OTHER_ID}$`),
    );
  });

  test('Jogar: mostra o motivo, a lotação, os amigos jogando e o botão Jogar do Steam', async ({
    page,
  }) => {
    await page.goto('/ranking');
    await hydrated(page);
    await open(page, 'Jogar');

    const join = page.getByTestId('preview-join');
    await expect(join).toHaveAttribute('href', 'steam://connect/203.0.113.10:27015');
    await expect(page.getByTestId('preview-play')).toContainText('7/9');
    await expect(page.getByTestId('preview-friends-count')).toContainText('2 amigos jogando agora');
    await expect(page.getByTestId('preview-other')).toHaveCount(2);
    await expect(page.getByTestId('preview-copy')).toBeVisible();
  });

  test('Loadout: cada Item leva ao editor, o slot vazio ao /loadout, e o Preset aparece', async ({
    page,
  }) => {
    await goes(
      page,
      'Loadout',
      (p) => p.locator('[data-slot-name="knife"]'),
      new RegExp(`/inventory/${UID_KNIFE}$`),
    );
    await goes(
      page,
      'Loadout',
      (p) => p.locator('[data-slot-name="weapon_m4a1_silencer"]'),
      new RegExp(`/inventory/${UID_RIFLE}$`),
    );
    await goes(page, 'Loadout', (p) => p.locator('[data-slot-name="gloves"]'), /\/loadout$/);

    await page.goto('/ranking');
    await hydrated(page);
    await open(page, 'Loadout');
    await expect(page.getByTestId('preview-loadout')).toContainText('Preset Principal');
    await expect(page.getByTestId('preview-loadout')).toHaveAttribute('data-side', 'ct');
    await expect(page.getByTestId('preview-slot')).toHaveCount(4);
  });

  test('Inventário: os últimos Itens levam ao editor e "Adicionar skin" ao catálogo', async ({
    page,
  }) => {
    await goes(
      page,
      'Inventário',
      (p) => p.getByTestId('preview-item').first(),
      new RegExp(`/inventory/${UID_RIFLE}$`),
    );
    await goes(page, 'Inventário', (p) => p.getByTestId('preview-add'), /\/inventory\/add$/);

    await page.goto('/ranking');
    await hydrated(page);
    await open(page, 'Inventário');
    await expect(page.getByTestId('preview-total')).toHaveText('12 de 200 Itens');
  });

  test('Ranking: a minha posição leva à minha linha, o top 3 ao Perfil, o Perfil privado fica anônimo', async ({
    page,
  }) => {
    await goes(
      page,
      'Ranking',
      (p) => p.getByTestId('preview-mine').first(),
      /\/ranking\?modo=retake#minha-linha$/,
    );
    await goes(page, 'Ranking', (p) => p.getByTestId('preview-top-row').first(), /\/10016$/);

    await page.goto('/loadout');
    await hydrated(page);
    await open(page, 'Ranking');
    // O Perfil privado não leva a lugar nenhum.
    const privateRow = page.locator('[data-testid="preview-top-row"][data-private]');
    await expect(privateRow).toHaveCount(1);
    await expect(privateRow).toContainText('Jogador privado');
    expect(await privateRow.evaluate((el) => el.tagName)).not.toBe('A');
    // Sem posição ainda: quanto falta para entrar. E a contagem até a semana fechar.
    await expect(page.getByTestId('preview-mode').nth(1)).toContainText(
      'Faltam 12 minutos para entrar',
    );
    await expect(page.getByTestId('preview-countdown')).toContainText(/A semana fecha em 3 d/);
  });
});

test.describe('visitante', () => {
  test.beforeEach(async ({ page }) => {
    await routePreviews(page, SIGNED_OUT);
    await page.goto('/ranking');
    await hydrated(page);
  });

  test('Jogar: o mais cheio e "Entrar com a Steam"', async ({ page }) => {
    await open(page, 'Jogar');

    await expect(page.getByTestId('preview-play')).toContainText('O mais cheio agora');
    await expect(page.getByTestId('preview-sign-in')).toHaveAttribute(
      'href',
      /\/api\/auth\/steam\/login/,
    );
  });

  test('Loadout: um exemplo e "Monte o seu"', async ({ page }) => {
    await open(page, 'Loadout');

    await expect(page.getByTestId('preview-loadout-example')).toBeVisible();
    await page.getByTestId('preview-build').click();
    await expect(page).toHaveURL(/\/loadout$/);
  });

  test('Inventário: o convite para entrar', async ({ page }) => {
    await open(page, 'Inventário');

    await expect(page.getByTestId('preview-inventory-signed-out')).toBeVisible();
    await expect(page.getByTestId('preview-sign-in')).toBeVisible();
  });

  test('Ranking: só o top 3 da semana', async ({ page }) => {
    await open(page, 'Ranking');

    await expect(page.getByTestId('preview-mine')).toHaveCount(0);
    await expect(page.getByTestId('preview-top-row').first()).toBeVisible();
  });
});

test.describe('estados', () => {
  test('com a leitura falhando, o painel diz que não carregou e "Tentar de novo" refaz', async ({
    page,
    expectedConsoleErrors,
  }) => {
    expectedConsoleErrors.push(/status of 503/);
    await routePreviews(page, SIGNED_IN, { status: 503 });
    await page.goto('/ranking');
    await hydrated(page);
    await open(page, 'Jogar');

    await expect(page.getByTestId('preview-error')).toContainText('Não deu para carregar agora');

    await page.unroute('**/header/previews**');
    await routePreviews(page, SIGNED_IN);
    await page.getByRole('button', { name: 'Tentar de novo' }).click();
    await expect(page.getByTestId('preview-play')).toBeVisible();
  });

  test('enquanto a leitura demora, mostra o carregando', async ({ page }) => {
    await routePreviews(page, SIGNED_IN, { delayMs: 700 });
    await page.goto('/ranking');
    await hydrated(page);

    await link(page, 'Jogar').hover();

    await expect(page.getByTestId('preview-loading')).toBeVisible();
    await expect(page.getByTestId('preview-play')).toBeVisible();
  });
});

test.describe('teclado', () => {
  /** Põe o foco no item (com a navegação rica já no lugar) sem passar pelo mouse. */
  async function focusItem(page: Page, name: keyof typeof PANELS) {
    await routePreviews(page);
    await page.goto('/inventory/add');
    await hydrated(page);
    await link(page, name).focus();
    await expect(page.getByTestId('header-nav')).toBeVisible();
    await expect(link(page, name)).toBeFocused();
  }

  test('seta para baixo abre o painel e leva o foco ao 1º alvo; Esc fecha e devolve o foco ao item', async ({
    page,
  }) => {
    await focusItem(page, 'Ranking');

    await page.keyboard.press('ArrowDown');
    await expect(panel(page, 'Ranking')).toBeVisible();
    await expect(panel(page, 'Ranking').locator(':focus')).toHaveCount(1);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('header-viewport')).toBeHidden();
    await expect(link(page, 'Ranking')).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/ranking$/);
  });

  test('o Tab só percorre os itens: não abre painel nem entra nele (U4 L2)', async ({ page }) => {
    await focusItem(page, 'Jogar');
    await expect(page.getByTestId('header-viewport')).toBeHidden();

    for (const next of ['Loadout', 'Inventário', 'Ranking'] as const) {
      await page.keyboard.press('Tab');
      await expect(link(page, next)).toBeFocused();
      await expect(page.getByTestId('header-viewport')).toBeHidden();
    }
  });

  test('dentro do painel o Tab e as setas percorrem os alvos; o Tab além do último fecha e segue para o próximo item', async ({
    page,
  }) => {
    await focusItem(page, 'Inventário');
    await page.keyboard.press('ArrowDown');
    await expect(panel(page, 'Inventário')).toBeVisible();

    const targets = await panel(page, 'Inventário').locator('a[href], button').count();
    expect(targets).toBeGreaterThan(1);
    // Percorre os alvos pelo Tab, sem sair do painel até o último.
    for (let i = 1; i < targets; i++) {
      await page.keyboard.press('Tab');
      await expect(panel(page, 'Inventário').locator(':focus')).toHaveCount(1);
    }
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('header-viewport')).toBeHidden();
    await expect(link(page, 'Ranking')).toBeFocused();
  });

  test('Shift+Tab no 1º alvo volta ao item, e o proxy de foco do Radix não é parada do Tab (U4 L1)', async ({
    page,
  }) => {
    await focusItem(page, 'Jogar');
    await page.keyboard.press('ArrowDown');
    await expect(panel(page, 'Jogar').locator(':focus')).toHaveCount(1);

    await expect(nav(page).locator('span[aria-hidden="true"][tabindex="0"]')).toHaveCount(0);
    await page.keyboard.press('Shift+Tab');
    await expect(link(page, 'Jogar')).toBeFocused();
  });

  test('o mouse continua abrindo no hover, sem tirar o foco de onde está', async ({ page }) => {
    await focusItem(page, 'Jogar');
    await link(page, 'Loadout').hover();
    await expect(panel(page, 'Loadout')).toBeVisible();
    await expect(panel(page, 'Loadout').locator(':focus')).toHaveCount(0);
  });
});

test.describe('celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('sem painel: o toque navega direto e nada é carregado', async ({ page }) => {
    const calls = await routePreviews(page);
    await page.goto('/');
    await hydrated(page);

    await link(page, 'Ranking').tap();

    await expect(page).toHaveURL(/\/ranking$/);
    expect(calls).toHaveLength(0);
    await expect(page.getByTestId('header-nav')).toHaveCount(0);
  });
});

test.describe('movimento reduzido', () => {
  test('entra só com fade, sem deslocamento', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await routePreviews(page);
    await page.goto('/ranking');
    await hydrated(page);

    await open(page, 'Jogar');
    await link(page, 'Inventário').hover();
    await expect(panel(page, 'Inventário')).toBeVisible();

    expect(
      await panel(page, 'Inventário').evaluate((el) => getComputedStyle(el).animationName),
    ).toBe('palette-fade-in');
  });
});

test.describe('acessibilidade', () => {
  for (const theme of ['dark', 'light'] as const) {
    for (const name of Object.keys(PANELS) as (keyof typeof PANELS)[]) {
      test(`o painel ${name} aberto, sem violações do axe (${theme})`, async ({ page }) => {
        await saveTheme(page, theme);
        await routePreviews(page, SIGNED_IN);
        await page.goto('/ranking');
        await hydrated(page);
        await open(page, name);
        await settle(page);

        expect(await axeViolations(page)).toEqual([]);
      });
    }
  }

  for (const theme of ['dark', 'light'] as const) {
    test(`depois do Tab e com o painel aberto pela seta, sem violações do axe (${theme})`, async ({
      page,
    }) => {
      await saveTheme(page, theme);
      await routePreviews(page, SIGNED_IN);
      await page.goto('/ranking');
      await hydrated(page);
      await link(page, 'Jogar').focus();
      await expect(page.getByTestId('header-nav')).toBeVisible();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('ArrowDown');
      await expect(panel(page, 'Jogar').locator(':focus')).toHaveCount(1);
      await settle(page);

      expect(await axeViolations(page)).toEqual([]);
    });
  }

  test('a navegação tem nome, o item atual é anunciado e o painel é um grupo nomeado pelo item', async ({
    page,
  }) => {
    await routePreviews(page);
    await page.goto('/ranking');
    await hydrated(page);
    await open(page, 'Loadout');

    await expect(link(page, 'Ranking')).toHaveAttribute('aria-current', 'page');
    // O Radix nomeia o painel pelo próprio item do menu (aria-labelledby).
    await expect(page.getByRole('group', { name: 'Loadout' })).toBeVisible();
    await expect(link(page, 'Loadout')).toHaveAttribute('aria-expanded', 'true');
  });
});
