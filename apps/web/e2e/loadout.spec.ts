import type { Page } from '@playwright/test';
import { csrfToken, grantVip, newSteamId, revokeVip, signInFromHeader } from './accounts';
import { axeViolations, expect, saveTheme, test } from './fixtures';

// Ids da @ianlucas/cs2-lib 9.5.0.
const AWP_ASIIMOV = 306;
const USP_KILL_CONFIRMED = 1139;
const KARAMBIT_FADE = 1327;
const KARAMBIT_VANILLA = 41;
const FIRST_AGENT = 8620;

/** Entra com uma Conta nova (Steam falsa) a partir de `start`, fecha os Primeiros passos e, se pedido, dá VIP. */
async function signIn(page: Page, { vip = false, start = '/loadout' } = {}) {
  const steamId = newSteamId();
  await page.goto(start);
  await signInFromHeader(page, steamId);
  await expect(page).toHaveURL(start);
  await page.getByRole('button', { name: 'Entendi' }).click();
  if (vip) {
    grantVip(steamId);
    await page.reload();
  }
  return steamId;
}

async function addItem(page: Page, item: Record<string, unknown>) {
  const response = await page.request.post('/api/inventory/items', {
    headers: { 'x-csrf-token': await csrfToken(page.context()) },
    data: { item },
  });
  expect(response.status()).toBe(201);
  return ((await response.json()) as { uid: string }).uid;
}

const slot = (page: Page, name: string, side: 'ct' | 't' | 'all') =>
  page.getByTestId(`slot-${name}-${side}`);

/** O aviso com esse texto (outro pode estar saindo da tela ao mesmo tempo). */
const toast = (page: Page, text: string) =>
  page.locator('[data-testid$="-toast"]').filter({ hasText: text });

const panel = (page: Page) => page.getByRole('complementary', { name: 'Slot selecionado' });

test('sem sessão, o Loadout convida a entrar', async ({ page }) => {
  await page.goto('/loadout');
  await expect(page.getByTestId('loadout-signed-out')).toContainText(
    'Entre para montar o seu Loadout',
  );
});

test('equipa uma faca em CT e TR, que fica depois de recarregar e aparece no Perfil', async ({
  page,
  browser,
}) => {
  await signIn(page);
  const knife = await addItem(page, { id: KARAMBIT_FADE });
  await page.reload();

  await slot(page, 'knife', 'ct').click();
  await expect(panel(page).getByTestId('both-sides')).toHaveAttribute('aria-pressed', 'true');
  await panel(page).getByRole('button', { name: 'Equipar Karambit | Degradê' }).click();
  await expect(toast(page, 'Karambit | Degradê equipado em CT e TR.')).toBeVisible();
  await expect(slot(page, 'knife', 'ct')).toHaveAttribute('data-equipped', knife);

  await page.reload();
  await expect(slot(page, 'knife', 'ct')).toHaveAttribute('data-equipped', knife);
  await page.getByTestId('side-t').click();
  await expect(slot(page, 'knife', 't')).toHaveAttribute('data-equipped', knife);

  // A vitrine do Perfil é pública: um visitante sem sessão vê a faca, uma vez, nos dois lados.
  const me = (await (await page.request.get('/api/me')).json()) as {
    account: { publicId: number };
  };
  const visitor = await browser.newPage();
  await visitor.goto(`/${me.account.publicId}`);
  const showcase = visitor.getByTestId('showcase-item');
  await expect(showcase).toHaveCount(1);
  await expect(showcase).toContainText('Karambit');
  await expect(showcase).toContainText('CT e TR');
  await visitor.close();
});

test('substituir avisa com "Desfazer", que devolve o Item anterior; desequipar volta ao padrão', async ({
  page,
}) => {
  await signIn(page);
  const fade = await addItem(page, { id: KARAMBIT_FADE });
  const vanilla = await addItem(page, { id: KARAMBIT_VANILLA });
  await page.reload();

  await slot(page, 'knife', 'ct').click();
  await panel(page).getByRole('button', { name: 'Equipar Karambit | Degradê' }).click();
  await expect(slot(page, 'knife', 'ct')).toHaveAttribute('data-equipped', fade);

  // Só no CT: o TR continua com a Degradê.
  await panel(page).getByTestId('both-sides').click();
  await panel(page)
    .getByRole('button', { name: /^Equipar Karambit$/ })
    .click();
  await expect(toast(page, 'Karambit substituiu Karambit | Degradê em CT.')).toBeVisible();
  await expect(slot(page, 'knife', 'ct')).toHaveAttribute('data-equipped', vanilla);

  await toast(page, 'substituiu').getByTestId('undo-action').click();
  await expect(toast(page, 'Desfeito')).toBeVisible();
  await expect(slot(page, 'knife', 'ct')).toHaveAttribute('data-equipped', fade);

  await panel(page).getByTestId('unequip').click();
  await expect(toast(page, 'Faca voltou ao padrão em CT.')).toBeVisible();
  await expect(slot(page, 'knife', 'ct')).not.toHaveAttribute('data-equipped');
  await page.getByTestId('side-t').click();
  await expect(slot(page, 'knife', 't')).toHaveAttribute('data-equipped', fade);
});

test('adicionar e equipar em um passo, do Inventário vazio, leva ao Loadout com o !ws', async ({
  page,
}) => {
  await signIn(page, { start: '/inventario' });
  await page.getByRole('button', { name: 'Adicionar e equipar AK-47 | Linhas Vermelhas' }).click();
  await expect(page).toHaveURL('/loadout');
  await expect(
    toast(page, 'AK-47 | Linhas Vermelhas equipado em TR. No servidor, digite !ws'),
  ).toBeVisible();
  await page.getByTestId('side-t').click();
  await expect(slot(page, 'weapon_ak47', 't')).toHaveAttribute('data-equipped', /.+/);

  // Do catálogo, pelo editor: a AWP vai para os dois lados.
  await page.goto(`/inventario/adicionar/${AWP_ASIIMOV}`);
  await page.getByTestId('add-and-equip').click();
  await expect(page).toHaveURL('/loadout');
  await expect(slot(page, 'weapon_awp', 'ct')).toHaveAttribute('data-equipped', /.+/);
  await page.getByTestId('side-t').click();
  await expect(slot(page, 'weapon_awp', 't')).toHaveAttribute('data-equipped', /.+/);
});

test('equipar pelo menu do cartão no Inventário oferece só os lados do Item', async ({ page }) => {
  await signIn(page, { start: '/inventario' });
  const usp = await addItem(page, { id: USP_KILL_CONFIRMED });
  await page.reload();
  const card = page.locator(`[data-uid="${usp}"]`);
  await card.getByTestId('item-menu').click();
  await expect(page.getByTestId('menu-equip-t')).toHaveCount(0);
  await page.getByTestId('menu-equip-ct').click();
  await expect(toast(page, 'equipado em CT')).toBeVisible();
  // Sem texto "equipado": só a bolinha azul do CT, com nome acessível.
  await expect(card).not.toContainText('Equipado');
  await expect(card.getByTestId('team-dots')).toHaveAttribute('data-sides', 'ct');
  await expect(card.getByText('Equipada no CT')).toBeAttached();
});

test('Presets: grátis tem só o Principal; VIP cria e ativa; sem VIP, os extras ficam somente leitura', async ({
  page,
}) => {
  const steamId = await signIn(page);
  await expect(page.getByTestId('preset-count')).toHaveText('1 de 1');
  await expect(page.getByTestId('preset-free')).toBeVisible();
  await expect(page.getByTestId('preset-new')).toHaveCount(0);

  grantVip(steamId);
  await page.reload();
  await expect(page.getByTestId('vip-notice')).toBeVisible();
  await expect(page.getByTestId('preset-count')).toHaveText('1 de 20');
  await page.getByTestId('preset-new').click();
  await page.getByTestId('preset-name').fill('Retake de sexta');
  await page.getByTestId('preset-submit').click();
  await expect(toast(page, 'Preset Retake de sexta criado')).toBeVisible();
  await expect(page.getByTestId('preset-count')).toHaveText('2 de 20');

  await page.getByRole('button', { name: 'Ativar Retake de sexta' }).click();
  await expect(toast(page, 'Retake de sexta é o seu Loadout')).toBeVisible();
  await expect(page.locator('[data-testid="preset"][data-active]')).toContainText(
    'Retake de sexta',
  );

  revokeVip(steamId);
  await page.reload();
  await expect(page.getByTestId('vip-notice')).toHaveAttribute('data-notice', 'ended_today');
  await expect(page.getByTestId('preset-active-read-only')).toContainText(
    'ficou somente leitura sem VIP',
  );
  await expect(page.locator('[data-testid="preset"][data-read-only]')).toContainText(
    'Retake de sexta',
  );
  await slot(page, 'knife', 'ct').click();
  await expect(panel(page)).toContainText('somente leitura');

  await page.getByTestId('activate-main').click();
  await expect(page.locator('[data-testid="preset"][data-active]')).toContainText('Principal');
  await expect(page.getByTestId('preset-read-only')).toBeVisible();
});

test('sem VIP, um agente equipado aparece como fora do jogo, com a explicação', async ({
  page,
}) => {
  const steamId = await signIn(page, { vip: true });
  const agent = await addItem(page, { id: FIRST_AGENT });
  await page.reload();
  await page.getByTestId('side-t').click();
  await slot(page, 'agent', 't').click();
  await panel(page).getByTestId('candidate').click();
  await expect(slot(page, 'agent', 't')).toHaveAttribute('data-equipped', agent);
  await expect(slot(page, 'agent', 't').getByTestId('not-in-game')).toHaveCount(0);

  revokeVip(steamId);
  await page.reload();
  await page.getByTestId('side-t').click();
  await expect(slot(page, 'agent', 't').getByTestId('not-in-game')).toContainText('Fora do jogo');
  await slot(page, 'agent', 't').click();
  await expect(panel(page).getByTestId('not-in-game-note')).toContainText(
    'não vai para o jogo sem um Período VIP ativo',
  );
});

test('no celular, o slot abre numa folha e equipa dali', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  const knife = await addItem(page, { id: KARAMBIT_FADE });
  await page.reload();
  await slot(page, 'knife', 'ct').click();
  const sheet = page.getByRole('dialog', { name: 'Slot selecionado' });
  await sheet.getByRole('button', { name: 'Equipar Karambit | Degradê' }).click();
  await expect(slot(page, 'knife', 'ct')).toHaveAttribute('data-equipped', knife);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

for (const theme of ['dark', 'light'] as const) {
  test(`axe sem violações no Loadout com Itens, Presets e o painel (${theme})`, async ({
    page,
  }) => {
    await saveTheme(page, theme);
    await signIn(page, { vip: true });
    await addItem(page, { id: KARAMBIT_FADE });
    await addItem(page, { id: FIRST_AGENT });
    await page.reload();
    await slot(page, 'knife', 'ct').click();
    await panel(page).getByRole('button', { name: 'Equipar Karambit | Degradê' }).click();
    // O axe mede depois que o aviso sai: no meio da animação ele está translúcido de propósito.
    await expect(page.getByTestId('undo-toast')).toHaveCount(0, { timeout: 15_000 });
    expect(await axeViolations(page)).toEqual([]);
  });
}
