import { randomInt, randomUUID } from 'node:crypto';
import type { Browser, Page } from '@playwright/test';
import { chooseSteamAccount, grantStaffRole, newSteamId, signInByRequest } from './accounts';
import { expect, test } from './fixtures';
import { connectPlayer, createServer, type E2eServer } from './live-servers';

/**
 * S13 · Denúncias e log de chat: a Denúncia feita no jogo (o `POST /api/server/reports` do Carmine.Core) é aceita ou
 * recusada pela API e chega à fila do painel da Staff (S25, `apps/staff`, outro host) com o chat do momento; a regra de
 * evidência de cheat e voz aparece no painel. A fila em si (casos, ordenação, arquivar, celular, acessibilidade) tem
 * E2E próprio em `staff-queues.spec.ts`.
 */

const STAFF = `http://localhost:${process.env.STAFF_E2E_PORT ?? 3200}`;

/** Quem fala no jogo: o Carmine.Core manda o chat no lote de eventos. */
async function say(page: Page, server: E2eServer, steamId: string, text: string) {
  const response = await page.request.post('/api/server/events', {
    headers: { authorization: `Bearer ${server.key}` },
    data: {
      kills: [],
      damages: [],
      roundEnds: [],
      sessionStarts: [],
      sessionEnds: [],
      chatMessages: [
        {
          id: randomUUID(),
          at: new Date().toISOString(),
          steamId,
          team: 't',
          teamChat: false,
          text,
        },
      ],
    },
  });
  expect(response.status()).toBe(200);
}

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
  return (await response.json()) as { accepted: boolean; message: string; refusal: string | null };
}

/** A Staff entra no painel (outro host) pela Steam falsa, num contexto próprio. */
async function staffInPanel(browser: Browser, server: E2eServer, role: 'owner' | 'moderator') {
  const context = await browser.newContext({ baseURL: STAFF });
  const page = await context.newPage();
  const steamId = newSteamId();
  await connectPlayer(page.request, server, steamId, `Staff ${role}`);
  await signInByRequest(page, steamId);
  grantStaffRole(steamId, role);
  await page.context().clearCookies();
  await chooseSteamAccount(page.context(), steamId);
  await page.goto('/entrar');
  await page.getByRole('link', { name: 'Entrar com a Steam' }).click();
  await expect(page.getByTestId('stp-home')).toBeVisible();
  return { page, steamId };
}

/** Abre o caso do alvo na fila de Denúncias do painel. */
async function openCase(page: Page, targetName: string) {
  await page.goto('/denuncias');
  await page.getByTestId('stp-query').fill(targetName);
  await expect(page.getByTestId('stp-row')).toHaveCount(1);
  await page.getByTestId('stp-row').first().click();
  const detail = page.getByTestId('stp-detail');
  await expect(detail).toBeVisible();
  return detail;
}

test.describe('Denúncias', () => {
  test('a Denúncia do jogo chega à fila com o chat do momento; a segunda do mesmo alvo é recusada', async ({
    browser,
    page,
  }) => {
    const server = createServer();
    const [reporter, target] = [newSteamId(), newSteamId()];
    const targetName = `Alvo-${randomInt(100_000, 999_999)}`;
    await connectPlayer(page.request, server, reporter, 'Denunciante E2E');
    await connectPlayer(page.request, server, target, targetName);
    const line = `você é um lixo ${randomInt(1000, 9999)}`;
    await say(page, server, target, line);

    const first = await report(page, server, reporter, target, 'offensive_chat');
    expect(first).toMatchObject({
      accepted: true,
      message: 'Denúncia recebida; a Staff analisa em até 72 h.',
    });
    const second = await report(page, server, reporter, target, 'griefing');
    expect(second.accepted).toBe(false);
    expect(second.refusal).toBe('same_target_cooldown');
    expect(second.message).toMatch(/Tente de novo em d+ min./);

    const moderator = await staffInPanel(browser, server, 'moderator');
    const detail = await openCase(moderator.page, targetName);
    await expect(detail).toContainText('Chat ofensivo');
    await expect(detail).toContainText('de_inferno');
    await expect(detail.getByTestId('report-chat')).toContainText(line);
    await expect(detail.getByTestId('report-chat').locator('[data-from-target]')).toHaveCount(1);
    await expect(detail.getByTestId('report-evidence')).toHaveCount(0);
    await moderator.page.context().close();
  });

  test('Denúncia de cheat avisa que só vira Punição com evidência adicional', async ({
    browser,
    page,
  }) => {
    const server = createServer();
    const [reporter, target] = [newSteamId(), newSteamId()];
    const targetName = `Suspeito-${randomInt(100_000, 999_999)}`;
    await connectPlayer(page.request, server, reporter, 'Denunciante Cheat');
    await connectPlayer(page.request, server, target, targetName);
    expect((await report(page, server, reporter, target, 'cheat')).accepted).toBe(true);

    const owner = await staffInPanel(browser, server, 'owner');
    const detail = await openCase(owner.page, targetName);
    await expect(detail.getByTestId('report-evidence')).toContainText('sem demo');

    // O botão leva à ficha da Conta, no painel, com o formulário já ligado à Denúncia.
    await owner.page.getByTestId('report-punish').click();
    await expect(owner.page.getByTestId('apply-from-report')).toContainText(
      'clipe enviado no Discord',
    );
    await owner.page.getByTestId('sanction-category').selectOption('cheat');
    await expect(owner.page.getByTestId('cheat-proof')).toBeVisible();
    await owner.page.context().close();
  });
});
