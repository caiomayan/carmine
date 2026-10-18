import { describe, expect, it, vi } from 'vitest';
import { createFormerIdsLookup } from './former-public-ids';

function setup(responses: Array<{ from: number; to: number }[] | Error>) {
  let now = 1_000;
  const fetchRedirects = vi.fn(async () => {
    const next = responses.shift() ?? [];
    if (next instanceof Error) throw next;
    return next;
  });
  const lookup = createFormerIdsLookup({
    fetchRedirects,
    ttlMs: 30_000,
    retryMs: 5_000,
    now: () => now,
  });
  return { lookup, fetchRedirects, advance: (ms: number) => (now += ms) };
}

describe('ID público antigo (S10)', () => {
  it('devolve o ID atual de um ID trocado por um reservado, e null para os demais', async () => {
    const { lookup } = setup([[{ from: 10_016, to: 7 }]]);

    expect(await lookup(10_016)).toBe(7);
    expect(await lookup(10_017)).toBeNull();
  });

  it('guarda a lista por um tempo, em vez de consultar a API a cada visita', async () => {
    const { lookup, fetchRedirects, advance } = setup([[{ from: 10_016, to: 7 }], []]);

    await lookup(10_016);
    advance(29_000);
    await lookup(10_016);
    expect(fetchRedirects).toHaveBeenCalledTimes(1);

    advance(2_000);
    expect(await lookup(10_016)).toBeNull();
    expect(fetchRedirects).toHaveBeenCalledTimes(2);
  });

  it('com a API fora, não redireciona nada e tenta de novo logo; mantém a lista anterior se havia', async () => {
    const down = new Error('API fora');
    const { lookup, fetchRedirects, advance } = setup([down, [{ from: 10_016, to: 7 }], down]);

    expect(await lookup(10_016)).toBeNull();
    advance(1_000);
    await lookup(10_016);
    expect(fetchRedirects).toHaveBeenCalledTimes(1);

    advance(5_000);
    expect(await lookup(10_016)).toBe(7);
    advance(31_000);
    // A API caiu na renovação: a última lista conhecida continua valendo.
    expect(await lookup(10_016)).toBe(7);
  });

  it('visitas simultâneas dividem uma só consulta', async () => {
    const { lookup, fetchRedirects } = setup([[{ from: 10_016, to: 7 }]]);

    const results = await Promise.all([lookup(10_016), lookup(10_016), lookup(5)]);

    expect(results).toEqual([7, 7, null]);
    expect(fetchRedirects).toHaveBeenCalledTimes(1);
  });
});
