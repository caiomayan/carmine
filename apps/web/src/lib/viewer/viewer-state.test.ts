import { describe, expect, it } from 'vitest';
import { initialViewerState, viewerReducer } from './viewer-state';

const start = (opts: { always2d?: boolean; webgl?: boolean } = {}) =>
  initialViewerState({ always2d: opts.always2d ?? false, webgl: opts.webgl ?? true });

describe('estado do viewer', () => {
  it('music kits e agentes ficam sempre em 2D, sem tentar o 3D', () => {
    expect(start({ always2d: true })).toEqual({ mode: '2d', reason: 'always' });
  });

  it('sem WebGL começa em 2D', () => {
    expect(start({ webgl: false })).toEqual({ mode: '2d', reason: 'no-webgl' });
  });

  it('com WebGL conecta, carrega e fica pronto', () => {
    let state = start();
    expect(state).toEqual({ mode: '3d', phase: 'connecting' });
    state = viewerReducer(state, { type: 'ready' });
    expect(state).toEqual({ mode: '3d', phase: 'loading' });
    state = viewerReducer(state, { type: 'rendered' });
    expect(state).toEqual({ mode: '3d', phase: 'ready' });
    state = viewerReducer(state, { type: 'loading', busy: true });
    expect(state).toEqual({ mode: '3d', phase: 'loading' });
    state = viewerReducer(state, { type: 'loading', busy: false });
    expect(state).toEqual({ mode: '3d', phase: 'ready' });
  });

  it('iframe que não responde cai para 2D', () => {
    expect(viewerReducer(start(), { type: 'timeout' })).toEqual({ mode: '2d', reason: 'timeout' });
    const loading = viewerReducer(start(), { type: 'ready' });
    expect(viewerReducer(loading, { type: 'timeout' })).toEqual({ mode: '2d', reason: 'timeout' });
  });

  it('um timeout atrasado não derruba um 3D que já está pronto', () => {
    const ready = viewerReducer(viewerReducer(start(), { type: 'ready' }), { type: 'rendered' });
    expect(viewerReducer(ready, { type: 'timeout' })).toBe(ready);
  });

  it('unsupported e rateLimited do viewer caem para 2D com o motivo', () => {
    expect(viewerReducer(start(), { type: 'unsupported', reason: 'webgl' })).toEqual({
      mode: '2d',
      reason: 'no-webgl',
    });
    expect(viewerReducer(start(), { type: 'unsupported', reason: 'network' })).toEqual({
      mode: '2d',
      reason: 'network',
    });
    expect(viewerReducer(start(), { type: 'unsupported', reason: 'sticker' })).toEqual({
      mode: '2d',
      reason: 'unsupported',
    });
    expect(
      viewerReducer(start(), { type: 'rateLimited', retryAfterMs: 60_000, now: 1_000 }),
    ).toEqual({ mode: '2d', reason: 'rate-limited', retryAt: 61_000 });
  });

  it('em 2D ignora eventos atrasados do iframe', () => {
    const fallback = viewerReducer(start(), { type: 'timeout' });
    expect(viewerReducer(fallback, { type: 'ready' })).toBe(fallback);
    expect(viewerReducer(fallback, { type: 'rendered' })).toBe(fallback);
  });

  it('tentar de novo volta a conectar, menos quando o 3D é impossível', () => {
    const fallback = viewerReducer(start(), { type: 'timeout' });
    expect(viewerReducer(fallback, { type: 'retry' })).toEqual({ mode: '3d', phase: 'connecting' });
    const noWebgl = start({ webgl: false });
    expect(viewerReducer(noWebgl, { type: 'retry' })).toBe(noWebgl);
    const always = start({ always2d: true });
    expect(viewerReducer(always, { type: 'retry' })).toBe(always);
  });
});
