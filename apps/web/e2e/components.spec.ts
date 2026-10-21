import type { Page } from '@playwright/test';
import { axeViolations, expect, saveTheme, settle, type Theme, test } from './fixtures';
import { fakeServer, routeLiveServers } from './live-servers';

/** Animações do Motion (WAAPI) rodando dentro do elemento; as de CSS ficam de fora. */
const motionAnimationsIn = (page: Page, selector: string) =>
  page.evaluate(
    (sel) =>
      document
        .getAnimations()
        .filter(
          (a) =>
            !(a instanceof CSSAnimation) &&
            !(a instanceof CSSTransition) &&
            a.playState === 'running' &&
            a.effect instanceof KeyframeEffect &&
            !!a.effect.target &&
            !!document.querySelector(sel)?.contains(a.effect.target as Node),
        ).length,
    selector,
  );

test('o filtro de Modo troca a lista com destaque deslizante e teclado', async ({ page }) => {
  await routeLiveServers(page, [fakeServer({ name: 'fixo-filtro' })]);
  await page.goto('/');
  const tabs = page.getByRole('tablist', { name: 'Modo' });
  await expect(tabs.getByRole('tab', { name: 'Todos' })).toHaveAttribute('aria-selected', 'true');

  await tabs.getByRole('tab', { name: 'Retake' }).click();
  await expect(tabs.getByRole('tab', { name: 'Retake' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-server="fixo-filtro"]')).toBeVisible();

  await page.keyboard.press('ArrowRight');
  await expect(tabs.getByRole('tab', { name: 'Deathmatch' })).toBeFocused();
  await expect(page.getByText('Nenhum servidor de Deathmatch por enquanto')).toBeVisible();
});

test('os ícones animam no hover do controle e ficam parados com movimento reduzido', async ({
  page,
}) => {
  await page.goto('/');
  await settle(page);
  const toggle = '[data-testid="theme-toggle"]';
  await page.hover(toggle);
  await expect.poll(() => motionAnimationsIn(page, toggle)).toBeGreaterThan(0);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await settle(page);
  await page.mouse.move(0, 0);
  await page.hover(toggle);
  await page.waitForTimeout(150);
  expect(await motionAnimationsIn(page, toggle)).toBe(0);
});

test('os ícones também animam com o foco de teclado no controle', async ({ page }) => {
  await page.goto('/');
  await settle(page);
  await page.getByTestId('theme-toggle').focus();
  // Foco programático não é :focus-visible; o Tab é.
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('theme-toggle')).toBeFocused();
  await expect
    .poll(() => motionAnimationsIn(page, '[data-testid="theme-toggle"]'))
    .toBeGreaterThan(0);
});

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`componentes animados funcionam (movimento: ${reducedMotion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto('/dev/componentes');

    // Interruptor
    const sw = page.getByRole('switch', { name: 'Mostrar só servidores com vaga' });
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    await sw.click();
    await expect(sw).toHaveAttribute('aria-checked', 'false');

    // Menu
    await page.getByRole('button', { name: 'Escolher Modo' }).click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem')).toHaveCount(3);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();

    // Diálogo
    await page.getByRole('button', { name: 'Abrir diálogo' }).click();
    const dialog = page.getByRole('dialog', { name: 'Ativar Preset?' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Fechar' }).first().click();
    await expect(dialog).toBeHidden();

    // Painel lateral
    await page.getByRole('button', { name: 'Abrir painel' }).click();
    const sheet = page.getByRole('dialog', { name: 'Filtros' });
    await expect(sheet).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();

    // Contador: o leitor de tela ouve só o número; com movimento reduzido não há rolos.
    await page.getByRole('button', { name: 'Somar jogadores' }).click();
    await expect(page.getByText('2.448', { exact: true })).toBeAttached();
    const tree = await page.locator('main').ariaSnapshot();
    expect(tree).toContain('2.448');
    expect(tree, 'rolos de dígitos fora da árvore de acessibilidade').not.toMatch(/\d \d \d \d/);
    const rollers = page.locator('main [data-slot="sliding-number"]');
    await expect(rollers).toHaveCount(reducedMotion === 'reduce' ? 0 : 1);
  });
}

for (const theme of ['dark', 'light'] as Theme[]) {
  for (const width of [390, 1440]) {
    test(`Select, Combobox e confirmação: teclado, busca sem acento e axe (${theme}, ${width} px)`, async ({
      page,
    }) => {
      await saveTheme(page, theme);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/dev/componentes');
      await settle(page);

      // Select: abre pelo teclado, setas e Enter escolhem; o item vazio desfaz.
      const mode = page.getByRole('combobox', { name: 'Modo', exact: true });
      await expect(mode).toHaveText('Todos os Modos');
      await mode.focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('listbox').getByRole('option')).toHaveCount(3);
      // O Select do Radix é modal: o resto da página fica aria-hidden e o foco preso no painel, o
      // que o axe lê como "aria-hidden-focus" (falso positivo: nada fora do painel recebe foco).
      expect(
        await axeViolations(page, { ignore: ['aria-hidden-focus'] }),
        'axe com o Select aberto',
      ).toEqual([]);
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await expect(mode).toHaveText('Retake');
      await expect(mode).toBeFocused();
      await mode.click();
      await page.getByTestId('option-empty').click();
      await expect(mode).toHaveText('Todos os Modos');

      // Combobox: busca tolerante (erro de digitação, palavra parcial); Enter escolhe e fecha.
      const weapon = page.getByRole('combobox', { name: 'Arma', exact: true });
      await weapon.click();
      const search = page.getByRole('combobox', { name: 'Buscar na lista' });
      await expect(search).toBeFocused();
      await expect(page.getByRole('option')).toHaveCount(10);
      expect(await axeViolations(page), 'axe com o Combobox aberto').toEqual([]);
      await search.fill('glok 18');
      await expect(page.getByRole('option')).toHaveText(['Glock-18']);
      // Palavra parcial; o exato vem antes do aproximado (ordem por relevância).
      await search.fill('m4');
      await expect(page.getByRole('option')).toHaveText(['M4A1-S', 'M4A4']);
      await search.fill('m4a4');
      await expect(page.getByRole('option').first()).toHaveText('M4A4');
      await search.fill('glok 18');
      await page.keyboard.press('Enter');
      await expect(weapon).toHaveText('Glock-18');
      await expect(search).toBeHidden();
      await expect(weapon).toBeFocused();

      await weapon.click();
      await search.fill('zzz');
      await expect(page.getByText('Nada encontrado')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(search).toBeHidden();

      // Confirmação: alertdialog, foco em "Cancelar", Esc fecha e devolve o foco.
      const open = page.getByRole('button', { name: 'Excluir Preset' });
      await open.click();
      const dialog = page.getByRole('alertdialog', { name: 'Excluir o Preset Treino?' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeFocused();
      expect(await axeViolations(page), 'axe com a confirmação aberta').toEqual([]);
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(open).toBeFocused();
      await open.click();
      await dialog.getByRole('button', { name: 'Excluir', exact: true }).click();
      await expect(dialog).toBeHidden();
    });
  }
}
