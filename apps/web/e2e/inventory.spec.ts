import type { Page } from '@playwright/test';
import { csrfToken, grantVip, newSteamId, signInFromHeader } from './accounts';
import { dragSelectedInViewer, viewerItem, viewerSelection, viewerSelections } from './fake-viewer';
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

/** O X do chaveiro que o viewer (falso) está mostrando (`undefined` no padrão da arma). */
async function viewerCharmX(page: Page): Promise<number | undefined> {
  const keychains = (await viewerItem(page))?.keychains as
    | Record<string, { x?: number }>
    | undefined;
  return keychains?.['0']?.x;
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

test('catálogo: busca tolerante (parcial, erro de digitação, inglês) e ordenada por relevância', async ({
  page,
}) => {
  await page.goto('/inventario/adicionar');
  const search = page.getByTestId('catalog-search');
  const first = page.locator('[data-testid^="catalog-item-"]').first();

  await search.fill('ak redlin');
  await expect(page.getByTestId(`catalog-item-${AK_REDLINE}`)).toBeVisible();
  // O nome original em inglês acha o PT-BR ("Linhas Vermelhas"), e o exato vem primeiro.
  await search.fill('ak47 redline');
  await expect(first).toHaveAttribute('data-testid', `catalog-item-${AK_REDLINE}`);
  // Erro de digitação: a faca sem pintura é o resultado mais relevante.
  await search.fill('karambti');
  await expect(first).toHaveAttribute('data-testid', 'catalog-item-41');
  // O tipo nos dois idiomas.
  // (as "Faixas de Mão", ou Hand Wraps, também são luvas)
  await search.fill('gloves');
  await expect(first).toContainText(/Luvas|Faixas/);
  await search.fill('luvas');
  await expect(first).toContainText(/Luvas|Faixas/);
});

test('catálogo: a busca das listas de Arma e Coleção acha em qualquer ordem, em inglês e sem acento', async ({
  page,
}) => {
  await page.goto('/inventario/adicionar');
  const search = page.getByRole('combobox', { name: 'Buscar na lista' });
  const options = page.getByRole('option');

  // Arma: "a1 m4" (código misturado, fora de ordem) acha só a M4A1-S; Enter escolhe e filtra.
  await page.getByLabel('Arma').click();
  await search.fill('a1 m4');
  await expect(options).toHaveText(['M4A1-S']);
  await search.press('Enter');
  await expect(page).toHaveURL(/arma=M4A1-S/);
  await expect(search).toBeHidden();

  // Ao reabrir, a opção atual vem destacada e à vista, e a busca começa vazia.
  await page.getByLabel('Arma').click();
  await expect(search).toHaveValue('');
  const current = page.getByTestId('option-M4A1-S');
  await expect(current).toHaveAttribute('data-selected', 'true');
  await expect(current).toBeInViewport();
  await page.keyboard.press('Escape');

  // "knife" (inglês) acha as facas; o nome original acha o PT-BR.
  await page.getByRole('button', { name: 'Facas', exact: true }).click();
  await page.getByLabel('Arma').click();
  await search.fill('knife');
  await expect(options.first()).toBeVisible();
  expect(await options.count()).toBeGreaterThan(10);
  await search.fill('butterfly');
  await expect(options).toHaveText(['Canivete Borboleta']);
  await page.keyboard.press('Escape');

  // Coleção: sem acento, parcial, com erro de digitação e pelo nome em inglês ("Quilowatt").
  await page.getByRole('button', { name: 'Armas', exact: true }).click();
  await page.getByLabel('Coleção').click();
  for (const query of ['colecao quilowatt', 'quilowat', 'kilowatt', 'kilowtat']) {
    await search.fill(query);
    await expect(options, query).toHaveText(['A Coleção Quilowatt']);
  }
  await search.press('Enter');
  await expect(page).toHaveURL(/colecao=A\+Cole%C3%A7%C3%A3o\+Quilowatt/);
  await expect(page.getByLabel('Coleção')).toHaveText('A Coleção Quilowatt');
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
  // O nome em inglês e o PT-BR acham a mesma categoria.
  await page.getByRole('combobox', { name: 'Buscar na lista' }).fill('antwerp 2022');
  await expect(page.getByRole('option', { name: 'Antuérpia 2022 da PGL' })).toBeVisible();
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

  // Erro de digitação também acha no seletor.
  await addSticker(page, 'vitalty');
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
  // Os stickers e o chaveiro viram ícones dentro da área da imagem, não texto.
  await expect(card.getByTestId('tile-stickers').locator('img')).toHaveCount(2);
  await expect(card.getByTestId('tile-charm')).toHaveCount(0);
  await expect(card).not.toContainText('stickers');
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

test('3D sem botão de modo: o sticker é selecionado sozinho, arrasta e o ajuste fino acompanha', async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/inventario/adicionar/${AK_REDLINE}`);
  await addSticker(page, 'furia');
  await expect(page.getByTestId('item-viewer')).toHaveAttribute('data-phase', 'ready');
  // O 3D precisa ter recebido o sticker antes de arrastá-lo.
  await expect.poll(() => viewerItem(page)).toMatchObject({ stickers: { '0': {} } });

  // Não há botão "Arrastar no 3D": o sticker novo já é o selecionado.
  await expect(page.getByRole('button', { name: /Arrastar/ })).toHaveCount(0);
  await expect.poll(() => viewerSelection(page)).toEqual({ kind: 'sticker', index: 0 });
  await expect(page.getByTestId('on-viewer-sticker-0')).toBeVisible();
  await expect(page.getByTestId('viewer-drag-hint')).toBeVisible();

  // Arrastar o selecionado devolve a posição; o ajuste fino mostra o valor que veio do 3D.
  await page.getByTestId('sticker-0').getByText('Ajuste fino').click();
  expect(await dragSelectedInViewer(page)).toBe(true);
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

test('a seleção do 3D segue o foco: outra linha, o chaveiro e fora do bloco', async ({ page }) => {
  await signIn(page);
  await page.goto(`/inventario/adicionar/${AK_REDLINE}`);
  await addSticker(page, 'furia');
  await addSticker(page, 'vitality');
  await page.getByTestId('add-charm').click();
  await page
    .getByTestId('picker-charm')
    .getByRole('button', { name: /^Escolher / })
    .first()
    .click();
  await expect(page.getByTestId('charm')).toBeVisible();
  await expect(page.getByTestId('item-viewer')).toHaveAttribute('data-phase', 'ready');

  // Focar a linha do primeiro sticker seleciona esse; a do segundo, o segundo.
  await page.getByTestId('sticker-0').getByRole('slider', { name: 'Rotação' }).focus();
  await expect.poll(() => viewerSelection(page)).toEqual({ kind: 'sticker', index: 0 });
  await page.getByTestId('sticker-1').getByRole('slider', { name: 'Rotação' }).focus();
  await expect.poll(() => viewerSelection(page)).toEqual({ kind: 'sticker', index: 1 });
  await expect(page.getByTestId('sticker-1')).toHaveAttribute('data-selected', 'true');
  await expect(page.getByTestId('sticker-0')).not.toHaveAttribute('data-selected');

  // O chaveiro só é selecionado enquanto a linha dele tem o foco.
  await page.getByTestId('charm').getByLabel('Padrão do chaveiro').focus();
  await expect.poll(() => viewerSelection(page)).toEqual({ kind: 'keychain', index: 0 });
  await expect(page.getByTestId('on-viewer-charm')).toBeVisible();

  // Sair do bloco manda a seleção nula: aí arrastar só gira a arma.
  await page.getByTestId('field-seed').focus();
  await expect.poll(() => viewerSelection(page)).toBeNull();
  expect(await dragSelectedInViewer(page)).toBe(false);
  await expect(page.getByTestId('viewer-drag-hint')).toHaveCount(0);

  // Voltar a uma linha seleciona de novo.
  await page.getByTestId('sticker-1').getByRole('slider', { name: 'Rotação' }).focus();
  await expect.poll(() => viewerSelection(page)).toEqual({ kind: 'sticker', index: 1 });
  const history = await viewerSelections(page);
  expect(history).toContainEqual(null);
});

test('chaveiro em slots: posições prontas, ajuste fino e o arrasto no 3D vira "Personalizada"', async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/inventario/adicionar/${AK_REDLINE}`);
  await page.getByTestId('add-charm').click();
  await page
    .getByTestId('picker-charm')
    .getByRole('button', { name: /^Escolher / })
    .first()
    .click();
  const charm = page.getByTestId('charm');
  const placement = charm.getByTestId('charm-placement');
  await expect(placement).toContainText('Padrão da arma');
  await expect(page.getByRole('button', { name: /Arrastar no 3D/ })).toHaveCount(0);
  await expect.poll(() => viewerItem(page)).toMatchObject({ keychains: { '0': {} } });
  expect((await viewerItem(page))?.keychains).not.toHaveProperty('0.x');

  // No padrão da arma o ajuste fino só pede para escolher uma posição.
  await charm.getByText('Ajuste fino').click();
  await expect(charm.getByRole('slider')).toHaveCount(0);

  // Uma posição pronta guarda X, Y e Z e vai ao 3D; os extremos são os limites da arma.
  await chooseOption(page, placement, '2');
  await expect(placement).toContainText('Posição 3');
  await expect
    .poll(async () => (await viewerItem(page))?.keychains)
    .toMatchObject({
      '0': { x: expect.any(Number), y: expect.any(Number), z: expect.any(Number) },
    });
  const middle = (await viewerCharmX(page)) ?? 0;
  await chooseOption(page, placement, '0');
  await expect.poll(() => viewerCharmX(page)).toBeLessThan(middle);

  // O ajuste fino mexe numa posição pronta e a deixa personalizada.
  const sliderX = charm.getByRole('slider', { name: 'X' });
  await expect(sliderX).toBeVisible();
  await sliderX.focus();
  await page.keyboard.press('ArrowRight');
  await expect(placement).toContainText('Personalizada');

  // Arrastar o chaveiro no 3D é só atalho: o resultado também é "Personalizada".
  await chooseOption(page, placement, '1');
  await charm.getByLabel('Padrão do chaveiro').focus();
  await expect.poll(() => viewerSelection(page)).toEqual({ kind: 'keychain', index: 0 });
  expect(await dragSelectedInViewer(page)).toBe(true);
  await expect(placement).toContainText('Personalizada');
  await expect(sliderX).toHaveAttribute('aria-valuetext', '1,00');

  // Voltar ao padrão da arma tira a posição.
  await chooseOption(page, placement, 'default');
  await expect(placement).toContainText('Padrão da arma');
  await expect.poll(async () => (await viewerItem(page))?.keychains).not.toHaveProperty('0.x');

  await chooseOption(page, placement, '4');
  await page.getByTestId('save-item').click();
  await expect(page).toHaveURL('/inventario');
  const inventory = await (await page.request.get('/api/inventory')).json();
  expect(inventory.items[0].item.keychains['0']).toMatchObject({
    x: expect.any(Number),
    y: expect.any(Number),
    z: expect.any(Number),
  });
  // O cartão mostra o chaveiro como ícone no canto inferior direito da imagem.
  await expect(page.getByTestId('tile-charm').locator('img')).toHaveCount(1);
});

test('a dica do 3D lista girar, mover (Shift) e aproximar; no toque, só girar', async ({
  page,
}) => {
  await page.goto(`/inventario/adicionar/${AK_REDLINE}`);
  await expect(page.getByTestId('item-viewer')).toHaveAttribute('data-phase', 'ready');
  await expect(page.getByTestId('item-viewer')).toContainText(
    'Arraste para girar · Shift + arraste para mover · Roda para aproximar',
  );
  // O endereço do viewer não leva o halfRotation (a build dele não lê).
  const src = await page.getByTestId('viewer-iframe').getAttribute('src');
  expect(new URL(src ?? '').searchParams.has('halfRotation')).toBe(false);
});

test.describe('no toque', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('a dica do 3D diz só "Arraste para girar"', async ({ page }) => {
    await page.goto(`/inventario/adicionar/${AK_REDLINE}`);
    await expect(page.getByTestId('item-viewer')).toHaveAttribute('data-phase', 'ready');
    const hint = page.getByTestId('item-viewer').locator('figcaption');
    await expect(hint).toContainText('Arraste para girar');
    // O texto do mouse existe no HTML, mas fica escondido no toque.
    await expect(hint.getByText(/Shift/)).toBeHidden();
    await expect(hint.getByText(/Roda/)).toBeHidden();
  });
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
