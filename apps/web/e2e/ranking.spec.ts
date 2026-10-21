import { randomUUID } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import { createUnclaimedAccount, newSteamId, signInByRequest } from './accounts';
import { runApiCli } from './api-cli';
import { axeViolations, expect, saveTheme, test, WIDTHS } from './fixtures';

const AT = () => new Date().toISOString();

/** A segunda-feira (Brasília) da semana atual, como a API a conta. */
function thisWeek(): string {
  const local = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const monday =
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) -
    ((local.getUTCDay() + 6) % 7) * 24 * 60 * 60 * 1000;
  return new Date(monday).toISOString().slice(0, 10);
}

interface Rounds {
  steamIds: string[];
  /** Quantos rounds (todos vencidos pelo CT) esses jogadores jogam juntos. */
  count: number;
}

/** Manda ao Servidor Carmine de Retake os rounds e as kills (killer → victim, uma por item). */
async function play(
  request: APIRequestContext,
  { rounds, kills = [] }: { rounds: Rounds; kills?: [killer: string, victim: string][] },
) {
  const response = await request.post('/api/server/events', {
    headers: { authorization: `Bearer ${process.env.E2E_SERVER_KEY}` },
    data: {
      kills: kills.map(([killer, victim]) => ({
        id: randomUUID(),
        at: AT(),
        warmup: false,
        killerSteamId: killer,
        killerIsBot: false,
        victimSteamId: victim,
        victimIsBot: false,
        assisterSteamId: null,
        assisterIsBot: false,
        headshot: false,
        weapon: 'ak47',
        teamKill: false,
      })),
      damages: [],
      roundEnds: Array.from({ length: rounds.count }, () => ({
        id: randomUUID(),
        at: AT(),
        warmup: false,
        winner: 'ct',
        players: rounds.steamIds.map((steamId) => ({ steamId, team: 'ct' })),
      })),
      sessionStarts: [],
      sessionEnds: [],
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
}

/** Duas Contas com os mesmos 50 rounds vencidos; a primeira faz mais kills (K/D maior). */
async function tiedPair(request: APIRequestContext) {
  const tag = randomUUID().slice(0, 6);
  const [high, low, victim] = await Promise.all(
    [`Alta Razão ${tag}`, `Baixa Razão ${tag}`, `Vítima Rank ${tag}`].map((name) =>
      createUnclaimedAccount(request, name),
    ),
  );
  if (!high || !low || !victim) throw new Error('Contas não criadas');
  await play(request, {
    rounds: { steamIds: [high.steamId, low.steamId], count: 50 },
    kills: [
      [high.steamId, victim.steamId],
      [high.steamId, victim.steamId],
      [high.steamId, victim.steamId],
      [low.steamId, victim.steamId],
    ],
  });
  return {
    high: { ...high, name: `Alta Razão ${tag}` },
    low: { ...low, name: `Baixa Razão ${tag}` },
  };
}

test('um empate em rounds vencidos é resolvido pelo K/D', async ({ page, request }) => {
  const { high, low } = await tiedPair(request);

  await page.goto('/ranking');

  const names = await page.getByTestId('ranking-row').allInnerTexts();
  const highAt = names.findIndex((row) => row.includes(high.name));
  const lowAt = names.findIndex((row) => row.includes(low.name));
  expect(highAt).toBeGreaterThanOrEqual(0);
  expect(highAt).toBeLessThan(lowAt);
  await expect(page.getByRole('link', { name: high.name })).toHaveAttribute(
    'href',
    `/${high.publicId}`,
  );
  expect(low.publicId).not.toBe(high.publicId);
});

test('o Perfil privado aparece como "Jogador privado", sem link, nome nem avatar, e ocupa a posição', async ({
  page,
  request,
}) => {
  const [quiet, other] = await Promise.all(
    ['Silenciosa Rank', 'Aberta Rank'].map((name) => createUnclaimedAccount(request, name)),
  );
  if (!quiet || !other) throw new Error('Contas não criadas');
  await play(request, { rounds: { steamIds: [quiet.steamId, other.steamId], count: 50 } });
  // A Conta entra no site e liga o Perfil privado pela interface.
  await signInByRequest(page, quiet.steamId);
  await page.goto(`/${quiet.publicId}`);
  await page.getByTestId('privacy-switch').click();
  await expect(page.getByTestId('privacy-switch')).toBeChecked();

  await page.goto('/ranking');
  const own = page
    .getByTestId('ranking-row')
    .filter({ has: page.getByText('Você', { exact: true }) });
  await expect(own).toContainText('Jogador privado');
  await expect(own.getByRole('link')).toHaveCount(0);
  await expect(own).not.toContainText('Silenciosa Rank');
  await expect(page.getByRole('link', { name: 'Aberta Rank' })).toBeVisible();

  // Um visitante sem sessão também a vê privada, e o nome não aparece em lugar nenhum da página.
  const visitor = await page
    .context()
    .browser()
    ?.newContext({ baseURL: page.url().split('/ranking')[0] });
  const anonymous = await visitor?.newPage();
  await anonymous?.goto('/ranking');
  await expect(anonymous?.getByText('Jogador privado').first() ?? page.locator('x')).toBeVisible();
  expect(await anonymous?.content()).not.toContain('Silenciosa Rank');
  await visitor?.close();
});

test('o jogador logado vê quanto falta para o mínimo e, depois, a própria posição', async ({
  page,
  request,
}) => {
  const player = await createUnclaimedAccount(request, 'Progresso Rank');
  await play(request, { rounds: { steamIds: [player.steamId], count: 38 } });
  await signInByRequest(page, player.steamId);

  await page.goto('/ranking');
  await expect(page.getByTestId('viewer-note')).toContainText('Faltam 12 rounds');

  await play(request, { rounds: { steamIds: [player.steamId], count: 12 } });
  // O cache do Ranking dura 1 s no E2E: relê até a nova semana aparecer.
  await expect(async () => {
    await page.reload();
    await expect(page.getByTestId('viewer-note')).toContainText(
      /Você está na posição \d+ do Retake/,
      { timeout: 1_000 },
    );
  }).toPass({ timeout: 15_000 });
  await expect(
    page.getByTestId('ranking-row').filter({ hasText: 'Progresso Rank' }),
  ).toHaveAttribute('data-self', 'true');
});

test('a Staff remove a entrada do Ranking e as Estatísticas continuam no Perfil', async ({
  page,
  request,
}) => {
  const { high } = await tiedPair(request);
  const by = newSteamId();
  await page.goto('/ranking');
  await expect(page.getByRole('link', { name: high.name })).toBeVisible();

  const out = runApiCli('dist/staff/staff.cli.js', [
    'ranking-remove',
    '--steam-id',
    high.steamId,
    '--mode',
    'retake',
    '--week',
    thisWeek(),
    '--by',
    by,
    '--reason',
    'teste de integridade',
  ]);
  expect(out).toContain('saiu do Ranking de retake');

  // O CLI também tira o Ranking do cache curto, então a próxima leitura já não a traz.
  await page.reload();
  await expect(page.getByRole('link', { name: high.name })).toHaveCount(0);
  await page.goto(`/${high.publicId}`);
  await expect(page.getByTestId('stats-retake')).toContainText('Kills');
});

test('semana sem ninguém elegível mostra o estado vazio que explica as regras', async ({
  page,
}) => {
  await page.goto('/ranking?modo=deathmatch');

  const empty = page.getByTestId('ranking-empty');
  await expect(empty).toContainText('Ninguém entrou no Ranking desta semana');
  await expect(empty).toContainText('ao menos 30 minutos de Deathmatch');
  await expect(empty).toContainText('HS%');
  await expect(page).toHaveURL(/modo=deathmatch/);

  await page.goto('/ranking?semana=2020-01-06');
  await expect(page.getByTestId('ranking-empty')).toContainText('ninguém cumpriu o mínimo');
  await page.goto('/ranking?semana=2020-01-07');
  await expect(page.getByText('Essa semana não existe')).toBeVisible();
});

test('as abas por Modo e o seletor de semana trocam a URL compartilhável', async ({ page }) => {
  await page.goto('/ranking');
  await expect(page.getByTestId('ranking-tab-retake')).toHaveAttribute('aria-current', 'page');

  await page.getByTestId('ranking-tab-deathmatch').click();
  await expect(page).toHaveURL(/\/ranking\?modo=deathmatch$/);

  // Com uma semana só o seletor vira texto; com mais, o botão mostra a semana atual.
  await expect(page.getByTestId('week-select').or(page.getByTestId('week-label'))).toContainText(
    '(atual)',
  );
});

test('com uma semana antiga na URL, o Select oferece a semana atual e volta para ela', async ({
  page,
}) => {
  await page.goto('/ranking?semana=2020-01-06');
  const select = page.getByTestId('week-select');
  await expect(select).not.toContainText('(atual)');
  await select.click();
  expect(await page.getByRole('option').count()).toBeGreaterThanOrEqual(2);
  await page.getByRole('option', { name: /\(atual\)/ }).click();
  await expect(page).toHaveURL(/\/ranking\?modo=retake$/);
  await expect(page.getByTestId('week-select').or(page.getByTestId('week-label'))).toContainText(
    '(atual)',
  );
});

test('Estatísticas no Perfil: por Modo e no total; Perfil privado esconde de visitantes', async ({
  page,
  request,
  browser,
}) => {
  const [killer, victim] = await Promise.all(
    ['Estat Autor', 'Estat Vítima'].map((name) => createUnclaimedAccount(request, name)),
  );
  if (!killer || !victim) throw new Error('Contas não criadas');
  await play(request, {
    rounds: { steamIds: [killer.steamId, victim.steamId], count: 2 },
    kills: [[killer.steamId, victim.steamId]],
  });

  await page.goto(`/${killer.publicId}`);
  const total = page.getByTestId('stats-total');
  await expect(total.locator('[data-stat="kills"]')).toContainText('1');
  await expect(total.locator('[data-stat="adr"]')).toHaveCount(0);
  await expect(total.locator('[data-stat="kpm"]')).toHaveCount(0);
  await expect(page.getByTestId('stats-retake').locator('[data-stat="adr"]')).toBeVisible();
  await expect(page.getByTestId('stats-only-you')).toHaveCount(0);

  // O dono liga o Perfil privado: vê as suas com "Só você vê"; o visitante vê o aviso.
  await signInByRequest(page, killer.steamId);
  await page.goto(`/${killer.publicId}`);
  await page.getByTestId('privacy-switch').click();
  await expect(page.getByTestId('privacy-switch')).toBeChecked();
  await page.reload();
  await expect(page.getByTestId('stats-only-you')).toHaveText('Só você vê');
  await expect(page.getByTestId('stats-total').locator('[data-stat="kills"]')).toContainText('1');

  const visitorContext = await browser.newContext({
    baseURL: page.url().split('/').slice(0, 3).join('/'),
  });
  const visitor = await visitorContext.newPage();
  await visitor.goto(`/${killer.publicId}`);
  await expect(visitor.getByTestId('stats-private')).toContainText('Estatísticas privadas');
  await expect(visitor.locator('[data-stat]')).toHaveCount(0);
  await visitorContext.close();
});

for (const theme of ['dark', 'light'] as const) {
  test(`Ranking e Estatísticas sem violações do axe e sem scroll horizontal (${theme})`, async ({
    page,
    request,
  }) => {
    await saveTheme(page, theme);
    const { high } = await tiedPair(request);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ['/ranking', '/ranking?modo=deathmatch', `/${high.publicId}`]) {
        await page.goto(path);
        await expect(page.locator('main')).toBeVisible();
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${path} em ${width}px`).toBeLessThanOrEqual(0);
        if (width === 390 || width === 1440) {
          expect(await axeViolations(page), `${path} em ${width}px`).toEqual([]);
        }
      }
    }
  });
}
