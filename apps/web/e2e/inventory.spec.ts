import type { Page } from '@playwright/test';
import { csrfToken, grantVip, newSteamId, signInFromHeader } from './accounts';
import { viewerItem } from './fake-viewer';
import { axeViolations, chooseOption, expect, saveTheme, test } from './fixtures';

const AK_REDLINE = 222;
const MUSIC_KIT = 1781;

/** Entra com uma Conta nova (Steam falsa), fecha os Primeiros passos e, se pedido, dá VIP. */
async function signIn(page: Page, { vip = false } = {}) {
  const steamId = newSteamId();
  await page.goto('/inventario');
  await signInFromHeader(page, steamId);
  await expect(page).toHaveURL('/inventario');
  await page.getByRole('button', { name: 'Entendi' }).click();
  if (vip) {
    grantVip(steamId);
    await page.reload();
  }
  return steamId;
}

/** Escolhe no seletor o primeiro sticker que a busca encontrar. */
async function addSticker(page: Page, query: string) {
  await page.getByTestId('add-sticker').click();
  const picker = page.getByTestId('picker-sticker');
  await picker.getByTestId('picker-search').fill(query);
  await expect(picker.getByText(/\d+ resultados?/)).toBeVisible();
  await picker
    .getByRole('button', { name: /^Escolher / })
    .first()
    .click();
  await expect(picker).toHaveCount(0);
}

async function addItemByApi(page: Page, item: Record<string, unknown>) {
  const response = await page.request.post('/api/inventory/items', {
    headers: { 'x-csrf-token': await csrfToken(page.context()) },
    data: { item },
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as { uid: string };
}

test('sem sessão, o Inventário convida a entrar e o catálogo continua aberto', async ({ page }) => {
  await page.goto('/inventario');
  const invite = page.getByTestId('inventory-signed-out');
  await expect(invite).toContainText('Entre para montar o seu Inventário');
  await expect(invite.getByRole('link', { name: 'Entrar com a Steam' })).toHaveAttribute(
    'href',
    '/entrar?voltar=%2Finventario',
  );
  await invite.getByRole('link', { name: 'Ver o catálogo' }).click();
  await expect(page).toHaveURL('/inventario/adicionar');

  // No editor, salvar vira entrar (e volta para o mesmo Item).
  await page.getByTestId(`catalog-item-${AK_REDLINE}`).click();
  await expect(page.getByTestId('sign-in-to-add')).toHaveAttribute(
    'href',
    `/entrar?voltar=%2Finventario%2Fadicionar%2F${AK_REDLINE}`,
  );
});

test('catálogo: busca sem acento, filtros na URL, sem Armas padrão e estado vazio', async ({
  page,
}) => {
  await page.goto('/inventario/adicionar');
  await page.getByTestId('catalog-search').fill('linhas vermelhas');
  await expect(page).toHaveURL(/q=linhas\+vermelhas/);
  await expect(page.getByTestId(`catalog-item-${AK_REDLINE}`)).toBeVisible();

  await page.getByTestId('catalog-search').fill('');
  await page.getByRole('button', { name: 'Armas', exact: true }).click();
  await chooseOption(page, page.getByLabel('Arma'), 'AK-47');
  await chooseOption(page, page.getByLabel('Raridade'), 'classified');
  await expect(page).toHaveURL(/tipo=weapon/);
  await expect(page).toHaveURL(/arma=AK-47/);
  await expect(page).toHaveURL(/raridade=classified/);
  await expect(page.getByTestId(`catalog-item-${AK_REDLINE}`)).toBeVisible();
  // A AK sem skin é Arma padrão: nunca aparece.
  await expect(page.locator('main')).not.toContainText(/^AK-47$/m);

  await page.getByTestId('catalog-search').fill('nada-disso-existe');
  await expect(page.getByText('Nada encontrado')).toBeVisible();
  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await expect(page).toHaveURL('/inventario/adicionar');
});

test('seletor de stickers: a categoria é um Combobox dentro do Dialog e o slot é um Select', async ({
  page,
}) => {
  await signIn(page, { vip: true });
  await page.goto(`/inventario/adicionar/${AK_REDLINE}`);
  await page.getByTestId('add-sticker').click();
  const picker = page.getByTestId('picker-sticker');
  const category = picker.getByRole('combobox', { name: 'Campeonato ou coleção' });
  await category.click();
  // Sem chave de tradução crua na lista; a busca acha sem acento e sem ordem.
  await expect(page.getByRole('option', { name: /^#CSGO/ })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Buscar na lista' }).fill('2013 dreamhack winter');
  await page.getByRole('option').first().click();
  await expect(category).toContainText('DreamHack Winter 2013');
  await expect(picker.getByText(/\d+ resultados?/)).toBeVisible();
  // Esc fecha só o Popover; o Dialog continua.
  await category.click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('combobox', { name: 'Buscar na lista' })).toBeHidden();
  await expect(picker).toBeVisible();
  await picker
    .getByRole('button', { name: /^Escolher / })
    .first()
    .click();
  await expect(picker).toHaveCount(0);

  await addSticker(page, 'vitality');
  await chooseOption(page, page.getByTestId('sticker-1').getByRole('combobox'), '3');
  await expect
    .poll(() => viewerItem(page))
    .toMatchObject({ stickers: { '0': { schema: 0 }, '1': { schema: 3 } } });
});

for (const theme of ['dark', 'light'] as const) {
  test(`axe com o Combobox do catálogo aberto (${theme})`, async ({ page }) => {
    await saveTheme(page, theme);
    await page.goto('/inventario/adicionar');
    await page.getByLabel('Arma').click();
    await expect(page.getByRole('combobox', { name: 'Buscar na lista' })).toBeFocused();
    expect(await axeViolations(page), `catálogo com o Combobox aberto (${theme})`).toEqual([]);
  });
}

test('adiciona a AK do aceite (float 0,15, seed 661, StatTrak, 2 stickers): igual no 3D e depois de recarregar', async ({
  page,
}) => {
  await signIn(page, { vip: true });
  await expect(page.getByTestId('inventory-empty')).toBeVisible();
  // O Inventário vazio conduz até a primeira skin: as sugestões abrem o editor.
  await page.getByTestId(`catalog-item-${AK_REDLINE}`).click();
  await expect(page).toHaveURL(`/inventario/adicionar/${AK_REDLINE}`);

  await page.getByTestId('field-wear').fill('0,15');
  await page.getByTestId('field-seed').fill('661');
  await page.getByTestId('field-stattrak').click();
  await addSticker(page, 'furia colônia 2026');
  await addSticker(page, 'vitality');
  await expect(page.getByTestId('wear-tier')).toHaveText('Pouco Usada');

  // O 3D recebe exatamente o que está no formulário.
  await expect
    .poll(() => viewerItem(page))
    .toMatchObject({
      id: AK_REDLINE,
      wear: 0.15,
      seed: 661,
      statTrak: 0,
      stickers: { '0': { schema: 0 }, '1': { schema: 1 } },
    });

  await page.getByTestId('save-item').click();
  await expect(page).toHaveURL('/inventario');
  await expect(page.getByTestId('notice-toast')).toContainText(
    'AK-47 | Linhas Vermelhas entrou no seu Inventário.',
  );
  const card = page.getByTestId('inventory-item');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('ST™');
  await expect(card).toContainText('2 stickers');
  await expect(page.getByTestId('inventory-count')).toHaveText('1 Item de 300');

  await page.reload();
  await card.getByRole('link').click();
  await expect(page.getByTestId('field-wear')).toHaveValue('0,15');
  await expect(page.getByTestId('field-seed')).toHaveValue('661');
  await expect(page.getByTestId('field-stattrak')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('sticker-0')).toBeVisible();
  await expect(page.getByTestId('sticker-1')).toBeVisible();
  await expect
    .poll(() => viewerItem(page))
    .toMatchObject({ id: AK_REDLINE, wear: 0.15, seed: 661, statTrak: 0 });
});

test('sem VIP, StatTrak e nametag ficam com cadeado e não salvam; music kit nem entra', async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/inventario/adicionar/${AK_REDLINE}`);
  await expect(page.getByTestId('vip-attributes-lock')).toBeVisible();
  await page.getByTestId('field-stattrak').click();
  await page.getByTestId('save-item').click();
  await expect(page.getByTestId('editor-alert')).toContainText('Corrija 1 campo para salvar.');
  await expect(page.getByText('Isto exige um Período VIP ativo.')).toBeVisible();
  await expect(page).toHaveURL(`/inventario/adicionar/${AK_REDLINE}`);

  await page.goto(`/inventario/adicionar/${MUSIC_KIT}`);
  await expect(page.getByTestId('vip-item-lock')).toBeVisible();
  await expect(page.getByTestId('save-item')).toBeDisabled();
  // Music kit é sempre 2D, sem iframe.
  await expect(page.getByTestId('item-viewer')).toHaveAttribute('data-mode', '2d');
  await expect(page.getByTestId('viewer-iframe')).toHaveCount(0);
});

test('o erro de validação da API vira mensagem no campo', async ({
  page,
  expectedConsoleErrors,
}) => {
  // O Chrome registra a resposta 422 no console.
  expectedConsoleErrors.push(/422 \(Unprocessable (Entity|Content)\)/);
  await signIn(page);
  await page.route('**/api/inventory/items', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 422,
          contentType: 'application/json',
          body: JSON.stringify({
            statusCode: 422,
            code: 'wear_out_of_range',
            message: 'fora da faixa',
            field: 'wear',
            range: { min: 0.1, max: 0.7 },
          }),
        })
      : route.continue(),
  );
  await page.goto(`/inventario/adicionar/${AK_REDLINE}`);
  await page.getByTestId('field-wear').fill('0,2');
  await page.getByTestId('save-item').click();
  await expect(page.getByText('O float desta skin vai de 0,10 a 0,70.')).toBeVisible();
  await expect(page.getByTestId('field-wear')).toHaveAttribute('aria-invalid', 'true');
});

test('arrastar um sticker no 3D atualiza o ajuste fino e é salvo', async ({ page }) => {
  await signIn(page);
  await page.goto(`/inventario/adicionar/${AK_REDLINE}`);
  await addSticker(page, 'furia');
  await expect(page.getByTestId('item-viewer')).toHaveAttribute('data-phase', 'ready');
  // O 3D precisa ter recebido o sticker antes de arrastá-lo.
  await expect.poll(() => viewerItem(page)).toMatchObject({ stickers: { '0': {} } });

  const drag = page.getByTestId('drag-sticker-0');
  await drag.click();
  await expect(drag).toHaveAttribute('aria-pressed', 'true');
  // O ajuste fino abre e acompanha a posição que veio do 3D.
  await expect(
    page.getByTestId('sticker-0').getByRole('slider', { name: 'Ajuste horizontal' }),
  ).toHaveAttribute('aria-valuetext', '0,25');
  await expect
    .poll(() => viewerItem(page))
    .toMatchObject({ stickers: { '0': { x: 0.25, y: 0.1 } } });

  await page.getByTestId('save-item').click();
  await expect(page).toHaveURL('/inventario');
  const inventory = await (await page.request.get('/api/inventory')).json();
  expect(inventory.items[0].item.stickers['0']).toMatchObject({ x: 0.25, y: 0.1 });
});

test.describe('com o 3D bloqueado', () => {
  test.use({ viewer: 'blocked' });

  test('cai para o 2D e todos os atributos continuam editáveis', async ({
    page,
    expectedConsoleErrors,
  }) => {
    // O Chrome registra o iframe recusado.
    expectedConsoleErrors.push(/3d\.cstrike\.app|ERR_BLOCKED_BY_CLIENT/);
    await page.goto(`/inventario/adicionar/${AK_REDLINE}`);
    const viewer = page.getByTestId('item-viewer');
    await expect(viewer).toHaveAttribute('data-mode', '2d', { timeout: 15_000 });
    await expect(page.getByTestId('viewer-fallback')).toHaveAttribute('data-reason', 'timeout');
    await expect(page.getByTestId('viewer-fallback')).toContainText('O 3D não respondeu');

    await page.getByTestId('field-wear').fill('0,5');
    await expect(page.getByTestId('viewer-2d').locator('img').first()).toHaveAttribute(
      'src',
      /_medium\.webp$/,
    );
    await page.getByTestId('field-seed').fill('661');
    await page.getByTestId('field-nametag').fill('Velha Guarda');
    await addSticker(page, 'furia');
    await expect(page.getByTestId('viewer-2d-attachments').locator('li')).toHaveCount(1);
    await page.getByTestId('add-charm').click();
    await page
      .getByTestId('picker-charm')
      .getByRole('button', { name: /^Escolher / })
      .first()
      .click();
    await expect(page.getByTestId('charm')).toBeVisible();
    await expect(page.getByTestId('viewer-2d-attachments').locator('li')).toHaveCount(2);
  });
});

test('remover mostra onde o Item está em uso e "Desfazer" o devolve', async ({ page }) => {
  await signIn(page);
  const { uid } = await addItemByApi(page, { id: AK_REDLINE, wear: 0.2, seed: 7 });
  await page.reload();
  await expect(page.getByTestId('inventory-item')).toHaveCount(1);

  await page.getByTestId('item-menu').click();
  await page.getByTestId('menu-remove').click();
  const dialog = page.getByTestId('remove-dialog');
  await expect(dialog).toContainText('Remover AK-47 | Linhas Vermelhas?');
  await expect(dialog.getByTestId('item-usages-none')).toBeVisible();
  await dialog.getByTestId('confirm-remove').click();

  await expect(page.getByTestId('undo-toast')).toContainText('saiu do Inventário');
  await expect(page.getByTestId('inventory-empty')).toBeVisible();
  await page.getByTestId('undo-action').click();
  await expect(page.getByTestId('notice-toast')).toContainText('voltou ao Inventário');
  await expect(page.locator(`[data-uid="${uid}"]`)).toBeVisible();
});

test('o "Desfazer" some depois de 8 s', async ({ page }) => {
  await signIn(page);
  await addItemByApi(page, { id: AK_REDLINE, wear: 0.2, seed: 7 });
  await page.reload();
  await page.getByTestId('item-menu').click();
  await page.getByTestId('menu-remove').click();
  await page.getByTestId('confirm-remove').click();
  await expect(page.getByTestId('undo-toast')).toBeVisible();
  // Sem ponteiro nem foco em cima, o tempo corre.
  await page.mouse.move(0, 0);
  await page.locator('body').focus();
  await expect(page.getByTestId('undo-toast')).toHaveCount(0, { timeout: 10_000 });
});

test('sessão expirada no editor: a edição volta depois do novo login', async ({
  page,
  expectedConsoleErrors,
}) => {
  expectedConsoleErrors.push(/401 \(Unauthorized\)/);
  await signIn(page);
  await page.goto(`/inventario/adicionar/${AK_REDLINE}`);
  await page.getByTestId('field-seed').fill('661');
  await page.getByTestId('field-wear').fill('0,33');
  await page.context().clearCookies({ name: '__Host-carmine_session' });
  await page.getByTestId('save-item').click();

  await expect(page).toHaveURL(
    `/entrar?voltar=%2Finventario%2Fadicionar%2F${AK_REDLINE}&motivo=sessao-expirada`,
  );
  // A Steam falsa lembra da mesma Conta neste navegador.
  await page.getByRole('link', { name: 'Entrar com a Steam' }).click();
  await expect(page).toHaveURL(`/inventario/adicionar/${AK_REDLINE}`);
  await expect(page.getByTestId('draft-restored')).toBeVisible();
  await expect(page.getByTestId('field-seed')).toHaveValue('661');
  await expect(page.getByTestId('field-wear')).toHaveValue('0,33');
});

test('/entrar?erro=limite explica o limite de tentativas', async ({ page }) => {
  await page.goto('/entrar?erro=limite');
  await expect(page.getByRole('alert')).toContainText('Muitas tentativas de login seguidas');
});

for (const theme of ['dark', 'light'] as const) {
  test(`axe sem violações no Inventário com Itens e no editor (${theme})`, async ({ page }) => {
    await saveTheme(page, theme);
    await signIn(page, { vip: true });
    const { uid } = await addItemByApi(page, {
      id: AK_REDLINE,
      wear: 0.15,
      seed: 661,
      statTrak: 0,
      stickers: { '0': { id: 1847, schema: 0, rotation: 0, wear: 0 } },
    });
    await page.reload();
    expect(await axeViolations(page), `inventário (${theme})`).toEqual([]);
    await page.goto(`/inventario/${uid}`);
    await expect(page.getByTestId('item-viewer')).toHaveAttribute('data-phase', 'ready');
    expect(await axeViolations(page), `editor (${theme})`).toEqual([]);
  });
}
