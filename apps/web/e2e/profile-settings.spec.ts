import { createUnclaimedAccount, newSteamId, signInByRequest } from './accounts';
import { runApiCli } from './api-cli';
import { axeViolations, expect, saveTheme, test, WIDTHS } from './fixtures';

/** O Chrome registra no console a recusa (409/422) que o teste provoca de propósito. */
const REFUSED = /status of (409|422)/;

/** O nome que a Conta mostra no site: o botão do menu da Conta o carrega (sempre atualizado). */
async function expectShownName(page: import('@playwright/test').Page, name: string) {
  await expect(page.getByTestId('account-menu')).toHaveAccessibleName(`Menu da Conta de ${name}`);
}

/** Entra com uma Conta que já jogou (nome Steam gravado) e abre Configurações > Perfil. */
async function ownProfile(
  page: import('@playwright/test').Page,
  request: import('@playwright/test').APIRequestContext,
  steamName: string,
) {
  const account = await createUnclaimedAccount(request, steamName);
  await signInByRequest(page, account.steamId);
  await page.goto('/configuracoes/perfil');
  await expect(page.getByTestId('profile-settings')).toBeVisible();
  return account;
}

/** O que o plugin recebe no connect: o nome que o jogo aplica. */
async function connectName(
  request: import('@playwright/test').APIRequestContext,
  steamId: string,
  steamName: string,
) {
  const response = await request.post('/api/server/player-connects', {
    headers: { authorization: `Bearer ${process.env.E2E_SERVER_KEY}` },
    data: { steamId, steamName },
  });
  return ((await response.json()) as { displayName: string }).displayName;
}

test('trocar o nome: aparece no Perfil e no próximo connect; antes de 7 dias é recusado com a data', async ({
  page,
  request,
  expectedConsoleErrors,
}) => {
  expectedConsoleErrors.push(REFUSED);
  const account = await ownProfile(page, request, 'Nome Da Steam');
  await expect(page.getByTestId('name-setting')).toContainText('Hoje vale o seu nome da Steam');

  await page.getByTestId('name-edit').click();
  const input = page.getByLabel('Novo nome');
  await expect(input).toBeFocused();
  await input.fill('  Fer   Ninja ');
  await page.getByTestId('name-save').click();

  await expect(page.getByTestId('name-saved')).toContainText('Nome alterado para Fer Ninja');
  await expectShownName(page, 'Fer Ninja');
  // O Perfil público mostra o nome novo.
  await page.goto(`/${account.publicId}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Fer Ninja' })).toBeVisible();
  await page.goto('/configuracoes/perfil');
  // O jogo recebe o nome no próximo connect, mesmo com outro nome Steam.
  expect(await connectName(request, account.steamId, 'Outro Nome Steam')).toBe('Fer Ninja');

  // Dentro dos 7 dias: o formulário avisa antes e a API recusa com a data.
  await page.getByTestId('name-edit').click();
  await expect(page.getByTestId('name-cooldown')).toContainText('Você só poderá trocar de novo em');
  await page.getByLabel('Novo nome').fill('Segundo Nome');
  await page.getByTestId('name-save').click();
  const error = page.getByTestId('name-form').getByText(/Você trocou de nome há pouco/);
  await expect(error).toBeVisible();
  await expect(error).toContainText('(horário de Brasília)');
  await expect(page.getByLabel('Novo nome')).toHaveAttribute('aria-invalid', 'true');
  await expectShownName(page, 'Fer Ninja');
  expect(await connectName(request, account.steamId, 'Outro Nome Steam')).toBe('Fer Ninja');
});

test('nomes fora das regras são recusados com mensagem clara e não gastam a troca', async ({
  page,
  request,
  expectedConsoleErrors,
}) => {
  expectedConsoleErrors.push(REFUSED);
  await ownProfile(page, request, 'Jogador Regras');
  await page.getByTestId('name-edit').click();
  const input = page.getByLabel('Novo nome');
  const save = page.getByTestId('name-save');

  await input.fill('A');
  await save.click();
  await expect(page.getByText('O nome precisa ter pelo menos 2 caracteres.')).toBeVisible();

  await input.fill('Filho da Puta');
  await save.click();
  await expect(page.getByText('Esse nome não é permitido. Escolha outro.')).toBeVisible();

  await input.fill('x'.repeat(25));
  await save.click();
  await expect(page.getByText('O nome pode ter no máximo 24 caracteres.')).toBeVisible();

  await input.fill('Nome Bom');
  await save.click();
  await expect(page.getByTestId('name-saved')).toBeVisible();
});

test('a Staff reseta o nome pelo CLI e o Perfil volta ao nome Steam', async ({ page, request }) => {
  const account = await ownProfile(page, request, 'Steam Original');
  await page.getByTestId('name-edit').click();
  await page.getByLabel('Novo nome').fill('Nome Proprio');
  await page.getByTestId('name-save').click();
  await expectShownName(page, 'Nome Proprio');

  const output = runApiCli('dist/staff/staff.cli.js', [
    'reset-name',
    '--steam-id',
    account.steamId,
    '--by',
    newSteamId(),
    '--reason',
    'E2E: nome ofensivo',
  ]);
  expect(output).toContain('agora aparece como "Steam Original"');

  await page.reload();
  await expectShownName(page, 'Steam Original');
  expect(await connectName(request, account.steamId, 'Steam Original')).toBe('Steam Original');
});

test('voltar ao nome Steam: confirma avisando do prazo, volta no site e no jogo e não reinicia os 7 dias', async ({
  page,
  request,
}) => {
  const account = await ownProfile(page, request, 'Steam De Volta');
  await expect(page.getByTestId('name-revert')).toHaveCount(0);
  await page.getByTestId('name-edit').click();
  await page.getByLabel('Novo nome').fill('Nome Temporario');
  await page.getByTestId('name-save').click();
  await expectShownName(page, 'Nome Temporario');

  await page.getByTestId('name-revert').click();
  const dialog = page.getByTestId('name-revert-dialog');
  await expect(dialog).toContainText('não reinicia nem zera o prazo de 7 dias');
  await expect(dialog).toContainText('(horário de Brasília)');
  await page.getByTestId('name-revert-confirm').click();

  await expect(page.getByTestId('name-reverted')).toContainText('Steam De Volta');
  await expectShownName(page, 'Steam De Volta');
  await expect(page.getByTestId('name-revert')).toHaveCount(0);
  expect(await connectName(request, account.steamId, 'Steam De Volta')).toBe('Steam De Volta');

  // O prazo da troca anterior segue valendo: não dá para escolher outro nome na hora.
  await page.getByTestId('name-edit').click();
  await expect(page.getByTestId('name-cooldown')).toContainText('Você só poderá trocar de novo em');
});

test('Perfil privado: uma frase no interruptor, o selo no Perfil e o visitante vê o aviso', async ({
  page,
  request,
  browser,
}) => {
  const account = await ownProfile(page, request, 'Jogador Privado Teste');
  const toggle = page.getByTestId('privacy-switch');
  await expect(toggle).not.toBeChecked();
  // A explicação mora num lugar só, sob o interruptor.
  await expect(page.getByTestId('privacy-setting')).toContainText(
    'Nome, avatar, Loadout e presença em servidor continuam públicos',
  );

  await toggle.click();

  await expect(toggle).toBeChecked();
  await expect(page.getByTestId('privacy-status')).toHaveText('Perfil privado ativado.');
  // No Perfil, um selo curto (sem repetir a explicação).
  await page.goto(`/${account.publicId}`);
  await expect(page.getByTestId('private-note')).toHaveText('Perfil privado');

  // Um visitante sem sessão: nome, avatar e Loadout seguem públicos; nenhuma Estatística, nem na prévia.
  const visitorContext = await browser.newContext({
    baseURL: page.url().split('/').slice(0, 3).join('/'),
  });
  const visitor = await visitorContext.newPage();
  await visitor.goto(`/${account.publicId}`);
  await expect(
    visitor.getByRole('heading', { level: 1, name: 'Jogador Privado Teste' }),
  ).toBeVisible();
  await expect(visitor.getByTestId('loadout-showcase')).toBeVisible();
  await expect(visitor.getByTestId('private-note')).toHaveText('Perfil privado');
  await expect(visitor.getByTestId('edit-profile')).toHaveCount(0);
  await expect(visitor.getByTestId('stats-private')).toContainText('Estatísticas privadas');
  await expect(visitor.locator('[data-stat]')).toHaveCount(0);
  const preview = await visitor.evaluate(() =>
    [
      ...document.querySelectorAll(
        'meta[property^="og:"], meta[name^="twitter:"], meta[name="description"]',
      ),
    ].map(
      (meta) =>
        `${meta.getAttribute('property') ?? meta.getAttribute('name')}=${meta.getAttribute('content')}`,
    ),
  );
  expect(preview.join('\n')).not.toMatch(/K\/D|kills|mortes|HS%|ADR|KPM|tempo jogado/i);
  expect(preview).toContain('og:title=Jogador Privado Teste');
  await visitorContext.close();

  // Desligar volta ao normal.
  await page.goto('/configuracoes/perfil');
  await page.getByTestId('privacy-switch').click();
  await expect(page.getByTestId('privacy-status')).toHaveText('Perfil privado desativado.');
  await page.goto(`/${account.publicId}`);
  await expect(page.getByTestId('private-note')).toHaveCount(0);
});

for (const theme of ['dark', 'light'] as const) {
  test(`Configurações > Perfil sem violações do axe e sem scroll horizontal (${theme})`, async ({
    page,
    request,
    expectedConsoleErrors,
  }) => {
    expectedConsoleErrors.push(REFUSED);
    await saveTheme(page, theme);
    const account = await createUnclaimedAccount(request, 'Nome De Exibição Bem Comprido Mesmo');
    await signInByRequest(page, account.steamId);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/configuracoes/perfil');
      await expect(page.getByTestId('profile-settings')).toBeVisible();
      await page.getByTestId('name-edit').click();
      await page.getByLabel('Novo nome').fill('A');
      await page.getByTestId('name-save').click();
      await expect(page.getByText('O nome precisa ter pelo menos 2 caracteres.')).toBeVisible();
      expect(await axeViolations(page), `${width}px, formulário com erro`).toEqual([]);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${width}px`).toBe(0);
    }

    // Perfil privado ligado, com o aviso na tela.
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto('/configuracoes/perfil');
    const toggle = page.getByTestId('privacy-switch');
    if (!(await toggle.isChecked())) await toggle.click();
    await expect(page.getByTestId('privacy-status')).toHaveText('Perfil privado ativado.');
    expect(await axeViolations(page), 'Perfil privado ligado').toEqual([]);
  });
}
