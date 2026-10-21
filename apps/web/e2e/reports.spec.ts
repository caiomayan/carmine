import { randomInt, randomUUID } from 'node:crypto';
import type { Browser, Page } from '@playwright/test';
import { grantStaffRole, newSteamId, signInByRequest } from './accounts';
import { axeViolations, chooseOption, expect, saveTheme, test } from './fixtures';
import { connectPlayer, createServer, type E2eServer } from './live-servers';

/**
 * S13 · Denúncias e log de chat: a Denúncia feita no jogo (o `POST /api/server/reports` do
 * Carmine.Core) chega à fila do painel com o chat do momento; a Staff arquiva com motivo ou
 * aplica a Punição, e a regra de evidência de cheat e voz aparece no painel.
 */

const NOT_FOUND = /404 \(Not Found\)/;

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

async function staffMember(browser: Browser, server: E2eServer, role: 'owner' | 'moderator') {
  const context = await browser.newContext();
  const page = await context.newPage();
  const steamId = newSteamId();
  await connectPlayer(page.request, server, steamId, `Staff ${role}`);
  await signInByRequest(page, steamId);
  grantStaffRole(steamId, role);
  await page.goto('/staff/denuncias');
  return { page, steamId };
}

test.describe('Denúncias', () => {
  test.beforeEach(({ expectedConsoleErrors }) => {
    expectedConsoleErrors.push(NOT_FOUND);
  });

  test('quem não é da Staff recebe 404 na fila', async ({ page }) => {
    expect((await page.goto('/staff/denuncias'))?.status()).toBe(404);
  });

  test('a Denúncia do jogo aparece na fila com o chat do momento; a segunda do mesmo alvo é recusada', async ({
    browser,
    page,
  }) => {
    const server = createServer();
    const [reporter, target] = [newSteamId(), newSteamId()];
    await connectPlayer(page.request, server, reporter, 'Denunciante E2E');
    await connectPlayer(page.request, server, target, 'Alvo E2E');
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
    expect(second.message).toMatch(/Tente de novo em \d+ min\./);

    const moderator = await staffMember(browser, server, 'moderator');
    const card = moderator.page.getByRole('article', { name: /Denúncia contra Alvo E2E/ });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('Chat ofensivo');
    await expect(card).toContainText('de_inferno');
    await expect(card).toContainText('round 4');
    await expect(card.getByTestId('report-chat')).toContainText(line);
    await expect(card.getByTestId('report-chat').locator('[data-from-target]')).toHaveCount(1);
    await expect(card.getByTestId('report-evidence')).toHaveCount(0);

    // A Staff arquiva com motivo; a Denúncia sai da fila e vai para a aba de arquivadas.
    await card.getByRole('button', { name: 'Arquivar com motivo' }).click();
    await card.getByTestId('reason').fill('Provocação leve, sem reincidência');
    await card.getByRole('button', { name: 'Arquivar Denúncia' }).click();
    await expect(card).toHaveCount(0);
    await moderator.page.goto('/staff/denuncias?status=archived');
    const archived = moderator.page.getByRole('article', { name: /Denúncia contra Alvo E2E/ });
    await expect(archived.getByTestId('report-resolution')).toContainText(
      'Provocação leve, sem reincidência',
    );
    await moderator.page.context().close();
  });

  test('Denúncia de cheat avisa que só vira Punição com evidência adicional', async ({
    browser,
    page,
  }) => {
    const server = createServer();
    const [reporter, target] = [newSteamId(), newSteamId()];
    await connectPlayer(page.request, server, reporter, 'Denunciante Cheat');
    await connectPlayer(page.request, server, target, 'Suspeito E2E');
    expect((await report(page, server, reporter, target, 'cheat')).accepted).toBe(true);

    const owner = await staffMember(browser, server, 'owner');
    const card = owner.page.getByRole('article', { name: /Denúncia contra Suspeito E2E/ });
    await expect(card.getByTestId('report-evidence')).toContainText('sem demo');

    // O botão leva à ficha da Conta com o formulário já ligado à Denúncia.
    await card.getByRole('link', { name: 'Aplicar Punição' }).click();
    await expect(owner.page.getByTestId('apply-from-report')).toContainText(
      'clipe enviado no Discord',
    );
    await chooseOption(owner.page, owner.page.getByTestId('sanction-category'), 'cheat');
    await expect(owner.page.getByTestId('proof-witness')).toBeVisible();
    await owner.page.context().close();
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`a fila passa na checagem de acessibilidade (${theme})`, async ({ browser, page }) => {
      const server = createServer();
      const [reporter, target] = [newSteamId(), newSteamId()];
      await connectPlayer(page.request, server, reporter, 'Denunciante A11y');
      await connectPlayer(page.request, server, target, 'Alvo A11y');
      await say(page, server, target, 'olá, pessoal');
      await report(page, server, reporter, target, 'voice');

      const owner = await staffMember(browser, server, 'owner');
      await saveTheme(owner.page, theme);
      for (const path of ['/staff/denuncias', '/staff/denuncias?status=archived']) {
        await owner.page.goto(path);
        expect(await axeViolations(owner.page), `${path} (${theme})`).toEqual([]);
      }
      await owner.page.context().close();
    });
  }
});
