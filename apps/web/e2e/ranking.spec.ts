import { randomUUID } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import { createUnclaimedAccount, newSteamId, signInByRequest } from './accounts';
import { runApiCli } from './api-cli';
import { axeViolations, expect, saveTheme, test, WIDTHS } from './fixtures';
import { clickHydrated } from './hydration';

const AT = () => new Date().toISOString();

/**
 * Liga o Perfil privado pelo interruptor da página aberta. Um clique logo depois do `goto` pode
 * cair antes de a página hidratar e não fazer nada; então repete até ligar (sem desligar o que já
 * ligou: só clica enquanto está desligado).
 */
async function turnPrivateProfileOn(page: import('@playwright/test').Page) {
  const toggle = page.getByTestId('privacy-switch');
  await expect(async () => {
    if (!(await toggle.isChecked())) await toggle.click();
    await expect(toggle).toBeChecked({ timeout: 2_000 });
  }).toPass();
}

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

  // O pódio vem na ordem 2-1-3 na tela: a posição é o atributo, não a ordem no documento.
  const rows = await page
    .getByTestId('ranking-row')
    .evaluateAll((els) =>
      els.map((el) => ({
        position: Number((el as HTMLElement).dataset.position),
        text: el.textContent ?? '',
      })),
    );
  const highAt = rows.find((row) => row.text.includes(high.name))?.position ?? 0;
  const lowAt = rows.find((row) => row.text.includes(low.name))?.position ?? 0;
  expect(highAt).toBeGreaterThanOrEqual(1);
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
  await page.goto('/configuracoes/perfil');
  await turnPrivateProfileOn(page);

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

  // A U3e leva de "minha posição" para /ranking#minha-linha: só a linha própria tem o id, e o
  // scroll-margin a mantém fora de baixo do header.
  const mine = page.locator('#minha-linha');
  await expect(mine).toHaveCount(1);
  await expect(mine).toHaveAttribute('data-self', 'true');
  await expect(mine).toContainText('Progresso Rank');
  await page.goto('/ranking?modo=retake#minha-linha');
  await expect(mine).toBeInViewport();
  const header = await page.getByRole('banner').boundingBox();
  const row = await mine.boundingBox();
  if (!header || !row) throw new Error('header ou linha própria sem caixa');
  expect(row.y).toBeGreaterThanOrEqual(header.y + header.height);
});

test('no celular o HS% e os rounds descem para uma segunda linha sob o nome, em vez de sumir', async ({
  page,
  request,
}) => {
  const { high } = await tiedPair(request);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ranking');

  const row = page.getByTestId('ranking-row').filter({ hasText: high.name });
  await expect(row.getByRole('link', { name: high.name })).toBeVisible();
  await expect(row.getByTestId('ranking-row-extra')).toContainText(/HS% .+ · \d+ rounds/);

  // Nada é cortado com reticências: o nome e a linha extra aparecem inteiros.
  for (const part of [
    row.getByRole('link', { name: high.name }),
    row.getByTestId('ranking-row-extra'),
  ]) {
    expect(await part.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
    expect(await part.evaluate((el) => getComputedStyle(el).textOverflow)).not.toBe('ellipsis');
  }
  const box = await row.boundingBox();
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);

  // No desktop as colunas voltam e a segunda linha some.
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(row.getByTestId('ranking-row-extra')).toBeHidden();
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
  await expect(page.getByTestId('stats-retake')).toContainText('Abates');
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
  // Os quatro números de destaque (K/D, Abates, HS% e horas) vêm antes dos cartões e do Loadout; a
  // semana abre primeiro (teve jogo) e o seletor leva ao total.
  const highlights = page.getByTestId('stats-highlights');
  await expect(highlights.locator('[data-highlight]')).toHaveCount(4);
  await expect(highlights.locator('[data-highlight="kills"]')).toContainText('1');
  await clickHydrated(page.locator('[data-period-option="total"]'));
  await expect(highlights).toHaveAttribute('data-period', 'total');
  await expect(highlights.locator('[data-stat="kills"]')).toContainText('1');
  await expect(page.getByTestId('stats-retake').locator('[data-stat="adr"]')).toBeVisible();
  await expect(page.getByTestId('stats-retake').locator('[data-stat="kpm"]')).toHaveCount(0);
  await expect(page.getByTestId('stats-only-you')).toHaveCount(0);
  const statsBox = await page.getByTestId('profile-stats').boundingBox();
  const loadoutBox = await page.getByRole('region', { name: 'Loadout' }).boundingBox();
  expect(statsBox?.y).toBeLessThan(loadoutBox?.y ?? 0);

  // O dono liga o Perfil privado: vê as suas com "Só você vê"; o visitante vê o aviso.
  await signInByRequest(page, killer.steamId);
  await page.goto('/configuracoes/perfil');
  await turnPrivateProfileOn(page);
  await page.goto(`/${killer.publicId}`);
  await expect(page.getByTestId('stats-only-you')).toHaveText('Só você vê');
  await expect(page.getByTestId('stats-highlights').locator('[data-stat="kills"]')).toContainText(
    '1',
  );

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

for (const theme of ['dark', 'light'] as const) {
  test(`a linha "Você" do Ranking passa no axe, logado (${theme})`, async ({ page, request }) => {
    const player = await createUnclaimedAccount(request, `Linha Propria ${theme}`);
    await play(request, { rounds: { steamIds: [player.steamId], count: 60 } });
    await signInByRequest(page, player.steamId);
    await saveTheme(page, theme);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      // O cache do Ranking dura 1 s no E2E: relê até a linha própria aparecer.
      await expect(async () => {
        await page.goto('/ranking');
        await expect(page.locator('#minha-linha')).toHaveCount(1, { timeout: 1_000 });
      }).toPass({ timeout: 15_000 });
      expect(await axeViolations(page), `/ranking em ${width}px`).toEqual([]);
    }
  });
}

test('o pódio é 2-1-3: o primeiro no meio e mais alto, os três com a posição escrita', async ({
  page,
  request,
}) => {
  await tiedPair(request);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/ranking');
  const slots = page.getByTestId('ranking-podium').getByTestId('ranking-row');
  await expect(slots).toHaveCount(3);
  const boxes = await Promise.all(
    [1, 2, 3].map(async (position) => {
      const slot = page.getByTestId('ranking-podium').locator(`[data-position="${position}"]`);
      await expect(slot).toContainText(String(position));
      return slot.boundingBox();
    }),
  );
  const [first, second, third] = boxes;
  // 2º à esquerda, 1º no meio, 3º à direita; o do meio é o mais alto.
  expect(second?.x ?? 0).toBeLessThan(first?.x ?? 0);
  expect(first?.x ?? 0).toBeLessThan(third?.x ?? 0);
  expect(first?.height ?? 0).toBeGreaterThan(second?.height ?? 0);
  expect(second?.height ?? 0).toBeGreaterThan(third?.height ?? 0);
});

test('a contagem até a virada da semana só existe na semana atual, com a frase para o leitor de tela', async ({
  page,
}) => {
  await page.goto('/ranking');
  const timer = page.getByTestId('week-countdown');
  await expect(timer).toHaveAttribute('role', 'timer');
  await expect(timer).toHaveAttribute('aria-label', /para a virada da semana/);
  // Os dígitos são rolos decorativos; o valor muda a cada segundo.
  const before = await timer.getAttribute('aria-label');
  await expect.poll(() => timer.getAttribute('aria-label')).not.toBe(before);

  const past = new Date(Date.parse(thisWeek()) - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  await page.goto(`/ranking?semana=${past}`);
  await expect(page.getByTestId('week-countdown')).toHaveCount(0);
});

test('a troca de posição é animada e ganha a seta só quando a leitura nova muda a ordem', async ({
  page,
  request,
}) => {
  const { high, low } = await tiedPair(request);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/ranking');
  // Sem troca nenhuma ainda, nenhuma seta: elas nunca nascem de simulação.
  await expect(page.getByTestId('ranking-move')).toHaveCount(0);

  // A de baixo joga mais e passa a de cima: dados novos de verdade, lidos de novo pela API.
  await play(request, { rounds: { steamIds: [low.steamId], count: 40 } });
  await expect(async () => {
    // A aba voltando à vista dispara a leitura na hora (de resto ela vem a cada 20 s).
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.getByTestId('ranking-move').first()).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 20_000 });

  const rowOf = (name: string) =>
    page.getByTestId('ranking-row').filter({ has: page.getByRole('link', { name }) });
  await expect(rowOf(low.name).getByTestId('ranking-move')).toHaveAttribute('data-direction', 'up');
  await expect(rowOf(high.name).getByTestId('ranking-move')).toHaveAttribute(
    'data-direction',
    'down',
  );
  await expect(page.getByTestId('ranking-live-status')).toHaveText('O Ranking foi atualizado.');
});

test('o jogador logado que está jogando agora ganha o pontinho no avatar e o chip ao lado do nome', async ({
  page,
  request,
}) => {
  const player = await createUnclaimedAccount(request, 'Presença Rank');
  await play(request, { rounds: { steamIds: [player.steamId], count: 60 } });
  await signInByRequest(page, player.steamId);
  await page.route('**/api/me/playing', (route) =>
    route.fulfill({
      json: {
        server: {
          id: randomUUID(),
          name: 'retake-1',
          showcaseName: null,
          mode: 'retake',
          map: 'de_mirage',
        },
      },
    }),
  );
  await expect(async () => {
    await page.goto('/ranking');
    await expect(page.locator('#minha-linha')).toHaveCount(1, { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });

  const own = page.locator('#minha-linha');
  await expect(own.getByTestId('presence-chip')).toHaveText('Jogando agora');
  // O estado vem escrito também para o leitor de tela (o pontinho sozinho não diz nada).
  await expect(own.locator('.sr-only', { hasText: 'Jogando agora' })).toHaveCount(1);

  // Quem não está jogando não leva chip.
  await page.unroute('**/api/me/playing');
  await page.route('**/api/me/playing', (route) => route.fulfill({ json: { server: null } }));
  await page.reload();
  await expect(page.locator('#minha-linha').getByTestId('presence-chip')).toHaveCount(0);
});
