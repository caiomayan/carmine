import { randomInt } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import { chooseSteamAccount, grantStaffRole, newSteamId, signInByRequest } from './accounts';
import { axeViolations } from './fixtures';
import { connectPlayer, createServer, type E2eServer } from './live-servers';

/**
 * As filas do painel da Staff (S25 PR C, `apps/staff`): Denúncias (casos agrupados pela regra única de denúncia, ADR 0027,
 * estados do ADR 0019) e Fotos denunciadas. O painel é outro host (porta 3200 no E2E) com a própria sessão; a API é a mesma.
 * As fotos não têm armazenamento no E2E (as decisões delas são testadas na API); aqui vale a tela.
 */
const STAFF = `http://localhost:${process.env.STAFF_E2E_PORT ?? 3200}`;

test.use({ baseURL: STAFF });

async function report(
  page: Page,
  server: E2eServer,
  reporterSteamId: string,
  targetSteamId: string,
  reason: string,
) {
  const response = await page.request.post('/api/server/reports', {
    headers: { authorization: `Bearer ${server.key}` },
    data: { reporterSteamId, targetSteamId, reason, round: 4, map: 'de_inferno' },
  });
  expect(response.status()).toBe(200);
  expect(((await response.json()) as { accepted: boolean }).accepted).toBe(true);
}

/** A Staff entra no painel pela Steam falsa (Conta que já jogou, reivindicada pelo site, com o papel dado pelo CLI). */
async function signInAsStaff(page: Page, server: E2eServer, role: 'owner' | 'moderator') {
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

/** Dois denunciantes contra o mesmo jogador, pelo mesmo motivo, no mesmo servidor e mapa: um caso só. */
async function seedCase(page: Page, server: E2eServer) {
  const name = `Alvo-${randomInt(100_000, 999_999)}`;
  const [first, second, target] = [newSteamId(), newSteamId(), newSteamId()];
  await connectPlayer(page.request, server, first, 'Denunciante A');
  await connectPlayer(page.request, server, second, 'Denunciante B');
  await connectPlayer(page.request, server, target, name);
  await report(page, server, first, target, 'offensive_chat');
  await report(page, server, second, target, 'offensive_chat');
  return name;
}

test.describe('Denúncias no painel', () => {
  test('as Denúncias contra a mesma Conta, pelo mesmo motivo e mapa viram um caso só, com o prazo e a linha do tempo', async ({
    page,
  }) => {
    const server = createServer();
    const name = await seedCase(page, server);
    await signInAsStaff(page, server, 'moderator');

    await page.goto('/denuncias');
    await expect(page.getByRole('heading', { name: 'Denúncias', level: 1 })).toBeVisible();
    await page.getByTestId('stp-query').fill(name);
    const rows = page.getByTestId('stp-row');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('2 denúncias');
    await expect(rows.first()).toContainText('Chat ofensivo');
    await expect(rows.first()).toContainText('restantes');

    await rows.first().click();
    const detail = page.getByTestId('stp-detail');
    await expect(detail).toBeVisible();
    await expect(page.getByTestId('stp-case-count')).toHaveText('2 denúncias');
    await expect(detail.getByTestId('stp-member')).toHaveCount(2);
    await expect(detail.getByText('Fim do prazo da Staff')).toBeVisible();
    // A Punição é aplicada na ficha da Conta, no site, até a tela de Contas migrar para o painel.
    await expect(page.getByTestId('report-punish')).toHaveAttribute(
      'href',
      /\/staff\/contas\/\d+\?denuncia=[0-9a-f-]{36}&evidencia=0#aplicar$/,
    );
  });

  test('ordenar, filtrar por motivo e paginar a fila', async ({ page }) => {
    const server = createServer();
    const name = await seedCase(page, server);
    await signInAsStaff(page, server, 'owner');
    await page.goto('/denuncias');

    const header = page.getByRole('columnheader', { name: /Denunciado/ });
    await header.getByRole('button').click();
    await expect(header).toHaveAttribute('aria-sort', 'ascending');
    await header.getByRole('button').click();
    await expect(header).toHaveAttribute('aria-sort', 'descending');

    // A busca pelo nome do caso semeado isola o caso; o motivo certo o mantém e o errado o tira.
    await page.getByTestId('stp-query').fill(name);
    await page.getByTestId('stp-reason').selectOption('offensive_chat');
    await expect(page.getByTestId('stp-row')).toHaveCount(1);
    await page.getByTestId('stp-reason').selectOption('cheat');
    await expect(page.getByTestId('stp-row')).toHaveCount(0);
    await expect(page.getByTestId('stp-empty')).toBeVisible();
    await page.getByRole('button', { name: 'Limpar' }).click();
    await expect(page.getByTestId('stp-range')).not.toHaveText(/^0–0/);
  });

  test('arquivar com motivo resolve o caso inteiro e ele vai para a aba Arquivadas', async ({
    page,
  }) => {
    const server = createServer();
    const name = await seedCase(page, server);
    await signInAsStaff(page, server, 'moderator');
    await page.goto('/denuncias');
    await page.getByTestId('stp-query').fill(name);
    await page.getByTestId('stp-row').first().click();

    await page.getByTestId('archive-report-open').click();
    await page.getByTestId('archive-report-submit').click();
    await expect(page.getByRole('alert').first()).toContainText('pelo menos 3 caracteres');
    await page.getByTestId('archive-report-reason').fill('Provocação leve, sem reincidência');
    await page.getByTestId('archive-report-submit').click();
    await expect(page.getByTestId('archive-report-done')).toContainText(
      'Caso arquivado (2 denúncias)',
    );
    await expect(page.getByTestId('stp-row')).toHaveCount(0);

    await page.getByTestId('stp-tab-archived').click();
    await expect(page).toHaveURL(/status=archived/);
    await page.getByTestId('stp-query').fill(name);
    await expect(page.getByTestId('stp-row')).toHaveCount(1);
    await expect(page.getByTestId('stp-row').first()).toContainText('Arquivada');
    await page.getByTestId('stp-row').first().click();
    await expect(page.getByTestId('report-resolution')).toContainText(
      'Provocação leve, sem reincidência',
    );
  });

  test('390 px: a fila vira cartões, o detalhe sobe como folha e nada rola de lado', async ({
    page,
  }) => {
    const server = createServer();
    const name = await seedCase(page, server);
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAsStaff(page, server, 'moderator');
    await page.goto('/denuncias');
    await page.getByTestId('stp-query').fill(name);
    await expect(page.getByTestId('stp-report-board-table')).toBeHidden();
    const card = page.getByTestId('stp-report-board-cards').getByRole('button').first();
    await expect(card).toContainText('2 denúncias');
    await card.click();
    const sheet = page.getByTestId('stp-detail');
    await expect(sheet).toBeVisible();
    const box = await sheet.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(389);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`acessibilidade: a fila e o detalhe de um caso sem violações (${theme})`, async ({
      page,
    }) => {
      const server = createServer();
      const name = await seedCase(page, server);
      await signInAsStaff(page, server, 'moderator');
      await page.context().addCookies([{ name: 'stp-theme', value: theme, url: STAFF }]);
      await page.goto('/denuncias');
      await page.getByTestId('stp-query').fill(name);
      await expect(page.getByTestId('stp-row')).toHaveCount(1);
      expect(await axeViolations(page), 'fila').toEqual([]);
      await page.getByTestId('stp-row').first().click();
      await expect(page.getByTestId('stp-detail')).toBeVisible();
      expect(await axeViolations(page), 'detalhe').toEqual([]);
    });
  }
});

test.describe('Fotos denunciadas no painel', () => {
  test('a tela carrega com as abas, a busca e o estado da fila (sem armazenamento de fotos no E2E)', async ({
    page,
  }) => {
    const server = createServer();
    await signInAsStaff(page, server, 'moderator');
    await page.goto('/fotos');
    await expect(page.getByRole('heading', { name: 'Fotos denunciadas', level: 1 })).toBeVisible();
    await expect(page.getByTestId('stp-tab-open')).toHaveAttribute('aria-current', 'page');
    await page.getByTestId('stp-tab-decided').click();
    await expect(page).toHaveURL(/status=decided/);
    await expect(page.getByTestId('stp-photo-board')).toBeVisible();
    await expect(page.getByTestId('stp-query')).toBeVisible();
  });

  test('acessibilidade da fila de fotos (claro e escuro)', async ({ page }) => {
    const server = createServer();
    await signInAsStaff(page, server, 'owner');
    for (const theme of ['dark', 'light']) {
      await page.context().addCookies([{ name: 'stp-theme', value: theme, url: STAFF }]);
      await page.goto('/fotos');
      await expect(page.getByTestId('stp-photo-board')).toBeVisible();
      expect(await axeViolations(page), theme).toEqual([]);
    }
  });
});
