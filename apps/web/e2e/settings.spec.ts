import { createUnclaimedAccount, grantVip, newSteamId, signInByRequest } from './accounts';
import { axeViolations, expect, saveTheme, test, WIDTHS } from './fixtures';
import { hydrated, openAccountMenu } from './hydration';
import { connectPlayer, createServer, keepBeating } from './live-servers';

const accountMenu = (page: import('@playwright/test').Page) => page.getByTestId('account-menu');

/**
 * Abre o menu da Conta e clica no item. Logo depois de uma navegação o Next ainda move o foco da
 * página nova, o que fecha um menu recém-aberto (comportamento do Radix para foco fora dele): então
 * repete a abertura até o clique pegar, como faria quem usa.
 */
async function menuGo(
  page: import('@playwright/test').Page,
  item: import('@playwright/test').Locator,
) {
  await expect(async () => {
    if (!(await item.isVisible())) {
      await hydrated(accountMenu(page));
      await openAccountMenu(page);
    }
    await item.click({ timeout: 3_000 });
  }).toPass();
}

/** Entra (sem a interface) com uma Conta que já jogou, com o nome Steam dado. */
async function signedIn(
  page: import('@playwright/test').Page,
  request: import('@playwright/test').APIRequestContext,
  steamName: string,
) {
  const account = await createUnclaimedAccount(request, steamName);
  await signInByRequest(page, account.steamId);
  return account;
}

const overflow = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe('menu da Conta', () => {
  test('mostra a Conta, os atalhos e o Sair separado, sem o #ID e sem o tema', async ({
    page,
    request,
  }) => {
    const account = await signedIn(page, request, 'Menu Teste');
    await page.goto('/ranking');
    await openAccountMenu(page);

    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(page.getByTestId('menu-name')).toHaveText('Menu Teste');
    await expect(menu).not.toContainText('#');
    await expect(menu).not.toContainText(String(account.publicId));
    await expect(accountMenu(page)).toHaveAccessibleName('Menu da Conta de Menu Teste');
    await expect(page.getByTestId('menu-vip')).toHaveCount(0);
    await expect(page.getByTestId('menu-playing')).toHaveCount(0);
    await expect(page.getByTestId('staff-panel-link')).toHaveCount(0);

    await expect(menu.getByRole('menuitem')).toHaveText([
      'Meu perfil',
      'Inventário',
      'Loadout',
      'Configurações',
      'Início',
      'Primeiros passos',
      'Sair',
    ]);
    // O tema não mora no menu: fica no botão da barra e em Configurações > Aparência.
    await expect(menu.getByRole('menuitemradio')).toHaveCount(0);

    await page.getByTestId('menu-settings').click();
    await expect(page).toHaveURL('/configuracoes');
  });

  test('Meu perfil, Inventário e Loadout levam às páginas', async ({ page, request }) => {
    const account = await signedIn(page, request, 'Atalhos Teste');
    await page.goto('/ranking');
    await menuGo(page, page.getByTestId('menu-profile'));
    await expect(page).toHaveURL(`/${account.publicId}`);

    await menuGo(page, page.getByRole('menuitem', { name: 'Inventário' }));
    await expect(page).toHaveURL('/inventario');

    await menuGo(page, page.getByRole('menuitem', { name: 'Loadout' }));
    await expect(page).toHaveURL('/loadout');
  });

  test('o botão de tema fica na barra com a Conta aberta e o menu não o repete', async ({
    page,
    request,
  }) => {
    await signedIn(page, request, 'Barra Superior');
    await page.goto('/ranking');
    await expect(accountMenu(page)).toBeVisible();
    const toggle = page.getByTestId('theme-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAccessibleName('Usar tema claro');

    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await page.evaluate(() => localStorage.getItem('carmine-theme'))).toBe('light');
    await expect(toggle).toHaveAccessibleName('Usar tema escuro');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // O menu da Conta já não traz o tema.
    await openAccountMenu(page);
    await expect(page.getByRole('menu')).not.toContainText('Tema');
    await expect(page.getByRole('menuitemradio')).toHaveCount(0);
  });

  test('com VIP ativo mostra o selo com os dias que faltam', async ({ page, request }) => {
    const account = await signedIn(page, request, 'Menu Vip');
    grantVip(account.steamId, 12);
    await page.goto('/ranking');
    await openAccountMenu(page);
    await expect(page.getByTestId('menu-vip')).toHaveText('VIP · 12 dias');

    // No último dia, o singular.
    const other = await signedIn(page, request, 'Menu Vip Um');
    grantVip(other.steamId, 1);
    await page.goto('/ranking');
    await openAccountMenu(page);
    await expect(page.getByTestId('menu-vip')).toHaveText('VIP · 1 dia');
  });

  test('"Jogando agora" aparece só enquanto a Conta está num servidor', async ({
    page,
    request,
  }) => {
    const steamId = newSteamId();
    const server = createServer();
    await connectPlayer(request, server, steamId, 'Menu Jogando');
    await signInByRequest(page, steamId);
    let players = [steamId];
    const stop = keepBeating(request, server, () => players);
    try {
      await page.goto('/ranking');
      await openAccountMenu(page);
      const playing = page.getByTestId('menu-playing');
      await expect(playing).toContainText('Jogando agora');
      await expect(playing).toContainText(server.name);
      await expect(playing).toContainText('de_mirage');
      // Nada de endereço do servidor no menu.
      await expect(playing).not.toContainText(server.address);
      await page.keyboard.press('Escape');

      // Fora do servidor: some (a leitura é refeita depois da janela de frescor).
      players = [];
      await page.reload();
      await page.waitForTimeout(5_500);
      await openAccountMenu(page);
      await expect(page.getByTestId('menu-playing')).toHaveCount(0);
    } finally {
      stop();
    }
  });

  test('no celular o botão tem 44 px e o painel cabe na tela', async ({ page, request }) => {
    await signedIn(page, request, 'Menu Celular');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/ranking');
    const box = await accountMenu(page).boundingBox();
    expect(Math.round(box?.width ?? 0)).toBeGreaterThanOrEqual(44);
    expect(Math.round(box?.height ?? 0)).toBeGreaterThanOrEqual(44);

    await openAccountMenu(page);
    const panel = await page.getByRole('menu').boundingBox();
    expect(panel?.x).toBeGreaterThanOrEqual(0);
    expect((panel?.x ?? 0) + (panel?.width ?? 0)).toBeLessThanOrEqual(390);
    // O painel chega com uma entrada curta (escala): mede depois de assentar.
    await expect
      .poll(async () => {
        const items = await page.getByRole('menuitem').all();
        const heights = await Promise.all(
          items.map(async (item) => (await item.boundingBox())?.height ?? 0),
        );
        return Math.min(...heights);
      })
      .toBeGreaterThanOrEqual(44);
    expect(await overflow(page)).toBe(0);
  });
});

test.describe('Configurações', () => {
  test('sem sessão convida a entrar e volta para Configurações', async ({ page }) => {
    await page.goto('/configuracoes');
    await expect(page.getByTestId('settings-signed-out')).toContainText(
      'Entre para ver as suas configurações',
    );
    await expect(page.getByTestId('settings-nav-perfil')).toHaveCount(0);
    await page.getByRole('link', { name: 'Entrar com a Steam' }).click();
    await expect(page).toHaveURL('/entrar?voltar=%2Fconfiguracoes');
  });

  test('no desktop a navegação lateral leva a cada seção e a raiz abre o Perfil', async ({
    page,
    request,
  }) => {
    await signedIn(page, request, 'Config Desktop');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/configuracoes');

    const nav = page.getByRole('navigation', { name: 'Seções das configurações' });
    await expect(nav.getByRole('link')).toHaveText([
      'Perfil',
      'Conexões',
      'Aparência',
      'Dados e conta',
    ]);
    await expect(page.getByRole('heading', { level: 1, name: 'Configurações' })).toBeVisible();
    await expect(page.getByTestId('settings-nav-perfil')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('profile-settings')).toBeVisible();
    await expect(page.getByTestId('settings-back')).toHaveCount(0);

    await page.getByTestId('settings-nav-conexoes').click();
    await expect(page).toHaveURL('/configuracoes/conexoes');
    await expect(page.getByTestId('settings-nav-conexoes')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('settings-nav-perfil')).not.toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByTestId('discord-setting')).toBeVisible();
    await expect(page.getByTestId('profile-settings')).toHaveCount(0);

    await page.getByTestId('settings-nav-dados').click();
    await expect(page).toHaveURL('/configuracoes/dados');
    await expect(page.getByTestId('data-request')).toContainText('conforme a LGPD');
    await expect(
      page.getByRole('main').getByRole('link', { name: 'Contato e exclusão de dados' }),
    ).toHaveAttribute('href', '/contato');
    await expect(
      page.getByRole('main').getByRole('link', { name: 'Política de privacidade' }),
    ).toHaveAttribute('href', '/privacidade');
  });

  test('Aparência: dois rádios trocam o tema, que fica salvo no navegador', async ({
    page,
    request,
  }) => {
    await signedIn(page, request, 'Config Tema');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/configuracoes/aparencia');

    const dark = page.getByTestId('theme-dark');
    const light = page.getByTestId('theme-light');
    await expect(dark).toBeChecked();
    await expect(light).not.toBeChecked();

    await page.getByText('Claro', { exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(light).toBeChecked();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(light).toBeChecked();

    // Pelo teclado: foco no grupo e seta para o outro.
    await light.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(dark).toBeChecked();
  });

  test('no celular a raiz é a lista de seções e cada seção traz o "voltar"', async ({
    page,
    request,
  }) => {
    await signedIn(page, request, 'Config Celular');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/configuracoes');

    for (const section of ['perfil', 'conexoes', 'aparencia', 'dados']) {
      await expect(page.getByTestId(`settings-nav-${section}`)).toBeVisible();
      expect(
        (await page.getByTestId(`settings-nav-${section}`).boundingBox())?.height,
      ).toBeGreaterThanOrEqual(44);
    }
    // O conteúdo do Perfil não aparece junto da lista.
    await expect(page.getByTestId('profile-settings')).toBeHidden();
    await expect(page.getByTestId('settings-back')).toHaveCount(0);

    // A coluna da página: o fundo do "voltar" começa na mesma borda da lista de seções.
    const columnX = (await page.getByTestId('settings-nav-aparencia').boundingBox())?.x ?? -1;

    await page.getByTestId('settings-nav-aparencia').click();
    await expect(page).toHaveURL('/configuracoes/aparencia');
    await expect(page.getByTestId('settings-nav-perfil')).toBeHidden();
    await expect(page.getByTestId('theme-setting')).toBeVisible();
    // O H1 segue no DOM (para leitor de tela), só some da vista.
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);

    const backX = (await page.getByTestId('settings-back').boundingBox())?.x ?? -99;
    expect(Math.abs(backX - columnX)).toBeLessThanOrEqual(1);
    await page.getByTestId('settings-back').click();
    await expect(page).toHaveURL('/configuracoes');
    await expect(page.getByTestId('settings-nav-perfil')).toBeVisible();
    expect(await overflow(page)).toBe(0);
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`todas as seções sem violações do axe e sem scroll horizontal (${theme})`, async ({
      page,
      request,
    }) => {
      // 4 larguras x 4 seções, cada uma com a varredura do axe: passa dos 30 s padrão em máquina ocupada.
      test.setTimeout(90_000);
      await saveTheme(page, theme);
      await signedIn(page, request, 'Nome De Exibição Bem Comprido Mesmo');
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        for (const route of [
          '/configuracoes',
          '/configuracoes/perfil',
          '/configuracoes/conexoes',
          '/configuracoes/aparencia',
          '/configuracoes/dados',
        ]) {
          await page.goto(route);
          await expect(page.getByRole('heading', { level: 1, name: 'Configurações' })).toHaveCount(
            1,
          );
          expect(await axeViolations(page), `${route} em ${width}px`).toEqual([]);
          expect(await overflow(page), `${route} em ${width}px`).toBe(0);
        }
      }
    });
  }
});

test.describe('foco', () => {
  test('campo de texto (Label Input): o campo clareia ao focar e ganha o anel fino da marca, com o mouse e com o teclado', async ({
    page,
    request,
  }) => {
    await signedIn(page, request, 'Foco Campos');
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/configuracoes/perfil');
    await page.getByTestId('name-edit').click();
    const input = page.getByTestId('name-input');
    await expect(input).toBeFocused();
    const html = page.locator('html');

    const style = (property: 'outlineStyle' | 'outlineWidth' | 'boxShadow') =>
      input.evaluate((el, name) => getComputedStyle(el)[name], property);

    // Foco do mouse (o campo é focado depois de um clique): o fundo clareia e o anel fino já entra
    // (exceção do dono para o campo de texto padrão).
    await expect(html).not.toHaveAttribute('data-kbd', '');
    expect(await style('outlineStyle')).toBe('solid');
    expect(await style('outlineWidth')).toBe('2px');
    await expect.poll(() => style('boxShadow')).toMatch(/inset/);
    expect((await style('boxShadow')).split('inset')).toHaveLength(2);

    // Foco do teclado (Tab para fora e Shift+Tab de volta): o mesmo anel, e o fundo continua.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(input).toBeFocused();
    await expect(html).toHaveAttribute('data-kbd', '');
    expect(await style('outlineStyle')).toBe('solid');
    expect(await style('outlineWidth')).toBe('2px');
    await expect.poll(() => style('boxShadow')).toMatch(/inset/);

    // Sem foco, o fundo volta (também depois da transição).
    await input.evaluate((el) => (el as HTMLInputElement).blur());
    await expect.poll(() => style('boxShadow')).toBe('none');
  });

  test('botões e links: anel fino só no foco do teclado; mouse e toque nunca o mostram', async ({
    page,
  }) => {
    await page.goto('/regras');
    const html = page.locator('html');
    const focused = () =>
      page.evaluate(() => {
        const style = getComputedStyle(document.activeElement as Element);
        return {
          outline: style.outlineStyle,
          width: style.outlineWidth,
          background: style.backgroundColor,
        };
      });

    // Clique do mouse no botão de tema: o foco fica nele, mas sem anel e sem o modo teclado.
    await page.getByTestId('theme-toggle').click();
    await expect(page.getByTestId('theme-toggle')).toBeFocused();
    await expect(html).not.toHaveAttribute('data-kbd', '');
    expect(await focused()).toMatchObject({ outline: 'none', background: 'rgba(0, 0, 0, 0)' });

    // Tab: o foco vai para "Entrar" e o teclado desenha o anel fino (o fundo é o do repouso).
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('sign-in')).toBeFocused();
    await expect(html).toHaveAttribute('data-kbd', '');
    expect(await focused()).toMatchObject({ outline: 'solid', width: '2px' });

    // Um clique desliga o modo: o anel some até o próximo Tab.
    await page.getByTestId('theme-toggle').click();
    await expect(html).not.toHaveAttribute('data-kbd', '');
    expect((await focused()).outline).toBe('none');
  });
});
