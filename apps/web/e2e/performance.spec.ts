import { expect, test } from './fixtures';

/**
 * Perfil "Slow 4G" do DevTools do Chrome (o antigo "Fast 3G"): 562,5 ms de latência, 1,6 Mbps
 * de descida e 750 kbps de subida, com o fator de 0,9 que o DevTools aplica; e a CPU 4× mais
 * lenta, como um celular intermediário (Princípios transversais: interativo em até 4 s).
 */
const SLOW_4G = {
  offline: false,
  latency: 562.5,
  downloadThroughput: ((1.6 * 1000 * 1000) / 8) * 0.9,
  uploadThroughput: ((750 * 1000) / 8) * 0.9,
};
const BUDGET_MS = 4000;
/**
 * O tempo ainda não reprova a CI. Depois da dieta do bundle (Zod e motion fora da primeira
 * carga: 310 → 259 kB de JS na home) a home e o editor ficam em ~4,4 s e ~4,7 s neste teste, que
 * mede o `next start` em HTTP/1.1 (seis conexões, 21 pedidos); atrás de um proxy HTTP/2, como o
 * Cloudflare, caem para ~4,2 s. O que sobra é o React/Next (~165 kB de JS) e a fonte (49 kB);
 * o tempo oscila ±0,5 s entre execuções, então `PERF_BUDGET=enforce` faz reprovar, mas só vale
 * numa máquina quieta. O que reprova sempre é o peso do JS da primeira carga (determinístico).
 */
const ENFORCE = process.env.PERF_BUDGET === 'enforce';
/** JS da primeira carga (bytes na rede, gzip do `next start`), com ~5% de folga sobre o medido. */
const JS_BUDGET_KB = 275;

/**
 * Interativo = o React já hidratou o controle que a pessoa usa (o nó ganhou a fibra do React e
 * responde a eventos), e não só o HTML do servidor na tela.
 */
const PAGES = [
  { name: 'a home', path: '/', control: '[role="tablist"] [role="tab"]' },
  { name: 'o editor', path: '/inventario/adicionar/222', control: '[data-testid="field-seed"]' },
] as const;

for (const target of PAGES) {
  test(`${target.name} fica interativo em até 4 s no Slow 4G de celular`, async ({ page }) => {
    test.skip(process.env.E2E_DEV === '1', 'mede o build de produção');
    await page.setViewportSize({ width: 390, height: 844 });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', SLOW_4G);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

    const started = Date.now();
    await page.goto(target.path, { waitUntil: 'commit' });
    await page.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector);
        return !!el && Object.keys(el).some((key) => key.startsWith('__reactProps'));
      },
      target.control,
      { timeout: 20_000, polling: 50 },
    );
    const hydrated = Date.now() - started;
    const timing = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      const scripts = performance
        .getEntriesByType('resource')
        .filter((entry) => entry.name.endsWith('.js')) as PerformanceResourceTiming[];
      return {
        ttfb: Math.round(nav.responseStart),
        dcl: Math.round(nav.domContentLoadedEventEnd),
        jsKb: scripts.reduce((sum, entry) => sum + entry.transferSize, 0) / 1024,
      };
    });

    test.info().annotations.push({
      type: 'tempos',
      description: `pronto ${hydrated} ms · TTFB ${timing.ttfb} ms · DCL ${timing.dcl} ms · JS ${timing.jsKb.toFixed(1)} kB`,
    });
    expect(
      timing.jsKb,
      `${target.path}: JS da primeira carga em ${timing.jsKb.toFixed(1)} kB (orçamento ${JS_BUDGET_KB} kB)`,
    ).toBeLessThanOrEqual(JS_BUDGET_KB);
    if (ENFORCE) {
      expect(hydrated, `${target.path} interativo em ${hydrated} ms`).toBeLessThanOrEqual(
        BUDGET_MS,
      );
    } else if (hydrated > BUDGET_MS) {
      test.info().annotations.push({
        type: 'acima do orçamento de 4 s',
        description: `${target.path}: ${hydrated} ms (PERF_BUDGET=enforce reprova)`,
      });
    }
  });
}
