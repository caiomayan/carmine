import { describe, expect, it } from 'vitest';
import {
  classificaPasso,
  ehProducao,
  limiteDoGrupo,
  rotasSemRequisicao,
  tabelaDoGrupo,
} from '../lib/escada.mjs';

const resultado = (extra = {}) => ({
  ok: true,
  abortouPelaSonda: false,
  violados: [],
  metricas: {
    'http_req_duration{scenario:carga,endpoint:eventos}': { contagem: 10, p95: 123.4, p99: 200 },
    'http_req_failed{scenario:carga}': { taxa: 0.005 },
    'http_reqs{scenario:carga}': { taxa: 12.34 },
  },
  ...extra,
});

describe('escada do teste de carga', () => {
  it('classifica pelo código de saída do k6 e pelo resultado', () => {
    expect(classificaPasso({ codigoDeSaida: 0, resultado: resultado() })).toBe('ok');
    expect(
      classificaPasso({ codigoDeSaida: 99, resultado: resultado({ ok: false, violados: ['x'] }) }),
    ).toBe('limite');
    expect(
      classificaPasso({ codigoDeSaida: 108, resultado: resultado({ abortouPelaSonda: true }) }),
    ).toBe('producao');
    // Sonda abortou e o k6 saiu 0 por algum motivo: o JSON manda.
    expect(
      classificaPasso({ codigoDeSaida: 0, resultado: resultado({ abortouPelaSonda: true }) }),
    ).toBe('producao');
    expect(classificaPasso({ codigoDeSaida: 107, resultado: null })).toBe('erro');
    expect(classificaPasso({ codigoDeSaida: 0, resultado: null })).toBe('erro');
    expect(classificaPasso({ codigoDeSaida: 7, resultado: resultado() })).toBe('erro');
  });

  it('acha o último passo que aguentou e o que estourou', () => {
    const passos = [
      { passo: 10, classe: 'ok' },
      { passo: 25, classe: 'ok' },
      { passo: 50, classe: 'limite' },
    ];
    expect(limiteDoGrupo(passos)).toEqual({ aguentou: 25, estourou: 50 });
    expect(limiteDoGrupo([{ passo: 10, classe: 'limite' }])).toEqual({
      aguentou: null,
      estourou: 10,
    });
    expect(limiteDoGrupo([{ passo: 10, classe: 'ok' }])).toEqual({ aguentou: 10, estourou: null });
  });

  it('monta a tabela com p95 por rota, erros e req/s', () => {
    const tabela = tabelaDoGrupo('coleta', [{ passo: 10, classe: 'ok', resultado: resultado() }]);
    expect(tabela).toContain('| Passo | Resultado | Req/s | Erros | p95 eventos |');
    expect(tabela).toContain('| 10 | dentro do limite | 12.3 | 0.50% | 123 ms |');
  });
});

describe('guarda contra a produção', () => {
  it('recusa a produção, o www, o host da sonda e URL inválida; aceita homologação e local', () => {
    expect(ehProducao('https://stcarmine.com', 'https://stcarmine.com')).toBe(true);
    expect(ehProducao('https://STCARMINE.com/', undefined)).toBe(true);
    expect(ehProducao('https://www.stcarmine.com', undefined)).toBe(true);
    expect(ehProducao('https://outro.exemplo', 'https://outro.exemplo')).toBe(true);
    expect(ehProducao(undefined, undefined)).toBe(true);
    expect(ehProducao('não é url', undefined)).toBe(true);
    expect(ehProducao('https://dev.stcarmine.com', 'https://stcarmine.com')).toBe(false);
    expect(ehProducao('http://localhost:3333', undefined)).toBe(false);
  });
});

describe('rota esperada sem requisição', () => {
  const metricas = (contagens: Record<string, number>) =>
    Object.fromEntries(
      Object.entries(contagens).map(([rota, contagem]) => [
        `http_reqs{scenario:carga,endpoint:${rota}}`,
        { contagem },
      ]),
    );

  it('aponta a rota com 0 requisições ou sem contador (o p95 0 ms do Perfil na rodada 1)', () => {
    const api = metricas({ me: 40, servidores: 40, ranking: 40, perfil: 0 });
    expect(rotasSemRequisicao(api, 'api')).toEqual(['perfil']);
    expect(rotasSemRequisicao({}, 'paginas')).toEqual(['home', 'ranking', 'perfil']);
    expect(rotasSemRequisicao(metricas({ eventos: 3, batimento: 3 }), 'coleta')).toEqual([]);
  });

  it('o passo vira defeito do roteiro, não limite nem ok', () => {
    const r = resultado({ ok: false, violados: ['x'], semRequisicao: ['perfil'] });
    expect(classificaPasso({ codigoDeSaida: 0, resultado: r })).toBe('erro');
    expect(classificaPasso({ codigoDeSaida: 99, resultado: r })).toBe('erro');
  });
});
