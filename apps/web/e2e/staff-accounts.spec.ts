import { randomInt } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import { chooseSteamAccount, grantStaffRole, newSteamId, signInByRequest } from './accounts';
import { axeViolations } from './fixtures';
import { connectPlayer, createServer, type E2eServer } from './live-servers';

/**
 * As Contas no painel da Staff (S25 PR D, `apps/staff`): busca, ficha, aplicar Punição (sugestão da tabela, prova do cheat,
 * Denúncia de origem), revogar e resetar o Nome de exibição. O painel é outro host (porta 3200 no E2E) com a própria
 * sessão; a API é a mesma.
 */
const STAFF = `http://localhost:${process.env.STAFF_E2E_PORT ?? 3200}`;

test.use({ baseURL: STAFF });

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

/** Um jogador comum que já conectou: tem Conta (não reivindicada) e aparece na busca pelo SteamID64. */
async function seedPlayer(page: Page, server: E2eServer) {
  const name = `Alvo-${randomInt(100_000, 999_999)}`;
  const steamId = newSteamId();
  await connectPlayer(page.request, server, steamId, name);
  return { name, steamId };
}

async function openFile(page: Page, steamId: string) {
  await page.goto('/contas');
  await page.getByTestId('staff-search').fill(steamId);
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(page.getByTestId('staff-account-result')).toHaveCount(1);
  await page.getByTestId('staff-account-result').click();
  await expect(page.getByTestId('account-file')).toBeVisible();
}

test.describe('Contas no painel', () => {
  test('a busca acha a Conta pelo SteamID64, mostra quem é da Staff sem busca e avisa busca curta', async ({
    page,
  }) => {
    const server = createServer();
    const { steamId } = await seedPlayer(page, server);
    await signInAsStaff(page, server, 'moderator');

    await page.goto('/contas');
    await expect(page.getByTestId('staff-members')).toBeVisible();
    await page.getByTestId('staff-search').fill('a');
    await expect(page.getByText('Digite pelo menos 2 caracteres.')).toBeVisible();

    await page.getByTestId('staff-search').fill(steamId);
    await expect(page.getByTestId('staff-account-result')).toHaveCount(1);
    await expect(page.getByTestId('staff-account-result')).toContainText('Não reivindicada');

    await page.goto('/contas?q=ZZZ-ninguem-assim');
    await expect(page.getByTestId('staff-no-results')).toBeVisible();
  });

  test('aplicar Punição: sugestão da tabela, motivo obrigatório, revisão e histórico; revogar com recurso aceito', async ({
    page,
  }) => {
    const server = createServer();
    const { steamId } = await seedPlayer(page, server);
    await signInAsStaff(page, server, 'owner');
    await openFile(page, steamId);

    await page.getByTestId('sanction-category').selectOption('offensive_chat');
    await expect(page.getByTestId('sanction-suggestion')).toContainText('1ª ocorrência');
    await expect(page.getByTestId('suggestion-state')).toHaveAttribute('data-follows', 'true');
    const suggested = (await page.getByTestId('suggested-measures').innerText()).trim();

    // Ajustar a medida tira do "segue a tabela".
    await page.getByTestId('measure-type').first().selectOption('ban');
    await expect(page.getByTestId('suggestion-state')).toHaveAttribute('data-follows', 'false');
    await page.getByRole('button', { name: 'Voltar à sugestão' }).click();
    await expect(page.getByTestId('suggestion-state')).toHaveAttribute('data-follows', 'true');

    await page.getByTestId('sanction-review').click();
    await expect(
      page.getByRole('alert').or(page.locator('.stp-field-error')).first(),
    ).toContainText('pelo menos 3 caracteres');
    await page.getByTestId('sanction-reason-input').fill('Ofendeu outro jogador no chat.');
    await page.getByTestId('sanction-review').click();
    await expect(page.getByTestId('sanction-confirm')).toContainText(suggested);
    await page.getByTestId('sanction-apply').click();
    await expect(page.getByTestId('apply-done')).toBeVisible();

    const history = page.getByTestId('staff-sanction');
    await expect(history).toHaveCount(1);
    await expect(history.first()).toContainText('Ofendeu outro jogador no chat.');
    await expect(page.getByTestId('audit-entries')).toContainText('Aplicou punição');

    // O jogador agora conta 1 ocorrência nessa Categoria na janela de 30 dias.
    await page.getByTestId('sanction-category').selectOption('offensive_chat');
    await expect(page.getByTestId('sanction-suggestion')).toContainText('2ª ocorrência');
    await page.getByTestId('sanction-category').selectOption('');

    // Punição de aviso ou kick fica "Registrada"; a revogação com recurso aceito a tira da reincidência.
    await history.first().getByTestId('revoke-form-open').click();
    await history.first().getByTestId('revoke-appeal').check();
    await history.first().getByTestId('revoke-form-reason').fill('Recurso aceito pela moderação.');
    await history.first().getByRole('button', { name: 'Revogar punição' }).click();
    await expect(history.first()).toHaveAttribute('data-state', 'appeal');
    await expect(history.first()).toContainText('Recurso aceito pela moderação.');
    await page.getByTestId('sanction-category').selectOption('offensive_chat');
    await expect(page.getByTestId('sanction-suggestion')).toContainText('1ª ocorrência');

    expect(await axeViolations(page)).toEqual([]);
  });

  test('ban por cheat exige testemunha ou link da evidência, e o Perfil público diz o que aparece', async ({
    page,
  }) => {
    const server = createServer();
    const { steamId } = await seedPlayer(page, server);
    await signInAsStaff(page, server, 'owner');
    await openFile(page, steamId);

    await page.getByTestId('sanction-category').selectOption('cheat');
    await expect(page.getByTestId('cheat-proof')).toBeVisible();
    await page.getByTestId('sanction-reason-input').fill('Wallhack evidente no demo.');
    await page.getByTestId('sanction-review').click();
    await expect(page.getByText('Informe a testemunha ou o link da evidência.')).toBeVisible();

    await page.getByTestId('proof-evidence').fill('não é um link');
    await page.getByTestId('sanction-review').click();
    await expect(page.getByText('Use um link que comece com http:// ou https://.')).toBeVisible();

    await page.getByTestId('proof-evidence').fill('https://example.com/clipe');
    await page.getByTestId('sanction-review').click();
    await expect(page.getByTestId('proof-public')).toContainText('“Cheat”');
    await page.getByTestId('sanction-apply').click();
    await expect(page.getByTestId('apply-done')).toBeVisible();
    await expect(page.getByTestId('sanction-proof')).toContainText('Evidência anexada');
    await expect(page.getByTestId('file-status')).toContainText('Ban');
  });

  test('o Moderador não pune a si mesmo; Moderador não oferece punição permanente', async ({
    page,
  }) => {
    const server = createServer();
    // O jogador é criado antes da sessão: o connect do servidor não aceita a sessão do painel aberta.
    const { steamId } = await seedPlayer(page, server);
    await signInAsStaff(page, server, 'moderator');

    const me = (await (await page.request.get('/api/me')).json()) as {
      account: { publicId: number };
    };
    await page.goto(`/contas/${me.account.publicId}`);
    await expect(page.getByTestId('sanction-guard')).toContainText('não pode se punir');
    await expect(page.getByTestId('apply-sanction')).toHaveCount(0);

    await openFile(page, steamId);
    await page.getByTestId('sanction-category').selectOption('offensive_chat');
    await page.getByTestId('measure-type').first().selectOption('ban');
    await expect(page.getByTestId('measure-permanent')).toBeDisabled();
  });

  test('resetar o Nome de exibição pede motivo e mostra o resultado na ficha', async ({ page }) => {
    const server = createServer();
    const { steamId } = await seedPlayer(page, server);
    await signInAsStaff(page, server, 'owner');
    await openFile(page, steamId);

    await page.getByTestId('name-reset-open').click();
    await page.getByRole('button', { name: 'Resetar nome' }).click();
    await expect(page.getByRole('alert').first()).toContainText('pelo menos 3 caracteres');
    await page.getByTestId('name-reset-reason').fill('Nome ofensivo.');
    await page.getByRole('button', { name: 'Resetar nome' }).click();
    await expect(page.getByTestId('name-reset-done')).toBeVisible();
    await expect(page.getByTestId('audit-entries')).toContainText('Resetou o nome');
  });

  test('da Denúncia para a ficha: a Punição aplicada fecha o caso como punido', async ({
    page,
  }) => {
    const server = createServer();
    const [first, second, target] = [newSteamId(), newSteamId(), newSteamId()];
    const name = `Alvo-${randomInt(100_000, 999_999)}`;
    await connectPlayer(page.request, server, first, 'Denunciante A');
    await connectPlayer(page.request, server, second, 'Denunciante B');
    await connectPlayer(page.request, server, target, name);
    for (const reporter of [first, second]) {
      const response = await page.request.post('/api/server/reports', {
        headers: { authorization: `Bearer ${server.key}` },
        data: {
          reporterSteamId: reporter,
          targetSteamId: target,
          reason: 'offensive_chat',
          round: 4,
          map: 'de_inferno',
        },
      });
      expect(response.status()).toBe(200);
    }
    await signInAsStaff(page, server, 'owner');

    await page.goto('/denuncias');
    await page.getByTestId('stp-query').fill(name);
    await page.getByTestId('stp-row').first().click();
    await page.getByTestId('report-punish').click();
    await expect(page.getByTestId('account-file')).toBeVisible();
    await expect(page.getByTestId('apply-from-report')).toBeVisible();

    await page.getByTestId('sanction-category').selectOption('offensive_chat');
    await page.getByTestId('sanction-reason-input').fill('Confirmado pela linha do tempo do caso.');
    await page.getByTestId('sanction-review').click();
    await page.getByTestId('sanction-apply').click();
    await expect(page.getByTestId('apply-done')).toBeVisible();
    await expect(page.getByTestId('apply-from-report')).toHaveCount(0);

    await page.goto('/denuncias');
    await page.getByTestId('stp-query').fill(name);
    await expect(page.getByTestId('stp-row')).toHaveCount(0);
    await page.getByTestId('stp-tab-sanctioned').click();
    await page.getByTestId('stp-query').fill(name);
    await expect(page.getByTestId('stp-row')).toHaveCount(1);
    await expect(page.getByTestId('stp-row').first()).toContainText('Punida');
  });
});
