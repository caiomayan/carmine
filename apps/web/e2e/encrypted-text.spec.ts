import type { Page } from '@playwright/test';
import { newSteamId, signInFromHeader } from './accounts';
import { axeViolations, expect, test } from './fixtures';
import { routePreviews, SIGNED_IN } from './header-previews';

/**
 * O texto que decifra (EncryptedText) nos três momentos: o título do 404, o nome no
 * "Boas-vindas" dos Primeiros passos e o "Semana encerrada" do painel de Ranking do header.
 * Em todos, o texto final está no DOM o tempo todo (para o leitor de tela) e o movimento
 * reduzido mostra direto.
 */

interface Sample {
  /** O texto que o leitor de tela lê (o `sr-only`). */
  label: string | null;
  /** O embaralhado fica escondido da árvore de acessibilidade. */
  maskHidden: string | null;
}

declare global {
  interface Window {
    __encrypted: Sample[];
  }
}

/** Anota, a cada mudança do DOM, o estado de todo efeito em andamento (`data-encrypted="run"`). */
async function recordEffects(page: Page) {
  await page.addInitScript(() => {
    window.__encrypted = [];
    new MutationObserver(() => {
      for (const el of document.querySelectorAll('[data-encrypted="run"]')) {
        const [label, mask] = el.children;
        window.__encrypted.push({
          label: label?.textContent ?? null,
          maskHidden: mask?.getAttribute('aria-hidden') ?? null,
        });
      }
    }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  });
}

const samples = (page: Page) => page.evaluate(() => window.__encrypted);

test.describe('404', () => {
  test('o título decifra, e o leitor de tela lê o texto final o tempo todo', async ({
    page,
    expectedConsoleErrors,
  }) => {
    expectedConsoleErrors.push(/404 \(Not Found\)/);
    await recordEffects(page);
    const response = await page.goto('/nao-existe');
    expect(response?.status()).toBe(404);

    const title = page.getByRole('heading', { level: 1, name: 'Página não encontrada' });
    await expect(title).toBeVisible();
    await expect(title.locator('[data-encrypted="rest"]')).toHaveText('Página não encontrada');

    const seen = await samples(page);
    expect(seen.length).toBeGreaterThan(0);
    for (const sample of seen) {
      expect(sample.label).toBe('Página não encontrada');
      expect(sample.maskHidden).toBe('true');
    }
    expect(await axeViolations(page)).toEqual([]);
  });

  test('o 404 de Perfil também decifra o título', async ({ page, expectedConsoleErrors }) => {
    expectedConsoleErrors.push(/404 \(Not Found\)/);
    await recordEffects(page);
    const response = await page.goto('/999999999999');
    expect(response?.status()).toBe(404);

    const title = page.getByRole('heading', { level: 1, name: 'Nenhum Perfil com esse ID' });
    await expect(title.locator('[data-encrypted="rest"]')).toHaveText('Nenhum Perfil com esse ID');
    expect((await samples(page)).length).toBeGreaterThan(0);
  });

  test('com movimento reduzido o título aparece direto, sem embaralhar', async ({
    page,
    expectedConsoleErrors,
  }) => {
    expectedConsoleErrors.push(/404 \(Not Found\)/);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await recordEffects(page);
    await page.goto('/nao-existe');

    const title = page.getByRole('heading', { level: 1, name: 'Página não encontrada' });
    await expect(title.locator('[data-encrypted="rest"]')).toBeVisible();
    expect(await samples(page)).toEqual([]);
  });

  test('o servidor já traz o título, e se a página não hidrata ele aparece sozinho', async ({
    page,
    request,
    expectedConsoleErrors,
  }) => {
    expectedConsoleErrors.push(/404 \(Not Found\)/);
    // O HTML do servidor tem o texto final, marcado como "pendente" (invisível até hidratar). O 404
    // do `next dev` é montado no cliente, então a conferência usa o título da semana do /ranking.
    const html = await (await request.get('/ranking')).text();
    expect(html).toMatch(/<span[^>]*encrypted-pending[^>]*>Esta semana, de /);

    // Sem hidratar, ninguém troca a fase: o fallback em CSS mostra o texto em ~1,5 s. Um
    // `.encrypted-pending` solto (que o React não toca) prova isso. O 404 chega em streaming e a
    // hidratação pode refazer o <body> e a folha de estilos logo depois do `goto`, levando o elemento
    // solto junto: a prova inteira (nasce escondido, aparece sozinho) se repete até uma rodada fechar.
    await page.goto('/nao-existe');
    await expect(async () => {
      const hidden = await page.evaluate(() => {
        document.getElementById('solto')?.remove();
        const el = document.createElement('span');
        el.className = 'encrypted-pending';
        el.textContent = 'solto';
        el.id = 'solto';
        document.body.append(el);
        return getComputedStyle(el).opacity;
      });
      expect(hidden).toBe('0');
      await page.waitForTimeout(1_800);
      expect(await page.locator('#solto').evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
    }).toPass({ timeout: 20_000 });
  });
});

test('Boas-vindas: o nome decifra uma vez e o título mantém o nome acessível', async ({ page }) => {
  await recordEffects(page);
  await page.goto('/');
  await signInFromHeader(page, newSteamId());
  const opener = page
    .getByTestId('first-steps-strip')
    .getByRole('button', { name: 'Ver como funciona' });
  const dialog = page.getByRole('dialog', { name: /Boas-vindas à Carmine, \S+/ });
  // Um clique antes de a faixa hidratar não faz nada: repete até o Dialog abrir.
  await expect(async () => {
    await opener.click();
    await expect(dialog).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
  const name = dialog.locator('[data-encrypted]');
  await expect(name).toHaveAttribute('data-encrypted', 'rest');
  const final = (await name.textContent()) ?? '';
  expect(final).not.toBe('');
  await expect(dialog).toHaveAccessibleName(`Boas-vindas à Carmine, ${final}`);

  const seen = await samples(page);
  expect(seen.length).toBeGreaterThan(0);
  for (const sample of seen) {
    expect(sample.label).toBe(final);
    expect(sample.maskHidden).toBe('true');
  }

  // Fecha e reabre: o nome já decifrou nesta página, então vem parado.
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  const before = (await samples(page)).length;
  await opener.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-encrypted]')).toHaveAttribute('data-encrypted', 'rest');
  expect((await samples(page)).length).toBe(before);
});

test.describe('virada da semana, no painel de Ranking do header', () => {
  const panelCountdown = (page: Page) => page.getByTestId('preview-countdown');

  async function hydrated(page: Page) {
    await page.waitForFunction(() => {
      const el = document.querySelector('header nav a');
      return !!el && Object.keys(el).some((key) => key.startsWith('__reactProps'));
    });
  }

  async function openRanking(page: Page) {
    await page.goto('/regras');
    await hydrated(page);
    await page
      .getByRole('navigation', { name: 'Principal' })
      .getByRole('link', { name: 'Ranking', exact: true })
      .hover();
    await expect(page.getByTestId('panel-ranking')).toBeVisible();
  }

  const closingIn = (ms: number) => ({
    ...SIGNED_IN,
    ranking: SIGNED_IN.ranking && {
      ...SIGNED_IN.ranking,
      closesAt: new Date(Date.now() + ms).toISOString(),
    },
  });

  test('a contagem zera com o painel aberto e "Semana encerrada" decifra', async ({ page }) => {
    await routePreviews(page, closingIn(90_000));
    await recordEffects(page);
    await page.clock.install();
    await page.clock.resume();
    await openRanking(page);
    await expect(panelCountdown(page)).toContainText('A semana fecha em');
    expect(await samples(page)).toEqual([]);

    await page.clock.fastForward(120_000);
    await expect(panelCountdown(page)).toHaveText('Semana encerrada');
    await expect(panelCountdown(page).locator('[data-encrypted="rest"]')).toBeVisible();

    const seen = await samples(page);
    expect(seen.length).toBeGreaterThan(0);
    for (const sample of seen) {
      expect(sample.label).toBe('Semana encerrada');
      expect(sample.maskHidden).toBe('true');
    }
  });

  test('abrir o painel com a semana já encerrada mostra o texto parado', async ({ page }) => {
    await routePreviews(page, closingIn(-60_000));
    await recordEffects(page);
    await openRanking(page);
    await expect(panelCountdown(page)).toHaveText('Semana encerrada');
    expect(await samples(page)).toEqual([]);
  });
});

test.describe('título da semana, no /ranking', () => {
  const WEEK_SEEN = 'carmine:ranking-semana-vista';

  /**
   * Grava uma semana antiga como a última vista, para a próxima visita ser a "depois da virada". Só depois
   * de o título hidratar (fase "parado"): a hidratação lê e regrava essa chave, e uma gravação que chega
   * antes dela seria vista por esta página, não pela recarga.
   */
  async function seedLastSeenWeek(page: Page) {
    await expect(title(page).locator('[data-encrypted="rest"]')).toBeVisible();
    await page.evaluate((key) => localStorage.setItem(key, '2020-01-06'), WEEK_SEEN);
  }
  const title = (page: Page) => page.getByTestId('week-title');
  const CURRENT = /^Esta semana, de .+ a .+$/;

  /** Espera o título parar (de `pending`/`run` para `rest`) e devolve o que o leitor de tela leu. */
  async function settled(page: Page) {
    await expect(title(page).locator('[data-encrypted="rest"]')).toBeVisible();
    return samples(page);
  }

  test('a primeira visita só guarda a semana: o título vem parado', async ({ page }) => {
    await recordEffects(page);
    await page.goto('/ranking');
    await expect(title(page)).toHaveText(CURRENT);
    expect(await settled(page)).toEqual([]);
    expect(await page.evaluate((key) => localStorage.getItem(key), WEEK_SEEN)).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );

    await page.reload();
    await expect(title(page)).toHaveText(CURRENT);
    expect(await settled(page)).toEqual([]);
  });

  test('trocar de semana no seletor decifra o novo título', async ({ page }) => {
    await recordEffects(page);
    await page.goto('/ranking?semana=2020-01-06');
    await expect(title(page)).toHaveText(/^Semana de .+ a .+$/);
    expect(await settled(page)).toEqual([]);

    const select = page.getByTestId('week-select');
    await select.click();
    await page.getByRole('option', { name: /\(atual\)/ }).click();
    await expect(page).toHaveURL(/\/ranking\?modo=retake$/);

    await expect(title(page)).toHaveText(CURRENT);
    const seen = await samples(page);
    expect(seen.length).toBeGreaterThan(0);
    for (const sample of seen) {
      expect(sample.label).toMatch(CURRENT);
      expect(sample.maskHidden).toBe('true');
    }
    // O título mantém o nome acessível durante todo o efeito.
    await expect(page.getByRole('heading', { level: 2, name: CURRENT })).toBeVisible();
  });

  test('na primeira visita depois da virada da semana o título decifra, uma vez só', async ({
    page,
  }) => {
    await recordEffects(page);
    await page.goto('/ranking');
    await expect(title(page)).toHaveText(CURRENT);
    await seedLastSeenWeek(page);

    await page.reload();
    await expect(title(page).locator('[data-encrypted="rest"]')).toBeVisible();
    const seen = await samples(page);
    expect(seen.length).toBeGreaterThan(0);
    for (const sample of seen) expect(sample.label).toMatch(CURRENT);

    await page.reload();
    await expect(title(page)).toHaveText(CURRENT);
    expect(await settled(page)).toEqual([]);
  });

  test('com movimento reduzido a virada não embaralha', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await recordEffects(page);
    await page.goto('/ranking');
    await seedLastSeenWeek(page);
    await page.reload();
    await expect(title(page)).toHaveText(CURRENT);
    expect(await settled(page)).toEqual([]);
  });

  test('sem armazenamento (bloqueado) a página funciona e o título vem parado', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new DOMException('bloqueado', 'SecurityError');
        },
      });
    });
    await recordEffects(page);
    await page.goto('/ranking');
    await expect(title(page)).toHaveText(CURRENT);
    expect(await settled(page)).toEqual([]);
  });
});
