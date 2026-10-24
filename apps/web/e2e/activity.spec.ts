import { randomUUID } from 'node:crypto';
import type { APIRequestContext, Page } from '@playwright/test';
import { newSteamId, reconnectPlayer } from './accounts';
import { axeViolations, expect, saveTheme, test } from './fixtures';

/**
 * A faixa de atividade ao vivo da home (Marquee): logo acima da lista de servidores, corre quando
 * não cabe, pausa no mouse, no foco e no botão, vira lista parada com movimento reduzido, o
 * leitor de tela lê cada item uma vez e, sem acontecimentos, ela não existe. Os acontecimentos
 * vêm da API de verdade (jogadores que entram no Servidor Carmine do E2E).
 */

const strip = (page: Page) => page.getByTestId('activity-marquee');
const track = (page: Page) => strip(page).locator('[data-slot="marquee-track"]');
const links = (page: Page) => strip(page).getByRole('link');

/** O jogo conecta o jogador e avisa que ele entrou no servidor: nasce um "entrou em" na faixa. */
async function playerJoins(request: APIRequestContext, name: string) {
  const steamId = newSteamId();
  const { publicId } = await reconnectPlayer(request, steamId, name);
  const response = await request.post('/api/server/events', {
    headers: { authorization: `Bearer ${process.env.E2E_SERVER_KEY}` },
    data: {
      kills: [],
      damages: [],
      roundEnds: [],
      sessionStarts: [
        { id: randomUUID(), at: new Date().toISOString(), sessionId: randomUUID(), steamId },
      ],
      sessionEnds: [],
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return publicId;
}

/** Entradas suficientes para a faixa passar da largura da página em qualquer tamanho. */
async function seedActivity(request: APIRequestContext, count = 8) {
  const names = Array.from({ length: count }, (_, i) => `Faixa ${randomUUID().slice(0, 4)} ${i}`);
  for (const name of names) await playerJoins(request, name);
  return names;
}

/** Os acontecimentos que o navegador recebe na próxima volta do `/atividade/recentes`. */
async function routeActivity(page: Page, body: unknown, status = 200) {
  await page.route('**/atividade/recentes', (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

/**
 * Uma volta da leitura agora (o navegador faz sozinho a cada 15 s; voltar à aba também pede) e a
 * espera da resposta. Repete o pedido até a página responder: um aviso antes da hidratação ainda
 * não tem quem o escute.
 */
async function poll(page: Page) {
  const answered = page.waitForResponse((r) => r.url().includes('/atividade/recentes'));
  const timer = setInterval(() => {
    page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))).catch(() => {});
  }, 300);
  try {
    await answered;
  } finally {
    clearInterval(timer);
  }
}

const animationName = (page: Page) =>
  track(page).evaluate((el) => getComputedStyle(el).animationName);
const playState = (page: Page) =>
  track(page).evaluate((el) => getComputedStyle(el).animationPlayState);

test.describe('a faixa de atividade da home', () => {
  test.beforeAll(async ({ playwright, baseURL }) => {
    const request = await playwright.request.newContext({ baseURL });
    await seedActivity(request);
    await request.dispose();
  });

  test('fica logo acima da lista de servidores, abaixo do título, e leva ao servidor', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(strip(page)).toBeVisible();
    const [head, band, tabs] = await Promise.all([
      page.getByRole('heading', { level: 1 }).boundingBox(),
      strip(page).boundingBox(),
      page.getByRole('tablist').boundingBox(),
    ]);
    expect(band && head && tabs).toBeTruthy();
    expect(band?.y).toBeGreaterThan((head?.y ?? 0) + (head?.height ?? 0));
    expect((band?.y ?? 0) + (band?.height ?? 0)).toBeLessThanOrEqual(tabs?.y ?? 0);

    const first = links(page).first();
    await expect(first).toContainText(/entrou em e2e-/);
    await expect(first).toHaveAttribute('href', /^\/#servidor-/);
  });

  test('o leitor de tela lê cada acontecimento uma vez: a cópia do trilho fica de fora', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(strip(page)).toHaveAttribute('data-moving', 'true');
    const real = strip(page).getByRole('list', { name: 'Acontecimentos recentes' });
    await expect(real).toHaveCount(1);
    const readable = await real.getByRole('listitem').count();
    expect(readable).toBeGreaterThanOrEqual(6);
    // A cópia existe (é ela que emenda o trilho), mas nem a árvore de acessibilidade nem o Tab a veem.
    const clones = strip(page).locator('ul[aria-hidden="true"][inert]');
    await expect(clones).toHaveCount(1);
    expect(await clones.locator('a').count()).toBe(readable);
    expect(await links(page).count()).toBe(readable);
  });

  test('corre quando não cabe e pausa no mouse, no foco e no botão', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(strip(page)).toHaveAttribute('data-moving', 'true');
    expect(await animationName(page)).toBe('marquee');
    expect(await playState(page)).toBe('running');

    // Mouse: pausa em cima, volta ao sair.
    await strip(page).hover();
    await expect.poll(() => playState(page)).toBe('paused');
    await page.mouse.move(5, 5);
    await expect.poll(() => playState(page)).toBe('running');

    // Botão: a pausa de quem usa (WCAG 2.2.2), com o nome trocando.
    const pause = page.getByTestId('activity-pause');
    await expect(pause).toHaveAccessibleName('Pausar a faixa de atividade');
    await pause.click();
    await page.mouse.move(5, 5);
    await expect(pause).toHaveAccessibleName('Retomar a faixa de atividade');
    expect(await playState(page)).toBe('paused');
    await pause.click();
    await page.mouse.move(5, 5);
    await expect(pause).toHaveAccessibleName('Pausar a faixa de atividade');
    await expect.poll(() => playState(page)).toBe('running');

    // Foco: o trilho para e volta ao começo; o item focado fica inteiro à vista, mesmo o último.
    await links(page).last().focus();
    expect(await animationName(page)).toBe('none');
    const [band, item] = await Promise.all([
      strip(page).locator('[data-slot="marquee-track"]').locator('xpath=..').boundingBox(),
      links(page).last().boundingBox(),
    ]);
    expect(item?.x).toBeGreaterThanOrEqual((band?.x ?? 0) - 1);
    expect((item?.x ?? 0) + (item?.width ?? 0)).toBeLessThanOrEqual(
      (band?.x ?? 0) + (band?.width ?? 0) + 1,
    );
    await page.getByRole('tablist').getByRole('tab').first().focus();
    await expect.poll(() => animationName(page)).toBe('marquee');
  });

  test('com movimento reduzido é uma lista parada, que quebra linha, sem botão de pausa', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(strip(page)).toBeVisible();
    await expect(strip(page)).toHaveAttribute('data-moving', 'false');
    await expect(page.getByTestId('activity-pause')).toHaveCount(0);
    await expect(track(page)).toHaveCount(0);
    await expect(strip(page).locator('ul[aria-hidden="true"]')).toHaveCount(0);
    expect(await links(page).count()).toBeLessThanOrEqual(4);
    // Quebra em linhas: o texto de cada item cabe inteiro dentro da faixa (nada cortado na borda),
    // e a página não rola de lado.
    const fit = await strip(page).evaluate((band) => {
      const box = band.getBoundingClientRect();
      return {
        page: document.documentElement.scrollWidth - window.innerWidth,
        outside: [...band.querySelectorAll('a')].filter((a) => {
          const r = a.getBoundingClientRect();
          return (
            r.left < box.left - 1 || r.right > box.right + 1 || a.scrollWidth > a.clientWidth + 1
          );
        }).length,
      };
    });
    expect(fit.page).toBeLessThanOrEqual(0);
    expect(fit.outside, 'itens cortados na borda da faixa').toBe(0);
    const animated = await strip(page).evaluate(
      (el) =>
        el
          .getAnimations({ subtree: true })
          .filter((a) => a.effect?.getTiming().iterations === Infinity).length,
    );
    expect(animated).toBe(0);
  });

  test('390 px: sem rolagem de lado, nada cortado e o alvo de toque tem 44 px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(strip(page)).toHaveAttribute('data-moving', 'true');
    const metrics = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    }));
    expect(metrics.overflow).toBeLessThanOrEqual(0);
    const box = await strip(page).boundingBox();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
    const pause = await page.getByTestId('activity-pause').boundingBox();
    expect(pause?.width).toBeGreaterThanOrEqual(44);
    expect(pause?.height).toBeGreaterThanOrEqual(44);
    expect((await links(page).first().boundingBox())?.height).toBeGreaterThanOrEqual(44);
  });

  test.describe('o que chega depois da página', () => {
    test.use({ expectedConsoleErrors: [/503/] });

    test('mostra os quatro tipos, cada um levando ao seu contexto', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/');
      await expect(strip(page)).toBeVisible();
      const item = (id: string, rest: object) => ({
        id,
        player: { name: 'Ana' },
        ...rest,
      });
      await routeActivity(page, {
        items: [
          item('1', { kind: 'joined', server: 'Retake SP·1', href: '/#servidor-abc' }),
          item('2', { kind: 'multi_kill', server: 'DM SP·1', kills: 5, href: '/#servidor-def' }),
          {
            id: '3',
            kind: 'new_leader',
            player: { name: 'Jogador privado' },
            mode: 'deathmatch',
            href: '/ranking?modo=deathmatch',
          },
          item('4', { kind: 'skin_equipped', skin: 'AK-47 | Linhas Vermelhas', href: '/10042' }),
        ],
      });
      await poll(page);
      await expect(links(page).first()).toHaveText('Ana entrou em Retake SP·1');
      const text = await links(page).allInnerTexts();
      expect(text).toEqual([
        'Ana entrou em Retake SP·1',
        'Ana fez 5 kills seguidas em DM SP·1',
        'Jogador privado assumiu o 1º lugar no Deathmatch',
        'Ana equipou AK-47 | Linhas Vermelhas',
      ]);
      expect(
        await links(page).evaluateAll((all) => all.map((a) => a.getAttribute('href'))),
      ).toEqual(['/#servidor-abc', '/#servidor-def', '/ranking?modo=deathmatch', '/10042']);
    });

    test('o que cabe na largura fica parado: sem trilho, sem cópia e sem botão de pausa', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/');
      await expect(strip(page)).toHaveAttribute('data-moving', 'true');
      await routeActivity(page, {
        items: [
          {
            id: 'unico',
            kind: 'joined',
            player: { name: 'Ana' },
            server: 'Retake SP·1',
            href: '/#servidor-abc',
          },
        ],
      });
      await poll(page);
      await expect(strip(page)).toHaveAttribute('data-moving', 'false');
      await expect(links(page)).toHaveCount(1);
      await expect(page.getByTestId('activity-pause')).toHaveCount(0);
      await expect(strip(page).locator('ul[aria-hidden="true"]')).toHaveCount(0);
      expect(await animationName(page)).toBe('none');
    });

    test('a API fora não derruba a faixa: fica como estava; sem acontecimentos, ela some', async ({
      page,
    }) => {
      await page.goto('/');
      await expect(strip(page)).toBeVisible();
      const before = await links(page).count();
      await routeActivity(page, { error: 'unavailable' }, 503);
      await poll(page);
      await page.waitForTimeout(400);
      await expect(strip(page)).toBeVisible();
      expect(await links(page).count()).toBe(before);

      await page.unroute('**/atividade/recentes');
      await routeActivity(page, { items: [] });
      await poll(page);
      await expect(strip(page)).toHaveCount(0);
      // O resto da home segue de pé.
      await expect(page.getByRole('tablist')).toBeVisible();
    });
  });

  for (const theme of ['dark', 'light'] as const) {
    for (const width of [390, 1440]) {
      test(`axe: a faixa correndo e parada (${theme}, ${width} px)`, async ({ page }) => {
        await saveTheme(page, theme);
        await page.setViewportSize({ width, height: 900 });
        await page.goto('/');
        await expect(strip(page)).toHaveAttribute('data-moving', 'true');
        expect(await axeViolations(page)).toEqual([]);
        await page.getByTestId('activity-pause').click();
        expect(await axeViolations(page)).toEqual([]);
      });
    }

    test(`axe: a lista parada do movimento reduzido (${theme}, 390 px)`, async ({ page }) => {
      await saveTheme(page, theme);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize({ width: 390, height: 900 });
      await page.goto('/');
      await expect(strip(page)).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);
    });
  }
});
