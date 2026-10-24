import { randomBytes } from 'node:crypto';
import type { Page } from '@playwright/test';
import {
  createUnclaimedAccount,
  csrfToken,
  grantStaffRole,
  newSteamId,
  signInByRequest,
} from './accounts';
import { axeViolations, expect, saveTheme, settle, test } from './fixtures';
import { createServer, heartbeat } from './live-servers';

/** A paleta de comandos (Ctrl+K, U3d). */

const palette = (page: Page) => page.getByTestId('search-palette');
const input = (page: Page) => page.getByTestId('palette-input');
const trigger = (page: Page) => page.getByTestId('search-trigger');

/** Espera o React hidratar o botão (o atalho e o clique só existem depois disso). */
async function hydrated(page: Page) {
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="search-trigger"]');
    return !!el && Object.keys(el).some((key) => key.startsWith('__reactProps'));
  });
}

async function openPalette(page: Page, path = '/') {
  await page.goto(path);
  await hydrated(page);
  await page.keyboard.press('Control+k');
  await expect(palette(page)).toBeVisible();
  await expect(input(page)).toBeFocused();
}

const unique = (prefix: string) => `${prefix}${randomBytes(3).toString('hex')}`;

test.describe('abrir e fechar', () => {
  test('Ctrl+K abre em qualquer página, Esc fecha e o foco volta para onde estava', async ({
    page,
  }) => {
    await page.goto('/ranking');
    await hydrated(page);
    await trigger(page).focus();

    await page.keyboard.press('Control+k');
    await expect(palette(page)).toBeVisible();
    await expect(input(page)).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(palette(page)).toBeHidden();
    await expect(trigger(page)).toBeFocused();
  });

  test('Ctrl+K de novo fecha a paleta', async ({ page }) => {
    await openPalette(page);

    await page.keyboard.press('Control+k');

    await expect(palette(page)).toBeHidden();
  });

  test('"/" abre quando nenhum campo está em foco; dentro de um campo, é só a barra', async ({
    page,
  }) => {
    await page.goto('/inventario/adicionar');
    await hydrated(page);
    const field = page
      .getByRole('searchbox')
      .or(page.getByPlaceholder(/buscar/i))
      .first();
    await field.click();
    await page.keyboard.type('a/b');
    await expect(palette(page)).toBeHidden();
    await expect(field).toHaveValue('a/b');

    await page.locator('main').click({ position: { x: 4, y: 4 } });
    await page.keyboard.press('/');
    await expect(palette(page)).toBeVisible();
  });

  test('o botão do cabeçalho abre a paleta', async ({ page }) => {
    await page.goto('/');
    await hydrated(page);

    await trigger(page).click();

    await expect(palette(page)).toBeVisible();
    await expect(trigger(page)).toHaveAttribute('aria-haspopup', 'dialog');
  });

  test('a paleta não entra na primeira carga: o JS dela só chega ao abrir', async ({ page }) => {
    const scripts: string[] = [];
    page.on('response', (response) => {
      if (response.url().endsWith('.js')) scripts.push(response.url());
    });
    await page.goto('/');
    await hydrated(page);
    await settle(page);
    const before = scripts.length;

    await page.keyboard.press('Control+k');
    await expect(palette(page)).toBeVisible();

    expect(scripts.length).toBeGreaterThan(before);
  });
});

test.describe('o que a paleta acha', () => {
  test('sem busca, mostra as páginas e ações; o visitante tem "Entrar", sem Sair nem Staff', async ({
    page,
  }) => {
    await openPalette(page);

    const list = page.getByTestId('palette-list');
    for (const name of ['Jogar', 'Inventário', 'Loadout', 'Ranking', 'Configurações']) {
      await expect(list.getByRole('option', { name: new RegExp(`^${name}`) })).toBeVisible();
    }
    await expect(list.getByRole('option', { name: /^Entrar/ })).toBeVisible();
    await expect(list.getByRole('option', { name: /^Usar tema/ })).toBeVisible();
    await expect(list.getByRole('option', { name: /^Sair/ })).toHaveCount(0);
    await expect(list.getByRole('option', { name: /^Painel da Staff/ })).toHaveCount(0);
  });

  test('uma página: digita, Enter e navega (sem acento, parcial, com erro de digitação)', async ({
    page,
  }) => {
    await openPalette(page);

    await input(page).fill('inventar');
    await expect(page.getByRole('option', { name: /^Inventário/ })).toBeVisible();
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/inventario$/);
    await expect(palette(page)).toBeHidden();

    await openPalette(page, '/inventario');
    await input(page).fill('rankign');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/ranking$/);
  });

  test('navegação por teclado: setas escolhem, Home e End pulam, Enter abre', async ({ page }) => {
    await openPalette(page);
    const options = page.getByTestId('palette-list').getByRole('option');
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('ArrowDown');
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('End');
    await expect(options.last()).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowDown');
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/loadout$/);
  });

  test('um Item do catálogo (em português e em inglês) leva à página de adicionar', async ({
    page,
  }) => {
    await openPalette(page);

    await input(page).fill('linhas vermelhas');
    const hit = page.getByTestId('palette-item').filter({ hasText: 'AK-47' }).first();
    await expect(hit).toBeVisible();
    await expect(page.getByTestId('palette-list')).toContainText('Catálogo');
    await hit.click();
    await expect(page).toHaveURL(/\/inventario\/adicionar\/222$/);

    await openPalette(page);
    await input(page).fill('redline');
    await expect(
      page.getByTestId('palette-item').filter({ hasText: 'AK-47' }).first(),
    ).toBeVisible();
  });

  test('um jogador pelo nome leva ao Perfil, sem nunca mostrar SteamID', async ({
    page,
    request,
  }) => {
    const name = unique('Quokka');
    const { publicId, steamId } = await createUnclaimedAccount(request, name);
    const bodies: string[] = [];
    page.on('response', async (response) => {
      if (response.url().includes('/api/players/search')) bodies.push(await response.text());
    });
    await openPalette(page);

    await input(page).fill(name.toLowerCase());
    const hit = page.getByTestId('palette-player').filter({ hasText: name });
    await expect(hit).toBeVisible();
    await expect(page.getByTestId('palette-list')).toContainText('Jogadores');
    expect(bodies.join('')).not.toContain(steamId);
    expect(bodies.join('')).toContain(String(publicId));
    await expect(palette(page)).not.toContainText(steamId);
    await hit.click();

    await expect(page).toHaveURL(new RegExp(`/${publicId}$`));
  });

  test('um servidor ao vivo pelo mapa leva ao cartão dele na home', async ({ page, request }) => {
    const server = createServer();
    await heartbeat(request, server, [], 'de_inferno');
    await openPalette(page);

    await input(page).fill(server.name);
    const hit = page.getByTestId('palette-server').first();
    await expect(hit).toContainText('Inferno');
    await hit.click();

    await expect(page).toHaveURL(/\/#servidor-/);
    await expect(page.locator(`[data-server="${server.name}"]`).first()).toBeVisible();
  });

  test('quem entrou acha o que tem no Inventário e abre o editor do Item', async ({ page }) => {
    const steamId = newSteamId();
    await signInByRequest(page, steamId);
    const response = await page.request.post('/api/inventory/items', {
      headers: { 'x-csrf-token': await csrfToken(page.context()) },
      data: { item: { id: 306 } },
    });
    expect(response.status()).toBe(201);
    const { uid } = (await response.json()) as { uid: string };
    await openPalette(page);

    await input(page).fill('asiimov');
    // O grupo do Inventário vem antes do Catálogo no empate: a primeira linha é a cópia da Conta.
    await expect(page.getByTestId('palette-list')).toContainText('No seu Inventário');
    await page.getByTestId('palette-item').first().click();

    await expect(page).toHaveURL(new RegExp(`/inventario/${uid}$`));
  });

  test('o Painel da Staff só aparece para a Staff; Meu perfil e Sair, para quem entrou', async ({
    page,
  }) => {
    const steamId = newSteamId();
    await signInByRequest(page, steamId);
    await openPalette(page);
    const list = page.getByTestId('palette-list');
    await expect(list.getByRole('option', { name: /^Meu perfil/ })).toBeVisible();
    await expect(list.getByRole('option', { name: /^Sair/ })).toBeVisible();
    await expect(list.getByRole('option', { name: /^Entrar/ })).toHaveCount(0);
    await expect(list.getByRole('option', { name: /^Painel da Staff/ })).toHaveCount(0);
    await page.keyboard.press('Escape');

    grantStaffRole(steamId, 'admin');
    const me = (await (await page.request.get('/api/me')).json()) as { staffRole: string | null };
    expect(me.staffRole).toBe('admin');
    await openPalette(page);

    await expect(
      page.getByTestId('palette-list').getByRole('option', { name: /^Painel da Staff/ }),
    ).toBeVisible();
  });
});

test.describe('ações', () => {
  test('alternar o tema', async ({ page }) => {
    await saveTheme(page, 'dark');
    await openPalette(page);

    await input(page).fill('tema');
    await page.getByRole('option', { name: /^Usar tema claro/ }).click();

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(palette(page)).toBeHidden();
  });

  test('Sair encerra a sessão', async ({ page }) => {
    await signInByRequest(page, newSteamId());
    await openPalette(page);

    await input(page).fill('sair');
    await page.getByRole('option', { name: /^Sair/ }).click();

    await expect(page.getByTestId('sign-in')).toBeVisible();
    await expect(palette(page)).toBeHidden();
  });

  test('Primeiros passos abre o Dialog e o foco fica nele', async ({ page }) => {
    await signInByRequest(page, newSteamId());
    await openPalette(page);

    await input(page).fill('primeiros');
    await page.getByRole('option', { name: /^Primeiros passos/ }).click();

    await expect(palette(page)).toBeHidden();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});

test.describe('estados', () => {
  test('sem resultado, diz o que foi buscado e o que tentar', async ({ page }) => {
    await openPalette(page);

    await input(page).fill('zzqqxxyy');

    await expect(page.getByTestId('palette-empty')).toContainText(
      'Nada encontrado para “zzqqxxyy”',
    );
    await expect(page.getByTestId('palette-empty')).toContainText('ortografia');
  });

  test('enquanto busca, mostra o carregando e depois o resultado', async ({ page }) => {
    await page.route('**/busca/itens**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      await route.continue();
    });
    await openPalette(page);

    await input(page).fill('karambit');

    await expect(page.getByTestId('palette-loading')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Buscando' })).toBeAttached();
    await expect(page.getByTestId('palette-item').first()).toBeVisible();
    await expect(page.getByTestId('palette-loading')).toBeHidden();
  });

  test.describe('erro de uma fonte', () => {
    test('avisa que parte não carregou, mantém o resto e "Tentar de novo" refaz', async ({
      page,
      expectedConsoleErrors,
    }) => {
      expectedConsoleErrors.push(/status of 503/);
      await page.route('**/api/players/search**', (route) =>
        route.fulfill({ status: 503, body: '{}' }),
      );
      await openPalette(page);

      await input(page).fill('ranking');
      await expect(page.getByTestId('palette-error')).toContainText(
        'Parte dos resultados não carregou',
      );
      await expect(page.getByRole('option', { name: /^Ranking/ })).toBeVisible();

      await page.unroute('**/api/players/search**');
      await page.getByRole('button', { name: 'Tentar de novo' }).click();

      await expect(page.getByTestId('palette-error')).toBeHidden();
    });
  });

  test('tudo fora do ar: erro claro e a navegação continua', async ({
    page,
    expectedConsoleErrors,
  }) => {
    expectedConsoleErrors.push(/status of 503/);
    await page.route('**/api/players/search**', (route) =>
      route.fulfill({ status: 503, body: '{}' }),
    );
    await page.route('**/busca/itens**', (route) => route.fulfill({ status: 503, body: '{}' }));
    await openPalette(page);

    await input(page).fill('zzqqxxyy');

    await expect(page.getByTestId('palette-error')).toContainText('Não deu para buscar agora');
    await expect(page.getByTestId('palette-empty')).toHaveCount(0);
  });
});

test.describe('histórico', () => {
  test('guarda a busca de quem escolheu um resultado, por pessoa, e se limpa', async ({ page }) => {
    await openPalette(page);
    await input(page).fill('ranking');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/ranking$/);

    await openPalette(page, '/ranking');
    const recent = page.getByTestId('palette-recent');
    await expect(recent).toHaveCount(1);
    await expect(recent.first()).toContainText('ranking');
    await recent.first().click();
    await expect(input(page)).toHaveValue('ranking');

    await input(page).fill('');
    await page.getByTestId('palette-recent-clear').click();
    await expect(page.getByTestId('palette-recent')).toHaveCount(0);
  });

  test('o histórico de uma pessoa não aparece para a outra', async ({ page }) => {
    await openPalette(page);
    await input(page).fill('loadout');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/loadout$/);

    await signInByRequest(page, newSteamId());
    await openPalette(page, '/ranking');

    await expect(page.getByTestId('palette-recent')).toHaveCount(0);
  });

  test('com o armazenamento bloqueado, a paleta funciona sem histórico', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new DOMException('bloqueado', 'SecurityError');
        },
      });
    });
    await openPalette(page);

    await input(page).fill('ranking');
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(/\/ranking$/);
  });
});

test.describe('celular', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('o campo vira só o ícone (44 px) e a paleta ocupa a tela toda, com botão de fechar', async ({
    page,
  }) => {
    await page.goto('/');
    await hydrated(page);
    // A entrada do campo (fade-up) escala por uns quadros: mede depois que ela termina.
    await settle(page);
    const box = await trigger(page).boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
    await expect(trigger(page).getByText('Buscar', { exact: true })).toBeHidden();

    await trigger(page).click();
    await expect(palette(page)).toBeVisible();
    await settle(page);

    const panel = await palette(page).boundingBox();
    expect(panel).toMatchObject({ x: 0, y: 0, width: 390, height: 844 });
    await page.getByRole('button', { name: 'Fechar a busca' }).click();
    await expect(palette(page)).toBeHidden();
    await expect(trigger(page)).toBeFocused();
  });

  test('sem rolagem horizontal e com alvos de 44 px nos resultados', async ({ page }) => {
    await openPalette(page);
    await settle(page);

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    for (const option of await page.getByTestId('palette-list').getByRole('option').all()) {
      expect((await option.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe('movimento reduzido', () => {
  test('entra só com fade, sem deslocamento', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await hydrated(page);
    await page.keyboard.press('Control+k');

    await expect(palette(page)).toBeVisible();

    expect(await palette(page).evaluate((el) => getComputedStyle(el).animationName)).toBe(
      'palette-fade-in',
    );
  });
});

test.describe('acessibilidade', () => {
  for (const theme of ['dark', 'light'] as const) {
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      test(`aberta e com resultados, sem violações do axe (${theme}, ${viewport.width} px)`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        await saveTheme(page, theme);
        await openPalette(page);
        await input(page).fill('a');
        await input(page).fill('ranking');
        await expect(page.getByRole('option', { name: /^Ranking/ })).toBeVisible();
        await settle(page);

        expect(await axeViolations(page)).toEqual([]);
      });
    }
  }

  test('o campo do cabeçalho tem nome acessível e anuncia o atalho', async ({ page }) => {
    await page.goto('/');
    await hydrated(page);

    await expect(trigger(page)).toHaveAccessibleName(/Buscar/);
    await expect(trigger(page)).toHaveAttribute('aria-keyshortcuts', 'Control+K Meta+K');
  });

  test('a paleta é um diálogo nomeado e a lista, uma listbox', async ({ page }) => {
    await openPalette(page);

    await expect(page.getByRole('dialog', { name: 'Buscar no Carmine' })).toBeVisible();
    await expect(page.getByRole('listbox')).toBeVisible();
    await expect(input(page)).toHaveAttribute('role', 'combobox');
  });
});
