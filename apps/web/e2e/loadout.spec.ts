import type { Locator, Page } from '@playwright/test';
import { csrfToken, grantVip, newSteamId, revokeVip, signInFromHeader } from './accounts';
import { axeViolations, expect, saveTheme, test } from './fixtures';

// Ids da @ianlucas/cs2-lib 9.5.0.
const AWP_ASIIMOV = 306;
const USP_KILL_CONFIRMED = 1139;
const KARAMBIT_FADE = 1327;
const KARAMBIT_VANILLA = 41;
const FIRST_AGENT = 8620;

/** O controle só responde a clique depois que o React hidratou o nó (o `next dev` demora). */
async function hydrated(control: Locator) {
  await expect
    .poll(() => control.evaluate((el) => Object.keys(el).some((k) => k.startsWith('__reactProps'))))
    .toBe(true);
}

/** O quadro só responde a teclado e clique depois que o React hidratou um cartão. */
async function boardReady(page: Page) {
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-card]');
    return !!el && Object.keys(el).some((key) => key.startsWith('__reactProps'));
  });
}

/** Entra com uma Conta nova (Steam falsa) a partir de `start` e, se pedido, dá VIP. */
async function signIn(page: Page, { vip = false, start = '/loadout' } = {}) {
  const steamId = newSteamId();
  await page.goto(start);
  await signInFromHeader(page, steamId);
  await expect(page).toHaveURL(start);
  if (vip) {
    grantVip(steamId);
    await page.reload();
  }
  if (start === '/loadout') await boardReady(page);
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

/** Cria um Preset (a Conta precisa de VIP) e devolve o id. */
async function createPreset(page: Page, name: string, from: 'current' | 'empty' = 'current') {
  const response = await page.request.post('/api/presets', {
    headers: { 'x-csrf-token': await csrfToken(page.context()) },
    data: { name, from },
  });
  expect(response.status()).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

/** A mão de Presets só responde depois que o React hidratou uma carta. */
async function handReady(page: Page) {
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-testid="preset"] button');
    return !!el && Object.keys(el).some((key) => key.startsWith('__reactProps'));
  });
}

const slot = (page: Page, name: string, side: 'ct' | 't' | 'all') =>
  page.getByTestId(`slot-${name}-${side}`);

/** O aviso com esse texto (outro pode estar saindo da tela ao mesmo tempo). */
const toast = (page: Page, text: string) =>
  page.locator('[data-testid$="-toast"]').filter({ hasText: text });

/** A barra fixa embaixo, com o slot selecionado. */
const dock = (page: Page) => page.getByRole('complementary', { name: 'Slot selecionado' });

/** Abre a folha de escolha do slot selecionado e devolve a folha. */
async function openPicker(page: Page) {
  await dock(page).getByTestId('dock-pick').click();
  const picker = page.getByRole('dialog', { name: /^Escolher:/ });
  await expect(picker).toBeVisible();
  return picker;
}

/** Seleciona o slot, abre a folha e equipa o Item (o botão se chama "Equipar <nome>"). */
async function equipFromPicker(
  page: Page,
  target: { name: string; side: 'ct' | 't' | 'all' },
  item: string | RegExp,
) {
  await slot(page, target.name, target.side).click();
  const picker = await openPicker(page);
  await picker.getByRole('button', { name: item }).click();
  await expect(picker).toBeHidden();
}

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
  await boardReady(page);

  await slot(page, 'knife', 'ct').click();
  const picker = await openPicker(page);
  await expect(picker.getByTestId('both-sides')).toHaveAttribute('aria-pressed', 'true');
  await picker.getByRole('button', { name: 'Equipar Karambit | Degradê' }).click();
  await expect(toast(page, 'Karambit | Degradê equipado em CT e TR.')).toBeVisible();
  await expect(slot(page, 'knife', 'ct')).toHaveAttribute('data-equipped', knife);
  // As bolinhas dizem onde: TR e CT, nesta ordem.
  await expect(slot(page, 'knife', 'ct').getByTestId('team-dots')).toHaveAttribute(
    'data-sides',
    't,ct',
  );

  await page.reload();

  await boardReady(page);
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
  // Os lados são as bolinhas do site todo (TR à esquerda, CT à direita), com o texto para leitor de tela.
  await expect(showcase.getByTestId('team-dots')).toHaveAttribute('data-sides', 't,ct');
  await expect(showcase).toContainText('Equipada no TR');
  await expect(showcase).toContainText('Equipada no CT');
  await visitor.close();
});

test('substituir avisa com "Desfazer", que devolve o Item anterior; desequipar volta ao padrão', async ({
  page,
}) => {
  await signIn(page);
  const fade = await addItem(page, { id: KARAMBIT_FADE });
  const vanilla = await addItem(page, { id: KARAMBIT_VANILLA });
  await page.reload();
  await boardReady(page);

  await equipFromPicker(page, { name: 'knife', side: 'ct' }, 'Equipar Karambit | Degradê');
  await expect(slot(page, 'knife', 'ct')).toHaveAttribute('data-equipped', fade);

  // Só no CT: o TR continua com a Degradê.
  const picker = await openPicker(page);
  await picker.getByTestId('both-sides').click();
  await picker.getByRole('button', { name: /^Equipar Karambit$/ }).click();
  await expect(toast(page, 'Karambit substituiu Karambit | Degradê em CT.')).toBeVisible();
  await expect(slot(page, 'knife', 'ct')).toHaveAttribute('data-equipped', vanilla);

  await toast(page, 'substituiu').getByTestId('undo-action').click();
  await expect(toast(page, 'Desfeito')).toBeVisible();
  await expect(slot(page, 'knife', 'ct')).toHaveAttribute('data-equipped', fade);

  await dock(page).getByTestId('dock-unequip').click();
  await expect(toast(page, 'Faca voltou ao padrão em CT.')).toBeVisible();
  await expect(slot(page, 'knife', 'ct')).not.toHaveAttribute('data-equipped');
  await page.getByTestId('side-t').click();
  await expect(slot(page, 'knife', 't')).toHaveAttribute('data-equipped', fade);
});

test('adicionar e equipar em um passo, do Inventário vazio, leva ao Loadout com o !ws', async ({
  page,
}) => {
  await signIn(page, { start: '/inventario' });
  const quick = page.getByRole('button', { name: 'Adicionar e equipar AK-47 | Linhas Vermelhas' });
  await hydrated(quick);
  await quick.click();
  await expect(page).toHaveURL('/loadout');
  await expect(
    toast(page, 'AK-47 | Linhas Vermelhas equipado em TR. No servidor, digite !ws'),
  ).toBeVisible();
  await boardReady(page);
  await page.getByTestId('side-t').click();
  await expect(slot(page, 'weapon_ak47', 't')).toHaveAttribute('data-equipped', /.+/);

  // Do catálogo, pelo editor: a AWP vai para os dois lados.
  await page.goto(`/inventario/adicionar/${AWP_ASIIMOV}`);
  const addAndEquip = page.getByTestId('add-and-equip');
  await hydrated(addAndEquip);
  await addAndEquip.click();
  // No next dev, o primeiro envio do editor baixa o chunk dos schemas e demora.
  await expect(page).toHaveURL('/loadout', { timeout: 45_000 });
  await boardReady(page);
  // O Loadout abre no último lado usado, que aqui foi o TR.
  await page.getByTestId('side-ct').click();
  await expect(slot(page, 'weapon_awp', 'ct')).toHaveAttribute('data-equipped', /.+/);
  await page.getByTestId('side-t').click();
  await expect(slot(page, 'weapon_awp', 't')).toHaveAttribute('data-equipped', /.+/);
});

test('equipar pelo menu do cartão no Inventário oferece só os lados do Item', async ({ page }) => {
  await signIn(page, { start: '/inventario' });
  const usp = await addItem(page, { id: USP_KILL_CONFIRMED });
  await page.reload();
  const card = page.locator(`[data-uid="${usp}"]`);
  await hydrated(card.getByTestId('item-menu'));
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
  await boardReady(page);
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
  await boardReady(page);
  await expect(page.getByTestId('vip-notice')).toHaveAttribute('data-notice', 'ended_today');
  await expect(page.getByTestId('preset-active-read-only')).toContainText(
    'ficou somente leitura sem VIP',
  );
  await expect(page.locator('[data-testid="preset"][data-read-only]')).toContainText(
    'Retake de sexta',
  );
  // O rótulo "Ativar …" esconderia o texto interno: o motivo vai na descrição acessível.
  await expect(
    page.locator('[data-testid="preset"][data-read-only] button[aria-pressed]'),
  ).toHaveAccessibleDescription(/Somente leitura/);
  await slot(page, 'knife', 'ct').click();
  await expect(dock(page)).toContainText('somente leitura');
  await expect(dock(page).getByTestId('dock-pick')).toHaveCount(0);

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
  await boardReady(page);
  await page.getByTestId('side-t').click();
  await slot(page, 'agent', 't').click();
  await (await openPicker(page)).getByTestId('candidate').click();
  await expect(slot(page, 'agent', 't')).toHaveAttribute('data-equipped', agent);
  await expect(slot(page, 'agent', 't')).not.toHaveAccessibleName(/Fora do jogo/);

  revokeVip(steamId);
  await page.reload();
  await boardReady(page);
  await page.getByTestId('side-t').click();
  await expect(slot(page, 'agent', 't')).toHaveAccessibleName(/Fora do jogo/);
  await slot(page, 'agent', 't').click();
  await expect(dock(page).getByTestId('not-in-game-note')).toContainText(
    'não vai para o jogo sem um Período VIP ativo',
  );
});

test('no celular, o seletor abre numa folha e equipa dali', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  const knife = await addItem(page, { id: KARAMBIT_FADE });
  await page.reload();
  await boardReady(page);
  await page.getByTestId('category-equipment').click();
  await equipFromPicker(page, { name: 'knife', side: 'ct' }, 'Equipar Karambit | Degradê');
  await expect(slot(page, 'knife', 'ct')).toHaveAttribute('data-equipped', knife);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

test('em 390 px as cartas de Preset e o "Novo Preset" não se sobrepõem, e a mão passa no axe', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, { vip: true });
  await createPreset(page, 'Retake');
  await createPreset(page, 'Treino');
  await page.reload();
  await boardReady(page);
  await handReady(page);
  // A fileira rola dentro da mão: o "Novo Preset" fica no fim, alcançável, e nenhuma carta o cobre.
  const button = page.getByTestId('preset-new');
  await button.scrollIntoViewIfNeeded();
  await expect(button).toBeVisible();
  const buttonBox = await button.boundingBox();
  if (!buttonBox) throw new Error('botão Novo Preset sem caixa');
  expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(390);
  for (const card of await page.getByTestId('preset').all()) {
    const box = await card.boundingBox();
    if (!box) throw new Error('carta de Preset sem caixa');
    const apart = box.x + box.width <= buttonBox.x || buttonBox.x + buttonBox.width <= box.x;
    expect(apart, 'carta de Preset sobre o botão Novo Preset').toBe(true);
  }
  expect(await axeViolations(page)).toEqual([]);
});

test('o quadro tem as cinco colunas do menu de compra, com todas as armas do lado', async ({
  page,
}) => {
  await signIn(page);
  const ids = ['secondary', 'smg', 'rifle', 'heavy', 'equipment'];
  const xs: number[] = [];
  for (const id of ids) {
    const box = await page.getByTestId(`column-${id}`).boundingBox();
    expect(box).not.toBeNull();
    xs.push(box?.x ?? 0);
  }
  // Lado a lado, na ordem do menu.
  expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  expect(new Set(xs).size).toBe(5);

  // CT: a P2000 existe e a Glock não; o Zeus, a faca, as luvas, o agente e o kit fecham a última.
  await expect(slot(page, 'weapon_hkp2000', 'ct')).toBeVisible();
  await expect(slot(page, 'weapon_glock', 'ct')).toHaveCount(0);
  await expect(slot(page, 'weapon_ak47', 'ct')).toHaveCount(0);
  const equipment = page.getByTestId('column-equipment');
  for (const [name, side] of [
    ['weapon_taser', 'ct'],
    ['knife', 'ct'],
    ['gloves', 'ct'],
    ['agent', 'ct'],
    ['musicKit', 'all'],
  ] as const) {
    await expect(equipment.getByTestId(`slot-${name}-${side}`)).toBeVisible();
  }
  await expect(equipment.getByRole('button', { name: /^Kit de música:/ })).toBeVisible();

  // TR: a Glock e a AK-47 aparecem; a P2000 some.
  await page.getByTestId('side-t').click();
  await expect(slot(page, 'weapon_glock', 't')).toBeVisible();
  await expect(slot(page, 'weapon_ak47', 't')).toBeVisible();
  await expect(slot(page, 'weapon_hkp2000', 't')).toHaveCount(0);
  // Vazio: nenhum cartão traz Item, e a barra diz que vale o padrão do jogo.
  await expect(page.locator('[data-equipped]')).toHaveCount(0);
  await expect(dock(page)).toContainText('Nada equipado');
});

test('"Equipar também" leva o mesmo Item ao outro lado, e as bolinhas mostram os dois', async ({
  page,
}) => {
  await signIn(page);
  const knife = await addItem(page, { id: KARAMBIT_FADE });
  await page.reload();
  await boardReady(page);

  // Só no CT.
  await slot(page, 'knife', 'ct').click();
  const picker = await openPicker(page);
  await picker.getByTestId('both-sides').click();
  await picker.getByRole('button', { name: 'Equipar Karambit | Degradê' }).click();
  await expect(toast(page, 'Karambit | Degradê equipado em CT.')).toBeVisible();
  const dots = slot(page, 'knife', 'ct').getByTestId('team-dots');
  await expect(dots).toHaveAttribute('data-sides', 'ct');

  await dock(page).getByTestId('dock-also').click();
  await expect(toast(page, 'Karambit | Degradê equipado em CT e TR.')).toBeVisible();
  await expect(dots).toHaveAttribute('data-sides', 't,ct');
  await expect(dock(page).getByTestId('dock-also')).toHaveCount(0);
  await page.getByTestId('side-t').click();
  await expect(slot(page, 'knife', 't')).toHaveAttribute('data-equipped', knife);
});

test('o teclado anda pelo quadro com as setas e os números pulam de coluna', async ({ page }) => {
  await signIn(page);
  // Um único cartão está na ordem de tabulação: o selecionado (o primeiro, num Loadout vazio).
  const first = slot(page, 'weapon_hkp2000', 'ct');
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await expect(first).toHaveAttribute('tabindex', '0');
  await expect(page.locator('[data-card][tabindex="0"]')).toHaveCount(1);

  await first.focus();
  await page.keyboard.press('ArrowDown');
  await expect(slot(page, 'weapon_usp_silencer', 'ct')).toBeFocused();
  await expect(slot(page, 'weapon_usp_silencer', 'ct')).toHaveAttribute('aria-pressed', 'true');
  await expect(dock(page)).toContainText('USP-S');

  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('column-smg').locator('[data-card]').first()).not.toHaveAttribute(
    'data-equipped',
  );
  await expect(page.getByTestId('column-smg').locator('[data-card]:focus')).toHaveCount(1);

  await page.keyboard.press('3');
  await expect(page.getByTestId('column-rifle').locator('[data-card]:focus')).toHaveCount(1);
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('column-smg').locator('[data-card]:focus')).toHaveCount(1);
});

test('o número da coluna do cartão em foco não deixa foco preso para o próximo clique', async ({
  page,
}) => {
  await signIn(page);
  const first = slot(page, 'weapon_hkp2000', 'ct');
  // O clique já escolhe a coluna; o primeiro cartão da coluna 1 é o selecionado: apertar 1 não
  // muda estado nenhum, e o foco já está nele.
  await first.click();
  await page.keyboard.press('1');
  await expect(first).toBeFocused();

  const other = slot(page, 'weapon_usp_silencer', 'ct');
  await other.click();
  await expect(other).toHaveAttribute('aria-pressed', 'true');
  await expect(other).toBeFocused();
  // E a seta parte do cartão clicado, não do primeiro.
  await page.keyboard.press('ArrowDown');
  await expect(slot(page, 'weapon_elite', 'ct')).toBeFocused();
});

test('no celular, as categorias trocam a coluna à vista, sem rolagem lateral', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await expect(page.getByTestId('column-secondary')).toBeVisible();
  await expect(page.getByTestId('column-rifle')).toBeHidden();

  await page.getByTestId('category-rifle').click();
  await expect(page.getByTestId('column-rifle')).toBeVisible();
  await expect(page.getByTestId('column-secondary')).toBeHidden();
  await expect(page.getByTestId('category-rifle')).toHaveAttribute('aria-pressed', 'true');

  // A seta fica na coluna à vista: não alcança cartões escondidos.
  await slot(page, 'weapon_famas', 'ct').focus();
  await page.keyboard.press('ArrowRight');
  await expect(slot(page, 'weapon_famas', 'ct')).toBeFocused();

  // Os alvos de toque têm ao menos 44 px.
  for (const target of [
    page.getByTestId('side-t'),
    page.getByTestId('category-rifle'),
    dock(page).getByTestId('dock-pick'),
  ]) {
    const box = await target.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

test('abre no CT e, depois, no último lado usado, guardado no navegador', async ({ page }) => {
  await signIn(page);
  await expect(page.getByTestId('side-ct')).toHaveAttribute('aria-selected', 'true');
  await expect(slot(page, 'weapon_hkp2000', 'ct')).toBeVisible();

  await page.getByTestId('side-t').click();
  await expect(slot(page, 'weapon_glock', 't')).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('side-t')).toHaveAttribute('aria-selected', 'true');
  await expect(slot(page, 'weapon_glock', 't')).toBeVisible();

  await page.getByTestId('side-ct').click();
  await page.reload();
  await expect(page.getByTestId('side-ct')).toHaveAttribute('aria-selected', 'true');
});

test('sem armazenamento no navegador, o Loadout abre no CT e a troca de lado continua valendo', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('bloqueado', 'SecurityError');
      },
    });
  });
  await signIn(page);
  await expect(page.getByTestId('side-ct')).toHaveAttribute('aria-selected', 'true');
  await page.getByTestId('side-t').click();
  await expect(page.getByTestId('side-t')).toHaveAttribute('aria-selected', 'true');
  await expect(slot(page, 'weapon_glock', 't')).toBeVisible();
});

test('a mão de Presets fica acima da troca TR | CT, e as armas aparecem sem rolar', async ({
  page,
}) => {
  // 1440 × 900: a mão ocupa ~215 px antes do quadro, então a primeira linha de armas cabe acima
  // da barra do slot a partir daí (em 720 de altura ela fica por baixo, e se rola até lá).
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  // Os Primeiros passos acabaram de fechar: espera o quadro parar de subir antes de medir.
  const boardTop = () =>
    page
      .getByTestId('column-secondary')
      .boundingBox()
      .then((box) => box?.y ?? 0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(boardTop).toBeLessThan(600);
  const side = await page.getByTestId('side-t').boundingBox();
  const hand = await page.getByTestId('presets').boundingBox();
  expect(side).not.toBeNull();
  expect(hand).not.toBeNull();
  // A mão vem antes da troca de lado.
  expect((hand?.y ?? 0) + (hand?.height ?? 0)).toBeLessThanOrEqual((side?.y ?? 0) + 1);

  // O primeiro cartão de cada coluna de armas cabe acima da barra do slot, sem rolar.
  const dockTop = (await dock(page).boundingBox())?.y ?? 0;
  for (const id of ['secondary', 'smg', 'rifle', 'heavy']) {
    const card = await page
      .getByTestId(`column-${id}`)
      .locator('[data-card]')
      .first()
      .boundingBox();
    expect(card).not.toBeNull();
    expect((card?.y ?? 0) + (card?.height ?? 0)).toBeLessThanOrEqual(dockTop);
  }
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

/**
 * A barra do slot fica fixa embaixo e a de cima fixa no alto: um cartão que recebe o foco do
 * teclado nunca pode ficar escondido atrás de uma delas, em telas baixas (1280 × 720) e no celular.
 */
for (const size of [
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
]) {
  test(`o foco do teclado traz o cartão para fora das barras fixas (${size.width} × ${size.height})`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await signIn(page);
    // Com um slot selecionado a barra de baixo aparece.
    await page.locator('[data-card]').first().click();
    await expect(dock(page)).toBeVisible();

    const tabs = page.locator('[data-testid^="category-"]');
    const columns = size.width < 1001 ? await tabs.count() : 1;
    for (let column = 0; column < columns; column++) {
      if (size.width < 1001) await tabs.nth(column).click();
      const cards = page.locator('[data-card]:visible');
      const total = await cards.count();
      expect(total).toBeGreaterThan(0);
      for (let index = 0; index < total; index++) {
        await cards.nth(index).focus();
        await page.waitForTimeout(60);
        const box = await cards.nth(index).boundingBox();
        const dockBox = await dock(page).boundingBox();
        const bar = await page.getByTestId('side-t').boundingBox();
        expect(box).not.toBeNull();
        expect(
          (box?.y ?? 0) + (box?.height ?? 0),
          `cartão ${index} da coluna ${column} sob a barra do slot`,
        ).toBeLessThanOrEqual((dockBox?.y ?? 0) + 0.5);
        expect(
          box?.y ?? 0,
          `cartão ${index} da coluna ${column} sob a barra de cima`,
        ).toBeGreaterThanOrEqual((bar?.y ?? 0) + (bar?.height ?? 0) - 0.5);
      }
    }
  });
}

test.describe('mão de Presets', () => {
  test('em 390 px o nome da carta quebra em até 2 linhas, sem corte seco, e segue inteiro', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, { vip: true });
    await createPreset(page, 'Retake de sexta-feira');
    await page.reload();
    await boardReady(page);
    await handReady(page);

    for (const card of await cards(page).all()) {
      const title = card.getByTestId('preset-title');
      const name = (await title.textContent()) ?? '';
      // O nome inteiro continua no DOM, na dica e no nome acessível do botão.
      await expect(title).toHaveAttribute('title', name);
      const size = await title.evaluate((el) => ({
        sw: el.scrollWidth,
        cw: el.clientWidth,
        sh: el.scrollHeight,
        ch: el.clientHeight,
      }));
      const fits = size.sw <= size.cw + 1 && size.sh <= size.ch + 1;
      expect(fits, `nome "${name}" cortado: ${JSON.stringify(size)}`).toBe(true);
      // O nome não passa por baixo do menu "…".
      const menu = card.getByTestId('preset-menu');
      if (await menu.isVisible()) {
        const titleBox = await title.boundingBox();
        const menuBox = await menu.boundingBox();
        expect((titleBox?.x ?? 0) + (titleBox?.width ?? 0)).toBeLessThanOrEqual(
          (menuBox?.x ?? 0) + 0.5,
        );
      }
    }
    await expect(page.getByRole('button', { name: 'Ativar Retake de sexta-feira' })).toBeVisible();
  });

  /**
   * A página ainda anda um pouco depois de hidratar (a faixa dos Primeiros passos fecha, o aviso do VIP
   * entra): quem mede a posição de uma carta ou aponta o mouse para ela antes disso acerta o lugar
   * errado. Espera a posição do bloco ficar a mesma em duas leituras seguidas.
   */
  async function layoutStable(block: Locator) {
    let last = Number.NaN;
    await expect
      .poll(
        async () => {
          const y = (await block.boundingBox())?.y ?? Number.NaN;
          const same = y === last;
          last = y;
          return same;
        },
        { intervals: [250] },
      )
      .toBe(true);
  }

  /** Uma Conta VIP com o Principal e mais dois Presets. */
  async function vipHand(page: Page) {
    await signIn(page, { vip: true });
    await createPreset(page, 'Retake');
    await createPreset(page, 'Treino');
    await page.reload();
    await boardReady(page);
    await handReady(page);
    // Hidratada, a mão ainda nasce em fileira (largura 0) e só vira leque depois de medir.
    const narrow = (page.viewportSize()?.width ?? 1280) < 640;
    await expect(page.getByTestId('presets')).toHaveAttribute('data-mode', narrow ? 'row' : 'fan');
    await layoutStable(page.getByTestId('presets'));
  }
  const cards = (page: Page) => page.getByTestId('preset');

  /**
   * A altura da carta dentro da mão (relativa ao bloco dos Presets): as posições absolutas andam com a
   * rolagem restaurada pelo reload e com o que a página ainda ajusta depois de hidratar, e foi isso que
   * fez estes testes medirem o repouso num lugar e a carta em outro (no Linux da CI, sempre).
   */
  async function rise(page: Page, index: number) {
    const card = (await cards(page).nth(index).boundingBox())?.y;
    const block = (await page.getByTestId('presets').boundingBox())?.y;
    return card === undefined || block === undefined ? Number.NaN : card - block;
  }

  /**
   * O Motion carrega depois da hidratação (chunk à parte) e só então a mão anima e aceita arrasto:
   * passa o mouse numa carta e espera ela subir antes de arrastar.
   */
  async function motionReady(page: Page) {
    const second = cards(page).nth(1);
    const rest = await rise(page, 1);
    await expect(async () => {
      await second.hover();
      expect(await rise(page, 1)).toBeLessThan(rest - 10);
    }).toPass();
    await page.mouse.move(5, 5);
    await expect.poll(() => rise(page, 1)).toBeGreaterThan(rest - 4);
  }

  test('cada Preset é uma carta, e o ativo vem marcado e mais alto', async ({ page }) => {
    await vipHand(page);

    await expect(cards(page)).toHaveCount(3);
    await expect(page.getByTestId('presets')).toHaveAttribute('data-mode', 'fan');
    await expect(cards(page).nth(0)).toHaveAttribute('data-active', 'true');
    await expect(cards(page).nth(0)).toContainText('Principal');
    await expect(cards(page).nth(0)).toContainText('Ativo');
    await expect(cards(page).nth(1)).toContainText('Retake');
    const activeTop = (await cards(page).nth(0).boundingBox())?.y ?? 0;
    const otherTop = (await cards(page).nth(2).boundingBox())?.y ?? 0;
    expect(activeTop).toBeLessThan(otherTop);
  });

  test('passar o mouse folheia: a carta sob o ponteiro sobe, e sair devolve a mão ao repouso', async ({
    page,
  }) => {
    await vipHand(page);

    const rest = await rise(page, 1);
    await cards(page).nth(1).hover();
    await expect(cards(page).nth(1)).toHaveAttribute('data-focused', 'true');
    await expect.poll(() => rise(page, 1)).toBeLessThan(rest - 10);

    await page.mouse.move(5, 5);
    await expect(cards(page).nth(1)).not.toHaveAttribute('data-focused', 'true');
    await expect.poll(() => rise(page, 1)).toBeGreaterThan(rest - 4);
  });

  test('depois de um clique, tirar o mouse devolve a mão ao repouso', async ({ page }) => {
    await vipHand(page);
    await motionReady(page);

    await cards(page).nth(2).click();
    await expect(toast(page, 'Treino é o seu Loadout')).toBeVisible();
    await page.mouse.move(5, 5);
    await expect(page.locator('[data-testid="preset"][data-focused]')).toHaveCount(0);
  });

  test('o teclado folheia com as setas, e Enter ativa, com Desfazer', async ({ page }) => {
    await vipHand(page);

    await page.getByRole('button', { name: 'Ativar Retake' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('button', { name: 'Ativar Treino' })).toBeFocused();
    await expect(cards(page).nth(2)).toHaveAttribute('data-focused', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('button', { name: 'Ativar Retake' })).toBeFocused();
    await page.keyboard.press('End');
    await expect(page.getByRole('button', { name: 'Novo Preset' })).toBeFocused();
    await page.keyboard.press('Home');
    await expect(page.getByRole('button', { name: /^Principal/ })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');

    await expect(toast(page, 'Retake é o seu Loadout')).toBeVisible();
    await expect(page.locator('[data-testid="preset"][data-active]')).toContainText('Retake');
    // O foco fica na carta (não vai para o corpo da página): dá para seguir com as setas.
    await expect(cards(page).nth(1).locator('button[aria-pressed]')).toBeFocused();
    await toast(page, 'Retake é o seu Loadout').getByRole('button', { name: 'Desfazer' }).click();
    await expect(page.locator('[data-testid="preset"][data-active]')).toContainText('Principal');
  });

  test('jogar a carta para cima ativa o Preset', async ({ page }) => {
    await vipHand(page);
    await motionReady(page);

    const card = page.getByRole('button', { name: 'Ativar Treino' });
    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    const x = (box?.x ?? 0) + (box?.width ?? 0) / 2;
    const y = (box?.y ?? 0) + (box?.height ?? 0) / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 60, { steps: 6 });
    await page.mouse.move(x, y - 150, { steps: 8 });
    await page.mouse.up();

    await expect(toast(page, 'Treino é o seu Loadout')).toBeVisible();
    await expect(page.locator('[data-testid="preset"][data-active]')).toContainText('Treino');
  });

  test('arrastar só um pouco não ativa: a carta volta', async ({ page }) => {
    await vipHand(page);
    await motionReady(page);

    const box = await page.getByRole('button', { name: 'Ativar Treino' }).boundingBox();
    const x = (box?.x ?? 0) + (box?.width ?? 0) / 2;
    const y = (box?.y ?? 0) + (box?.height ?? 0) / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 20, { steps: 4 });
    await page.mouse.up();

    await expect(page.locator('[data-testid="preset"][data-active]')).toContainText('Principal');
    await expect(page.locator('[data-testid="undo-toast"]')).toHaveCount(0);
  });

  test('a carta mostra a faca equipada do lado em uso, e muda com a troca TR | CT', async ({
    page,
  }) => {
    await signIn(page, { vip: true });
    await addItem(page, { id: KARAMBIT_FADE });
    await page.reload();
    await boardReady(page);
    await equipFromPicker(page, { name: 'knife', side: 'ct' }, 'Equipar Karambit | Degradê');
    await page.reload();
    await handReady(page);
    const card = cards(page).first();

    await expect(card).toContainText('CT');
    const face = card.locator('button[aria-pressed]');
    await expect(face).toHaveAccessibleDescription(/Faca: Karambit \| Degradê/);
    await expect(face).toHaveAccessibleDescription(/Rifle: M4A4/);
    await page.getByTestId('side-t').click();
    await expect(card).toContainText('TR');
    // No TR a frente é a do TR: o rifle padrão é a AK-47.
    await expect(face).toHaveAccessibleDescription(/Rifle: AK-47/);
  });

  test('no celular, a carta do plano grátis cabe inteira, sem rolagem lateral', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page);
    await handReady(page);

    const card = await cards(page).first().boundingBox();
    expect(card?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((card?.x ?? 0) + (card?.width ?? 999)).toBeLessThanOrEqual(390);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });

  test('plano grátis: uma carta só, com o convite do VIP discreto', async ({ page }) => {
    await signIn(page);
    await handReady(page);

    await expect(cards(page)).toHaveCount(1);
    await expect(page.getByTestId('preset-free')).toBeVisible();
    await expect(page.getByTestId('preset-new')).toHaveCount(0);
    await expect(page.getByTestId('preset-menu')).toHaveCount(0);
  });

  test('com movimento reduzido a mão não se mexe: sem inclinar, subir ou crescer', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await vipHand(page);

    await cards(page).nth(1).hover();
    await expect(cards(page).nth(1)).toHaveAttribute('data-focused', 'true');
    const transforms = await cards(page).evaluateAll((items) =>
      items.map((item) => getComputedStyle(item).transform),
    );
    // Só deslocamento horizontal (a posição na mão): nenhuma rotação, subida ou escala.
    for (const transform of transforms) {
      expect(transform === 'none' || /^matrix\(1, 0, 0, 1, -?[\d.]+, 0\)$/.test(transform)).toBe(
        true,
      );
    }
  });

  test('no celular a mão é uma fileira que rola e prende, e tocar numa carta ativa', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await vipHand(page);

    await expect(page.getByTestId('presets')).toHaveAttribute('data-mode', 'row');
    const row = page.getByTestId('presets').locator('ul');
    expect(await row.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    expect(await row.evaluate((el) => getComputedStyle(el).scrollSnapType)).toContain('x');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
    // Nada cortado: a mão cabe na tela e a primeira carta começa dentro dela, com o menu à vista.
    const section = await page.getByTestId('presets').boundingBox();
    expect(section?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((section?.x ?? 0) + (section?.width ?? 999)).toBeLessThanOrEqual(390);
    const first = await cards(page).first().boundingBox();
    expect(first?.x ?? -1).toBeGreaterThanOrEqual(0);
    await expect(cards(page).first().getByTestId('preset-menu')).toBeVisible();

    await page.getByRole('button', { name: 'Ativar Retake' }).click();
    await expect(toast(page, 'Retake é o seu Loadout')).toBeVisible();
    await expect(page.locator('[data-testid="preset"][data-active]')).toContainText('Retake');
  });
});

test('no celular, os Presets rolam com a página e a troca de lado fica fixa no alto', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await expect(page.getByTestId('presets')).toBeVisible();
  await page.getByTestId('category-rifle').click();
  // Rola até logo depois dos Presets (onde estiverem: os Primeiros passos podem ainda estar abertos).
  await page.getByTestId('presets').evaluate((el) => {
    window.scrollTo(0, el.getBoundingClientRect().bottom + window.scrollY + 40);
  });
  await expect
    .poll(async () => (await page.getByTestId('presets').boundingBox())?.y ?? 0)
    .toBeLessThan(0);
  // No celular o header rola junto: a troca de lado fica fixa no próprio alto da tela.
  const side = await page.getByTestId('side-t').boundingBox();
  expect(side?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect(side?.y ?? 999).toBeLessThan(80);
});

test('os textos do quadro têm ao menos 11 px', async ({ page }) => {
  await signIn(page);
  const small = await page.evaluate(() => {
    const board = document.querySelector('[data-testid^="loadout-"]');
    if (!board) return ['sem quadro'];
    const found: string[] = [];
    for (const el of board.querySelectorAll<HTMLElement>('*')) {
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim());
      if (own && Number.parseFloat(getComputedStyle(el).fontSize) < 11) {
        found.push(`${el.textContent?.trim()} (${getComputedStyle(el).fontSize})`);
      }
    }
    return found;
  });
  expect(small).toEqual([]);
});

for (const theme of ['dark', 'light'] as const) {
  test(`axe sem violações no Loadout com Itens, Presets, a barra do slot e a folha (${theme})`, async ({
    page,
  }) => {
    await saveTheme(page, theme);
    await signIn(page, { vip: true });
    await addItem(page, { id: KARAMBIT_FADE });
    await addItem(page, { id: FIRST_AGENT });
    await page.reload();
    await boardReady(page);
    await equipFromPicker(page, { name: 'knife', side: 'ct' }, 'Equipar Karambit | Degradê');
    await createPreset(page, 'Retake');
    await createPreset(page, 'Treino', 'empty');
    await page.reload();
    await boardReady(page);
    // O axe mede depois que o aviso sai: no meio da animação ele está translúcido de propósito.
    await expect(page.getByTestId('undo-toast')).toHaveCount(0, { timeout: 15_000 });
    expect(await axeViolations(page)).toEqual([]);
    // Com a folha de escolha aberta.
    await slot(page, 'knife', 'ct').click();
    await openPicker(page);
    expect(await axeViolations(page)).toEqual([]);
  });
}
