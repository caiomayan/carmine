/*
 * Adaptado de app/viewer-api.client.ts do CS2 Inventory Simulator, © Ian Lucas, licença MIT
 * (ver LICENSE.md nesta pasta). Mudanças: sem a captura de quadros (não usamos), Item no formato
 * do contrato do Carmine e comentários em PT-BR.
 */
import type { Cs2Item } from '@carmine/contracts';
import { toViewerItem, type ViewerItem } from './viewer-src';

/** Namespace e versão do protocolo postMessage do viewer. */
const VIEWER_SOURCE = '3d.cstrike.app';
const VIEWER_PROTOCOL_VERSION = 1;

/** O que está selecionado no canvas: um sticker, o charm ou nada. */
export type ViewerSelection =
  | { kind: 'sticker'; index: number }
  | { kind: 'keychain'; index: number }
  | null;

/** Estado do viewer, no `getState` e no evento `change` (inclusive depois de arrastar). */
export interface ViewerState {
  item: ViewerItem;
  selection: ViewerSelection;
  activeSticker: number | null;
  schemaCount: number;
  keychainDefault?: { x: number; y: number; z: number } | null;
}

export type RateLimitScope = 'ip' | 'origin' | 'partner';

/** Por que o viewer não desenha o Item; qualquer um volta o editor para o 2D. */
export type ViewerUnsupportedReason =
  | 'weapon'
  | 'sticker'
  | 'keychain'
  | 'patch'
  | 'network'
  | 'webgl'
  | 'asset';

export interface ViewerEventMap {
  ready: { v: number };
  change: ViewerState;
  loading: { busy: boolean };
  rendered: { item: ViewerItem };
  rateLimited: { retryAfterMs: number; scope?: RateLimitScope };
  unsupported: { reason: ViewerUnsupportedReason };
}

interface Envelope {
  source: typeof VIEWER_SOURCE;
  v: number;
  id?: string;
  type: string;
  data?: unknown;
}

interface PendingReply {
  resolve: (data: ViewerState) => void;
  reject: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
}

/**
 * Cliente tipado do postMessage do viewer. Recebe o iframe; cuida do aperto de mão de
 * "pronto", guarda os comandos enviados antes disso, correlaciona as respostas de `getState`
 * e repassa os eventos. Chame `destroy()` quando o iframe sair da tela.
 */
export class ViewerApi extends EventTarget {
  readonly origin: string;
  isReady = false;
  lastState: ViewerState | undefined;

  private readonly iframe: HTMLIFrameElement;
  private destroyed = false;
  private queue: (() => void)[] = [];
  private readonly pending = new Map<string, PendingReply>();

  /** O iframe pode já ter carregado (cache) antes do listener: pede o "pronto" logo de cara. */
  constructor(iframe: HTMLIFrameElement, options?: { origin?: string }) {
    super();
    this.iframe = iframe;
    this.origin = options?.origin ?? new URL(iframe.src, window.location.href).origin;
    window.addEventListener('message', this.onMessage);
    iframe.addEventListener('load', this.onLoad);
    this.solicitReady();
  }

  /** Assina um evento do viewer; devolve a função que cancela. */
  on<K extends keyof ViewerEventMap>(
    type: K,
    listener: (data: ViewerEventMap[K]) => void,
  ): () => void {
    const handler = (event: Event) => listener((event as CustomEvent<ViewerEventMap[K]>).detail);
    this.addEventListener(type, handler);
    return () => this.removeEventListener(type, handler);
  }

  setItem(item: Cs2Item): void {
    this.send('setItem', { item: toViewerItem(item) });
  }

  setActiveSticker(data: { index: number | null }): void {
    this.send('setActiveSticker', data);
  }

  setSelection(data: { selection: ViewerSelection }): void {
    this.send('setSelection', data);
  }

  highlightSticker(data: { index: number }): void {
    this.send('highlightSticker', data);
  }

  /** Estado atual do viewer; recusa se não responder em `timeoutMs` (contado após o "pronto"). */
  getState(timeoutMs = 5000): Promise<ViewerState> {
    const id = crypto.randomUUID();
    return new Promise<ViewerState>((resolve, reject) => {
      if (this.destroyed) {
        reject(new Error('ViewerApi: destroyed.'));
        return;
      }
      const entry: PendingReply = { resolve, reject };
      this.pending.set(id, entry);
      this.enqueue(() => {
        if (this.destroyed) return;
        entry.timer = setTimeout(() => {
          this.pending.delete(id);
          reject(new Error('ViewerApi: getState timed out.'));
        }, timeoutMs);
        this.post(this.envelope('getState', undefined, id));
      });
    });
  }

  /** Comando cru do protocolo; fica na fila até o "pronto", menos o `ping` (que o pede). */
  send(type: string, data?: unknown): void {
    const envelope = this.envelope(type, data);
    this.enqueue(() => this.post(envelope), type === 'ping');
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    window.removeEventListener('message', this.onMessage);
    this.iframe.removeEventListener('load', this.onLoad);
    this.queue = [];
    for (const { reject, timer } of this.pending.values()) {
      if (timer !== undefined) clearTimeout(timer);
      reject(new Error('ViewerApi: destroyed.'));
    }
    this.pending.clear();
  }

  private envelope(type: string, data?: unknown, id?: string): Envelope {
    const envelope: Envelope = { source: VIEWER_SOURCE, v: VIEWER_PROTOCOL_VERSION, type };
    if (id !== undefined) envelope.id = id;
    if (data !== undefined) envelope.data = data;
    return envelope;
  }

  private enqueue(task: () => void, immediate = false): void {
    if (this.destroyed) return;
    if (this.isReady || immediate) task();
    else this.queue.push(task);
  }

  /** Só posta se o iframe já está na origem do viewer (não na página em branco inicial). */
  private canReachViewer(): boolean {
    const contentWindow = this.iframe.contentWindow;
    if (contentWindow === null) return false;
    if (this.origin === window.location.origin) return true;
    try {
      void contentWindow.location.href;
      return false;
    } catch {
      return true;
    }
  }

  private post(envelope: Envelope): void {
    if (!this.canReachViewer()) return;
    this.iframe.contentWindow?.postMessage(envelope, this.origin);
  }

  private flush(): void {
    if (this.isReady) return;
    this.isReady = true;
    const queue = this.queue;
    this.queue = [];
    for (const task of queue) task();
  }

  private dispatch<K extends keyof ViewerEventMap>(type: K, detail: ViewerEventMap[K]): void {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  private readonly solicitReady = (): void => {
    if (!this.destroyed) this.post(this.envelope('ping'));
  };

  private readonly onLoad = (): void => {
    this.solicitReady();
  };

  /** Só obedece ao nosso viewer: mesma origem, o nosso iframe e o namespace e versão certos. */
  private readonly onMessage = (event: MessageEvent): void => {
    if (this.destroyed) return;
    if (event.origin !== this.origin) return;
    if (event.source !== this.iframe.contentWindow) return;
    const message = event.data as Partial<Envelope> | null;
    if (
      message?.source !== VIEWER_SOURCE ||
      message.v !== VIEWER_PROTOCOL_VERSION ||
      typeof message.type !== 'string'
    ) {
      return;
    }
    const { id, type, data } = message;
    if (id !== undefined) {
      const pending = this.pending.get(id);
      if (pending !== undefined) {
        this.pending.delete(id);
        if (pending.timer !== undefined) clearTimeout(pending.timer);
        this.lastState = data as ViewerState;
        pending.resolve(data as ViewerState);
        return;
      }
    }
    switch (type) {
      case 'ready':
        this.flush();
        this.dispatch('ready', data as ViewerEventMap['ready']);
        break;
      case 'change':
        this.lastState = data as ViewerState;
        this.dispatch('change', data as ViewerState);
        break;
      case 'loading':
      case 'rendered':
      case 'rateLimited':
      case 'unsupported':
        this.dispatch(type, data as never);
        break;
    }
  };
}
