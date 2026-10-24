import { BG, expect, saveTheme, test } from './fixtures';

const toggle = (page: import('@playwright/test').Page) => page.getByTestId('theme-toggle');

test('a troca de tema alterna, salva e sobrevive ao recarregar', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Usar tema claro' }).click();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  // Quem pinta o fundo é o <html>: nas telas com o brilho ambiente (`data-vida`) o <body> fica transparente.
  await expect(page.locator('html')).toHaveCSS('background-color', BG.light);
  await expect(page.getByRole('button', { name: 'Usar tema escuro' })).toBeVisible();

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await page.getByRole('button', { name: 'Usar tema escuro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('carmine-theme'))).toBe('dark');
});

test('a troca de tema funciona pelo teclado', async ({ page }) => {
  await page.goto('/');
  await toggle(page).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(toggle(page)).toHaveAccessibleName('Usar tema escuro');
  await expect(toggle(page)).toBeFocused();

  await page.keyboard.press('Space');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(toggle(page)).toHaveAccessibleName('Usar tema claro');
});

test('o botão de tema mostra o destino da troca no ícone e na dica', async ({ page }) => {
  await page.goto('/');
  // No escuro aparece o sol (vai para o claro); a lua fica oculta.
  const icons = toggle(page).locator('svg');
  await expect(icons.nth(0)).toBeVisible();
  await expect(icons.nth(1)).toBeHidden();

  await toggle(page).hover();
  await expect(page.getByRole('tooltip')).toHaveText('Usar tema claro');

  await toggle(page).click();
  await expect(icons.nth(0)).toBeHidden();
  await expect(icons.nth(1)).toBeVisible();
});

test('a troca de tema funciona com movimento reduzido', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Usar tema claro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('html')).not.toHaveClass(/no-tx/);
});

test('a página 404 respeita o tema salvo', async ({ page, expectedConsoleErrors }) => {
  expectedConsoleErrors.push(/404 \(Not Found\)/);
  await saveTheme(page, 'light');
  const response = await page.goto('/pagina-que-nao-existe');
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Página não encontrada' }),
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  // Quem pinta o fundo é o <html>: nas telas com o brilho ambiente (`data-vida`) o <body> fica transparente.
  await expect(page.locator('html')).toHaveCSS('background-color', BG.light);
});
