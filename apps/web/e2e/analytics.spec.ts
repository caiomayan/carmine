import { gunzipSync } from 'node:zlib';
import type { BrowserContext, Page, Route } from '@playwright/test';
import { createUnclaimedAccount, csrfToken, signInByRequest } from './accounts';
import { axeViolations, expect, saveTheme, test, WIDTHS } from './fixtures';

/**
 * A contagem de páginas (A1d, `pagina_vista`) e a chave "Participar da análise de uso". Roda no web com
 * `POSTHOG_API_KEY` (o projeto `analytics`, ver playwright.config.ts); o PostHog é um host de mentira que o teste
 * intercepta, então nada sai da máquina. O Chromium do Playwright se anuncia como robô (`navigator.webdriver`), e a
 * biblioteca não conta robôs: o teste esconde isso para a contagem rodar como num navegador de verdade.
 */

const POSTHOG = 'http://posthog.e2e.test';
const MAIN_WEB = `http://localhost:${process.env.WEB_E2E_PORT ?? 3000}`;
const NOT_FOUND = /404 \(Not Found\)/;

type Sent = { event: string; properties: Record<string, unknown> };

/** O que a biblioteca mandou ao PostHog (o corpo vem em gzip), desembrulhado em eventos. */
function eventsOf(route: Route): Sent[] {
  const buffer = route.request().postDataBuffer();
  if (!buffer) return [];
  const text = (buffer[0] === 0x1f && buffer[1] === 0x8b ? gunzipSync(buffer) : buffer).toString(
    'utf8',
  );
  try {
    const body = JSON.parse(text) as { batch?: Sent[] } | Sent[] | Sent;
    if (Array.isArray(body)) return body;
    if ('batch' in body && body.batch) return body.batch;
    return 'event' in body ? [body] : [];
  } catch {
    return [];
  }
}

/** Intercepta o PostHog do E2E e guarda cada pedido (com a ordem em relação ao `load` da página). */
async function watchPostHog(page: Page) {
  const context: BrowserContext = page.context();
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });
  const requests: { events: Sent[]; afterLoad: boolean }[] = [];
  let loaded = false;
  page.on('load', () => {
    loaded = true;
  });
  await context.route(`${POSTHOG}/**`, async (route) => {
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
    };
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers });
    }
    requests.push({ events: eventsOf(route), afterLoad: loaded });
    return route.fulfill({ status: 200, headers, json: { status: 1 } });
  });
  return {
    requests,
    events: () => requests.flatMap((request) => request.events),
    /** Zera o que já chegou (a página seguinte conta de novo desde o zero). */
    reset: () => {
      requests.length = 0;
      loaded = false;
    },
  };
}

const views = (sent: Sent[]) => sent.filter((event) => event.event === 'pagina_vista');

/** A biblioteca junta os eventos e manda a cada ~3 s: dá a volta toda para provar que NADA foi enviado. */
const FLUSH_MS = 5000;

test.describe('contagem de páginas', () => {
  test.beforeEach(({ expectedConsoleErrors }) => {
    expectedConsoleErrors.push(NOT_FOUND);
  });

  test('o visitante conta uma vez por navegação, só depois do load, com a URL reescrita', async ({
    page,
  }) => {
    const posthog = await watchPostHog(page);

    await page.goto('/ranking?modo=retake&utm_source=discord&utm_campaign=Sujo%20Demais', {
      referer: 'https://discord.com/channels/1/2',
    });
    await expect.poll(() => views(posthog.events()).length, { timeout: 20_000 }).toBe(1);

    const [view] = views(posthog.events());
    expect(view?.properties).toMatchObject({
      rota: 'ranking',
      modo: 'retake',
      logado: false,
      referenciador: 'discord.com',
      utm_source: 'discord',
      utm_medium: null,
      utm_campaign: null,
      versao_plano: '1.0',
      ambiente: 'staging',
      origem_evento: 'web',
    });
    // Nada de URL crua, ID, referenciador cru nem agente do navegador.
    const text = JSON.stringify(posthog.events());
    for (const forbidden of [
      '$current_url',
      '$pathname',
      '$host',
      '$referrer',
      '$raw_user_agent',
      '/ranking',
      'channels/1/2',
    ]) {
      expect(text, forbidden).not.toContain(forbidden);
    }
    // Só depois da carga da página, e fora dela: nenhum pedido ao PostHog antes do `load`.
    expect(posthog.requests.every((request) => request.afterLoad)).toBe(true);

    // Navegar dentro do site conta de novo, uma vez, como "interno".
    await page
      .getByRole('navigation', { name: 'Principal' })
      .getByRole('link', { name: 'Jogar' })
      .click();
    await expect.poll(() => views(posthog.events()).length, { timeout: 20_000 }).toBe(2);
    expect(views(posthog.events())[1]?.properties).toMatchObject({
      rota: 'inicio',
      modo: null,
      referenciador: 'interno',
    });
    await page.waitForTimeout(FLUSH_MS);
    expect(views(posthog.events())).toHaveLength(2);
  });

  test('o Perfil conta como "perfil", sem o ID público', async ({ page, request }) => {
    const owner = await createUnclaimedAccount(request, 'Analytics Perfil');
    const posthog = await watchPostHog(page);

    await page.goto(`/${owner.publicId}?aba=x#ancora`);
    await expect.poll(() => views(posthog.events()).length, { timeout: 20_000 }).toBe(1);

    expect(views(posthog.events())[0]?.properties.rota).toBe('perfil');
    expect(JSON.stringify(posthog.events())).not.toContain(String(owner.publicId));
    expect(JSON.stringify(posthog.events())).not.toContain(owner.steamId);
  });

  test('sem cookies nem nada guardado no aparelho', async ({ page }) => {
    const posthog = await watchPostHog(page);

    await page.goto('/');
    await expect.poll(() => views(posthog.events()).length, { timeout: 20_000 }).toBe(1);

    expect(
      (await page.context().cookies()).filter((cookie) => /^ph_|posthog/i.test(cookie.name)),
    ).toEqual([]);
    const stored = await page.evaluate(() => [
      ...Object.keys(localStorage),
      ...Object.keys(sessionStorage),
    ]);
    expect(stored.filter((key) => /^ph_|posthog/i.test(key))).toEqual([]);
  });

  test('nunca em /staff nem /dev', async ({ page }) => {
    const posthog = await watchPostHog(page);

    for (const path of ['/staff', '/dev/qualquer-coisa']) {
      await page.goto(path);
    }
    await page.waitForTimeout(FLUSH_MS);

    expect(posthog.requests).toEqual([]);
  });

  test('a CSP deixa o navegador falar com o PostHog só neste web (o outro não muda)', async ({
    page,
    request,
  }) => {
    const here = await page.goto('/');
    expect(here?.headers()['content-security-policy']).toContain(`connect-src 'self' ${POSTHOG}`);

    const main = await request.get(`${MAIN_WEB}/`);
    expect(main.headers()['content-security-policy']).toContain("connect-src 'self';");
    expect(main.headers()['content-security-policy']).not.toContain('posthog');
  });
});

test.describe('quem está logado e a chave "Participar da análise de uso"', () => {
  test('desligada na API, a contagem para; ligada de novo, volta', async ({ page, request }) => {
    const account = await createUnclaimedAccount(request, 'Analytics Chave');
    await signInByRequest(page, account.steamId);
    const posthog = await watchPostHog(page);
    const setParticipation = async (participate: boolean) => {
      const response = await page.request.put('/api/me/analytics', {
        headers: { 'x-csrf-token': await csrfToken(page.context()) },
        data: { participate },
      });
      expect(response.status(), await response.text()).toBe(200);
    };

    // Ligada por padrão: o logado conta, com `logado: true`.
    await page.goto('/ranking');
    await expect.poll(() => views(posthog.events()).length, { timeout: 20_000 }).toBe(1);
    expect(views(posthog.events())[0]?.properties).toMatchObject({ rota: 'ranking', logado: true });

    // Desligou: nem a página nova conta, e nada é enviado.
    await setParticipation(false);
    posthog.reset();
    await page.goto('/inventario');
    await page.waitForTimeout(FLUSH_MS);
    expect(posthog.requests).toEqual([]);

    await setParticipation(true);
    await page.goto('/loadout');
    await expect.poll(() => views(posthog.events()).length, { timeout: 20_000 }).toBe(1);
    expect(views(posthog.events())[0]?.properties.rota).toBe('loadout');
  });

  test('o interruptor em Configurações muda na hora, para a contagem e volta atrás se a API recusar', async ({
    page,
    request,
  }) => {
    const account = await createUnclaimedAccount(request, 'Analytics Interruptor');
    await signInByRequest(page, account.steamId);
    const posthog = await watchPostHog(page);

    await page.goto('/configuracoes/dados');
    const setting = page.getByTestId('analytics-setting');
    await expect(setting).toContainText('Participar da análise de uso');
    await expect(setting).toContainText('direito de se opor');
    const toggle = page.getByTestId('analytics-switch');
    await expect(toggle).toBeChecked();
    // A contagem da própria página de Configurações entra primeiro (ligada por padrão).
    await expect.poll(() => views(posthog.events()).length, { timeout: 20_000 }).toBe(1);

    await toggle.click();
    await expect(page.getByTestId('analytics-status')).toHaveText(
      'Participação na análise de uso desativada.',
    );
    await expect(toggle).not.toBeChecked();
    // Persistiu na API.
    const saved = await page.request.get('/api/me/analytics');
    expect(await saved.json()).toEqual({ participate: false, enabled: true });
    // A navegação seguinte, dentro do site, já não conta.
    posthog.reset();
    await page.getByRole('link', { name: 'Compras' }).first().click();
    await page.waitForTimeout(FLUSH_MS);
    expect(posthog.requests).toEqual([]);

    // Recusa da API: volta ao que era e avisa.
    await page.goto('/configuracoes/dados');
    await page.route('**/api/me/analytics', (route) =>
      route.request().method() === 'PUT'
        ? route.fulfill({ status: 500, body: '{}' })
        : route.continue(),
    );
    await expect(toggle).not.toBeChecked();
    await toggle.click();
    await expect(page.getByText('Não deu para salvar agora')).toBeVisible();
    await expect(toggle).not.toBeChecked();
  });

  for (const theme of ['dark', 'light'] as const) {
    test(`a chave não tem violações do axe e cabe em 390 px (${theme})`, async ({
      page,
      request,
    }) => {
      const account = await createUnclaimedAccount(request, 'Analytics Acessibilidade');
      await signInByRequest(page, account.steamId);
      await saveTheme(page, theme);

      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto('/configuracoes/dados');
        await expect(page.getByTestId('analytics-setting')).toBeVisible();
        expect(await axeViolations(page), `${width}px`).toEqual([]);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          ),
          `${width}px`,
        ).toBe(0);
      }
    });
  }
});
