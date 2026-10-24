import type { APIRequestContext, Page } from '@playwright/test';
import { createUnclaimedAccount, csrfToken, signInByRequest } from './accounts';
import { axeViolations, expect, saveTheme, test } from './fixtures';
import { daysAgo, playWeek } from './game-events';
import { clickHydrated } from './hydration';
import { addAndEquip } from './loadout-api';

const KARAMBIT_FADE = 1327;
const AWP_ASIIMOV = 306;

/**
 * Uma Conta que jogou em três semanas seguidas (esta, a anterior e a retrasada), com rounds, abates,
 * headshots e tempo de jogo: o agregado semanal que o Perfil novo lê. Esta semana: 60 rounds, 12 abates
 * (4 na cabeça) e 1 h 30 min; na anterior, 6 abates; na retrasada, 3.
 */
async function playedThreeWeeks(request: APIRequestContext) {
  const [player, other] = await Promise.all(
    ['Lia Exe', 'Parceiro Vida'].map((name) => createUnclaimedAccount(request, name)),
  );
  if (!player || !other) throw new Error('Contas não criadas');
  const both = [player.steamId, other.steamId];
  const kills = (count: number, headshots: number) =>
    Array.from({ length: count }, (_, index) => ({
      killer: player.steamId,
      victim: other.steamId,
      headshot: index < headshots,
    }));
  await playWeek(request, {
    rounds: { steamIds: both, count: 60 },
    kills: [...kills(12, 4), { killer: other.steamId, victim: player.steamId }],
    sessions: [{ steamId: player.steamId, seconds: 5400 }],
  });
  await playWeek(request, {
    at: daysAgo(8),
    rounds: { steamIds: both, count: 40 },
    kills: kills(6, 3),
    sessions: [{ steamId: player.steamId, seconds: 3600 }],
  });
  await playWeek(request, {
    at: daysAgo(15),
    rounds: { steamIds: both, count: 30 },
    kills: kills(3, 1),
    sessions: [{ steamId: player.steamId, seconds: 1800 }],
  });
  return player;
}

const highlight = (page: Page, key: string) =>
  page.getByTestId('stats-highlights').locator(`[data-stat="${key}"]`);

test('Perfil com jogos: os quatro números da semana, o seletor, os cartões por Modo e o que ainda está coletando', async ({
  page,
  request,
}) => {
  const player = await playedThreeWeeks(request);
  await page.goto(`/${player.publicId}`);

  // Abre na semana, que teve atividade: abates, K/D, HS% e horas (o texto de verdade é o valor final).
  const numbers = page.getByTestId('stats-highlights');
  await expect(numbers).toHaveAttribute('data-period', 'week');
  await expect(numbers.locator('[data-stat]')).toHaveCount(4);
  await expect(highlight(page, 'kills')).toContainText('12');
  await expect(highlight(page, 'kd')).toContainText('12,00');
  await expect(highlight(page, 'headshotPercent')).toContainText('33,3%');
  await expect(highlight(page, 'hours')).toContainText('1,5 h');
  await expect(page.getByTestId('stats-retake')).toContainText('Rounds jogados');

  // O seletor troca para o total (3 semanas) sem recarregar; no total o Retake ganha ADR.
  await clickHydrated(page.locator('[data-period-option="total"]'));
  await expect(numbers).toHaveAttribute('data-period', 'total');
  await expect(highlight(page, 'kills')).toContainText('21');
  await expect(highlight(page, 'hours')).toContainText('3,0 h');
  await expect(page.getByTestId('stats-retake').locator('[data-stat="adr"]')).toBeVisible();
  await expect(page.getByTestId('stats-retake').locator('[data-stat="deaths"]')).toBeVisible();
  await clickHydrated(page.locator('[data-period-option="week"]'));
  await expect(numbers).toHaveAttribute('data-period', 'week');

  // Mapa de calor, radar e Sessões ainda não têm dado: cenas quietas, sem nenhum número.
  for (const kind of ['heatmap', 'radar', 'sessions']) {
    const card = page.getByTestId(`collecting-${kind}`);
    await expect(card).toContainText('Coletando');
    await expect(card.getByText(/\d/)).toHaveCount(0);
  }

  // Uma Conta não reivindicada com jogos mostra o convite e as Estatísticas ao mesmo tempo.
  await expect(page.getByTestId('claim-invite')).toBeVisible();
});

test('os gráficos só chegam perto da tela e usam a série real: rounds, HS% e horas por Modo', async ({
  page,
  request,
}) => {
  const player = await playedThreeWeeks(request);
  const chunks: string[] = [];
  page.on('response', (response) => {
    if (response.url().includes('/_next/static/') && response.url().endsWith('.js')) {
      chunks.push(response.url());
    }
  });
  await page.goto(`/${player.publicId}`);
  await expect(page.getByTestId('stats-panel')).toBeVisible();
  expect(await page.getByTestId('profile-charts').count()).toBe(0);

  await page.getByTestId('stats-panel').scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight / 2 }));
  const charts = page.getByTestId('profile-charts');
  await expect(charts).toBeVisible();
  await expect(charts.getByRole('heading', { name: 'Rounds por semana' })).toBeVisible();
  await expect(charts.locator('svg').first()).toBeVisible();

  // Horas por Modo: só o Retake jogou, com 1,5 h na semana; o Deathmatch parado fica fora.
  const hours = page.getByTestId('chart-hours');
  await expect(hours).toContainText('1,5 h nesta semana');
  await expect(hours.getByRole('listitem')).toHaveCount(1);
  await expect(hours).toContainText('Retake');
  await expect(hours).not.toContainText('Deathmatch');

  // O seletor também muda os gráficos.
  await page.evaluate(() => window.scrollTo({ top: 0 }));
  await clickHydrated(page.locator('[data-period-option="total"]'));
  await expect(page.getByTestId('chart-hours')).toContainText('3 h no total');
  await expect(page.getByTestId('chart-headshot')).toContainText('no total');
});

test('uma tendência aparece quando há pelo menos duas semanas com dado', async ({
  page,
  request,
}) => {
  const player = await playedThreeWeeks(request);
  await page.goto(`/${player.publicId}`);

  // A sparkline é carregada sob demanda, um pouco depois da página.
  await expect(highlight(page, 'kills').locator('svg').first()).toBeVisible({ timeout: 20_000 });
});

test('com movimento reduzido o número aparece pronto, sem contar', async ({ page, request }) => {
  const player = await playedThreeWeeks(request);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/${player.publicId}`);

  await expect(highlight(page, 'kills').locator('[aria-hidden="true"]').first()).toHaveText('12');
});

test('Perfil privado: o visitante vê o aviso no lugar dos números; o dono vê os seus com "Só você vê"', async ({
  page,
  request,
  browser,
}) => {
  const player = await playedThreeWeeks(request);
  await signInByRequest(page, player.steamId);
  const privacy = await page.request.put('/api/me/privacy', {
    headers: { 'x-csrf-token': await csrfToken(page.context()) },
    data: { isPrivate: true },
  });
  expect(privacy.status()).toBe(204);

  await page.goto(`/${player.publicId}`);
  await expect(page.getByTestId('stats-only-you')).toHaveText('Só você vê');
  await expect(highlight(page, 'kills')).toContainText('12');
  await expect(page.getByTestId('private-note')).toContainText('Perfil privado');

  const visitorContext = await browser.newContext({
    baseURL: page.url().split('/').slice(0, 3).join('/'),
  });
  const visitor = await visitorContext.newPage();
  await visitor.goto(`/${player.publicId}`);
  await expect(visitor.getByTestId('stats-private')).toContainText('Estatísticas privadas');
  await expect(visitor.getByTestId('private-note')).toBeVisible();
  // Nenhum número, gráfico nem cena de "coletando" para quem não pode ver.
  await expect(visitor.locator('[data-stat]')).toHaveCount(0);
  await expect(visitor.getByTestId('profile-charts')).toHaveCount(0);
  await expect(visitor.getByTestId('collecting-sessions')).toHaveCount(0);
  await expect(visitor.getByTestId('collecting-heatmap')).toHaveCount(0);
  await visitorContext.close();
});

test('a vitrine do Loadout tem a cor da raridade e o holo tingido pela skin nas raras', async ({
  page,
  request,
}) => {
  const player = await createUnclaimedAccount(request, 'Vitrine Vida');
  await signInByRequest(page, player.steamId);
  await addAndEquip(page, { id: KARAMBIT_FADE });
  await addAndEquip(page, { id: AWP_ASIIMOV }, ['t']);

  await page.goto(`/${player.publicId}`);
  const items = page.getByTestId('showcase-item');
  await expect(items).toHaveCount(2);
  const awp = items.filter({ hasText: 'Asiimov' });
  await expect(awp).toHaveAttribute('data-holo', /[12]/);
  // A paleta vem do servidor (cores da imagem da skin), não da cor de reserva da raridade.
  expect(await awp.getAttribute('style')).toMatch(/--h1:\s*#[0-9a-f]{6}/i);
  // Sem jogos: o banner e a cor ambiente seguem a skin mais rara, e o bloco de Estatísticas explica.
  await expect(page.getByTestId('profile-banner')).toHaveCount(1);
  await expect(page.getByTestId('stats-empty')).toBeVisible();
});

for (const theme of ['dark', 'light'] as const) {
  test(`Perfil completo sem violações do axe, sem rolagem lateral e com os gráficos carregados (${theme})`, async ({
    page,
    request,
  }) => {
    const player = await playedThreeWeeks(request);
    await saveTheme(page, theme);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${player.publicId}`);
      await expect(page.getByTestId('stats-panel')).toBeVisible();
      await page.evaluate(() =>
        window.scrollTo({ top: document.documentElement.scrollHeight / 2 }),
      );
      await expect(page.getByTestId('chart-hours')).toBeVisible();
      await expect(page.getByTestId('collecting-heatmap')).toBeVisible();
      // Os números terminam de contar antes de medir o contraste.
      await page.waitForTimeout(1500);
      expect(await axeViolations(page), `${width}px`).toEqual([]);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${width}px`).toBe(0);
    }
  });
}
