import { ANALYTICS_EVENTS, ANALYTICS_PLAN_VERSION } from '@carmine/contracts/analytics';
import { describe, expect, it } from 'vitest';
import {
  CAPTURE_PATH,
  COOKIELESS_DISTINCT_ID,
  captureBody,
  cleanUtm,
  deviceOf,
  isBot,
  isCountedPath,
  pageViewOf,
  referrerLabel,
} from './analytics-page';

const view = (over: Partial<Parameters<typeof pageViewOf>[0]> = {}) =>
  pageViewOf({
    pathname: '/',
    search: '',
    referrer: '',
    siteHost: 'stcarmine.com',
    loggedIn: false,
    ...over,
  });

describe('a rota nunca é o caminho cru', () => {
  it('/10016?x=1#a vira a rota perfil e nenhum ID sai', () => {
    const properties = view({ pathname: '/10016', search: '?x=1' });

    expect(properties?.rota).toBe('perfil');
    expect(JSON.stringify(properties)).not.toContain('10016');
  });

  it('o SteamID64 no endereço também vira perfil, sem o número', () => {
    const properties = view({ pathname: '/76561198000000001' });

    expect(properties?.rota).toBe('perfil');
    expect(JSON.stringify(properties)).not.toContain('7656119');
  });

  it('as páginas do site viram a rota do plano; o que não se conhece vira outra', () => {
    const rota = (pathname: string) => view({ pathname })?.rota;

    expect(rota('/')).toBe('inicio');
    expect(rota('/ranking')).toBe('ranking');
    expect(rota('/settings/purchases/0b9f8c1e')).toBe('minhas_compras');
    expect(rota('/settings/data')).toBe('configuracoes');
    expect(rota('/nao-existe/ainda')).toBe('outra');
  });

  it('as propriedades batem com o contrato do pagina_vista', () => {
    const properties = view({
      pathname: '/ranking',
      search: '?modo=retake&utm_source=discord&utm_medium=post&utm_campaign=lancamento',
      referrer: 'https://discord.com/channels/1/2',
      loggedIn: true,
    });

    expect(ANALYTICS_EVENTS.pagina_vista.properties.parse(properties)).toEqual(properties);
    expect(properties).toEqual({
      rota: 'ranking',
      modo: 'retake',
      logado: true,
      referenciador: 'discord.com',
      utm_source: 'discord',
      utm_medium: 'post',
      utm_campaign: 'lancamento',
    });
  });
});

describe('onde não conta', () => {
  it('/staff, /dev, /healthz e /api (com o que vem abaixo) não contam; o resto do site, sim', () => {
    for (const path of [
      '/staff',
      '/staff/contas/10016',
      '/dev',
      '/dev/pagamento/x',
      '/healthz',
      '/api/me',
    ]) {
      expect(isCountedPath(path), path).toBe(false);
      expect(view({ pathname: path }), path).toBeNull();
    }
    for (const path of ['/', '/ranking', '/10016', '/staffing', '/devs', '/settings']) {
      expect(isCountedPath(path), path).toBe(true);
    }
  });
});

describe('o modo', () => {
  it('só vale no Ranking, e só retake ou deathmatch', () => {
    expect(view({ pathname: '/ranking', search: '?modo=deathmatch' })?.modo).toBe('deathmatch');
    expect(view({ pathname: '/ranking', search: '?modo=qualquer' })?.modo).toBeNull();
    expect(view({ pathname: '/ranking' })?.modo).toBeNull();
    expect(view({ pathname: '/loadout', search: '?modo=retake' })?.modo).toBeNull();
  });
});

describe('o referenciador', () => {
  it('é o domínio, "direto" sem referenciador e "interno" do próprio site', () => {
    expect(referrerLabel('', 'stcarmine.com')).toBe('direto');
    expect(referrerLabel('https://www.google.com/search?q=carmine+cs2', 'stcarmine.com')).toBe(
      'google.com',
    );
    expect(referrerLabel('https://stcarmine.com/ranking?modo=retake', 'stcarmine.com')).toBe(
      'interno',
    );
    expect(referrerLabel('https://www.stcarmine.com/', 'stcarmine.com')).toBe('interno');
    expect(referrerLabel('http://localhost:3000/ranking', 'localhost:3000')).toBe('interno');
  });

  it('nunca leva caminho, consulta nem texto ilegível, e cabe em 80 caracteres', () => {
    expect(referrerLabel('isto não é uma URL', 'stcarmine.com')).toBe('direto');
    expect(referrerLabel('https://exemplo.com/a/b?token=segredo#x', 'stcarmine.com')).toBe(
      'exemplo.com',
    );
    const long = `https://${'a'.repeat(100)}.com/`;
    expect(referrerLabel(long, 'stcarmine.com').length).toBeLessThanOrEqual(80);
  });
});

describe('os utm', () => {
  it('só [a-z0-9_-] até 40 caracteres; o resto vira null', () => {
    expect(cleanUtm('discord')).toBe('discord');
    expect(cleanUtm('lancamento_2026-10')).toBe('lancamento_2026-10');
    expect(cleanUtm(null)).toBeNull();
    expect(cleanUtm('')).toBeNull();
    expect(cleanUtm('Discord')).toBeNull();
    expect(cleanUtm('com espaço')).toBeNull();
    expect(cleanUtm('76561198000000001@x.com')).toBeNull();
    expect(cleanUtm('a'.repeat(41))).toBeNull();
    expect(cleanUtm('a'.repeat(40))).toBe('a'.repeat(40));
  });

  it('um utm sujo no endereço não sai', () => {
    const properties = view({
      pathname: '/',
      search: '?utm_source=Sujo%20Demais&utm_medium=ok&utm_campaign=<script>',
    });

    expect(properties?.utm_source).toBeNull();
    expect(properties?.utm_medium).toBe('ok');
    expect(properties?.utm_campaign).toBeNull();
  });
});

describe('o aparelho, em famílias e nunca o agente cru', () => {
  const CHROME_WIN =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
  const FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';
  const SAFARI_MAC =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
  const CHROME_ANDROID =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
  const SAFARI_IPHONE =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  const EDGE_WIN = `${CHROME_WIN} Edg/130.0.0.0`;
  const ANDROID_TABLET =
    'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

  it('reconhece os navegadores e sistemas comuns', () => {
    expect(deviceOf(CHROME_WIN, false)).toEqual({
      $browser: 'Chrome',
      $os: 'Windows',
      $device_type: 'Desktop',
    });
    expect(deviceOf(EDGE_WIN, false).$browser).toBe('Microsoft Edge');
    expect(deviceOf(FIREFOX_LINUX, false)).toEqual({
      $browser: 'Firefox',
      $os: 'Linux',
      $device_type: 'Desktop',
    });
    expect(deviceOf(SAFARI_MAC, false)).toEqual({
      $browser: 'Safari',
      $os: 'Mac OS X',
      $device_type: 'Desktop',
    });
    expect(deviceOf(CHROME_ANDROID, true)).toEqual({
      $browser: 'Chrome',
      $os: 'Android',
      $device_type: 'Mobile',
    });
    expect(deviceOf(SAFARI_IPHONE, true)).toEqual({
      $browser: 'Safari',
      $os: 'iOS',
      $device_type: 'Mobile',
    });
  });

  it('o iPad (que se anuncia como Mac) e o tablet Android são Tablet', () => {
    expect(deviceOf(SAFARI_MAC, true)).toEqual({
      $browser: 'Safari',
      $os: 'iOS',
      $device_type: 'Tablet',
    });
    expect(deviceOf(ANDROID_TABLET, true).$device_type).toBe('Tablet');
  });

  it('o que não se reconhece vira Other, sem repetir o agente', () => {
    const device = deviceOf('AlgoEstranho/1.0 (id=76561198000000001)', false);

    expect(device.$browser).toBe('Other');
    expect(device.$os).toBe('Other');
    expect(JSON.stringify(device)).not.toContain('7656119');
  });
});

describe('robôs', () => {
  it('navegador automatizado e agentes de robô não contam; um Chrome comum conta', () => {
    const chrome =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

    expect(isBot(chrome, false)).toBe(false);
    expect(isBot(chrome, true)).toBe(true);
    for (const agent of [
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/130.0.0.0 Safari/537.36',
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (compatible; bingbot/2.0)',
      'curl/8.4.0',
      'Chrome-Lighthouse',
    ]) {
      expect(isBot(agent, false), agent).toBe(true);
    }
  });
});

describe('o corpo do pedido de captura é montado do zero', () => {
  const body = () =>
    captureBody({
      key: 'phc_x',
      view: pageViewOf({
        pathname: '/10016',
        search: '?x=1&utm_source=Sujo',
        referrer: 'https://discord.com/channels/1/2',
        siteHost: 'stcarmine.com',
        loggedIn: true,
      }) as NonNullable<ReturnType<typeof pageViewOf>>,
      device: { $browser: 'Chrome', $os: 'Windows', $device_type: 'Desktop' },
      planVersion: ANALYTICS_PLAN_VERSION,
      environment: 'producao',
      uuid: '0198a1b2-0000-7000-8000-000000000001',
      at: new Date('2026-10-28T12:00:00.000Z'),
    });

  it('leva só o evento, o identificador anônimo do modo sem cookies e as propriedades do plano', () => {
    const sent = body();

    expect(CAPTURE_PATH).toBe('/i/v0/e/');
    expect(sent).toMatchObject({
      api_key: 'phc_x',
      event: 'pagina_vista',
      distinct_id: COOKIELESS_DISTINCT_ID,
      timestamp: '2026-10-28T12:00:00.000Z',
    });
    expect(Object.keys(sent.properties).sort()).toEqual(
      [
        'token',
        'rota',
        'modo',
        'logado',
        'referenciador',
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'versao_plano',
        'ambiente',
        'origem_evento',
        '$browser',
        '$os',
        '$device_type',
        '$lib',
        '$lib_version',
        '$insert_id',
        '$cookieless_mode',
        '$process_person_profile',
      ].sort(),
    );
    expect(sent.properties).toMatchObject({
      rota: 'perfil',
      logado: true,
      referenciador: 'discord.com',
      utm_source: null,
      versao_plano: ANALYTICS_PLAN_VERSION,
      ambiente: 'producao',
      origem_evento: 'web',
      $cookieless_mode: true,
      $process_person_profile: false,
    });
  });

  it('as propriedades batem com o contrato do pagina_vista', () => {
    const { rota, modo, logado, referenciador, utm_source, utm_medium, utm_campaign } =
      body().properties;

    expect(
      ANALYTICS_EVENTS.pagina_vista.properties.parse({
        rota,
        modo,
        logado,
        referenciador,
        utm_source,
        utm_medium,
        utm_campaign,
      }),
    ).toEqual({ rota, modo, logado, referenciador, utm_source, utm_medium, utm_campaign });
  });

  it('a URL crua, o ID, o referenciador cru e o agente do navegador não saem', () => {
    const text = JSON.stringify(body());

    for (const forbidden of [
      '10016',
      'stcarmine.com',
      'channels/1/2',
      'Mozilla',
      'Sujo',
      '$current_url',
      '$pathname',
      '$host',
      '$referrer',
      '$raw_user_agent',
    ]) {
      expect(text, forbidden).not.toContain(forbidden);
    }
  });

  it('nenhuma identidade da Conta: o id é o do modo sem cookies e não há pessoa', () => {
    const sent = body();

    expect(sent.distinct_id).toBe('$posthog_cookieless');
    expect(sent.properties.$process_person_profile).toBe(false);
    expect(sent).not.toHaveProperty('$set');
  });
});
