import { ANALYTICS_EVENTS, ANALYTICS_PLAN_VERSION } from '@carmine/contracts/analytics';
import { describe, expect, it } from 'vitest';
import {
  cleanUtm,
  commonProperties,
  isCountedPath,
  pageViewOf,
  referrerLabel,
  sanitizeEvent,
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
    expect(rota('/configuracoes/compras/0b9f8c1e')).toBe('minhas_compras');
    expect(rota('/configuracoes/dados')).toBe('configuracoes');
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
    for (const path of ['/', '/ranking', '/10016', '/staffing', '/devs', '/configuracoes']) {
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

describe('o que a biblioteca anexa ao evento', () => {
  const raw = {
    event: 'pagina_vista',
    uuid: '0198a1b2-0000-7000-8000-000000000001',
    timestamp: '2026-10-28T01:00:00.000Z',
    $set: { email: 'a@b.c' },
    properties: {
      // O que a biblioteca coloca sozinha (do payload real do posthog-js em modo sem cookies).
      $current_url: 'https://stcarmine.com/10016?x=1#a',
      $pathname: '/10016',
      $host: 'stcarmine.com',
      $referrer: 'https://discord.com/channels/1/2',
      $referring_domain: 'discord.com',
      $raw_user_agent: 'Mozilla/5.0 ...',
      $timezone: 'America/Sao_Paulo',
      $screen_width: 1920,
      $viewport_width: 1280,
      $lib_custom_api_host: 'https://eu.i.posthog.com',
      utm_source: 'Sujo',
      gclid: 'abc',
      fbclid: 'def',
      $os: 'Windows',
      $browser: 'Chrome',
      $device_type: 'Desktop',
      $lib: 'web',
      $lib_version: '1.438.9',
      $insert_id: 'x1',
      $time: 1793149769.4,
      $cookieless_mode: true,
      $process_person_profile: false,
      distinct_id: '$posthog_cookieless',
      token: 'phc_x',
      // As nossas.
      ...view({ pathname: '/10016' }),
      ...commonProperties({ planVersion: ANALYTICS_PLAN_VERSION, environment: 'producao' }),
    },
  };

  it('só o pagina_vista sai, com as propriedades do plano mais as da biblioteca que o PostHog precisa', () => {
    const clean = sanitizeEvent(raw);

    expect(Object.keys(clean?.properties ?? {}).sort()).toEqual(
      [
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
        '$os',
        '$browser',
        '$device_type',
        '$lib',
        '$lib_version',
        '$insert_id',
        '$time',
        '$cookieless_mode',
        '$process_person_profile',
        'distinct_id',
        'token',
      ].sort(),
    );
    expect(clean?.properties?.utm_source).toBeNull();
    expect(clean?.properties?.rota).toBe('perfil');
    expect(clean?.properties?.origem_evento).toBe('web');
    expect(clean?.properties?.versao_plano).toBe(ANALYTICS_PLAN_VERSION);
  });

  it('a URL crua, o ID, o referenciador cru e o agente do navegador não saem', () => {
    const text = JSON.stringify(sanitizeEvent(raw));

    for (const forbidden of [
      '10016',
      '/10016',
      'stcarmine.com',
      'channels/1/2',
      'Mozilla',
      'gclid',
      'Sujo',
    ]) {
      expect(text, forbidden).not.toContain(forbidden);
    }
    expect(sanitizeEvent(raw)).not.toHaveProperty('$set');
  });

  it('qualquer outro evento é descartado', () => {
    for (const event of [
      '$pageview',
      '$autocapture',
      '$feature_flag_called',
      '$exception',
      '$snapshot',
    ]) {
      expect(sanitizeEvent({ ...raw, event })).toBeNull();
    }
    expect(sanitizeEvent(null)).toBeNull();
  });
});
