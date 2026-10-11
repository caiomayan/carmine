/**
 * Quando o editor mostra o viewer 3D e quando cai para as imagens 2D (S04, ADR 0006). O 3D é o
 * padrão; o 2D entra para music kits e agentes (sempre), sem WebGL, quando o iframe não
 * responde, quando o viewer recusa o Item e quando o limite de uso dele é atingido. Em todos os
 * casos o formulário continua editável: o 2D muda só a prévia.
 */

export type FallbackReason =
  | 'always'
  | 'no-webgl'
  | 'timeout'
  | 'network'
  | 'unsupported'
  | 'rate-limited';

export type ViewerState =
  | { mode: '3d'; phase: 'connecting' | 'loading' | 'ready' }
  | { mode: '2d'; reason: FallbackReason; retryAt?: number };

/** Motivos do viewer para não desenhar (o `unsupported` do protocolo). */
type UnsupportedReason =
  | 'weapon'
  | 'sticker'
  | 'keychain'
  | 'patch'
  | 'network'
  | 'webgl'
  | 'asset';

export type ViewerEvent =
  | { type: 'ready' }
  | { type: 'loading'; busy: boolean }
  | { type: 'rendered' }
  | { type: 'timeout' }
  | { type: 'unsupported'; reason: UnsupportedReason }
  | { type: 'rateLimited'; retryAfterMs: number; now: number }
  | { type: 'retry' };

/** Quanto esperar o iframe dizer "pronto" antes de mostrar o 2D. */
export const VIEWER_READY_TIMEOUT_MS = 8000;
/** Quanto esperar um Item desenhar depois de pronto (shaders e texturas num celular). */
export const VIEWER_RENDER_TIMEOUT_MS = 25_000;

export function initialViewerState({
  always2d,
  webgl,
}: {
  always2d: boolean;
  webgl: boolean;
}): ViewerState {
  if (always2d) return { mode: '2d', reason: 'always' };
  if (!webgl) return { mode: '2d', reason: 'no-webgl' };
  return { mode: '3d', phase: 'connecting' };
}

function fallbackFor(reason: UnsupportedReason): FallbackReason {
  if (reason === 'webgl') return 'no-webgl';
  if (reason === 'network' || reason === 'asset') return 'network';
  return 'unsupported';
}

export function viewerReducer(state: ViewerState, event: ViewerEvent): ViewerState {
  if (state.mode === '2d') {
    if (event.type !== 'retry' || state.reason === 'always' || state.reason === 'no-webgl') {
      return state;
    }
    return { mode: '3d', phase: 'connecting' };
  }
  switch (event.type) {
    case 'ready':
      return state.phase === 'connecting' ? { mode: '3d', phase: 'loading' } : state;
    case 'loading':
      return { mode: '3d', phase: event.busy ? 'loading' : 'ready' };
    case 'rendered':
      return { mode: '3d', phase: 'ready' };
    case 'timeout':
      return state.phase === 'ready' ? state : { mode: '2d', reason: 'timeout' };
    case 'unsupported':
      return { mode: '2d', reason: fallbackFor(event.reason) };
    case 'rateLimited':
      return { mode: '2d', reason: 'rate-limited', retryAt: event.now + event.retryAfterMs };
    case 'retry':
      return state;
  }
}

/** O navegador consegue desenhar WebGL? (falso também com aceleração de hardware desligada) */
export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}
