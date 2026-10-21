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

test('Presets e a troca TR | CT dividem a linha, e as armas aparecem sem rolar', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await signIn(page);
  // Os Primeiros passos acabaram de fechar: espera o quadro parar de subir antes de medir.
  const boardTop = () =>
    page
      .getByTestId('column-secondary')
      .boundingBox()
      .then((box) => box?.y ?? 0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(boardTop).toBeLessThan(400);
  const side = await page.getByTestId('side-t').boundingBox();
  const presets = await page.getByTestId('presets').boundingBox();
  expect(side).not.toBeNull();
  expect(presets).not.toBeNull();
  // Na mesma linha: o centro vertical de um cai dentro do outro.
  const middle = (side?.y ?? 0) + (side?.height ?? 0) / 2;
  expect(middle).toBeGreaterThan(presets?.y ?? 0);
  expect(middle).toBeLessThan((presets?.y ?? 0) + (presets?.height ?? 0));

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
    // O axe mede depois que o aviso sai: no meio da animação ele está translúcido de propósito.
    await expect(page.getByTestId('undo-toast')).toHaveCount(0, { timeout: 15_000 });
    expect(await axeViolations(page)).toEqual([]);
    // Com a folha de escolha aberta.
    await slot(page, 'knife', 'ct').click();
    await openPicker(page);
    expect(await axeViolations(page)).toEqual([]);
  });
}
