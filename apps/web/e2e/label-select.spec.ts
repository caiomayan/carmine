import type { Locator, Page } from '@playwright/test';
import { newSteamId, signInFromHeader } from './accounts';
import { axeViolations, chooseOption, expect, saveTheme, settle, test } from './fixtures';

const AK_REDLINE = 222;

/** Entra com uma Conta nova, abre o editor da AK-47 | Redline e põe um sticker: o slot é um LabelSelect. */
async function openStickerEditor(page: Page) {
  await page.goto('/inventario');
  await signInFromHeader(page, newSteamId());
  await expect(page).toHaveURL('/inventario');
  await page.goto(`/inventario/adicionar/${AK_REDLINE}`);
  await page.getByTestId('add-sticker').click();
  const picker = page.getByTestId('picker-sticker');
  await picker.getByTestId('picker-search').fill('vitalty');
  await expect(picker.getByText(/\d+ resultados?/)).toBeVisible();
  await picker
    .getByRole('button', { name: /^Escolher / })
    .first()
    .click();
  await expect(picker).toHaveCount(0);
  // Com a lista aberta o Radix marca o resto como aria-hidden: o seletor de papel não acharia o botão.
  const slot = page.getByTestId('sticker-0').locator('button[role="combobox"]');
  await expect(slot).toBeVisible();
  return slot;
}

const ring = (field: Locator) =>
  field.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      style: style.outlineStyle,
      width: Number.parseFloat(style.outlineWidth),
      color: style.outlineColor,
    };
  });

/** A escala do rótulo que acompanha o botão (o `<label for>` irmão). */
const labelScale = (field: Locator) =>
  field.evaluate((el) => {
    const label = el.parentElement?.querySelector(`label[for="${el.id}"]`) as HTMLElement;
    const scale = getComputedStyle(label).scale;
    return Number.parseFloat(scale === 'none' ? '1' : scale);
  });

for (const theme of ['dark', 'light'] as const) {
  test(`o slot do sticker é um Select com rótulo flutuante e anel da marca no foco e aberto (${theme})`, async ({
    page,
  }) => {
    await saveTheme(page, theme);
    const slot = await openStickerEditor(page);

    // Há um valor escolhido ("Slot 1"): o rótulo fica no alto e é o nome acessível do botão.
    await expect(slot).toHaveAccessibleName('Posição na arma');
    await expect.poll(() => labelScale(slot)).toBeLessThan(0.85);

    // Sem foco: sem anel.
    await page.mouse.click(5, 5);
    await settle(page);
    expect((await ring(slot)).color).toMatch(/, 0\)$|transparent/);

    // Foco do mouse: o anel de 2 px da marca já entra (exceção do dono para os campos).
    await slot.focus();
    await settle(page);
    const focused = await ring(slot);
    expect(focused.style).toBe('solid');
    expect(focused.width).toBe(2);
    expect(focused.color).not.toMatch(/, 0\)$/);

    // Com a lista aberta o botão continua com o anel.
    await slot.click();
    await expect(page.getByRole('listbox')).toBeVisible();
    expect((await ring(slot)).style).toBe('solid');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toBeHidden();
    await expect(slot).toBeFocused();
  });

  test(`sem violações do axe no editor com o Select e os números dos sliders (${theme})`, async ({
    page,
  }) => {
    await saveTheme(page, theme);
    const slot = await openStickerEditor(page);
    expect(await axeViolations(page), 'repouso').toEqual([]);
    await slot.focus();
    await settle(page);
    expect(await axeViolations(page), 'Select em foco').toEqual([]);
    await page.getByTestId('field-wear').focus();
    await settle(page);
    expect(await axeViolations(page), 'número em foco').toEqual([]);
  });
}

test('trocar o slot pelo teclado continua funcionando e o valor aparece no botão', async ({
  page,
}) => {
  const slot = await openStickerEditor(page);
  await chooseOption(page, slot, '2');
  await expect(slot).toContainText('Slot 3');
});

test('o número ao lado do slider tem o fundo da escala e o anel da marca no foco', async ({
  page,
}) => {
  await openStickerEditor(page);
  const wear = page.getByTestId('field-wear');
  const rest = await wear.evaluate((el) => getComputedStyle(el).backgroundColor);
  // O fundo é a camada do texto sobre a superfície (translúcida), não uma cor chapada.
  expect(rest).toMatch(/\/ 0\.\d+\)|rgba\(.*0\.\d+\)/);
  await wear.click();
  await settle(page);
  const focused = await ring(wear);
  expect(focused.style).toBe('solid');
  expect(focused.width).toBe(2);
});

test('com movimento reduzido o rótulo do Select troca de lugar sem transição', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const slot = await openStickerEditor(page);
  const transition = await slot.evaluate((el) => {
    const label = el.parentElement?.querySelector(`label[for="${el.id}"]`) as HTMLElement;
    const style = getComputedStyle(label);
    return { property: style.transitionProperty, duration: style.transitionDuration };
  });
  const none =
    transition.property === 'none' ||
    transition.duration.split(',').every((d) => Number.parseFloat(d) === 0);
  expect(none).toBe(true);
});
