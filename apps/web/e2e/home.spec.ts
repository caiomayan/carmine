import { randomUUID } from 'node:crypto';
import type { APIRequestContext, Page } from '@playwright/test';
import { chooseSteamAccount, newSteamId, reconnectPlayer } from './accounts';
import { axeViolations, expect, saveTheme, scrollToEnd, test } from './fixtures';
import { fakeServer, routeLiveServers } from './live-servers';

/**
 * A Home (V2 do redesenho "Vida"): o painel ao vivo. Os estados (deslogado, logado com amigos, logado sem nada,
 * servidores dormindo), o hero com o número de jogadores, o Top 3 e a faixa "Esta semana" com dados de verdade da
 * API, a vitrine dos Loadouts e o que muda de tamanho para tamanho. Os servidores e os amigos vêm de respostas
 * fixas (estado exato, sem depender dos servidores que os outros testes ligam); o Ranking e a semana, de eventos
 * enviados à API como o plugin faz.
 */

const hero = (page: Page) => page.getByTestId('home-hero');

/** Entra pela Steam falsa e volta para a home. */
async function signIn(page: Page) {
  await chooseSteamAccount(page.context(), newSteamId());
  await page.goto('/entrar');
  await page.getByTestId('steam-login').click();
  await page.waitForURL('/');
}

const noFriends = (page: Page) =>
  page.route('**/api/me/friends-playing', (route) =>
    route.fulfill({ json: { status: 'ok', friends: [] } }),
  );

/** 120 rounds vencidos de um jogador que acaba de entrar: ele passa do mínimo do Ranking de Retake (50). */
async function playRounds(request: APIRequestContext, name: string, rounds = 120) {
  const steamId = newSteamId();
  await reconnectPlayer(request, steamId, name);
  const at = new Date().toISOString();
  const response = await request.post('/api/server/events', {
    headers: { authorization: `Bearer ${process.env.E2E_SERVER_KEY}` },
    data: {
      kills: Array.from({ length: 40 }, () => ({
        id: randomUUID(),
        at,
        warmup: false,
        killerSteamId: steamId,
        killerIsBot: false,
        victimSteamId: null,
        victimIsBot: true,
        assisterSteamId: null,
        assisterIsBot: false,
        headshot: false,
        weapon: 'ak47',
        teamKill: false,
      })),
      damages: [],
      roundEnds: Array.from({ length: rounds }, () => ({
        id: randomUUID(),
        at,
        warmup: false,
        winner: 'ct',
        players: [{ steamId, team: 'ct' }],
      })),
      sessionStarts: [],
      sessionEnds: [],
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return steamId;
}

const LOADOUTS = {
  entries: [
    {
      key: 'a',
      itemId: 1,
      title: 'AK-47',
      subtitle: 'Linhas Vermelhas',
      image: '/icon.svg',
      rarity: 'classified',
      statTrak: true,
      foil: false,
      wear: 0.0121,
      sides: ['t'],
      palette: ['#c750b4', '#4192c7', '#d2a160'],
      player: { name: 'Ana', avatarUrl: null, href: '/10042' },
    },
    {
      key: 'b',
      itemId: 2,
      title: 'Karambit',
      subtitle: 'Degradê',
      image: '/icon.svg',
      rarity: 'covert',
      statTrak: false,
      foil: true,
      wear: 0.0862,
      sides: ['ct', 't'],
      palette: null,
      player: { name: 'Beto', avatarUrl: null, href: '/10043' },
    },
  ],
};

/** Uma skin só: sem rotação (cada fim da barra de progresso liga a próxima, e o `settle` do axe nunca assenta). */
const LOADOUT_ONE = { entries: LOADOUTS.entries.slice(0, 1) };

const live = () => [
  fakeServer({ name: 'fixo-a', map: 'de_mirage', players: 6 }),
  fakeServer({ name: 'fixo-b', map: 'de_dust2', mode: 'deathmatch', players: 5, maxPlayers: 16 }),
  fakeServer({
    name: 'fixo-off',
    state: 'offline',
    players: 0,
    map: null,
    lastHeartbeatAt: new Date(Date.now() - 25 * 60_000).toISOString(),
  }),
];

test.describe('os estados do hero', () => {
  test('deslogado: o número de jogadores no ar, o convite para entrar e o caminho até os servidores', async ({
    page,
  }) => {
    await routeLiveServers(page, live());
    await page.goto('/');
    await expect(page.getByTestId('home')).toHaveAttribute('data-state', 'deslogado');
    await expect(page.getByTestId('home-total').locator('.sr-only')).toHaveText('11');
    await expect(hero(page).getByText('no ar agora')).toBeVisible();
    await expect(page.getByTestId('home-lead')).toContainText('Entre com a Steam');
    const cta = page.getByTestId('home-cta');
    await expect(cta).toHaveText('Entrar com a Steam');
    await expect(cta).toHaveAttribute('href', /^\/entrar/);
    await expect(hero(page).getByRole('link', { name: 'Ver os servidores' })).toHaveAttribute(
      'href',
      '#jogar',
    );
    // O servidor mais cheio do Retake é o destaque.
    await expect(hero(page)).toContainText('Mais cheio agora: fixo-a');
  });

  test('o número do hero acompanha o ao vivo e rola quando muda', async ({ page }) => {
    const servers = live();
    await routeLiveServers(page, servers);
    await page.goto('/');
    await expect(page.getByTestId('home-total').locator('.sr-only')).toHaveText('11');
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const [first, second, off] = servers;
    await routeLiveServers(
      page,
      [{ ...first, players: 9, state: 'full' }, second, off].filter(Boolean) as typeof servers,
    );
    // O EventSource reconecta sozinho (retry 500 ms) e traz a lista nova.
    await expect(page.getByTestId('home-total').locator('.sr-only')).toHaveText('14', {
      timeout: 20_000,
    });
  });

  test('logado sem amigos jogando e sem Loadout: convida a montar o Loadout', async ({ page }) => {
    await routeLiveServers(page, live());
    await noFriends(page);
    await signIn(page);
    await expect(page.getByTestId('home')).toHaveAttribute('data-state', 'sem-nada');
    await expect(page.getByTestId('home-lead')).toContainText('Monte o seu Loadout');
    await expect(page.getByTestId('home-cta')).toHaveAttribute(
      'href',
      'steam://connect/203.0.113.200:27015',
    );
    await expect(hero(page).getByRole('link', { name: 'Montar o meu Loadout' })).toHaveAttribute(
      'href',
      '/loadout',
    );
  });

  test('logado com amigo jogando: o hero diz quem está jogando e o amigo está no trilho', async ({
    page,
  }) => {
    const servers = live();
    await routeLiveServers(page, servers);
    await page.route('**/api/me/friends-playing', (route) =>
      route.fulfill({
        json: {
          status: 'ok',
          friends: [
            {
              steamId: '76561198000000101',
              publicId: 9101,
              displayName: 'Lia Souza',
              avatarUrl: null,
              serverId: servers[0]?.id,
            },
          ],
        },
      }),
    );
    await signIn(page);
    await expect(page.getByTestId('home')).toHaveAttribute('data-state', 'amigos');
    await expect(page.getByTestId('home-lead')).toContainText('Lia Souza está jogando agora');
    const friend = page.getByTestId('friends-playing').locator('[data-friend="76561198000000101"]');
    await expect(friend).toContainText('fixo-a');
    // O pontinho "jogando agora" fica no canto do avatar.
    await expect(friend.locator('span.rounded-full').first()).toBeVisible();
  });

  test('servidores dormindo: o hero diz o último sinal e chama a galera no Discord', async ({
    page,
  }) => {
    await routeLiveServers(page, [
      fakeServer({
        name: 'fixo-dorme',
        state: 'offline',
        players: 0,
        map: null,
        lastHeartbeatAt: new Date(Date.now() - 25 * 60_000).toISOString(),
      }),
    ]);
    await noFriends(page);
    await signIn(page);
    await expect(page.getByTestId('home')).toHaveAttribute('data-state', 'offline');
    await expect(hero(page).getByRole('heading', { level: 1 })).toHaveText(
      'Os servidores estão dormindo',
    );
    await expect(page.getByTestId('home-lead')).toContainText(
      'O último sinal de um servidor foi há 25 minutos',
    );
    const cta = page.getByTestId('home-cta');
    await expect(cta).toHaveText('Chamar a galera no Discord');
    await expect(cta).toHaveAttribute('href', /discord\.gg/);
    // Sem arte (o servidor sem batimento não tem mapa): o fundo do hero some.
    await expect(page.getByTestId('home-hero-art')).toHaveCount(0);
  });

  test('a API fora dos servidores avisa e tenta de novo, sem lista vazia nem número inventado', async ({
    page,
    expectedConsoleErrors,
  }) => {
    expectedConsoleErrors.push(/503|net::ERR/);
    // A leitura do servidor do site já pode ter vindo; o SSE falha de propósito.
    await page.route('**/api/servers/live', (route) => route.fulfill({ status: 503, body: '' }));
    await page.goto('/');
    // Com a lista inicial do servidor ela aparece; sem ela (API fora na hora), o aviso. Os dois são "sem inventar".
    await expect(page.getByTestId('home')).toBeVisible();
    await expect(
      page.getByTestId('home-hero').or(page.getByTestId('servers-unavailable')),
    ).toBeVisible();
  });
});

test.describe('Top 3 e a semana, com dados de verdade', () => {
  test.beforeAll(async ({ playwright, baseURL }) => {
    const request = await playwright.request.newContext({ baseURL });
    await playRounds(request, 'Craque Home');
    await request.dispose();
  });

  test('o Top 3 da semana mostra quem lidera o Retake e leva ao Perfil; o Deathmatch tem o seu', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await routeLiveServers(page, live());
    await page.goto('/');
    const top = page.getByTestId('top3');
    await expect(top).toBeVisible();
    const rows = top.getByTestId('top3-row');
    expect(await rows.count()).toBeGreaterThanOrEqual(1);
    expect(await rows.count()).toBeLessThanOrEqual(3);
    await expect(top).toContainText('Craque Home');
    await expect(top).toContainText('rounds vencidos');
    await expect(top.getByRole('link', { name: 'Ver o Ranking' })).toHaveAttribute(
      'href',
      '/ranking?modo=retake',
    );
    const link = top.getByRole('link', { name: /Craque Home/ });
    await expect(link).toHaveAttribute('href', /^\/\d+$/);

    await top.getByRole('button', { name: 'Deathmatch' }).click();
    await expect(top.getByRole('button', { name: 'Deathmatch' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(top).toContainText('abates por minuto');
    await expect(top.getByRole('link', { name: 'Ver o Ranking' })).toHaveAttribute(
      'href',
      '/ranking?modo=deathmatch',
    );
  });

  test('a faixa "Esta semana" tem os números da API e nenhum "rounds" nem "partidas"', async ({
    page,
  }) => {
    await routeLiveServers(page, live());
    await page.goto('/');
    const week = page.getByTestId('week-strip');
    await expect(week).toBeVisible();
    await expect(week.getByRole('heading', { name: 'Esta semana' })).toBeVisible();
    for (const label of ['Jogadores ativos', 'Abates', 'HS%', 'Horas jogadas']) {
      await expect(week.getByText(label, { exact: true })).toBeVisible();
    }
    // Os mesmos números da API (o que o leitor de tela ouve).
    const summary = await page.request.get('/api/stats/week');
    expect(summary.ok()).toBe(true);
    const body = (await summary.json()) as { current: { players: number; kills: number } };
    expect(body.current.players).toBeGreaterThan(0);
    await expect(week.locator('[data-stat="players"] .sr-only')).toHaveText(
      new Intl.NumberFormat('pt-BR').format(body.current.players),
    );
    await expect(week.locator('[data-stat="kills"] .sr-only')).toHaveText(
      new Intl.NumberFormat('pt-BR').format(body.current.kills),
    );
    await expect(week).not.toContainText(/partida/i);
    await expect(week.getByText(/^rounds$/i)).toHaveCount(0);
    // A contagem até a virada tem texto para o leitor de tela.
    await expect(week.getByRole('timer')).toHaveAttribute(
      'aria-label',
      /Faltam \d+ dias?, \d+ horas/,
    );
    await expect(week.getByRole('img', { name: /da semana já passou/ })).toBeVisible();
  });
});

test.describe('Loadouts da semana', () => {
  test('mostra a skin em destaque dos melhores, gira, pausa e some quando não há ninguém', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await routeLiveServers(page, live());
    await page.route('**/vitrine/semana', (route) => route.fulfill({ json: LOADOUTS }));
    await page.goto('/');
    const section = page.getByTestId('loadouts-week');
    await scrollToEnd(page);
    await expect(section).toBeVisible();
    await expect(section.getByRole('heading', { name: 'Loadouts da semana' })).toBeVisible();
    const card = section.getByTestId('loadout-card');
    await expect(card).toContainText('Linhas Vermelhas');
    await expect(card).toContainText('Ana');
    await expect(card).toContainText('StatTrak™');
    await expect(card).toContainText('Nova de Fábrica');

    // Escolher outra skin troca o cartão.
    await section.getByRole('button', { name: /Degradê \(Karambit\), de Beto/ }).click();
    await expect(card).toContainText('Degradê');
    await expect(card).toHaveAttribute('data-foil', '');

    const pause = section.getByRole('button', { name: 'Pausar rotação' });
    await pause.click();
    await expect(section.getByRole('button', { name: 'Retomar rotação' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('sem ninguém para mostrar (ou com a API fora), a seção não aparece', async ({ page }) => {
    await routeLiveServers(page, live());
    await page.route('**/vitrine/semana', (route) => route.fulfill({ json: { entries: [] } }));
    await page.goto('/');
    await page.getByTestId('week-strip').scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 4000);
    await expect(page.getByTestId('loadouts-week')).toHaveCount(0);
    await expect(page.getByTestId('week-strip')).toBeVisible();
  });
});

test.describe('tamanhos e temas', () => {
  for (const width of [390, 820, 1100, 1440]) {
    test(`sem rolagem de lado e sem nada cortado (${width} px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await routeLiveServers(page, live());
      await page.route('**/vitrine/semana', (route) => route.fulfill({ json: LOADOUTS }));
      await page.goto('/');
      await expect(page.getByTestId('home')).toBeVisible();
      await page.getByTestId('week-strip').scrollIntoViewIfNeeded();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      for (const name of ['fixo-a', 'fixo-b']) {
        const box = await page.locator(`li[data-server="${name}"]`).boundingBox();
        expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
      }
    });
  }

  test('o trilho é duas colunas a partir de 1280 px e se desfaz abaixo: os amigos vêm logo depois do hero', async ({
    page,
  }) => {
    await routeLiveServers(page, live());
    await noFriends(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const [rail, servers] = await Promise.all([
      page.getByTestId('friends-playing').boundingBox(),
      page.getByTestId('server-list').boundingBox(),
    ]);
    expect(rail?.x ?? 0).toBeGreaterThan((servers?.x ?? 0) + (servers?.width ?? 0) - 1);

    await page.setViewportSize({ width: 820, height: 900 });
    const [friends, list] = await Promise.all([
      page.getByTestId('friends-playing').boundingBox(),
      page.getByTestId('server-list').boundingBox(),
    ]);
    expect(friends?.y ?? 0).toBeLessThan(list?.y ?? 0);
  });

  for (const theme of ['dark', 'light'] as const) {
    for (const width of [390, 1440]) {
      test(`axe: deslogado, com servidores no ar e offline (${theme}, ${width} px)`, async ({
        page,
      }) => {
        await saveTheme(page, theme);
        await page.setViewportSize({ width, height: 900 });
        await routeLiveServers(page, live());
        await page.route('**/vitrine/semana', (route) => route.fulfill({ json: LOADOUT_ONE }));
        await page.goto('/');
        await expect(page.getByTestId('home')).toBeVisible();
        await scrollToEnd(page);
        await expect(page.getByTestId('loadouts-week')).toBeVisible();
        expect(await axeViolations(page)).toEqual([]);
      });
    }

    test(`axe: logado com amigos jogando (${theme}, 1440 px)`, async ({ page }) => {
      await saveTheme(page, theme);
      const servers = live();
      await routeLiveServers(page, servers);
      await page.route('**/api/me/friends-playing', (route) =>
        route.fulfill({
          json: {
            status: 'ok',
            friends: [
              {
                steamId: '76561198000000101',
                publicId: 9101,
                displayName: 'Lia Souza',
                avatarUrl: null,
                serverId: servers[0]?.id,
              },
            ],
          },
        }),
      );
      await signIn(page);
      await expect(page.getByTestId('home')).toHaveAttribute('data-state', 'amigos');
      expect(await axeViolations(page)).toEqual([]);
    });

    test(`axe: servidores dormindo (${theme}, 390 px)`, async ({ page }) => {
      await saveTheme(page, theme);
      await page.setViewportSize({ width: 390, height: 900 });
      await routeLiveServers(page, [
        fakeServer({ name: 'fixo-dorme', state: 'offline', players: 0, map: null }),
      ]);
      await page.goto('/');
      await expect(page.getByTestId('home')).toHaveAttribute('data-state', 'offline');
      expect(await axeViolations(page)).toEqual([]);
    });
  }
});
