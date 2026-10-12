import { randomInt } from 'node:crypto';
import type { Browser, Page } from '@playwright/test';
import { csrfToken, grantStaffRole, newSteamId, signInFromHeader } from './accounts';
import { axeViolations, expect, saveTheme, test } from './fixtures';
import { connectPlayer, createServer, heartbeat, keepBeating } from './live-servers';

/**
 * S07 · Moderação essencial: o painel da Staff, a sugestão pela tabela, o aviso do jogador
 * punido, a sessão encerrada no ban, as Punições no Perfil e o nome de vitrine dos servidores.
 */

const NOT_FOUND = /404 \(Not Found\)/;
const UNAUTHORIZED = /401 \(Unauthorized\)/;

/** Uma Conta reivindicada (já entrou no site) neste navegador, com o nome Steam dado. */
async function signedInPlayer(page: Page, steamName: string) {
  const steamId = newSteamId();
  const server = createServer();
  await connectPlayer(page.request, server, steamId, steamName);
  await page.goto('/');
  await signInFromHeader(page, steamId);
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

async function openFile(page: Page, publicId: number) {
  await page.goto(`/staff?q=${publicId}`);
  await page.getByTestId('staff-result').first().click();
  await expect(page.getByTestId('account-file')).toHaveAttribute(
    'data-public-id',
    String(publicId),
  );
}

async function applySanction(
  page: Page,
  category: string,
  reason: string,
  adjust?: { type: string; value: string; unit: string },
) {
  await page.getByTestId('sanction-category').selectOption(category);
  if (adjust) {
    const row = page.getByTestId('measure-row').first();
    await row.getByTestId('measure-type').selectOption(adjust.type);
    await row.getByTestId('measure-value').fill(adjust.value);
    await row.getByTestId('measure-unit').selectOption(adjust.unit);
  }
  await page.getByTestId('apply-sanction').getByTestId('reason').fill(reason);
  await page.getByTestId('sanction-review').click();
  await expect(page.getByTestId('sanction-confirm')).toBeVisible();
  await page.getByTestId('sanction-apply').click();
  await expect(page.getByTestId('apply-sanction').getByRole('status')).toHaveText(
    'Punição aplicada.',
  );
}

test.describe('Painel da Staff', () => {
  test.beforeEach(({ expectedConsoleErrors }) => {
    expectedConsoleErrors.push(NOT_FOUND, UNAUTHORIZED);
  });

  test('quem não é da Staff recebe 404 em /staff', async ({ page }) => {
    expect((await page.goto('/staff'))?.status()).toBe(404);
    await signedInPlayer(page, 'Jogador Comum');
    expect((await page.goto('/staff'))?.status()).toBe(404);
    expect((await page.goto('/staff/auditoria'))?.status()).toBe(404);
    // Sem papel, o menu da Conta não leva ao painel.
    await page.goto('/');
    await page.getByTestId('account-menu').click();
    await expect(page.getByTestId('staff-panel-link')).toHaveCount(0);
  });

  test('Staff aplica ban: o jogador perde a sessão, vê o aviso ao voltar e o Perfil mostra a Punição sem o motivo', async ({
    browser,
    page,
    request,
  }) => {
    const player = await signedInPlayer(page, 'Banido Teste');
    await heartbeat(request, player.server, [player.steamId]);
    const owner = await staffMember(browser, 'owner');

    await owner.page.getByTestId('account-menu').click();
    await owner.page.getByTestId('staff-panel-link').click();
    await expect(owner.page.getByRole('heading', { name: 'Painel da Staff' })).toBeVisible();
    await openFile(owner.page, player.publicId);

    const reason = `TK proposital na rodada ${randomInt(1000, 9999)}`;
    await applySanction(owner.page, 'griefing', reason, { type: 'ban', value: '2', unit: 'day' });
    const item = owner.page.getByTestId('staff-sanction').first();
    await expect(item).toHaveAttribute('data-state', 'active');
    await expect(item.getByTestId('sanction-reason')).toHaveText(reason);
    await expect(owner.page.getByTestId('file-status')).toContainText('Ban');

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
    await expect(notice).toContainText('Motivo: Griefing');
    await expect(notice).toContainText(reason);
    await expect(notice).toContainText('72 h');
    await expect(notice.getByRole('link', { name: 'Como recorrer' })).toHaveAttribute(
      'href',
      '/regras#recurso',
    );
    // Banido não muda nada no site.
    const blocked = await page.request.post('/api/presets', {
      headers: { 'x-csrf-token': await csrfToken(page.context()) },
      data: { name: 'x' },
    });
    expect(blocked.status()).toBe(403);
    expect(((await blocked.json()) as { code?: string }).code).toBe('account_banned');

    // Perfil público (visitante): o selo e o histórico, nunca o motivo livre.
    const visitor = await browser.newPage();
    await visitor.goto(`/${player.publicId}`);
    await expect(visitor.getByTestId('sanction-badges')).toContainText(/Banido até \d{2}\/\d{2}/);
    const history = visitor.getByTestId('sanction-history');
    await expect(history).toContainText('Ban');
    await expect(history).toContainText('Griefing');
    await expect(history).toContainText('2 dias');
    await expect(visitor.getByText(reason)).toHaveCount(0);
    await visitor.close();

    // Revogar (recurso aceito) tira do Perfil.
    await owner.page
      .getByTestId('staff-sanction')
      .first()
      .getByRole('button', { name: 'Revogar' })
      .click();
    const revoke = owner.page.getByTestId('revoke-form');
    await revoke.getByRole('checkbox', { name: /Recurso aceito/ }).check();
    await revoke.getByTestId('reason').fill('Recurso aceito: clipe mostrou outro jogador');
    await revoke.getByRole('button', { name: 'Revogar punição' }).click();
    await expect(owner.page.getByTestId('staff-sanction').first()).toHaveAttribute(
      'data-state',
      'appeal',
    );
    await page.goto(`/${player.publicId}`);
    await expect(page.getByTestId('sanction-badges')).toHaveCount(0);
    await expect(page.getByTestId('sanction-history')).toHaveCount(0);
    await expect(page.getByTestId('sanction-notice')).toHaveCount(0);

    // O log de auditoria filtrado pelo alvo mostra as duas ações, com o motivo.
    await owner.page.goto(`/staff/auditoria?alvo=${player.steamId}`);
    const log = owner.page.getByTestId('audit-entries');
    await expect(log.locator('[data-action=sanction_apply]')).toContainText(reason);
    await expect(log.locator('[data-action=sanction_revoke]')).toContainText('Recurso aceito');

    await owner.page.context().close();
  });

  test('a sugestão segue a tabela de reincidência e o ajuste fica marcado', async ({
    browser,
    page,
  }) => {
    const player = await signedInPlayer(page, 'Reincidente');
    const owner = await staffMember(browser, 'owner');
    await openFile(owner.page, player.publicId);
    const form = owner.page.getByTestId('apply-sanction');

    const expectSuggestion = async (category: string, offense: number, text: string) => {
      await owner.page.getByTestId('sanction-category').selectOption(category);
      const suggestion = owner.page.getByTestId('sanction-suggestion');
      await expect(suggestion).toHaveAttribute('data-offense', String(offense));
      await expect(owner.page.getByTestId('suggested-measures')).toHaveText(text);
      await expect(owner.page.getByTestId('suggestion-state')).toHaveText('Segue a tabela');
    };

    await expectSuggestion('griefing', 1, 'Kick');
    await expectSuggestion('exploit', 1, 'Ban de 1 dia');
    await expectSuggestion('discrimination', 1, 'Gag de 7 dias + Ban de 1 dia');
    await expect(form.getByTestId('measure-row')).toHaveCount(2);
    await expectSuggestion('cheat', 1, 'Ban permanente');
    await expect(form.getByTestId('measure-permanent')).toBeChecked();

    // Ajustar a duração marca "Ajustado"; "Voltar à sugestão" restaura a tabela.
    await expectSuggestion('offensive_chat', 1, 'Aviso');
    await form.getByTestId('measure-type').selectOption('gag');
    await expect(owner.page.getByTestId('suggestion-state')).toHaveText('Ajustado pela Staff');
    await form.getByRole('button', { name: 'Voltar à sugestão' }).click();
    await expect(owner.page.getByTestId('suggestion-state')).toHaveText('Segue a tabela');

    // Aplicada a 1ª de griefing (kick), a próxima sugestão é a 2ª: ban de 1 dia.
    await applySanction(owner.page, 'griefing', 'AFK ocupando vaga no Retake');
    await expectSuggestion('griefing', 2, 'Ban de 1 dia');

    await owner.page.context().close();
  });

  test('Moderador não altera papéis nem aplica punição permanente', async ({ browser, page }) => {
    const player = await signedInPlayer(page, 'Alvo do Moderador');
    const mod = await staffMember(browser, 'moderator');

    // Sem as abas de Auditoria e Servidores.
    await mod.page.goto('/staff');
    await expect(mod.page.getByRole('link', { name: 'Auditoria' })).toHaveCount(0);
    expect((await mod.page.goto('/staff/servidores'))?.status()).toBe(404);

    await openFile(mod.page, player.publicId);
    await expect(mod.page.getByTestId('role-readonly')).toHaveText('Papel atual: Sem papel');
    await expect(mod.page.getByText('Só o Dono altera papéis de Staff.')).toBeVisible();
    await expect(mod.page.getByTestId('role-form')).toHaveCount(0);
    await mod.page.getByTestId('sanction-category').selectOption('exploit');
    await expect(mod.page.getByTestId('measure-permanent')).toBeDisabled();

    // E a API também recusa, mesmo chamada direto.
    const response = await mod.page.request.put(`/api/staff/accounts/${player.publicId}/role`, {
      headers: { 'x-csrf-token': await csrfToken(mod.page.context()) },
      data: { role: 'admin', reason: 'tentativa do E2E' },
    });
    expect(response.status()).toBe(403);
    await mod.page.context().close();
  });
});

test.describe('Servidores com nome de vitrine e código', () => {
  test.beforeEach(({ expectedConsoleErrors }) => {
    expectedConsoleErrors.push(NOT_FOUND);
  });

  test('o nome de vitrine e o código da Staff aparecem na home e no Conectar', async ({
    browser,
    page,
    request,
  }) => {
    const server = createServer();
    // Online durante o teste inteiro (offline desabilita o Conectar).
    const stop = keepBeating(request, server, () => []);
    const admin = await staffMember(browser, 'admin');
    await admin.page.goto('/staff/servidores');
    const row = admin.page.locator(`[data-testid=staff-server][data-server="${server.name}"]`);
    await row.getByRole('button', { name: 'Salvar' }).click();
    const letters = String.fromCharCode(65 + randomInt(26), 65 + randomInt(26), 65 + randomInt(26));
    const typed = `${letters.toLowerCase()}.${randomInt(1, 99)}`;
    const code = typed.toUpperCase().replace('.', '·');
    await row.getByTestId('server-showcase-name').fill('Retake · Rotação');
    await row.getByTestId('server-code-input').fill(typed);
    await row.getByTestId('server-code-input').blur();
    await expect(row.getByTestId('server-code-input')).toHaveValue(code);
    await expect(row.getByTestId('hostname-preview')).toHaveText(
      `Carmine | Retake · Rotação | ${code}`,
    );
    await row.getByTestId('reason').fill('Nome de lançamento');
    await row.getByTestId('server-form').getByRole('button', { name: 'Salvar' }).click();
    await expect(row.getByRole('status').last()).toHaveText('Salvo.');

    await page.goto('/');
    const home = page.locator(`[data-testid=server-row][data-server="${server.name}"]`);
    await expect(home.getByRole('heading', { name: 'Retake · Rotação' })).toBeVisible();
    await expect(home.getByTestId('server-code')).toHaveText(code);
    await expect(
      home.getByRole('link', { name: new RegExp(`Retake · Rotação \\(${code}\\)`) }),
    ).toBeVisible();

    // A auditoria registra a edição.
    await admin.page.goto('/staff/auditoria?acao=server_update');
    await expect(admin.page.getByTestId('audit-entries').first()).toContainText(
      'Nome de lançamento',
    );
    stop();
    await admin.page.context().close();
  });
});

test('as Regras de conduta têm o caminho de recurso em /regras#recurso', async ({ page }) => {
  await page.goto('/regras#recurso');
  await expect(page.getByRole('heading', { level: 1, name: 'Regras de conduta' })).toBeVisible();
  await expect(page.locator('#recurso')).toBeVisible();
  await expect(page.locator('#recurso')).toContainText('Recurso');
  // Nada de marcador de revisão jurídica cru na página.
  await expect(page.getByText('[VALIDAR COM ADVOGADO]')).toHaveCount(0);
});

test.describe('acessibilidade da moderação (axe)', () => {
  test.beforeEach(({ expectedConsoleErrors }) => {
    expectedConsoleErrors.push(NOT_FOUND);
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`painel, aviso e Perfil punido sem violações (${theme})`, async ({ browser, page }) => {
      const player = await signedInPlayer(page, 'Axe Punido');
      const owner = await staffMember(browser, 'owner');
      await saveTheme(owner.page, theme);
      await openFile(owner.page, player.publicId);
      await applySanction(owner.page, 'offensive_chat', 'Ofensa repetida ao mesmo jogador', {
        type: 'gag',
        value: '1',
        unit: 'hour',
      });
      for (const path of [
        '/staff',
        `/staff?q=${player.publicId}`,
        `/staff/contas/${player.publicId}`,
        '/staff/auditoria',
        '/staff/servidores',
      ]) {
        await owner.page.goto(path);
        expect(await axeViolations(owner.page), `${path} (${theme})`).toEqual([]);
      }

      await saveTheme(page, theme);
      await page.goto('/');
      await expect(page.getByTestId('sanction-notice')).toContainText('sem chat');
      expect(await axeViolations(page), `aviso (${theme})`).toEqual([]);
      await page.goto(`/${player.publicId}`);
      await expect(page.getByTestId('sanction-badges')).toContainText('Silenciado no chat até');
      expect(await axeViolations(page), `Perfil (${theme})`).toEqual([]);
      await page.goto('/regras');
      expect(await axeViolations(page), `regras (${theme})`).toEqual([]);
      await owner.page.context().close();
    });
  }
});
