import { randomUUID } from 'node:crypto';
import type { APIRequestContext, Page } from '@playwright/test';
import { newSteamId, reconnectPlayer } from './accounts';
import { axeViolations, expect, saveTheme, test } from './fixtures';

/**
 * A atividade ao vivo da Home (#71): a partir de 1280 px mora no trilho (o painel "Ao vivo agora"); abaixo disso não
 * há trilho e ela vira o Marquee, uma faixa de uma linha logo abaixo do hero, que corre quando não cabe, pausa no
 * mouse, no foco e no botão, vira lista parada com movimento reduzido, é lida uma vez pelo leitor de tela e, sem
 * acontecimentos, não existe. Os acontecimentos vêm da API de verdade (jogadores que entram no Servidor Carmine do E2E).
 */

const strip = (page: Page) => page.getByTestId('activity-strip');
const feed = (page: Page) => page.getByTestId('activity-feed');
const track = (page: Page) => strip(page).locator('[data-slot="marquee-track"]');
const links = (page: Page) => strip(page).getByRole('link');

/** O jogo conecta o jogador e avisa que ele entrou no servidor: nasce um "entrou em" na atividade. */
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

/** Os acontecimentos que o navegador recebe na próxima volta do `/activity/recent`. */
async function routeActivity(page: Page, body: unknown, status = 200) {
  await page.route('**/activity/recent', (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

/**
 * Uma volta da leitura agora (o navegador faz sozinho a cada 15 s; voltar à aba também pede) e a espera da resposta.
 * Repete o pedido até a página responder: um aviso antes da hidratação ainda não tem quem o escute.
 */
async function poll(page: Page) {
  const answered = page.waitForResponse((r) => r.url().includes('/activity/recent'));
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

/** Sem trilho (abaixo de 1280 px): é onde a faixa existe. */
const NARROW = { width: 1100, height: 900 };

const item = (id: string, rest: object) => ({
  id,
  at: new Date().toISOString(),
  player: { name: 'Ana', avatarUrl: null },
  ...rest,
});

test.describe('a atividade da home', () => {
  test.beforeAll(async ({ playwright, baseURL }) => {
    const request = await playwright.request.newContext({ baseURL });
    await seedActivity(request);
    await request.dispose();
  });

  test('a partir de 1280 px mora no trilho, com avatar, frase e o "há X", e leva ao servidor', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await expect(feed(page)).toBeVisible();
    await expect(
      feed(page).getByRole('heading', { name: /Ao vivo agora|Atividade recente/ }),
    ).toBeVisible();
    const first = feed(page).getByRole('link').first();
    await expect(first).toContainText(/entrou em e2e-/);
    await expect(first).toHaveAttribute('href', /^\/#servidor-/);
    await expect(first.locator('time')).toHaveText(/há|agora|segundo/);
    // Onde há trilho, a faixa não aparece.
    await expect(strip(page)).toBeHidden();
  });

  test('abaixo de 1280 px não há trilho: a faixa fica logo abaixo do hero e acima dos servidores', async ({
    page,
  }) => {
    await page.setViewportSize(NARROW);
    await page.goto('/');
    await expect(strip(page)).toBeVisible();
    await expect(feed(page)).toBeHidden();
    const [head, band, servers] = await Promise.all([
      page.getByRole('heading', { level: 1 }).boundingBox(),
      strip(page).boundingBox(),
      page.locator('#home-servers').boundingBox(),
    ]);
    expect(band && head && servers).toBeTruthy();
    expect(band?.y).toBeGreaterThan((head?.y ?? 0) + (head?.height ?? 0));
    expect((band?.y ?? 0) + (band?.height ?? 0)).toBeLessThanOrEqual(servers?.y ?? 0);

    const first = links(page).first();
    await expect(first).toContainText(/entrou em e2e-/);
    await expect(first).toHaveAttribute('href', /^\/#servidor-/);
  });

  test('o leitor de tela lê cada acontecimento uma vez: a cópia do trilho fica de fora', async ({
    page,
  }) => {
    await page.setViewportSize(NARROW);
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

  test('fora da tela a faixa pausa e, ao voltar à vista, corre de novo', async ({ page }) => {
    await page.setViewportSize(NARROW);
    await page.goto('/');
    await expect(strip(page)).toHaveAttribute('data-moving', 'true');
    await strip(page).scrollIntoViewIfNeeded();
    await expect.poll(() => playState(page)).toBe('running');

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => playState(page)).toBe('paused');

    await strip(page).scrollIntoViewIfNeeded();
    await expect.poll(() => playState(page)).toBe('running');
  });

  test('corre quando não cabe e pausa no mouse, no foco e no botão', async ({ page }) => {
    await page.setViewportSize(NARROW);
    await page.goto('/');
    await expect(strip(page)).toHaveAttribute('data-moving', 'true');
    expect(await animationName(page)).toBe('marquee');
    // A faixa só corre à vista: fora da tela ela pausa (o teste seguinte), então traz para a tela antes de olhar.
    await strip(page).scrollIntoViewIfNeeded();
    await expect.poll(() => playState(page)).toBe('running');

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
    const [band, last] = await Promise.all([
      track(page).locator('xpath=..').boundingBox(),
      links(page).last().boundingBox(),
    ]);
    expect(last?.x).toBeGreaterThanOrEqual((band?.x ?? 0) - 1);
    expect((last?.x ?? 0) + (last?.width ?? 0)).toBeLessThanOrEqual(
      (band?.x ?? 0) + (band?.width ?? 0) + 1,
    );
    await page.getByTestId('activity-pause').focus();
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
      await page.setViewportSize(NARROW);
      await page.goto('/');
      await expect(strip(page)).toBeVisible();
      await routeActivity(page, {
        items: [
          item('1', { kind: 'joined', server: 'Retake SP·1', href: '/#servidor-abc' }),
          item('2', { kind: 'multi_kill', server: 'DM SP·1', kills: 5, href: '/#servidor-def' }),
          {
            id: '3',
            at: new Date().toISOString(),
            kind: 'new_leader',
            player: { name: 'Jogador privado', avatarUrl: null },
            mode: 'deathmatch',
            href: '/ranking?modo=deathmatch',
          },
          item('4', { kind: 'skin_equipped', skin: 'AK-47 | Linhas Vermelhas', href: '/10042' }),
        ],
      });
      await poll(page);
      await expect(links(page).first()).toHaveAccessibleName('Ana entrou em Retake SP·1');
      const names = [
        'Ana entrou em Retake SP·1',
        'Ana fez 5 kills seguidas em DM SP·1',
        'Jogador privado assumiu o 1º lugar no Deathmatch',
        'Ana equipou AK-47 | Linhas Vermelhas',
      ];
      for (const [i, name] of names.entries()) {
        await expect(links(page).nth(i)).toHaveAccessibleName(name);
      }
      expect(
        await links(page).evaluateAll((all) => all.map((a) => a.getAttribute('href'))),
      ).toEqual(['/#servidor-abc', '/#servidor-def', '/ranking?modo=deathmatch', '/10042']);
    });

    test('o que cabe na largura fica parado: sem trilho, sem cópia e sem botão de pausa', async ({
      page,
    }) => {
      await page.setViewportSize(NARROW);
      await page.goto('/');
      await expect(strip(page)).toHaveAttribute('data-moving', 'true');
      await routeActivity(page, {
        items: [item('unico', { kind: 'joined', server: 'Retake SP·1', href: '/#servidor-abc' })],
      });
      await poll(page);
      await expect(strip(page)).toHaveAttribute('data-moving', 'false');
      await expect(links(page)).toHaveCount(1);
      await expect(page.getByTestId('activity-pause')).toHaveCount(0);
      await expect(strip(page).locator('ul[aria-hidden="true"]')).toHaveCount(0);
      expect(await animationName(page)).toBe('none');
    });

    test('o trilho recebe o acontecimento novo no topo; a API fora não derruba nada; sem acontecimentos, a faixa some', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/');
      await expect(feed(page)).toBeVisible();
      await routeActivity(page, {
        items: [item('novo', { kind: 'joined', server: 'Retake Novo', href: '/#servidor-novo' })],
      });
      await poll(page);
      await expect(feed(page).getByRole('link').first()).toContainText('Ana entrou em Retake Novo');

      await page.unroute('**/activity/recent');
      await routeActivity(page, { error: 'unavailable' }, 503);
      await poll(page);
      await page.waitForTimeout(400);
      await expect(feed(page).getByRole('link').first()).toContainText('Retake Novo');

      await page.unroute('**/activity/recent');
      await routeActivity(page, { items: [] });
      await poll(page);
      await expect(feed(page).getByTestId('activity-empty')).toBeVisible();
      // O resto da home segue de pé.
      await expect(page.getByTestId('home-hero')).toBeVisible();
    });

    test('abaixo de 1280 px, sem acontecimentos a faixa some', async ({ page }) => {
      await page.setViewportSize(NARROW);
      await page.goto('/');
      await expect(strip(page)).toBeVisible();
      await routeActivity(page, { items: [] });
      await poll(page);
      await expect(strip(page)).toHaveCount(0);
      await expect(page.getByTestId('home-hero')).toBeVisible();
    });
  });

  for (const theme of ['dark', 'light'] as const) {
    for (const width of [390, 1100, 1440]) {
      test(`axe: a atividade correndo e parada (${theme}, ${width} px)`, async ({ page }) => {
        await saveTheme(page, theme);
        await page.setViewportSize({ width, height: 900 });
        await page.goto('/');
        if (width < 1280) {
          await expect(strip(page)).toHaveAttribute('data-moving', 'true');
        } else {
          await expect(feed(page)).toBeVisible();
        }
        expect(await axeViolations(page)).toEqual([]);
        if (width < 1280) {
          await page.getByTestId('activity-pause').click();
          expect(await axeViolations(page)).toEqual([]);
        }
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
