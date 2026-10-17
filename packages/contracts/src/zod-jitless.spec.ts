import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

describe('zod-jitless', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    z.config({ jitless: false });
  });

  it('no Node o Zod mantém o JIT', async () => {
    await import('./index.js');

    expect(z.core.globalConfig.jitless).not.toBe(true);
  });

  it('no navegador o Zod fica sem JIT antes de os schemas existirem, e eles validam', async () => {
    vi.stubGlobal('window', {});

    const contracts = await import('./index.js');

    expect(z.core.globalConfig.jitless).toBe(true);
    expect(contracts.healthStatusSchema.safeParse('nao-existe').success).toBe(false);
  });
});
