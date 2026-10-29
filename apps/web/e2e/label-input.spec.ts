import type { Locator, Page } from '@playwright/test';
import { createUnclaimedAccount, signInByRequest } from './accounts';
import { axeViolations, expect, saveTheme, settle, test } from './fixtures';

/** Abre o campo "Novo nome" (Configurações > Perfil), o Label Input mais simples do site. */
async function openNameField(page: Page, request: import('@playwright/test').APIRequestContext) {
  const account = await createUnclaimedAccount(request, 'Campo Flutuante');
  await signInByRequest(page, account.steamId);
  await page.goto('/settings/profile');
  await expect(page.getByTestId('profile-settings')).toBeVisible();
  await page.getByTestId('name-edit').click();
  const input = page.getByLabel('Novo nome');
  await expect(input).toBeVisible();
  return input;
}

/** A escala e o deslocamento do rótulo do campo, lidos do que o navegador desenhou. */
const labelState = (input: Locator) =>
  input.evaluate((el) => {
    const label = el.parentElement?.querySelector('label') as HTMLElement;
    const style = getComputedStyle(label);
    return {
      scale: Number.parseFloat(style.scale === 'none' ? '1' : style.scale),
      top: label.getBoundingClientRect().top - el.getBoundingClientRect().top,
    };
  });

const ring = (input: Locator) =>
  input.evaluate((el) => {
    const style = getComputedStyle(el);
    return {
      style: style.outlineStyle,
      width: Number.parseFloat(style.outlineWidth),
      color: style.outlineColor,
    };
  });

for (const theme of ['dark', 'light'] as const) {
  test(`o rótulo repousa no campo vazio, sobe com o foco e fica no alto com texto (${theme})`, async ({
    page,
    request,
  }) => {
    await saveTheme(page, theme);
    const input = await openNameField(page, request);
    await input.fill('');
    await page.mouse.click(5, 5);
    await settle(page);

    const resting = await labelState(input);
    expect(resting.scale).toBe(1);

    await input.click();
    await expect.poll(async () => (await labelState(input)).scale).toBeLessThan(0.85);
    const floating = await labelState(input);
    expect(floating.top).toBeLessThan(resting.top);

    await input.fill('Alguém');
    await page.mouse.click(5, 5);
    await settle(page);
    expect((await labelState(input)).scale).toBeLessThan(0.85);
  });

  test(`o anel da marca aparece no foco, com mouse também, e passa de 3:1 (${theme})`, async ({
    page,
    request,
  }) => {
    await saveTheme(page, theme);
    const input = await openNameField(page, request);
    await page.mouse.click(5, 5);
    await settle(page);
    expect((await ring(input)).color).toMatch(/rgba\(\d+, \d+, \d+, 0\)|transparent/);

    await input.click();
    await settle(page);
    const focused = await ring(input);
    expect(focused.style).toBe('solid');
    expect(focused.width).toBe(2);
    expect(focused.color).not.toMatch(/, 0\)$/);

    // Contraste do anel contra o fundo do campo (WCAG 1.4.11).
    const ratio = await input.evaluate((el) => {
      const channels = (css: string) => {
        const unit = css.startsWith('color(') ? 255 : 1;
        return (css.match(/[0-9.]+/g) ?? []).map(Number).map((v, i) => (i < 3 ? v * unit : v));
      };
      const luminance = (rgb: number[]) => {
        const [r = 0, g = 0, b = 0] = rgb.map((v) => {
          const c = v / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const base = channels(getComputedStyle(document.body).backgroundColor);
      const top = channels(getComputedStyle(el).outlineColor);
      const alpha = top[3] ?? 1;
      const blended = [0, 1, 2].map((i) => (top[i] ?? 0) * alpha + (base[i] ?? 0) * (1 - alpha));
      const lighter = Math.max(luminance(blended), luminance(base));
      const darker = Math.min(luminance(blended), luminance(base));
      return (lighter + 0.05) / (darker + 0.05);
    });
    expect(ratio).toBeGreaterThanOrEqual(3);
  });

  test(`sem violações do axe: vazio, em foco e preenchido (${theme})`, async ({
    page,
    request,
  }) => {
    await saveTheme(page, theme);
    const input = await openNameField(page, request);
    expect(await axeViolations(page), 'vazio').toEqual([]);
    await input.click();
    await settle(page);
    expect(await axeViolations(page), 'em foco').toEqual([]);
    await input.fill('Nome Novo');
    expect(await axeViolations(page), 'preenchido').toEqual([]);
  });
}

test('o Tab leva ao campo e ao botão sem prender o foco, e o nome acessível é o rótulo', async ({
  page,
  request,
}) => {
  const input = await openNameField(page, request);
  await expect(input).toHaveAccessibleName('Novo nome');
  await input.focus();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('name-save')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(input).toBeFocused();
});

test('com movimento reduzido o rótulo troca de lugar sem transição', async ({ page, request }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const input = await openNameField(page, request);
  const transition = await input.evaluate((el) => {
    const style = getComputedStyle(el.parentElement?.querySelector('label') as HTMLElement);
    return { property: style.transitionProperty, duration: style.transitionDuration };
  });
  const none =
    transition.property === 'none' ||
    transition.duration.split(',').every((d) => Number.parseFloat(d) === 0);
  expect(none).toBe(true);
  await input.click();
  expect((await labelState(input)).scale).toBeLessThan(0.85);
});
