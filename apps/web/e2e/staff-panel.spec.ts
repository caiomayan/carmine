import { expect, test } from '@playwright/test';
import {
  chooseSteamAccount,
  grantStaffRole,
  newSteamId,
  reconnectPlayer,
  signInByRequest,
} from './accounts';
import { axeViolations } from './fixtures';

/**
 * O painel da Staff de verdade (S25 PR B, `apps/staff`): outro host (aqui, a porta 3200), login Steam próprio com a
 * sessão `__Host-` do host dele (ADR 0015) e só Conta com papel de Staff entra. O painel serve o próprio /api pelo
 * rewrite do Next (em produção, pelo túnel), contra a mesma API do E2E.
 */
const STAFF = `http://localhost:${process.env.STAFF_E2E_PORT ?? 3200}`;

test.use({ baseURL: STAFF });

/** Uma Conta com papel de Staff (existe, reivindicada pelo login do site e com o papel dado pelo CLI). */
async function staffAccount(
  page: import('@playwright/test').Page,
  role: 'owner' | 'admin' | 'moderator',
) {
  const steamId = newSteamId();
  await reconnectPlayer(page.request, steamId, `staff-${role}`);
  // Reivindica a Conta pelo login do site (o CLI de papéis exige Conta reivindicada).
  await signInByRequest(page, steamId);
  grantStaffRole(steamId, role);
  await page.context().clearCookies();
  return steamId;
}

/** O login do painel pela interface: tela de entrada, Steam falsa e o callback do painel. */
async function signInToPanel(page: import('@playwright/test').Page, steamId: string) {
  await chooseSteamAccount(page.context(), steamId);
  await page.goto('/entrar');
  await page.getByRole('link', { name: 'Entrar com a Steam' }).click();
}

test.describe('Painel da Staff', () => {
  test('sem sessão, qualquer tela vai para a entrada', async ({ page }) => {
    await page.goto('/denuncias');
    await expect(page).toHaveURL(/\/entrar$/);
    await expect(page.getByRole('heading', { name: 'Painel da Staff' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Entrar com a Steam' })).toBeVisible();
  });

  test('o Moderador entra pela Steam, vê o Início e o trilho do que o papel permite', async ({
    page,
  }) => {
    const steamId = await staffAccount(page, 'moderator');
    await signInToPanel(page, steamId);

    await expect(page).toHaveURL(`${STAFF}/`);
    await expect(page.getByTestId('stp-home')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      /Bom dia|Boa tarde|Boa noite/,
    );
    // O Moderador vê as filas e as Contas, não os pagamentos nem os servidores.
    await expect(page.getByTestId('stp-nav-denuncias')).toBeVisible();
    await expect(page.getByTestId('stp-nav-fotos')).toBeVisible();
    await expect(page.getByTestId('stp-nav-contas')).toBeVisible();
    await expect(page.getByTestId('stp-nav-pagamentos')).toHaveCount(0);
    await expect(page.getByTestId('stp-nav-servidores')).toHaveCount(0);
    // O Início mostra os dados da API de verdade: os servidores e as duas filas com o seu prazo.
    await expect(page.getByRole('heading', { name: 'Servidores no ar' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Denúncias esperando' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Fotos denunciadas' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Compras hoje' })).toHaveCount(0);
  });

  test('o Dono vê também Pagamentos, Servidores e Auditoria, e o cartão de compras', async ({
    page,
  }) => {
    const steamId = await staffAccount(page, 'owner');
    await signInToPanel(page, steamId);

    await expect(page.getByTestId('stp-home')).toBeVisible();
    for (const id of ['pagamentos', 'servidores', 'auditoria']) {
      await expect(page.getByTestId(`stp-nav-${id}`)).toBeVisible();
    }
    await expect(page.getByRole('heading', { name: 'Compras hoje' })).toBeVisible();
  });

  test('uma Conta sem papel de Staff não entra, mesmo logada pela Steam', async ({ page }) => {
    const steamId = newSteamId();
    await reconnectPlayer(page.request, steamId, 'jogador-comum');
    await signInToPanel(page, steamId);

    await expect(page).toHaveURL(/\/entrar\?erro=sem-acesso/);
    await expect(page.getByTestId('staff-entry-error')).toContainText('não tem papel de Staff');
    // Sem sessão: as telas do painel continuam mandando para a entrada.
    await page.goto('/');
    await expect(page).toHaveURL(/\/entrar$/);
  });

  test('sair encerra a sessão do painel', async ({ page }) => {
    const steamId = await staffAccount(page, 'admin');
    await signInToPanel(page, steamId);
    await expect(page.getByTestId('stp-home')).toBeVisible();

    await page.getByTestId('stp-signout').click();
    await expect(page).toHaveURL(/\/entrar/);
    await page.goto('/');
    await expect(page).toHaveURL(/\/entrar$/);
  });

  test('Ctrl+K abre a paleta, navega para uma tela e o tema e o trilho guardam a escolha', async ({
    page,
  }) => {
    const steamId = await staffAccount(page, 'owner');
    await signInToPanel(page, steamId);
    await expect(page.getByTestId('stp-home')).toBeVisible();

    await page.keyboard.press('Control+k');
    const palette = page.getByTestId('stp-palette');
    await expect(palette).toBeVisible();
    await page.keyboard.type('pagam');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(`${STAFF}/pagamentos`);
    await expect(page.getByTestId('stp-coming')).toBeVisible();

    // O tema e o trilho vão para cookies lidos no servidor: a escolha vale depois de recarregar.
    const panel = page.getByTestId('stp');
    await expect(panel).toHaveAttribute('data-theme', 'dark');
    await page.getByTestId('stp-theme').click();
    await expect(panel).toHaveAttribute('data-theme', 'light');
    await page.getByTestId('stp-collapse').click();
    await expect(panel).toHaveAttribute('data-collapsed', '');
    await page.reload();
    await expect(panel).toHaveAttribute('data-theme', 'light');
    await expect(panel).toHaveAttribute('data-collapsed', '');
  });

  test('390 px: a barra de baixo no lugar do trilho e nada rola de lado', async ({ page }) => {
    const steamId = await staffAccount(page, 'moderator');
    await page.setViewportSize({ width: 390, height: 844 });
    await signInToPanel(page, steamId);
    await expect(page.getByTestId('stp-home')).toBeVisible();

    await expect(page.getByRole('navigation', { name: 'Atalhos' })).toBeVisible();
    await expect(page.getByTestId('stp-nav-inicio')).toBeHidden();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`acessibilidade: entrada e Início sem violações (${theme})`, async ({ page }) => {
      const steamId = await staffAccount(page, 'owner');
      await page.context().addCookies([{ name: 'stp-theme', value: theme, url: STAFF }]);
      await page.goto('/entrar');
      expect(await axeViolations(page), 'entrada').toEqual([]);
      await signInToPanel(page, steamId);
      await expect(page.getByTestId('stp-home')).toBeVisible();
      expect(await axeViolations(page), 'início').toEqual([]);
    });
  }
});
