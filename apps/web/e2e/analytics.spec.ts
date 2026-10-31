import type { BrowserContext, Page, Route } from '@playwright/test';
import { createUnclaimedAccount, csrfToken, signInByRequest } from './accounts';
import { axeViolations, expect, saveTheme, test, WIDTHS } from './fixtures';

/**
 * A contagem de páginas (A1d, `pagina_vista`) e a chave "Participar da análise de uso". Roda no web com
 * `POSTHOG_API_KEY` (o projeto `analytics`, ver playwright.config.ts); o PostHog é um host de mentira que o teste
 * intercepta, então nada sai da máquina. O Chromium do Playwright se anuncia como robô (`navigator.webdriver` e o agente
 * `HeadlessChrome`), e o cliente não conta robôs: o teste esconde isso para a contagem rodar como num navegador de verdade.
 */

const POSTHOG = 'http://posthog.e2e.test';
/** O agente de um Chrome comum: o cliente descarta robôs, e o do Chromium de teste se anuncia como um. */
const CHROME_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

test.use({ userAgent: CHROME_AGENT });
const MAIN_WEB = `http://localhost:${process.env.WEB_E2E_PORT ?? 3000}`;
const NOT_FOUND = /404 \(Not Found\)/;

type Sent = { event: string; distinct_id?: string; properties: Record<string, unknown> };

/** O texto do corpo do pedido (o cliente manda JSON puro). */
function bodyText(buffer: Buffer): string {
  return buffer.toString('utf8');
}

/** O que o cliente mandou ao PostHog, desembrulhado em eventos. */
function eventsOf(buffer: Buffer | null): Sent[] {
  if (!buffer) return [];
  try {
    const body = JSON.parse(bodyText(buffer)) as { batch?: Sent[] } | Sent[] | Sent;
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
  const requests: { events: Sent[]; afterLoad: boolean; url: string; credentials: boolean }[] = [];
  const log: string[] = [];
  let loaded = false;
  page.on('console', (message) =>
    log.push(`console.${message.type()}: ${message.text().slice(0, 300)}`),
  );
  page.on('pageerror', (error) => log.push(`pageerror: ${error.message.slice(0, 300)}`));
  page.on('requestfailed', (request) =>
    log.push(`falhou: ${request.url().slice(0, 160)} ${request.failure()?.errorText ?? ''}`),
  );
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
    const body = route.request().postDataBuffer();
    log.push(
      `pedido ${route.request().method()} ${route.request().url().slice(0, 120)} corpo=${body ? body.length : 'nulo'} início=${body ? body.subarray(0, 24).toString('hex') : ''}`,
    );
    requests.push({
      events: eventsOf(body),
      afterLoad: loaded,
      url: route.request().url(),
      credentials: 'cookie' in route.request().headers(),
    });
    return route.fulfill({ status: 200, headers, json: { status: 1 } });
  });
  return {
    requests,
    log,
    events: () => requests.flatMap((request) => request.events),
    /** Zera o que já chegou (a página seguinte conta de novo desde o zero). */
    reset: () => {
      requests.length = 0;
      loaded = false;
    },
  };
}

const views = (sent: Sent[]) => sent.filter((event) => event.event === 'pagina_vista');

/** Espera `count` páginas vistas; se não chegarem, a falha traz o que a página e o PostHog de mentira viram. */
async function waitForViews(posthog: Awaited<ReturnType<typeof watchPostHog>>, count: number) {
  try {
    await expect.poll(() => views(posthog.events()).length, { timeout: 20_000 }).toBe(count);
  } catch (error) {
    throw new Error(
      [
        `esperava ${count} pagina_vista, vieram ${views(posthog.events()).length} (${posthog.requests.length} pedidos)`,
        ...posthog.log,
      ].join('\n'),
      { cause: error },
    );
  }
}

/** Dá tempo de sobra (o cliente espera o ocioso do navegador, até 4 s) para provar que NADA foi enviado. */
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
    await waitForViews(posthog, 1);

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
      $cookieless_mode: true,
      $process_person_profile: false,
      $browser: 'Chrome',
      $os: 'Windows',
      $device_type: 'Desktop',
    });
    // O identificador anônimo do modo sem cookies, no endpoint de captura, sem cookie nenhum no pedido.
    expect(view?.distinct_id).toBe('$posthog_cookieless');
    expect(posthog.requests.map((request) => new URL(request.url).pathname)).toEqual(['/i/v0/e/']);
    expect(posthog.requests.some((request) => request.credentials)).toBe(false);
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
    await waitForViews(posthog, 2);
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
    await waitForViews(posthog, 1);

    expect(views(posthog.events())[0]?.properties.rota).toBe('perfil');
    expect(JSON.stringify(posthog.events())).not.toContain(String(owner.publicId));
    expect(JSON.stringify(posthog.events())).not.toContain(owner.steamId);
  });

  test('sem cookies nem nada guardado no aparelho', async ({ page }) => {
    const posthog = await watchPostHog(page);

    await page.goto('/');
    await waitForViews(posthog, 1);

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
    await waitForViews(posthog, 1);
    expect(views(posthog.events())[0]?.properties).toMatchObject({ rota: 'ranking', logado: true });

    // Desligou: nem a página nova conta, e nada é enviado.
    await setParticipation(false);
    posthog.reset();
    await page.goto('/inventory');
    await page.waitForTimeout(FLUSH_MS);
    expect(posthog.requests).toEqual([]);

    await setParticipation(true);
    await page.goto('/loadout');
    await waitForViews(posthog, 1);
    expect(views(posthog.events())[0]?.properties.rota).toBe('loadout');
  });

  test('o interruptor em Configurações muda na hora, para a contagem e volta atrás se a API recusar', async ({
    page,
    request,
    expectedConsoleErrors,
  }) => {
    // A recusa da API (500) é provocada de propósito mais abaixo.
    expectedConsoleErrors.push(/status of 500/);
    const account = await createUnclaimedAccount(request, 'Analytics Interruptor');
    await signInByRequest(page, account.steamId);
    const posthog = await watchPostHog(page);

    await page.goto('/settings/data');
    const setting = page.getByTestId('analytics-setting');
    await expect(setting).toContainText('Participar da análise de uso');
    await expect(setting).toContainText('direito de se opor');
    const toggle = page.getByTestId('analytics-switch');
    await expect(toggle).toBeChecked();
    // A contagem da própria página de Configurações entra primeiro (ligada por padrão).
    await waitForViews(posthog, 1);

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
    await page.goto('/settings/data');
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
        await page.goto('/settings/data');
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
