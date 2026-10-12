export interface EventMessage {
  event: string;
  data: string;
}

export interface EventStream {
  headers: Headers;
  /** Comentários (`: ...`) e o `retry` recebidos até agora. */
  comments: string[];
  retry: number | null;
  /** O próximo evento; falha se não chegar em `timeoutMs`. */
  next(timeoutMs?: number): Promise<EventMessage>;
  /** Descarta eventos até um que satisfaça `match`. */
  until(match: (message: EventMessage) => boolean, timeoutMs?: number): Promise<EventMessage>;
  close(): void;
}

/** Um cliente SSE mínimo (o EventSource do navegador), lendo o stream com o `fetch` do Node. */
export async function openEventStream(url: string): Promise<EventStream> {
  const controller = new AbortController();
  const response = await fetch(url, { signal: controller.signal });
  if (!response.ok || !response.body) {
    throw new Error(`SSE ${url}: HTTP ${response.status}`);
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  const queue: EventMessage[] = [];
  const comments: string[] = [];
  let retry: number | null = null;
  let buffer = '';
  let wake = null as (() => void) | null;

  void (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        buffer += value;
        let end = buffer.indexOf('\n\n');
        while (end >= 0) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          let event = 'message';
          const data: string[] = [];
          for (const line of block.split('\n')) {
            if (line.startsWith(':')) comments.push(line.slice(1).trim());
            else if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
            else if (line.startsWith('retry:')) retry = Number(line.slice(6).trim());
          }
          if (data.length > 0) {
            queue.push({ event, data: data.join('\n') });
            wake?.();
          }
          end = buffer.indexOf('\n\n');
        }
      }
    } catch {
      // Fechado pelo teste.
    }
  })();

  async function next(timeoutMs = 3000): Promise<EventMessage> {
    const deadline = Date.now() + timeoutMs;
    while (queue.length === 0) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error(`Nenhum evento SSE em ${timeoutMs} ms`);
      await new Promise<void>((resolve) => {
        wake = resolve;
        setTimeout(resolve, remaining);
      });
      wake = null;
    }
    return queue.shift() as EventMessage;
  }

  return {
    headers: response.headers,
    comments,
    get retry() {
      return retry;
    },
    next,
    async until(match, timeoutMs = 3000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const message = await next(Math.max(1, deadline - Date.now()));
        if (match(message)) return message;
      }
    },
    close() {
      controller.abort();
    },
  };
}
