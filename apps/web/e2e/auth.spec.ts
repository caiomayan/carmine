import { chooseSteamAccount, newSteamId, signInFromHeader } from './accounts';
import { axeViolations, expect, saveTheme, test } from './fixtures';

const accountMenu = (page: import('@playwright/test').Page) => page.getByTestId('account-menu');

test('login completo: entra, volta à página de origem, avatar na barra e sai', async ({ page }) => {
  await page.goto('/regras');
  await expect(page.getByTestId('sign-in')).toHaveText('Entrar');
  await expect(accountMenu(page)).toHaveCount(0);

  await chooseSteamAccount(page.context(), newSteamId());
  await page.getByTestId('sign-in').click();
  await expect(page).toHaveURL('/entrar?voltar=%2Fregras');
  await expect(page.getByRole('heading', { level: 1, name: 'Entrar na Carmine' })).toBeVisible();
  // Na própria página de entrar a barra não repete o "Entrar".
  await expect(page.getByTestId('sign-in')).toHaveCount(0);

  await page.getByRole('link', { name: 'Entrar com a Steam' }).click();
  await expect(page).toHaveURL('/regras');
  await expect(accountMenu(page)).toBeVisible();
  await expect(accountMenu(page).locator('img, [aria-hidden]').first()).toBeVisible();
  await expect(page.getByTestId('sign-in')).toHaveCount(0);

  // Recarregada, a página já chega do servidor com a Conta: nunca pisca "Entrar".
  const html = await (await page.request.get('/regras')).text();
  expect(html).toContain('data-testid="account-menu"');
  expect(html).not.toContain('data-testid="sign-in"');

  await accountMenu(page).click();
  const logout = page.waitForRequest(
    (r) => r.url().endsWith('/api/auth/logout') && r.method() === 'POST',
  );
  await page.getByRole('menuitem', { name: 'Sair' }).click();
  expect((await logout).headers()['x-csrf-token'], 'logout com o token CSRF').toBeTruthy();
  await expect(page.getByTestId('sign-in')).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('sign-in')).toBeVisible();
  await expect(accountMenu(page)).toHaveCount(0);
});

test('cada carga de página confirma a sessão em /api/me (renovação deslizante)', async ({
  page,
}) => {
  await page.goto('/');
  await signInFromHeader(page, newSteamId());
  await expect(accountMenu(page)).toBeVisible();

  const me = page.waitForResponse((r) => r.url().endsWith('/api/me'));
  await page.goto('/inventario');
  expect((await me).status()).toBe(200);
});

test('visitante sem sessão não chama /api/me', async ({ page }) => {
  const calls: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/api/me')) calls.push(r.url());
  });
  await page.goto('/');
  await expect(page.getByTestId('sign-in')).toBeVisible();
  expect(calls).toEqual([]);
});

test('quem desiste na Steam volta para entrar com o aviso e a página de origem', async ({
  page,
}) => {
  await chooseSteamAccount(page.context(), newSteamId(), { cancel: true });
  await page.goto('/entrar?voltar=%2Finventario');
  await page.getByRole('link', { name: 'Entrar com a Steam' }).click();
  await expect(page).toHaveURL('/entrar?erro=cancelado&voltar=%2Finventario');
  await expect(page.getByText('Você cancelou o login na Steam')).toBeVisible();

  // Tentando de novo (agora sem desistir), volta para a página de origem.
  await chooseSteamAccount(page.context(), newSteamId());
  await page.getByRole('link', { name: 'Entrar com a Steam' }).click();
  await expect(page).toHaveURL('/inventario');
});

for (const [error, message] of [
  ['invalido', 'Não conseguimos confirmar o login com a Steam'],
  ['indisponivel', 'A Steam não respondeu agora'],
] as const) {
  test(`/entrar?erro=${error} explica o que houve`, async ({ page }) => {
    await page.goto(`/entrar?erro=${error}`);
    await expect(page.getByRole('alert').filter({ hasText: message })).toBeVisible();
  });
}

test('?voltar= só aceita caminhos internos', async ({ page }) => {
  for (const unsafe of ['https%3A%2F%2Fevil.example', '%2F%2Fevil.example', '%2Fapi%2Fme']) {
    await page.goto(`/entrar?voltar=${unsafe}`);
    await expect(page.getByRole('link', { name: 'Entrar com a Steam' })).toHaveAttribute(
      'href',
      '/api/auth/steam/login?returnTo=%2F',
    );
    await expect(page.getByRole('link', { name: 'Voltar sem entrar' })).toHaveAttribute(
      'href',
      '/',
    );
  }
});

test('quem já entrou e abre /entrar segue para a página de origem', async ({ page }) => {
  await page.goto('/');
  await signInFromHeader(page, newSteamId());
  await expect(accountMenu(page)).toBeVisible();
  await page.goto('/entrar?voltar=%2Finventario');
  await expect(page).toHaveURL('/inventario');
});

test('primeiros passos: aparecem depois do login, fecham, ficam fechados e reabrem', async ({
  page,
}) => {
  await page.goto('/');
  await signInFromHeader(page, newSteamId());
  const guide = page.getByTestId('first-steps');
  await expect(guide).toBeVisible();
  await expect(guide).toContainText('Adicionar não é equipar');
  await expect(guide).toContainText('!ws');

  await guide.getByRole('button', { name: 'Fechar primeiros passos' }).click();
  await expect(guide).toHaveCount(0);

  await page.reload();
  await expect(accountMenu(page)).toBeVisible();
  await expect(page.getByTestId('first-steps')).toHaveCount(0);

  await accountMenu(page).click();
  await page.getByRole('menuitem', { name: 'Primeiros passos' }).click();
  await expect(guide).toBeVisible();
  await expect(guide.getByRole('heading', { level: 2 })).toBeFocused();
});

test('primeiros passos são por Conta: outra Conta no mesmo navegador ainda os vê', async ({
  page,
}) => {
  await page.goto('/');
  await signInFromHeader(page, newSteamId());
  await page.getByRole('button', { name: 'Entendi' }).click();
  await expect(page.getByTestId('first-steps')).toHaveCount(0);

  await accountMenu(page).click();
  await page.getByRole('menuitem', { name: 'Sair' }).click();
  await signInFromHeader(page, newSteamId());
  await expect(page.getByTestId('first-steps')).toBeVisible();
});

test('sessão expirada durante a edição: o rascunho volta depois do novo login', async ({
  page,
  expectedConsoleErrors,
}) => {
  // O "Salvar" com a sessão vencida responde 401, e o Chrome registra isso no console.
  expectedConsoleErrors.push(/401 \(Unauthorized\)/);
  const steamId = newSteamId();
  await page.goto('/dev/rascunho');
  await signInFromHeader(page, steamId);
  await expect(page).toHaveURL('/dev/rascunho');
  await page.getByRole('button', { name: 'Entendi' }).click();

  await page.getByLabel('Nametag').fill('Fuzil do Caio');
  // A sessão morre no servidor enquanto a pessoa edita.
  await page.context().clearCookies({ name: '__Host-carmine_session' });
  await page.getByRole('button', { name: 'Salvar' }).click();

  await expect(page).toHaveURL('/entrar?voltar=%2Fdev%2Frascunho&motivo=sessao-expirada');
  await expect(page.getByRole('status').filter({ hasText: 'A sua sessão expirou' })).toBeVisible();

  await page.getByRole('link', { name: 'Entrar com a Steam' }).click();
  await expect(page).toHaveURL('/dev/rascunho');
  await expect(page.getByLabel('Nametag')).toHaveValue('Fuzil do Caio');
  await expect(page.getByTestId('draft-restored')).toContainText('Restauramos as alterações');

  // Salvo de verdade, o rascunho some.
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Salvo.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Nametag')).toHaveValue('');
});

test('o rascunho de uma Conta não aparece para outra', async ({ page }) => {
  await page.goto('/dev/rascunho');
  await signInFromHeader(page, newSteamId());
  await page.getByRole('button', { name: 'Entendi' }).click();
  await page.getByLabel('Nametag').fill('Só meu');
  await page.waitForTimeout(400);

  await accountMenu(page).click();
  await page.getByRole('menuitem', { name: 'Sair' }).click();
  await signInFromHeader(page, newSteamId());
  await expect(page).toHaveURL('/dev/rascunho');
  await expect(page.getByLabel('Nametag')).toHaveValue('');
});

for (const theme of ['dark', 'light'] as const) {
  for (const width of [390, 1440] as const) {
    test(`logado: barra, menu e primeiros passos sem violações do axe (${theme}, ${width}px)`, async ({
      page,
    }) => {
      await saveTheme(page, theme);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await signInFromHeader(page, newSteamId());
      await expect(page.getByTestId('first-steps')).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);

      await page.evaluate(() => window.scrollTo({ top: 0 }));
      await accountMenu(page).click();
      await expect(page.getByRole('menu')).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);
      // Sem scroll horizontal com a Conta na barra.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBe(0);
    });
  }
}
