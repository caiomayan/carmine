import { expect, test } from '@playwright/test';
import {
  chooseSteamAccount,
  grantStaffRole,
  newSteamId,
  reconnectPlayer,
  signInByRequest,
} from './accounts';
import { createServer } from './live-servers';

/** A tela Servidores do painel da Staff (S25): foco, Esc e Cancelar do editor (#277). */
const STAFF = `http://localhost:${process.env.STAFF_E2E_PORT ?? 3200}`;

test.use({ baseURL: STAFF });

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
  const name = await card.getByTestId('server-showcase-name').boundingBox();
  const code = await card.getByTestId('server-code-input').boundingBox();
  expect(Math.abs((name?.y ?? 0) - (code?.y ?? 99))).toBeLessThan(1);
  expect(Math.abs((name?.height ?? 0) - (code?.height ?? 99))).toBeLessThan(1);
});
