import { randomInt } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import {
  chooseSteamAccount,
  grantStaffRole,
  newSteamId,
  reconnectPlayer,
  signInByRequest,
} from './accounts';
import { connectPlayer, createServer, type E2eServer, keepBeating } from './live-servers';

/**
 * Servidores no painel da Staff (S25, `apps/staff`): o nome de vitrine e o código de cada servidor, com o hostname do jogo
 * ao vivo, e o resultado no site (Home e botão Jogar), que é outro host. Só Admin e Dono (`servers.edit`).
 */
const STAFF = `http://localhost:${process.env.STAFF_E2E_PORT ?? 3200}`;
const WEB = `http://localhost:${process.env.WEB_E2E_PORT ?? 3000}`;

test.use({ baseURL: STAFF });

async function signInAsStaff(page: Page, server: E2eServer, role: 'owner' | 'admin' | 'moderator') {
  const steamId = newSteamId();
  await connectPlayer(page.request, server, steamId, `Staff ${role}`);
  await signInByRequest(page, steamId);
  grantStaffRole(steamId, role);
  await page.context().clearCookies();
  await chooseSteamAccount(page.context(), steamId);
  await page.goto('/entrar');
  await page.getByRole('link', { name: 'Entrar com a Steam' }).click();
  await expect(page.getByTestId('stp-home')).toBeVisible();
}

test.describe('Servidores no painel', () => {
  test('o Moderador não vê a tela', async ({ page }) => {
    const server = createServer();
    await signInAsStaff(page, server, 'moderator');
    await expect(page.getByTestId('stp-nav-servidores')).toHaveCount(0);
    await page.goto('/servidores');
    await expect(page.getByTestId('stp-not-found')).toBeVisible();
  });

  test('o nome de vitrine e o código aparecem na Home e no Jogar, e a Auditoria registra a edição', async ({
    browser,
    page,
    request,
  }) => {
    const server = createServer();
    // Online durante o teste inteiro (offline não tem o botão Jogar).
    const stop = keepBeating(request, server, () => []);
    await signInAsStaff(page, server, 'admin');

    await page.goto('/servidores');
    const card = page.locator(`[data-testid=staff-server][data-server="${server.name}"]`);
    await card.getByTestId('server-form-open').click();
    const letters = String.fromCharCode(65 + randomInt(26), 65 + randomInt(26), 65 + randomInt(26));
    const typed = `${letters.toLowerCase()}.${randomInt(1, 99)}`;
    const code = typed.toUpperCase().replace('.', '·');
    await card.getByTestId('server-showcase-name').fill('Retake · Rotação');
    await card.getByTestId('server-code-input').fill(typed);
    await card.getByTestId('server-code-input').blur();
    await expect(card.getByTestId('server-code-input')).toHaveValue(code);
    await expect(card.getByTestId('hostname-preview')).toContainText(
      `Carmine | Retake · Rotação | ${code}`,
    );
    await card.getByTestId('server-form-reason').fill('Nome de lançamento');
    await card.getByTestId('server-form-submit').click();
    await expect(card.getByTestId('server-form-done')).toBeVisible();
    await expect(card.getByTestId('hostname-live')).toContainText(code);

    // No site (outro host): a Home mostra o nome de vitrine e o código.
    const context = await browser.newContext({ baseURL: WEB });
    const site = await context.newPage();
    await site.goto('/');
    const home = site.locator(`li[data-server="${server.name}"]`);
    await expect(home.getByRole('heading', { name: 'Retake · Rotação' })).toBeVisible();
    await expect(home.getByTestId('server-code')).toHaveText(code);
    await expect(
      home.getByRole('link', { name: new RegExp(`Retake · Rotação \\(${code}\\)`) }),
    ).toBeVisible();
    await context.close();

    // A Auditoria registra a edição.
    await page.goto('/auditoria?acao=server_update');
    await expect(page.getByTestId('audit-entries').first()).toContainText('Nome de lançamento');
    stop();
  });
});

/** Foco, Esc e Cancelar do editor (#277). */
test('o editor do Servidor devolve o foco, fecha com Esc e o Cancelar limpa o erro', async ({
  page,
}) => {
  const server = createServer();
  const steamId = newSteamId();
  await reconnectPlayer(page.request, steamId, 'staff-owner');
  await signInByRequest(page, steamId);
  grantStaffRole(steamId, 'owner');
  await page.context().clearCookies();
  await chooseSteamAccount(page.context(), steamId);
  await page.goto('/entrar');
  await page.getByRole('link', { name: 'Entrar com a Steam' }).click();
  await page.goto('/servidores');

  const card = page.locator(`[data-testid=staff-server][data-server="${server.name}"]`);
  const open = card.getByTestId('server-form-open');
  const form = card.getByTestId('server-form');

  // Abrir leva o foco ao primeiro campo.
  await open.click();
  await expect(card.getByTestId('server-showcase-name')).toBeFocused();

  // Salvar sem motivo mostra o erro; o Esc fecha e o foco volta ao Editar.
  await form.getByRole('button', { name: 'Salvar' }).click();
  await expect(form.getByRole('alert')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(form).toHaveCount(0);
  await expect(open).toBeFocused();

  // Reabrir: o erro anterior não sobrevive.
  await open.click();
  await expect(form.getByRole('alert')).toHaveCount(0);

  // O Cancelar também fecha, limpa o erro e devolve o foco.
  await form.getByRole('button', { name: 'Salvar' }).click();
  await expect(form.getByRole('alert')).toBeVisible();
  await form.getByRole('button', { name: 'Cancelar' }).click();
  await expect(form).toHaveCount(0);
  await expect(open).toBeFocused();
  await open.click();
  await expect(form.getByRole('alert')).toHaveCount(0);

  // Os dois campos começam no mesmo topo e têm a mesma altura.
  // O cartão entra com uma animação de subida (stp-rise) e a fonte pode trocar logo após abrir: mede os dois campos
  // juntos, no mesmo instante, e repete até assentar, sem afrouxar a tolerância.
  await expect
    .poll(
      async () => {
        const [name, code] = await Promise.all([
          card.getByTestId('server-showcase-name').boundingBox(),
          card.getByTestId('server-code-input').boundingBox(),
        ]);
        if (!name || !code) return 99;
        return Math.max(Math.abs(name.y - code.y), Math.abs(name.height - code.height));
      },
      { message: 'os dois campos começam no mesmo topo e têm a mesma altura' },
    )
    .toBeLessThan(1);
});
