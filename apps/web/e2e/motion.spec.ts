import type { Page } from '@playwright/test';
import { expect, settle, test } from './fixtures';

/**
 * Abre o diálogo da vitrine e anota, a cada quadro, o `transform` e a opacidade do painel (o
 * Motion escreve `translateY`/`scale` no `transform`) durante 450 ms. O primeiro quadro pode
 * mostrar o estado inicial com opacidade 0 (invisível): só contam os quadros visíveis.
 */
type Sample = { transform: string; opacity: number };

async function transformsWhileOpening(page: Page): Promise<Sample[]> {
  return page.evaluate(
    () =>
      new Promise<Sample[]>((resolve) => {
        const samples: { transform: string; opacity: number }[] = [];
        const button = [...document.querySelectorAll('button')].find(
          (b) => b.textContent?.trim() === 'Abrir diálogo',
        );
        button?.click();
        const start = performance.now();
        const tick = () => {
          const panel = document.querySelector('[data-slot="dialog-content"]');
          if (panel) {
            const style = getComputedStyle(panel);
            samples.push({ transform: style.transform, opacity: Number(style.opacity) });
          }
          if (performance.now() - start < 450) requestAnimationFrame(tick);
          else resolve(samples);
        };
        requestAnimationFrame(tick);
      }),
  );
}

const visible = (samples: Sample[]) => samples.filter((sample) => sample.opacity > 0.01);
const IDENTITY = new Set(['none', 'matrix(1, 0, 0, 1, 0, 0)']);

test.describe('Dialog', () => {
  test('entra com opacidade, deslocamento e escala suaves, sem girar', async ({ page }) => {
    await page.goto('/dev/componentes');
    await settle(page);

    const samples = await transformsWhileOpening(page);

    expect(samples.length).toBeGreaterThan(3);
    // Nunca rotação nem perspectiva (matrix3d): o painel não gira mais.
    expect(samples.filter(({ transform }) => transform.startsWith('matrix3d'))).toEqual([]);
    // Houve deslocamento no caminho (y de 8 px para 0) e termina assentado.
    expect(samples.some(({ transform }) => !IDENTITY.has(transform))).toBe(true);
    expect(IDENTITY.has((samples.at(-1) as Sample).transform)).toBe(true);
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
    expect(visible(samples).length).toBeGreaterThan(1);
    expect(visible(samples).filter(({ transform }) => !IDENTITY.has(transform))).toEqual([]);
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
