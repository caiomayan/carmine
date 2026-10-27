import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ANALYTICS_EVENT_NAMES,
  ANALYTICS_EVENTS,
  ANALYTICS_FORBIDDEN_PROPERTY,
  ANALYTICS_PLAN_VERSION,
  analyticsPreferenceInputSchema,
} from './analytics.js';

const plan = readFileSync(
  new URL('../../../docs/analytics/plano-de-eventos.md', import.meta.url),
  'utf8',
);

/** Os nomes em crase da tabela "1.3 Resumo" do plano, na ordem. */
function namesInPlan(): string[] {
  const section = plan.slice(plan.indexOf('### 1.3 Resumo'), plan.indexOf('## 2. Eventos'));
  return [...section.matchAll(/^\| \d+ \| `([a-z_]+)` \|/gm)].map((match) => match[1] as string);
}

describe('o plano de eventos em código', () => {
  it('tem exatamente os eventos da tabela do plano (mudar um sem o outro quebra a CI)', () => {
    expect([...ANALYTICS_EVENT_NAMES].sort()).toEqual([...namesInPlan()].sort());
    expect(namesInPlan()).toHaveLength(35);
  });

  it('a versão do plano em código é o MAJOR.MINOR do título do plano', () => {
    const title = /^# Plano de eventos · v(\d+)\.(\d+)\.\d+/m.exec(plan);
    expect(`${title?.[1]}.${title?.[2]}`).toBe(ANALYTICS_PLAN_VERSION);
  });

  it('os nomes seguem a convenção: snake_case, PT-BR, sem acento', () => {
    for (const name of ANALYTICS_EVENT_NAMES) expect(name).toMatch(/^[a-z]+(_[a-z0-9]+)*$/);
  });

  it('nenhum evento tem propriedade de dado proibido (SteamID64, ID público, nome, IP, chat, URL...)', () => {
    for (const name of ANALYTICS_EVENT_NAMES) {
      for (const key of Object.keys(ANALYTICS_EVENTS[name].properties.shape)) {
        expect(key, `${name}.${key}`).not.toMatch(ANALYTICS_FORBIDDEN_PROPERTY);
      }
    }
  });

  it('só `pagina_vista` vem do navegador, e só ela e as pré-login são anônimas', () => {
    const anonymous = ANALYTICS_EVENT_NAMES.filter(
      (n) => ANALYTICS_EVENTS[n].identity === 'anonymous',
    );
    expect(anonymous.sort()).toEqual(['login_falhou', 'login_iniciado', 'pagina_vista']);
    const web = ANALYTICS_EVENT_NAMES.filter((n) => ANALYTICS_EVENTS[n].origin === 'web');
    expect(web).toEqual(['pagina_vista']);
  });

  it('propriedade fora da lista é descartada, e o que falta é recusado', () => {
    const schema = ANALYTICS_EVENTS.preset_apagado.properties;

    expect(schema.parse({ era_ativo: true, total_presets_apos: 2, steam_id: '7656…' })).toEqual({
      era_ativo: true,
      total_presets_apos: 2,
    });
    expect(schema.safeParse({ era_ativo: true }).success).toBe(false);
    expect(schema.safeParse({ era_ativo: 'sim', total_presets_apos: 2 }).success).toBe(false);
  });

  it('as listas fechadas recusam valor novo e os inteiros respeitam os limites', () => {
    const connect = ANALYTICS_EVENTS.servidor_conectado.properties;
    const base = {
      modo: 'retake',
      servidor_codigo: 'SP·1',
      primeiro_connect: true,
      eh_vip: false,
      conta_reivindicada: true,
      itens_equipados: 3,
      reenvio: false,
    };

    expect(connect.safeParse(base).success).toBe(true);
    expect(connect.safeParse({ ...base, modo: 'competitivo' }).success).toBe(false);
    expect(connect.safeParse({ ...base, itens_equipados: -1 }).success).toBe(false);
    expect(
      ANALYTICS_EVENTS.sessao_de_jogo_encerrada.properties.safeParse({
        modo: 'retake',
        duracao_segundos: 86_401,
      }).success,
    ).toBe(false);
  });

  it('`utm_*` aceita só o formato do plano (minúsculas, até 40) ou null', () => {
    const page = ANALYTICS_EVENTS.pagina_vista.properties;
    const base = {
      rota: 'perfil',
      modo: null,
      logado: false,
      referenciador: 'discord.com',
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
    };

    expect(page.safeParse({ ...base, utm_source: 'meu-canal_1' }).success).toBe(true);
    expect(page.safeParse({ ...base, utm_source: 'Meu Canal' }).success).toBe(false);
    expect(page.safeParse({ ...base, rota: '/10016' }).success).toBe(false);
  });
});

describe('a chave "Participar da análise de uso"', () => {
  it('o corpo é só o booleano', () => {
    expect(analyticsPreferenceInputSchema.safeParse({ participate: false }).success).toBe(true);
    expect(analyticsPreferenceInputSchema.safeParse({}).success).toBe(false);
  });
});
