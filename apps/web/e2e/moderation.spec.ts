import { randomInt } from 'node:crypto';
import type { Browser, Page } from '@playwright/test';
import {
  csrfToken,
  grantStaffRole,
  newSteamId,
  signInByRequest,
  signInFromHeader,
} from './accounts';
import { axeViolations, expect, saveTheme, test } from './fixtures';
import { openAccountMenu } from './hydration';
import { connectPlayer, createServer, heartbeat } from './live-servers';

/**
 * S07 · Moderação essencial, o lado do site: o aviso do jogador punido, a sessão encerrada no ban, as Punições no Perfil
 * e o caminho de recurso. O painel da Staff é outra aplicação (S25, `apps/staff`) e tem os próprios E2E; aqui a Staff só
 * aplica a Punição pela API, como o painel faz, e o `/staff` do site confere o redirecionamento.
 */

const NOT_FOUND = /404 (Not Found)/;
const UNAUTHORIZED = /401 (Unauthorized)/;
const STAFF = `http://localhost:${process.env.STAFF_E2E_PORT ?? 3200}`;
const DAY = 24 * 60;

/** Uma Conta reivindicada (já entrou no site) neste navegador, com o nome Steam dado. */
async function signedInPlayer(page: Page, steamName: string) {
  const steamId = newSteamId();
  const server = createServer();
  await connectPlayer(page.request, server, steamId, steamName);
  await signInByRequest(page, steamId);
  await page.goto('/');
  await expect(page.getByTestId('account-menu')).toBeVisible();
  const me = (await (await page.request.get('/api/me')).json()) as {
    account: { publicId: number; displayName: string };
  };
  return { steamId, server, publicId: me.account.publicId, displayName: me.account.displayName };
}

/** Uma Conta da Staff com o papel dado, já com a sessão vendo o papel. */
async function staffMember(browser: Browser, role: 'owner' | 'admin' | 'moderator') {
  const context = await browser.newContext();
  const page = await context.newPage();
  const staff = await signedInPlayer(page, `Staff ${role}`);
  grantStaffRole(staff.steamId, role);
  await page.reload();
  return { page, ...staff };
}

type StaffDetail = { sanctions: { id: string }[] };

/** Aplica uma Punição como o painel faz (`POST /api/staff/accounts/{publicId}/sanctions`). */
async function applySanction(
  staff: Page,
  publicId: number,
  body: {
    category: string;
    reason: string;
    measures: { type: string; durationMinutes: number | null }[];
  },
) {
  const response = await staff.request.post(`/api/staff/accounts/${publicId}/sanctions`, {
    headers: { 'x-csrf-token': await csrfToken(staff.context()) },
    data: body,
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as StaffDetail;
}

test.describe('Punições, vistas do site', () => {
  test.beforeEach(({ expectedConsoleErrors }) => {
    expectedConsoleErrors.push(NOT_FOUND, UNAUTHORIZED);
  });

  test('/staff redireciona para o painel, e só quem é da Staff vê o atalho no menu', async ({
    browser,
    page,
    request,
  }) => {
    const home = await request.get('/staff', { maxRedirects: 0 });
    expect(home.status()).toBe(307);
    // O atalho vai para o Início do painel; a busca antiga, para Contas; o resto mantém o caminho e a consulta.
    expect(home.headers().location).toBe(`${STAFF}/`);
    const search = await request.get('/staff?q=10016', { maxRedirects: 0 });
    expect(search.headers().location).toBe(`${STAFF}/contas?q=10016`);
    const audit = await request.get('/staff/auditoria?acao=vip_grant', { maxRedirects: 0 });
    expect(audit.headers().location).toBe(`${STAFF}/auditoria?acao=vip_grant`);
    const account = await request.get('/staff/contas/10016', { maxRedirects: 0 });
    expect(account.headers().location).toBe(`${STAFF}/contas/10016`);

    // Sem papel, o menu da Conta não leva ao painel.
    await signedInPlayer(page, 'Jogador Comum');
    await openAccountMenu(page);
    await expect(page.getByTestId('staff-panel-link')).toHaveCount(0);

    // Com papel, o atalho sai do site e vai para o painel.
    const owner = await staffMember(browser, 'owner');
    await owner.page.goto('/');
    await openAccountMenu(owner.page);
    await owner.page.getByTestId('staff-panel-link').click();
    await owner.page.waitForURL((url) => url.origin === STAFF);
    await owner.page.context().close();
  });

  test('Staff aplica ban: o jogador perde a sessão, vê o aviso ao voltar e o Perfil mostra a Punição sem o motivo', async ({
    browser,
    page,
    request,
  }) => {
    const player = await signedInPlayer(page, 'Banido Teste');
    await heartbeat(request, player.server, [player.steamId]);
    const owner = await staffMember(browser, 'owner');

    const reason = `TK proposital na rodada ${randomInt(1000, 9999)}`;
    await applySanction(owner.page, player.publicId, {
      category: 'griefing',
      reason,
      measures: [{ type: 'ban', durationMinutes: 2 * DAY }],
    });

    // O próximo batimento manda o ban para o Carmine.Core derrubar o jogador.
    const beat = await request.post('/api/server/heartbeat', {
      headers: { authorization: `Bearer ${player.server.key}` },
      data: { map: 'de_mirage', players: [player.steamId], maxPlayers: 9 },
    });
    expect((await beat.json()).sanctions).toContainEqual(
      expect.objectContaining({ steamId: player.steamId, type: 'ban' }),
    );

    // A sessão do site caiu: o jogador volta a ser visitante.
    await page.reload();
    await expect(page.getByTestId('sign-in')).toBeVisible();
    expect((await page.request.get('/api/me')).status()).toBe(401);

    // Entrando de novo, vê a Punição, o motivo e como recorrer.
    await signInFromHeader(page, player.steamId);
    const notice = page.getByTestId('sanction-notice');
    await expect(notice).toContainText('Sua Conta está banida dos Servidores Carmine');
    // Os botões do aviso alinham com a coluna do texto, sem margem negativa.
    const noticeText = await notice.getByText('Sua Conta está banida').boundingBox();
    const noticeButton = await notice.getByRole('link').first().boundingBox();
    expect(Math.abs((noticeButton?.x ?? -99) - (noticeText?.x ?? 99))).toBeLessThanOrEqual(1);
    await expect(notice).toContainText('Motivo: Griefing');
    await expect(notice).toContainText(reason);
    await expect(notice).toContainText('72 h');
    await expect(notice.getByRole('link', { name: 'Como recorrer' })).toHaveAttribute(
      'href',
      '/rules#appeal',
    );
    // Banido não muda nada no site.
    const blocked = await page.request.post('/api/presets', {
      headers: { 'x-csrf-token': await csrfToken(page.context()) },
      data: { name: 'x' },
    });
    expect(blocked.status()).toBe(403);
    expect(((await blocked.json()) as { code?: string }).code).toBe('account_banned');

    // Perfil público (visitante): só o selo, sem o histórico; fora dos buscadores.
    const visitor = await browser.newPage();
    await visitor.goto(`/${player.publicId}`);
    await expect(visitor.getByTestId('sanction-badges')).toContainText(/Banido até \d{2}\/\d{2}/);
    await expect(visitor.getByTestId('sanction-history')).toHaveCount(0);
    await expect(visitor.locator('meta[name=robots]')).toHaveAttribute('content', /noindex/);
    await expect(visitor.getByText(reason)).toHaveCount(0);
    await visitor.close();
    await owner.page.context().close();
  });

  test('Staff revoga a Punição por recurso: o Perfil volta ao normal', async ({
    browser,
    page,
  }) => {
    const player = await signedInPlayer(page, 'Banido Recorrente');
    const owner = await staffMember(browser, 'owner');
    const reason = `TK proposital na rodada ${randomInt(1000, 9999)}`;
    const applied = await applySanction(owner.page, player.publicId, {
      category: 'griefing',
      reason,
      measures: [{ type: 'ban', durationMinutes: 2 * DAY }],
    });

    // Logado: o histórico, nunca o motivo livre.
    await owner.page.goto(`/${player.publicId}`);
    const history = owner.page.getByTestId('sanction-history');
    await expect(history).toContainText('Ban');
    await expect(history).toContainText('Griefing');
    await expect(history).toContainText('2 dias');
    await expect(owner.page.getByText(reason)).toHaveCount(0);

    // Revogar (recurso aceito) tira do Perfil.
    const revoked = await owner.page.request.post(
      `/api/staff/sanctions/${applied.sanctions[0]?.id}/revoke`,
      {
        headers: { 'x-csrf-token': await csrfToken(owner.page.context()) },
        data: { reason: 'Recurso aceito: clipe mostrou outro jogador', appealAccepted: true },
      },
    );
    expect(revoked.status()).toBe(200);
    await page.goto(`/${player.publicId}`);
    await expect(page.getByTestId('sanction-badges')).toHaveCount(0);
    await expect(page.getByTestId('sanction-history')).toHaveCount(0);
    await expect(page.getByTestId('sanction-notice')).toHaveCount(0);
    await owner.page.context().close();
  });
});

test('as Regras de conduta têm o caminho de recurso em /rules#appeal', async ({ page }) => {
  await page.goto('/rules#appeal');
  await expect(page.getByRole('heading', { level: 1, name: 'Regras de conduta' })).toBeVisible();
  await expect(page.locator('#appeal')).toBeVisible();
  await expect(page.locator('#appeal')).toContainText('Recurso');
  // Nada de marcador de revisão jurídica cru na página.
  await expect(page.getByText('[VALIDAR COM ADVOGADO]')).toHaveCount(0);
});

test.describe('acessibilidade da moderação (axe)', () => {
  test.beforeEach(({ expectedConsoleErrors }) => {
    expectedConsoleErrors.push(NOT_FOUND);
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`aviso e Perfil punido sem violações (${theme})`, async ({ browser, page }) => {
      const player = await signedInPlayer(page, 'Axe Punido');
      const owner = await staffMember(browser, 'owner');
      await applySanction(owner.page, player.publicId, {
        category: 'offensive_chat',
        reason: 'Ofensa repetida ao mesmo jogador',
        measures: [{ type: 'gag', durationMinutes: 60 }],
      });

      await saveTheme(page, theme);
      await page.goto('/');
      await expect(page.getByTestId('sanction-notice')).toContainText('sem chat');
      expect(await axeViolations(page), `aviso (${theme})`).toEqual([]);
      await page.goto(`/${player.publicId}`);
      await expect(page.getByTestId('sanction-badges')).toContainText('Silenciado no chat até');
      expect(await axeViolations(page), `Perfil (${theme})`).toEqual([]);
      await page.goto('/rules');
      expect(await axeViolations(page), `regras (${theme})`).toEqual([]);
      await owner.page.context().close();
    });
  }
});
