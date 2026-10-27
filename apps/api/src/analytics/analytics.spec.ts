import { ANALYTICS_PLAN_VERSION, ANALYTICS_UUID_NAMESPACE } from '@carmine/contracts/analytics';
import { describe, expect, it } from 'vitest';
import { Analytics, type AnalyticsParticipation } from './analytics.js';
import type { AnalyticsTransport, OutgoingEvent } from './analytics-transport.js';
import { uuidV5 } from './uuid-v5.js';

const ACCOUNT = '8f14e45f-ceea-467a-9575-cd8d7c5a2b11';
const OTHER = 'c4ca4238-a0b9-4382-a2f1-8e1c6f1d0a22';

class FakeTransport implements AnalyticsTransport {
  readonly mode = 'posthog' as const;
  readonly sent: OutgoingEvent[] = [];
  erased: string[] = [];
  throwOnSend = false;

  send(event: OutgoingEvent): void {
    if (this.throwOnSend) throw new Error('fila quebrada');
    this.sent.push(event);
  }

  async erasePerson(distinctId: string) {
    this.erased.push(distinctId);
    return 'removed' as const;
  }

  async flush(): Promise<void> {}
}

const participation = (optedOut: string[] = []): AnalyticsParticipation => ({
  participates: async (accountId) => !optedOut.includes(accountId),
});

/** O `capture` não espera o envio; cede o laço para o evento chegar ao transporte. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

function setup(optedOut: string[] = []) {
  const transport = new FakeTransport();
  return { transport, analytics: new Analytics(transport, participation(optedOut), 'staging') };
}

const equip = {
  tipo: 'arma',
  item_id: 7,
  slot: 'weapon_ak47',
  lados: 'ct',
  substituiu: false,
  preset_ativo: true,
  preset_principal: true,
} as const;

describe('Analytics.capture', () => {
  it('um evento de Conta sai com o ID interno, o horário do fato e as propriedades comuns do plano', async () => {
    const { transport, analytics } = setup();
    const at = new Date('2026-10-20T12:00:00.000Z');

    analytics.capture('item_equipado', { accountId: ACCOUNT, props: equip, at });
    await settle();

    expect(transport.sent).toHaveLength(1);
    const [event] = transport.sent;
    expect(event).toMatchObject({
      event: 'item_equipado',
      timestamp: '2026-10-20T12:00:00.000Z',
      properties: {
        distinct_id: ACCOUNT,
        ...equip,
        versao_plano: ANALYTICS_PLAN_VERSION,
        ambiente: 'staging',
        origem_evento: 'api',
        $geoip_disable: true,
      },
    });
    expect(event?.uuid).toMatch(/^[0-9a-f-]{36}$/);
    // Sem perfil de pessoa só nos anônimos.
    expect(event?.properties).not.toHaveProperty('$process_person_profile');
  });

  it('propriedade fora da lista é descartada, nunca enviada (SteamID64, nome, texto)', async () => {
    const { transport, analytics } = setup();

    analytics.capture('item_equipado', {
      accountId: ACCOUNT,
      props: { ...equip, steam_id: '76561198000000001', nome: 'Lia' } as typeof equip,
    });
    await settle();

    const properties = transport.sent[0]?.properties ?? {};
    expect(properties).not.toHaveProperty('steam_id');
    expect(properties).not.toHaveProperty('nome');
    expect(JSON.stringify(properties)).not.toContain('76561198000000001');
  });

  it('propriedades inválidas descartam o evento inteiro', async () => {
    const { transport, analytics } = setup();

    analytics.capture('preset_apagado', {
      accountId: ACCOUNT,
      props: { era_ativo: 'talvez', total_presets_apos: -3 } as never,
    });
    await settle();

    expect(transport.sent).toEqual([]);
  });

  it('o evento anônimo sai sem a Conta e sem perfil de pessoa, com um ID descartável', async () => {
    const { transport, analytics } = setup();

    analytics.capture('login_iniciado', { accountId: ACCOUNT, props: { destino: 'ranking' } });
    analytics.capture('login_iniciado', { props: { destino: 'inicio' } });
    await settle();

    expect(transport.sent).toHaveLength(2);
    for (const event of transport.sent) {
      expect(event.properties.$process_person_profile).toBe(false);
      expect(event.properties.distinct_id).not.toBe(ACCOUNT);
      expect(JSON.stringify(event)).not.toContain(ACCOUNT);
    }
    expect(transport.sent[0]?.properties.distinct_id).not.toBe(
      transport.sent[1]?.properties.distinct_id,
    );
  });

  it('quem desligou a chave "Participar da análise de uso" não envia nada, e as outras Contas seguem', async () => {
    const { transport, analytics } = setup([OTHER]);

    analytics.capture('item_equipado', { accountId: OTHER, props: equip });
    analytics.capture('item_equipado', { accountId: ACCOUNT, props: equip });
    await settle();

    expect(transport.sent.map((e) => e.properties.distinct_id)).toEqual([ACCOUNT]);
  });

  it('evento de Conta sem Conta não sai', async () => {
    const { transport, analytics } = setup();

    analytics.capture('item_equipado', { props: equip });
    await settle();

    expect(transport.sent).toEqual([]);
  });

  it('o ID natural dá sempre o mesmo uuid (reenviar não duplica); sem ele, é aleatório', async () => {
    const { transport, analytics } = setup();
    const props = { motivo: 'cheat', modo: 'retake' } as const;

    analytics.capture('denuncia_enviada', { accountId: ACCOUNT, props, naturalId: 'denuncia-1' });
    analytics.capture('denuncia_enviada', { accountId: ACCOUNT, props, naturalId: 'denuncia-1' });
    analytics.capture('denuncia_enviada', { accountId: ACCOUNT, props });
    analytics.capture('denuncia_enviada', { accountId: ACCOUNT, props });
    await settle();

    const uuids = transport.sent.map((e) => e.uuid);
    expect(uuids[0]).toBe(uuids[1]);
    expect(uuids[0]).toBe(uuidV5('denuncia_enviada:denuncia-1', ANALYTICS_UUID_NAMESPACE));
    expect(uuids[2]).not.toBe(uuids[3]);
  });

  it('sem transporte (sem chave do PostHog) não faz nada e diz que está desligada', async () => {
    const analytics = new Analytics(null, participation(), 'producao');

    expect(analytics.enabled).toBe(false);
    expect(() =>
      analytics.capture('item_equipado', { accountId: ACCOUNT, props: equip }),
    ).not.toThrow();
    expect(await analytics.erasePerson(ACCOUNT)).toBe('off');
  });

  it('um transporte que quebra nunca derruba quem emite', async () => {
    const { transport, analytics } = setup();
    transport.throwOnSend = true;

    expect(() =>
      analytics.capture('item_equipado', { accountId: ACCOUNT, props: equip }),
    ).not.toThrow();
    await settle();
    // Nenhuma rejeição sem tratamento: o teste não falha por "unhandled rejection".
    expect(transport.sent).toEqual([]);
  });

  it('apagar a pessoa vai ao transporte com o ID interno da Conta', async () => {
    const { transport, analytics } = setup();

    expect(await analytics.erasePerson(ACCOUNT)).toBe('removed');
    expect(transport.erased).toEqual([ACCOUNT]);
  });
});
