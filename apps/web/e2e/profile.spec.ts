import { randomInt } from 'node:crypto';
import {
  chooseSteamAccount,
  createUnclaimedAccount,
  newSteamId,
  reconnectPlayer,
  signInFromHeader,
} from './accounts';
import { runApiCli } from './api-cli';
import { axeViolations, expect, saveTheme, test, WIDTHS } from './fixtures';

const NOT_FOUND = /404 \(Not Found\)/;

test('Perfil mostra Nome de exibição, avatar, link da Steam e o Loadout vazio, sem o #ID', async ({
  page,
  request,
}) => {
  const account = await createUnclaimedAccount(request, 'Perfil Visitado');
  await page.goto(`/${account.publicId}`);

  await expect(page.getByRole('heading', { level: 1, name: 'Perfil Visitado' })).toBeVisible();
  // O ID público fica só na URL: nenhuma tela o mostra (spec, "ID público fora da interface").
  await expect(page.getByText(`#${account.publicId}`)).toHaveCount(0);
  await expect(page.getByRole('main')).not.toContainText(String(account.publicId));
  await expect(page.getByRole('img', { name: 'Avatar de Perfil Visitado' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Perfil de Perfil Visitado na Steam (abre em outra aba)' }),
  ).toHaveAttribute('href', `https://steamcommunity.com/profiles/${account.steamId}`);
  // Sem Itens nem jogos: um bloco só no lugar do Loadout e das Estatísticas, sem caminho para o visitante.
  await expect(page.getByTestId('profile-empty')).toContainText('Ainda não há nada para mostrar');
  await expect(page.getByTestId('profile-empty').getByRole('link')).toHaveCount(0);
  await expect(page.getByTestId('loadout-showcase')).toHaveCount(0);
  await expect(page.getByTestId('profile-stats')).toHaveCount(0);
  await expect(page).toHaveTitle('Perfil Visitado · Carmine');

  // Prévia simples do link.
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    'content',
    'Perfil Visitado',
  );
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'profile');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    /Perfil de Perfil Visitado na Carmine/,
  );
});

test('Conta não reivindicada: sinal discreto e convite "É você?" que entra na mesma Conta', async ({
  page,
  request,
}) => {
  const account = await createUnclaimedAccount(request, 'Jogou Antes');
  await page.goto(`/${account.publicId}`);

  await expect(page.locator('header[data-claimed="false"]')).toBeVisible();
  await expect(page.getByTestId('unclaimed-note')).toHaveText(
    'Conta criada no jogo; ainda não entrou no site.',
  );
  // Nunca um selo de verificado.
  await expect(page.getByText(/verificad/i)).toHaveCount(0);
  const invite = page.getByTestId('claim-invite');
  await expect(invite).toContainText('É você? Entre com a Steam para personalizar.');

  await chooseSteamAccount(page.context(), account.steamId);
  await invite.getByRole('link', { name: 'Entrar com a Steam' }).click();

  // Quem jogou antes vê a mesma Conta, no mesmo endereço, agora com as ações de dono.
  await expect(page).toHaveURL(`/${account.publicId}`);
  await expect(page.getByTestId('edit-profile')).toBeVisible();
  await expect(page.getByTestId('claim-invite')).toHaveCount(0);
  await expect(page.locator('header[data-claimed="true"]')).toBeVisible();
  await page.getByTestId('account-menu').click();
  await expect(page.getByRole('menu')).toContainText('Jogou Antes');
  await expect(page.getByRole('menu')).not.toContainText('#');
});

test('nome ofensivo na Steam: a Conta aparece com um nome fictício fixo, nunca com o #ID', async ({
  page,
  request,
}) => {
  const account = await createUnclaimedAccount(request, 'Filho da Puta');

  expect(account.displayName).toMatch(/^\p{Lu}\p{L}+$/u);
  expect(account.displayName).not.toContain('Jogador');
  await page.goto(`/${account.publicId}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(account.displayName);
  await expect(page.getByRole('main')).not.toContainText('#');
  await expect(page).toHaveTitle(`${account.displayName} · Carmine`);

  // Fixo por Conta: a mesma pessoa, o mesmo nome, a cada visita e a cada connect.
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(account.displayName);
  const again = await reconnectPlayer(request, account.steamId, 'Filho da Puta');
  expect(again.displayName).toBe(account.displayName);
});

test('visitante logado não vê o convite no Perfil de outra Conta não reivindicada', async ({
  page,
  request,
}) => {
  const other = await createUnclaimedAccount(request, 'Outra Pessoa');
  await page.goto(`/${other.publicId}`);
  await signInFromHeader(page, newSteamId());
  await expect(page).toHaveURL(`/${other.publicId}`);
  await expect(page.getByTestId('account-menu')).toBeVisible();
  await expect(page.getByTestId('claim-invite')).toHaveCount(0);
  await expect(page.getByTestId('unclaimed-note')).toBeVisible();
});

test('/<SteamID64> redireciona com 301 para /<idPúblico>', async ({ page, request }) => {
  const account = await createUnclaimedAccount(request, 'Pelo SteamID');
  const response = await request.get(`/${account.steamId}`, { maxRedirects: 0 });
  expect(response.status()).toBe(301);
  expect(response.headers().location).toMatch(new RegExp(`/${account.publicId}$`));

  await page.goto(`/${account.steamId}`);
  await expect(page).toHaveURL(`/${account.publicId}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Pelo SteamID' })).toBeVisible();
});

test('o ID antigo de uma Conta que ganhou um ID reservado redireciona com 301 para o novo', async ({
  page,
  request,
}) => {
  const account = await createUnclaimedAccount(request, 'Amigo do Beta');
  const reservedId = randomInt(1, 10_000);
  runApiCli('dist/accounts/accounts.cli.js', [
    'assign-reserved-id',
    '--steam-id',
    account.steamId,
    '--public-id',
    String(reservedId),
    '--by',
    newSteamId(),
    '--reason',
    'E2E: amigo do beta',
  ]);

  // O web guarda a lista de IDs antigos por alguns segundos.
  await expect
    .poll(async () => (await request.get(`/${account.publicId}`, { maxRedirects: 0 })).status(), {
      timeout: 25_000,
    })
    .toBe(301);
  const response = await request.get(`/${account.publicId}`, { maxRedirects: 0 });
  expect(response.headers().location).toMatch(new RegExp(`/${reservedId}$`));

  await page.goto(`/${account.publicId}`);
  await expect(page).toHaveURL(`/${reservedId}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Amigo do Beta' })).toBeVisible();
});

for (const [label, path] of [
  ['ID inexistente', '/999999999999'],
  ['SteamID64 sem Conta', `/${newSteamId()}`],
  ['zero à esquerda', '/010016'],
] as const) {
  test(`404 próprio do Perfil: ${label}`, async ({ page, expectedConsoleErrors }) => {
    expectedConsoleErrors.push(NOT_FOUND);
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Nenhum Perfil com esse ID' }),
    ).toBeVisible();
    await expect(page).toHaveTitle('Perfil não encontrado · Carmine');
  });
}

for (const theme of ['dark', 'light'] as const) {
  test(`Perfil sem violações do axe e sem scroll horizontal (${theme})`, async ({
    page,
    request,
  }) => {
    const account = await createUnclaimedAccount(request, 'Nome De Exibição Bem Comprido Mesmo');
    await saveTheme(page, theme);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${account.publicId}`);
      await expect(page.getByTestId('claim-invite')).toBeVisible();
      expect(await axeViolations(page), `${width}px`).toEqual([]);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${width}px`).toBe(0);
    }
  });
}
