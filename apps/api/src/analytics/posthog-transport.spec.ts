import { describe, expect, it, vi } from 'vitest';
import type { OutgoingEvent } from './analytics-transport.js';
import { PostHogTransport } from './posthog-transport.js';

const config = {
  apiKey: 'phc_teste',
  host: 'https://eu.i.posthog.com',
  apiHost: 'https://eu.posthog.com',
  erasure: { personalApiKey: 'phx_pessoal', projectId: '123' },
  flushMs: 5000,
};

const event = (n: number): OutgoingEvent => ({
  event: 'item_equipado',
  uuid: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  timestamp: '2026-10-20T12:00:00.000Z',
  properties: { distinct_id: 'conta-1', n },
});

const ok = () => new Response('{}', { status: 200 });

describe('PostHogTransport: envio', () => {
  it('manda a fila em lote para /batch/ da região UE, com a chave do projeto', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok());
    const transport = new PostHogTransport(config, fetchMock);
    transport.send(event(1));
    transport.send(event(2));

    await transport.flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://eu.i.posthog.com/batch/');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.api_key).toBe('phc_teste');
    expect(body.batch.map((e: OutgoingEvent) => e.uuid)).toEqual([event(1).uuid, event(2).uuid]);
    // Fila vazia: outro flush não manda nada.
    await transport.flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('o lote cheio sai sozinho, sem esperar o relógio', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok());
    const transport = new PostHogTransport(config, fetchMock);

    for (let i = 0; i < 100; i += 1) transport.send(event(i));
    await transport.flush();

    expect(fetchMock).toHaveBeenCalled();
    const sent = fetchMock.mock.calls.flatMap(
      ([, init]) => JSON.parse((init as RequestInit).body as string).batch,
    );
    expect(sent).toHaveLength(100);
  });

  it('com o PostHog fora, tenta de novo e descarta depois de 3 tentativas, sem nunca lançar erro', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('rede caiu'));
    const transport = new PostHogTransport(config, fetchMock);
    transport.send(event(1));

    await expect(transport.flush()).resolves.toBeUndefined();
    await expect(transport.flush()).resolves.toBeUndefined();
    await expect(transport.flush()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // Descartado: o quarto ciclo não tem o que mandar.
    await transport.flush();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('uma resposta de erro conta como falha, e o evento que vem depois ainda sai', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('x', { status: 500 }))
      .mockResolvedValue(ok());
    const transport = new PostHogTransport(config, fetchMock);
    transport.send(event(1));

    await transport.flush();
    transport.send(event(2));
    await transport.flush();

    const lastCall = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    const last = JSON.parse(lastCall[1].body as string);
    expect(last.batch.map((e: OutgoingEvent) => e.uuid)).toEqual([event(1).uuid, event(2).uuid]);
  });

  it('a fila tem teto: passou, o mais antigo é descartado (analytics não segura a API)', () => {
    // O envio fica pendurado (rede muito lenta): a fila só cresce.
    const hanging = vi.fn().mockReturnValue(new Promise(() => {}));
    const transport = new PostHogTransport(config, hanging);

    for (let i = 0; i < 2300; i += 1) transport.send(event(i));

    const queue = (transport as unknown as { queue: { event: OutgoingEvent }[] }).queue;
    expect(queue.length).toBeLessThanOrEqual(2000);
    expect(queue.at(-1)?.event.uuid).toBe(event(2299).uuid);
    expect(queue.some((q) => q.event.uuid === event(150).uuid)).toBe(false);
  });
});

describe('PostHogTransport: apagar a pessoa (S08)', () => {
  it('acha a pessoa pelo distinct_id e apaga com os eventos', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ results: [{ id: 42 }] }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const transport = new PostHogTransport(config, fetchMock);

    expect(await transport.erasePerson('conta-1')).toBe('removed');

    const [find, remove] = fetchMock.mock.calls as [[string, RequestInit], [string, RequestInit]];
    expect(find[0]).toBe('https://eu.posthog.com/api/projects/123/persons/?distinct_id=conta-1');
    expect((find[1].headers as Record<string, string>).authorization).toBe('Bearer phx_pessoal');
    expect(remove[0]).toBe(
      'https://eu.posthog.com/api/projects/123/persons/42/?delete_events=true',
    );
    expect(remove[1].method).toBe('DELETE');
  });

  it('quem nunca esteve no PostHog é "absent"; sem a chave de gestão ou com o PostHog fora, fica pendente', async () => {
    const empty = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ results: [] }), { status: 200 }));
    expect(await new PostHogTransport(config, empty).erasePerson('conta-1')).toBe('absent');

    const noCredentials = vi.fn();
    expect(
      await new PostHogTransport({ ...config, erasure: null }, noCredentials).erasePerson(
        'conta-1',
      ),
    ).toBe('pending');
    expect(noCredentials).not.toHaveBeenCalled();

    const down = vi.fn().mockRejectedValue(new Error('fora'));
    expect(await new PostHogTransport(config, down).erasePerson('conta-1')).toBe('pending');
    const refused = vi.fn().mockResolvedValue(new Response('no', { status: 403 }));
    expect(await new PostHogTransport(config, refused).erasePerson('conta-1')).toBe('pending');
  });
});
