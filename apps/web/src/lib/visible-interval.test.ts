import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startVisibleInterval, type VisibilityEnv } from './visible-interval';

/** Um ambiente de mentira: `hidden` e o disparo da mudança de visibilidade são nossos; os temporizadores, os falsos do vitest. */
function fakeEnv(initiallyHidden = false) {
  let hidden = initiallyHidden;
  const listeners = new Set<() => void>();
  const env: VisibilityEnv = {
    hidden: () => hidden,
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setInterval: (callback, ms) => setInterval(callback, ms),
    clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
  };
  return {
    env,
    listeners,
    setHidden(value: boolean) {
      hidden = value;
      for (const listener of [...listeners]) listener();
    },
  };
}

describe('startVisibleInterval', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('corre a cada intervalo com a aba à vista', () => {
    const { env } = fakeEnv();
    const callback = vi.fn();
    startVisibleInterval(callback, 1000, env);
    vi.advanceTimersByTime(3500);
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it('para ao esconder a aba e não roda nada enquanto ela está escondida', () => {
    const { env, setHidden } = fakeEnv();
    const callback = vi.fn();
    startVisibleInterval(callback, 1000, env);
    vi.advanceTimersByTime(2000);
    setHidden(true);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('ao voltar, atualiza na hora UMA vez e recomeça o intervalo', () => {
    const { env, setHidden } = fakeEnv();
    const callback = vi.fn();
    startVisibleInterval(callback, 1000, env);
    setHidden(true);
    vi.advanceTimersByTime(30_000);
    setHidden(false);
    expect(callback).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    expect(callback).toHaveBeenCalledTimes(3);
    // um segundo "visível" seguido não duplica o intervalo
    setHidden(false);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('com a aba já escondida no começo, só passa a correr quando ela aparecer', () => {
    const { env, setHidden } = fakeEnv(true);
    const callback = vi.fn();
    startVisibleInterval(callback, 1000, env);
    vi.advanceTimersByTime(10_000);
    expect(callback).not.toHaveBeenCalled();
    setHidden(false);
    expect(callback).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('o cancelamento limpa o intervalo e o ouvinte', () => {
    const { env, listeners } = fakeEnv();
    const stop = startVisibleInterval(vi.fn(), 1000, env);
    expect(vi.getTimerCount()).toBe(1);
    stop();
    expect(vi.getTimerCount()).toBe(0);
    expect(listeners.size).toBe(0);
  });
});
