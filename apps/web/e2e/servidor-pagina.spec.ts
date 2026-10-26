import type { APIRequestContext, Page } from '@playwright/test';
import { axeViolations, expect, saveTheme, test } from './fixtures';
import { createServer, heartbeat, keepBeating } from './live-servers';

/**
 * A página do servidor (/servidores/[id]). A API ainda não entrega os blocos da S12b (placar, jogadores, histórico
 * do dia), então a página real mostra "coletando" e os estados "prontos" vêm da vitrine de dev (/dev/servidor).
 */

const STATES = ['cheio', 'vazio', 'offline', 'warmup', 'deathmatch', 'coletando', 'nunca'] as const;

const gallery = (state: string, query = '') => `/dev/servidor?estado=${state}&barra=0${query}`;

/** O id do servidor recém-criado, lido da lista pública da API. */
async function serverId(request: APIRequestContext, name: string): Promise<string> {
  const response = await request.get('/api/servers');
  const { servers } = (await response.json()) as { servers: { id: string; name: string }[] };
  const id = servers.find((server) => server.name === name)?.id;
  if (!id) throw new Error(`servidor ${name} fora da lista`);
  return id;
}

const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe('Página do servidor: o que a API já entrega', () => {
  test('mostra mapa, estado e ações, e os blocos da S12b em "coletando"', async ({
    page,
    request,
  }) => {
    const server = createServer();
    const stop = keepBeating(request, server, () => []);
    try {
      await heartbeat(request, server, [], 'de_mirage');
      const id = await serverId(request, server.name);
      await page.goto(`/servidores/${id}`);

      await expect(page.getByTestId('server-page')).toHaveAttribute('data-estado', 'live');
      await expect(page.getByTestId('server-map')).toHaveText('Mirage');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(server.name);
      await expect(page.getByTestId('server-address')).toHaveText(server.address);
      await expect(page.getByTestId('connect')).toHaveAttribute(
        'href',
        `steam://connect/${server.address}`,
      );
      await expect(page.getByTestId('copy-ip')).toBeVisible();

      // Nada de número inventado: cada bloco da S12b é o estado "coletando", com o que ele vai mostrar.
      for (const kind of ['score', 'roster', 'today']) {
        const block = page.getByTestId(`collecting-${kind}`);
        await expect(block).toBeVisible();
        await expect(block).toContainText('Coletando');
        await expect(block).toContainText('Ainda não coletamos esse dado.');
      }
      await expect(page.getByTestId('placar')).toHaveCount(0);
      await expect(page.getByTestId('jogador')).toHaveCount(0);
    } finally {
      stop();
    }
  });

  test('o servidor que cai vira offline com o último mapa, sem recarregar a página', async ({
    page,
    request,
  }) => {
    const server = createServer();
    const stop = keepBeating(request, server, () => []);
    await heartbeat(request, server, [], 'de_nuke');
    const id = await serverId(request, server.name);
    await page.goto(`/servidores/${id}`);
    await expect(page.getByTestId('server-page')).toHaveAttribute('data-estado', 'live');
    await expect(page.getByTestId('server-map')).toHaveText('Nuke');

    stop();
    // No E2E a API marca offline com 4 s sem batimento (SERVER_OFFLINE_AFTER_SECONDS).
    await expect(page.getByTestId('server-page')).toHaveAttribute('data-estado', 'offline', {
      timeout: 20_000,
    });
    await expect(page.getByTestId('server-map')).toContainText('Nuke');
    await expect(page.getByTestId('offline-since')).toContainText('último mapa Nuke');
    await expect(page.getByTestId('connect')).toHaveCount(0);
  });

  test('um servidor que não existe leva o 404 do servidor', async ({ page }) => {
    const missing = '00000000-0000-4000-8000-000000000000';
    for (const path of [`/servidores/${missing}`, '/servidores/nao-e-um-id']) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      // O título decifra ao chegar (EncryptedText), mas o nome acessível já é o texto inteiro.
      await expect(
        page.getByRole('heading', { level: 1, name: 'Servidor não encontrado' }),
      ).toBeVisible();
      await expect(page.getByRole('link', { name: 'Ver servidores' })).toBeVisible();
    }
  });

  test('o nome do servidor no cartão da Home leva à página dele', async ({ page, request }) => {
    const server = createServer();
    const stop = keepBeating(request, server, () => []);
    try {
      await heartbeat(request, server, [], 'de_inferno');
      const id = await serverId(request, server.name);
      await page.goto('/');
      await page.locator(`li[data-server="${server.name}"]`).getByTestId('server-link').click();
      await page.waitForURL(`**/servidores/${id}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(server.name);
    } finally {
      stop();
    }
  });
});

test.describe('Página do servidor: os estados com dados de exemplo (vitrine)', () => {
  test('Retake lotado: placar, os dois lados, o privado sem link e "Mapas de hoje"', async ({
    page,
  }) => {
    await page.goto(gallery('cheio'));
    const score = page.getByTestId('placar');
    await expect(score).toContainText('Placar ao vivo');
    await expect(score).toContainText('Rounds ganhos por lado neste mapa');
    await expect(page.getByRole('list', { name: 'Contra-terroristas' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Terroristas' })).toBeVisible();

    const privateRows = page.locator('[data-testid="jogador"][data-private]');
    await expect(privateRows).toHaveCount(2);
    for (const row of await privateRows.all()) {
      await expect(row).toContainText('Jogador privado');
      await expect(row.getByRole('link')).toHaveCount(0);
    }
    // Retake não tem partida: a lista é de mapas, com os rounds ganhos por lado.
    await expect(page.getByRole('heading', { name: 'Mapas de hoje' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Partidas' })).toHaveCount(0);
    await expect(page.getByTestId('hoje')).toContainText('Rounds ganhos');
  });

  test('aquecimento: jogadores sem abates, mortes e pontos, com o selo Esquentando', async ({
    page,
  }) => {
    await page.goto(gallery('warmup'));
    await expect(page.getByTestId('server-page')).toHaveAttribute('data-estado', 'warmup');
    await expect(page.getByTestId('placar')).toHaveCount(0);
    const rows = page.getByTestId('jogador');
    await expect(rows).toHaveCount(6);
    await expect(page.locator('.vs-nums')).toHaveCount(0);
    await expect(page.getByTestId('jogadores').locator('.vs-badge')).toHaveCount(2);
  });

  test('Deathmatch: o líder no lugar do placar de times e uma lista única por pontos', async ({
    page,
  }) => {
    await page.goto(gallery('deathmatch'));
    await expect(page.getByTestId('placar')).toHaveCount(0);
    const leader = page.getByTestId('lider');
    await expect(leader).toContainText('Líder agora');
    await expect(leader).toContainText('Duda Falcão');
    await expect(leader).toContainText('No mapa há 23 min');
    await expect(page.getByRole('list', { name: 'Jogadores por pontos' })).toBeVisible();
    await expect(page.getByTestId('jogador')).toHaveCount(12);
    await expect(page.getByRole('list', { name: 'Terroristas' })).toHaveCount(0);
    // Sem lado, sem rounds ganhos por lado.
    await expect(page.getByTestId('hoje')).not.toContainText('Rounds ganhos');
  });

  test('vazio e offline: estados vazios claros, sem placar vivo', async ({ page }) => {
    await page.goto(gallery('vazio'));
    await expect(page.getByTestId('jogadores')).toContainText('Ninguém jogando agora');
    await expect(page.getByTestId('placar')).toHaveCount(0);

    await page.goto(gallery('offline'));
    await expect(page.getByTestId('server-page')).toHaveAttribute('data-estado', 'offline');
    await expect(page.getByTestId('jogadores')).toContainText('Ninguém conectado');
    await expect(page.getByTestId('server-map')).toContainText('Mirage');
    await expect(page.getByTestId('connect')).toHaveCount(0);
  });

  test('coletando e nunca online: nenhum número inventado', async ({ page }) => {
    await page.goto(gallery('coletando'));
    await expect(page.getByTestId('collecting-score')).toContainText(
      'Coletando desde 28 de outubro',
    );

    await page.goto(gallery('nunca'));
    await expect(page.getByTestId('offline-since')).toHaveText('Nunca ficou online');
    // Sem mapa conhecido, o nome do servidor ocupa o lugar do mapa e nenhum mapa é nomeado.
    await expect(page.getByTestId('server-map')).toHaveCount(0);
    await expect(page.getByTestId('server-page')).not.toContainText('Mirage');
  });

  test('simular: o round avança e o placar rola até o novo valor', async ({ page }) => {
    await page.goto(gallery('cheio', '&sim=1&ms=1300'));
    const round = page.locator('[data-testid="placar"] .vs-round .sr-only');
    await expect(round).toHaveText('15');
    await expect(round).toHaveText(/^(1[6-9]|2\d)$/, { timeout: 15_000 });
  });
});

for (const theme of ['dark', 'light'] as const) {
  test.describe(`Página do servidor, acessibilidade e 390 px (${theme})`, () => {
    for (const state of STATES) {
      test(`vitrine "${state}": axe sem violações e sem rolagem lateral`, async ({ page }) => {
        await saveTheme(page, theme);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(gallery(state));
        await expect(page.getByTestId('server-page')).toBeVisible();
        expect(await noHorizontalScroll(page)).toBe(true);
        expect(await axeViolations(page)).toEqual([]);

        await page.setViewportSize({ width: 1440, height: 900 });
        expect(await noHorizontalScroll(page)).toBe(true);
        expect(await axeViolations(page)).toEqual([]);
      });
    }

    test('a página de um servidor real: axe sem violações', async ({ page, request }) => {
      await saveTheme(page, theme);
      const server = createServer();
      const stop = keepBeating(request, server, () => []);
      try {
        await heartbeat(request, server, [], 'de_anubis');
        const id = await serverId(request, server.name);
        await page.goto(`/servidores/${id}`);
        await expect(page.getByTestId('server-map')).toHaveText('Anubis');
        expect(await axeViolations(page)).toEqual([]);
      } finally {
        stop();
      }
    });
  });
}
