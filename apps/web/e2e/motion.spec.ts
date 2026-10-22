import type { Page } from '@playwright/test';
import { expect, settle, test } from './fixtures';

/**
 * Abre o diálogo da vitrine e anota, a cada quadro, o `transform` do painel (o Motion escreve
 * `translateY`/`scale` ali) até ele assentar ou a janela acabar.
 */
async function transformsWhileOpening(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const samples: string[] = [];
        const button = [...document.querySelectorAll('button')].find(
          (b) => b.textContent?.trim() === 'Abrir diálogo',
        );
        button?.click();
        const start = performance.now();
        const tick = () => {
          const panel = document.querySelector('[data-slot="dialog-content"]');
          if (panel) samples.push(getComputedStyle(panel).transform);
          if (performance.now() - start < 450) requestAnimationFrame(tick);
          else resolve(samples);
        };
        requestAnimationFrame(tick);
      }),
  );
}

const IDENTITY = new Set(['none', 'matrix(1, 0, 0, 1, 0, 0)']);

test.describe('Dialog', () => {
  test('entra com opacidade, deslocamento e escala suaves, sem girar', async ({ page }) => {
    await page.goto('/dev/componentes');
    await settle(page);

    const samples = await transformsWhileOpening(page);

    expect(samples.length).toBeGreaterThan(3);
    // Nunca rotação nem perspectiva (matrix3d): o painel não gira mais.
    expect(samples.filter((value) => value.startsWith('matrix3d'))).toEqual([]);
    // Houve deslocamento no caminho (y de 8 px para 0) e termina assentado.
    expect(samples.some((value) => !IDENTITY.has(value))).toBe(true);
    expect(IDENTITY.has(samples.at(-1) as string)).toBe(true);
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('com movimento reduzido, só a opacidade anima: nenhum quadro desloca ou escala', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/dev/componentes');
    await settle(page);

    const samples = await transformsWhileOpening(page);

    expect(samples.length).toBeGreaterThan(3);
    expect(samples.filter((value) => !IDENTITY.has(value))).toEqual([]);
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('fecha com Esc e devolve o foco ao gatilho', async ({ page }) => {
    await page.goto('/dev/componentes');
    await settle(page);
    const trigger = page.getByRole('button', { name: 'Abrir diálogo' });

    await trigger.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});
