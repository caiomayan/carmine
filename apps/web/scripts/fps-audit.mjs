#!/usr/bin/env node
/**
 * Auditoria de quadros por segundo por página (prioridade do dono: 120 fps no mínimo, sem travar, também em
 * notebook com GPU integrada). Contra um build de produção (`next build && next start`), no Chromium com a CPU
 * 4× mais lenta (como o perfil do DevTools), mede em três janelas por página:
 *
 *   ocioso   3 s sem tocar em nada (o custo do que anima sozinho: brilho ambiente, ticker, marquee, Ken Burns)
 *   rolagem  a página inteira de cima a baixo e de volta, por um gesto de rolagem de verdade (compositor)
 *   ponteiro 3 s de mouse passeando pela tela (spotlight, holo, inclinação, hovers)
 *
 * O Chromium roda SEM o limite de quadros e sem vsync (`--disable-frame-rate-limit --disable-gpu-vsync`), então
 * os fps medidos são o que o pipeline inteiro (script, estilo, layout, pintura, raster e GPU) consegue entregar,
 * não o teto da tela: 120 fps = quadro de 8,33 ms. Com `--headed` usa a GPU de verdade da máquina (o notebook
 * com Intel Iris Xe); sem, o raster é por software, um pior caso para efeitos de GPU (backdrop-filter, blur).
 *
 *   node scripts/fps-audit.mjs --base http://localhost:3000 --storage-state sessao.json \
 *        --profile /AbCd123 --server /servers/<id> [--headed] [--only Home,Perfil] \
 *        [--ablate sem-vidro,sem-ambiente|all] [--trace] [--json saida.json]
 *
 * Com `--ablate`, cada página é medida de novo com um efeito neutralizado por CSS injetado, e a tabela mostra
 * quanto cada um custa (a medição antes/depois de cada suspeito, sem mexer no código).
 *
 * `--viewer-falso` troca o viewer 3D de terceiro do Editor (3d.cstrike.app) por um parado, no mesmo protocolo; o
 * `--guard` (a CI) já o usa. Sem a opção, o Editor é medido com o viewer de verdade.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(here, '..');
const { chromium } = createRequire(path.join(webRoot, 'package.json'))('@playwright/test');

/** O quadro de 120 fps. */
export const FRAME_120_MS = 1000 / 120;

/** Efeitos neutralizados por CSS, um de cada vez, para medir o custo de cada um. */
export const ABLATIONS = {
  'sem-vidro':
    '*,*::before,*::after{-webkit-backdrop-filter:none!important;backdrop-filter:none!important}',
  'sem-ambiente': '.v-ambient{display:none!important}',
  'sem-blobs': '.v-ambient i{animation:none!important}',
  'sem-kenburns':
    '[class*="kenburns"],[class*="hero-art"] img,[class*="-hero"] img{animation:none!important}',
  'sem-esqueleto':
    '.vh-skel,.pf-skel,.vh-shine,[class*="skel"],[class*="shimmer"]{animation:none!important}',
  'sem-cortina': '__curtain',
  'sem-hover': 'html *{pointer-events:none!important}',
  'sem-animacao': '*,*::before,*::after{animation:none!important}',
  'sem-transicao': '*,*::before,*::after{transition:none!important}',
  'sem-holo-spot': '.v-holo::after,.v-spot::before{display:none!important}',
  'sem-inclinacao':
    '.v-tilt{transform:none!important;transition:none!important;will-change:auto!important}',
  'sem-sombra': '*,*::before,*::after{box-shadow:none!important}',
  'sem-mascara':
    '*,*::before,*::after{-webkit-mask-image:none!important;mask-image:none!important}',
  'sem-filtro': '*,*::before,*::after{filter:none!important}',
  'sem-mistura': '*,*::before,*::after{mix-blend-mode:normal!important}',
};

const PAGES = [
  { name: 'Home', path: '/' },
  { name: 'Perfil', path: '{profile}', auth: true },
  { name: 'Ranking', path: '/ranking' },
  { name: 'Loadout', path: '/loadout', auth: true },
  { name: 'Inventário', path: '/inventory', auth: true },
  { name: 'Editor', path: '/inventory/add/222' },
  { name: 'Servidor', path: '{server}' },
  { name: 'Configurações', path: '/settings/profile', auth: true },
];

const ALL_WINDOWS = ['ocioso', 'rolagem', 'ponteiro'];
const WINDOWS = (() => {
  const at = process.argv.indexOf('--windows');
  return at === -1
    ? ALL_WINDOWS
    : process.argv[at + 1].split(',').filter((w) => ALL_WINDOWS.includes(w));
})();

/**
 * O viewer 3D do Editor (3d.cstrike.app) é de terceiro: renderiza WebGL sem parar num laço próprio, o que na CI (raster
 * por software, CPU 4× mais lenta) enche a thread principal (centenas de %) quando carrega e muda de uma execução para a
 * outra (carrega, é limitado por IP ou nem abre). Isso não é trabalho da nossa página, e a guarda precisa dar o mesmo
 * resultado sempre. Por isso, na verificação da CI (`--guard`) e com `--viewer-falso`, o endereço dele responde com um
 * viewer mínimo e parado, no mesmo protocolo postMessage (ver e2e/fake-viewer.ts): o Editor fica no estado "3D pronto",
 * medindo só a nossa página. A auditoria de fps no hardware do dono (sem essas opções) mede com o viewer de verdade.
 */
const FAKE_VIEWER_HTML = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:transparent"><script>
  const post = (type, data, id) => parent.postMessage(Object.assign({ source: '3d.cstrike.app', v: 1, type, data }, id ? { id } : {}), '*');
  let item = JSON.parse(new URL(location.href).searchParams.get('item') || 'null');
  addEventListener('message', (event) => {
    const m = event.data;
    if (!m || m.source !== '3d.cstrike.app' || m.v !== 1) return;
    if (m.type === 'ping') { post('ready', { v: 1 }); post('rendered', { item }); }
    if (m.type === 'setItem') { item = m.data.item; post('rendered', { item }); }
    if (m.type === 'getState') post('state', { item, selection: null, activeSticker: null, schemaCount: 4 }, m.id);
  });
</script></body></html>`;

/** Instalado em cada página antes de qualquer script dela: o gravador de quadros e de tarefas longas. */
const RECORDER = () => {
  const rec = { running: false, frames: [], loaf: [], longtasks: [] };
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        rec.loaf.push({
          d: e.duration,
          b: e.blockingDuration,
          t: e.startTime,
          scripts: (e.scripts ?? []).map((x) => ({
            u: x.sourceURL,
            f: x.sourceFunctionName,
            i: x.invoker,
            d: x.duration,
          })),
        });
      }
    }).observe({ type: 'long-animation-frame', buffered: false });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) rec.longtasks.push({ d: e.duration, t: e.startTime });
    }).observe({ type: 'longtask', buffered: false });
  } catch {}
  const loop = (t) => {
    if (!rec.running) return;
    rec.frames.push(t);
    requestAnimationFrame(loop);
  };
  const infinite = (a) =>
    a.playState === 'running' && a.effect?.getComputedTiming?.().iterations === Infinity;
  const keyOf = (a) => a.animationName ?? `transição de ${a.transitionProperty}`;
  let paused = [];
  window.__anim = {
    groups() {
      const map = new Map();
      for (const a of document.getAnimations().filter(infinite)) {
        const entry = map.get(keyOf(a)) ?? { name: keyOf(a), count: 0, el: '' };
        entry.count++;
        const t = a.effect?.target;
        if (!entry.el && t) {
          const cls = typeof t.className === 'string' ? t.className.trim().split(/s+/)[0] : '';
          entry.el = `${t.tagName.toLowerCase()}${cls ? `.${cls}` : ''}`;
        }
        map.set(entry.name, entry);
      }
      return [...map.values()];
    },
    pause(only) {
      paused = document
        .getAnimations()
        .filter((a) => infinite(a) && (only === null || keyOf(a) === only));
      for (const a of paused) a.pause();
    },
    resume() {
      for (const a of paused) a.play();
      paused = [];
    },
  };
  window.__fps = {
    peek() {
      return { loaf: rec.loaf, longtasks: rec.longtasks };
    },
    start() {
      rec.frames = [];
      rec.loaf = [];
      rec.longtasks = [];
      rec.running = true;
      requestAnimationFrame(loop);
    },
    stop() {
      rec.running = false;
      return { frames: rec.frames, loaf: rec.loaf, longtasks: rec.longtasks };
    },
  };
};

/** O que há na página que custa por natureza (os números que a CI guarda, sem depender de relógio). */
const CENSUS = () => {
  const compositable = new Set([
    'transform',
    'opacity',
    'translate',
    'scale',
    'rotate',
    'filter',
    'backdrop-filter',
    'offset',
  ]);
  const vw = innerWidth;
  const vh = innerHeight;
  const out = {
    backdrop: [],
    filters: 0,
    blend: 0,
    willChange: 0,
    maskImage: 0,
    animations: [],
    elements: document.getElementsByTagName('*').length,
  };
  const label = (el) =>
    `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${
      typeof el.className === 'string' && el.className
        ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
        : ''
    }`;
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    const visible =
      box.width > 0 &&
      box.height > 0 &&
      box.bottom > 0 &&
      box.top < vh &&
      box.right > 0 &&
      box.left < vw;
    const bd = cs.backdropFilter;
    if (bd && bd !== 'none' && visible) {
      out.backdrop.push({ el: label(el), px: Math.round(box.width * box.height), filter: bd });
    }
    if (cs.filter !== 'none') out.filters++;
    if (cs.mixBlendMode !== 'normal') out.blend++;
    if (cs.willChange !== 'auto') out.willChange++;
    if (cs.maskImage !== 'none' && cs.maskImage) out.maskImage++;
  }
  for (const a of document.getAnimations()) {
    const timing = a.effect?.getComputedTiming?.();
    const target = a.effect?.target;
    let props = [];
    if (a.transitionProperty) props = [a.transitionProperty];
    else {
      try {
        props = [
          ...new Set(
            a.effect
              .getKeyframes()
              .flatMap((k) => Object.keys(k))
              .filter((k) => !['offset', 'easing', 'composite', 'computedOffset'].includes(k)),
          ),
        ];
      } catch {}
    }
    out.animations.push({
      name: a.animationName ?? `transition:${a.transitionProperty}`,
      el: target ? label(target) : '?',
      props,
      infinite: timing?.iterations === Infinity,
      running: a.playState === 'running',
      offCompositor: props.filter((p) => !compositable.has(p)),
    });
  }
  return out;
};

const args = process.argv.slice(2);
const option = (name) => {
  const at = args.indexOf(name);
  return at === -1 ? null : (args[at + 1] ?? null);
};
const flag = (name) => args.includes(name);

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function summarize(raw, metrics, wallMs, procs) {
  const deltas = [];
  for (let i = 1; i < raw.frames.length; i++) deltas.push(raw.frames[i] - raw.frames[i - 1]);
  const sorted = [...deltas].sort((a, b) => a - b);
  const span = raw.frames.length > 1 ? raw.frames[raw.frames.length - 1] - raw.frames[0] : 0;
  const share = (limit) =>
    deltas.length ? deltas.filter((d) => d > limit).length / deltas.length : 0;
  return {
    frames: deltas.length,
    fps: span > 0 ? (deltas.length / span) * 1000 : 0,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted.length ? sorted[sorted.length - 1] : 0,
    over120: share(FRAME_120_MS * 1.25),
    over60: share(1000 / 60 + 1),
    longFrames: raw.loaf.filter((e) => e.d > 50).length,
    longTasks: raw.longtasks.length,
    blocking: Math.round(raw.loaf.reduce((sum, e) => sum + e.b, 0)),
    busy: wallMs > 0 ? Math.min(1, (metrics.TaskDuration ?? 0) / (wallMs / 1000)) : 0,
    // Trabalho da thread principal por quadro (ms) e CPU dos processos por segundo (1 = um núcleo inteiro).
    cpuPerFrame: deltas.length ? ((metrics.TaskDuration ?? 0) * 1000) / deltas.length : 0,
    rendererCpu: wallMs > 0 ? (procs.renderer * 1000) / wallMs : 0,
    gpuCpu: wallMs > 0 ? (procs.gpu * 1000) / wallMs : 0,
    script: metrics.ScriptDuration ?? 0,
    style: metrics.RecalcStyleDuration ?? 0,
    layout: metrics.LayoutDuration ?? 0,
    styleCount: metrics.RecalcStyleCount ?? 0,
    layoutCount: metrics.LayoutCount ?? 0,
  };
}

/** CPU acumulada (s) do processo do renderer e do da GPU: o que as camadas custam além da thread principal. */
async function processTimes(browserCdp) {
  try {
    const { processInfo } = await browserCdp.send('SystemInfo.getProcessInfo');
    const sum = (type) =>
      processInfo.filter((p) => p.type === type).reduce((acc, p) => acc + p.cpuTime, 0);
    return { renderer: sum('renderer'), gpu: sum('GPU') };
  } catch {
    return { renderer: 0, gpu: 0 };
  }
}

async function metricsOf(cdp) {
  const { metrics } = await cdp.send('Performance.getMetrics');
  return Object.fromEntries(metrics.map((m) => [m.name, m.value]));
}
function diff(after, before) {
  const out = {};
  for (const key of Object.keys(after)) out[key] = after[key] - (before[key] ?? 0);
  return out;
}

async function measureWindow(tab, cdp, name, { viewport, seconds, browserCdp }) {
  const before = await metricsOf(cdp);
  const procBefore = await processTimes(browserCdp);
  const started = Date.now();
  await tab.evaluate(() => window.__fps.start());
  if (name === 'ocioso') {
    await tab.waitForTimeout(seconds * 1000);
  } else if (name === 'rolagem') {
    const height = await tab.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    const distance = Math.min(Math.max(height, 0), 7000);
    const x = Math.round(viewport.width / 2);
    const y = Math.round(viewport.height / 2);
    if (distance > 0) {
      const speed = Math.max(1200, Math.round(distance / seconds));
      await cdp.send('Input.synthesizeScrollGesture', {
        x,
        y,
        yDistance: -distance,
        speed,
        gestureSourceType: 'mouse',
      });
      await cdp.send('Input.synthesizeScrollGesture', {
        x,
        y,
        yDistance: distance,
        speed,
        gestureSourceType: 'mouse',
      });
    } else {
      await tab.waitForTimeout(seconds * 1000);
    }
  } else {
    const end = Date.now() + seconds * 1000;
    let step = 0;
    while (Date.now() < end) {
      const t = step / 40;
      const px = Math.round(viewport.width * (0.08 + 0.84 * (0.5 + 0.5 * Math.sin(t * 5.1))));
      const py = Math.round(viewport.height * (0.1 + 0.8 * (0.5 + 0.5 * Math.sin(t * 3.3 + 1))));
      await tab.mouse.move(px, py, { steps: 6 });
      step++;
    }
  }
  const raw = await tab.evaluate(() => window.__fps.stop());
  const wall = Date.now() - started;
  const after = await metricsOf(cdp);
  const procAfter = await processTimes(browserCdp);
  return summarize(raw, diff(after, before), wall, {
    renderer: procAfter.renderer - procBefore.renderer,
    gpu: procAfter.gpu - procBefore.gpu,
  });
}

/** As camadas de composição: quantas, quanta área (em telas) e as maiores com a razão de cada uma. */
async function layerReport(cdp, viewport) {
  let layers = [];
  cdp.on('LayerTree.layerTreeDidChange', (event) => {
    if (event.layers) layers = event.layers;
  });
  await cdp.send('LayerTree.enable');
  await new Promise((resolve) => setTimeout(resolve, 600));
  const screen = viewport.width * viewport.height;
  const drawn = layers.filter((layer) => layer.drawsContent);
  const area = drawn.reduce((sum, layer) => sum + layer.width * layer.height, 0);
  const biggest = [...drawn].sort((a, b) => b.width * b.height - a.width * a.height).slice(0, 5);
  const top = [];
  for (const layer of biggest) {
    let reasons = [];
    try {
      reasons = (await cdp.send('LayerTree.compositingReasons', { layerId: layer.layerId }))
        .compositingReasonIds;
    } catch {}
    top.push({ size: `${Math.round(layer.width)}×${Math.round(layer.height)}`, reasons });
  }
  await cdp.send('LayerTree.disable').catch(() => {});
  return { layers: layers.length, drawn: drawn.length, screens: area / screen, top };
}

async function measurePage(browser, page, ctx, extraCss) {
  const context = await browser.newContext({
    viewport: ctx.viewport,
    deviceScaleFactor: ctx.dsf,
    ...(ctx.storageState ? { storageState: ctx.storageState } : {}),
  });
  if (ctx.fakeViewer) {
    await context.route('https://3d.cstrike.app/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: FAKE_VIEWER_HTML }),
    );
  }
  const tab = await context.newPage();
  await tab.addInitScript(RECORDER);
  const cdp = await context.newCDPSession(tab);
  await cdp.send('Performance.enable');
  if (ctx.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: ctx.cpu });
  const noCurtain = extraCss === '__curtain';
  const url = `${ctx.base}${page.target}${noCurtain ? `${page.target.includes('?') ? '&' : '?'}curtain=0` : ''}`;
  await tab.goto(url, { waitUntil: 'load', timeout: 120_000 });
  await tab.evaluate(() => document.fonts.ready);
  await tab.waitForTimeout(2500);
  // Os esqueletos são o estado de carregamento: mede-se a página pronta, não a espera pelo dado.
  const settled = await tab
    .waitForFunction(
      () =>
        ![...document.querySelectorAll('.vh-skel, .pf-skel, [data-skeleton]')].some((el) => {
          const box = el.getBoundingClientRect();
          return box.bottom > 0 && box.top < innerHeight && box.width > 0;
        }),
      undefined,
      {
        timeout: 20_000,
      },
    )
    .then(() => true)
    .catch(() => false);
  await tab.waitForTimeout(500);
  if (extraCss && !noCurtain) await tab.addStyleTag({ content: extraCss });
  await tab.waitForTimeout(400);

  const result = { windows: {}, settled };
  if (!extraCss && !page.censusDone) {
    page.censusDone = true;
    result.census = await tab.evaluate(CENSUS);
    result.layers = await layerReport(cdp, ctx.viewport);
  }
  for (const name of WINDOWS) {
    result.windows[name] = await measureWindow(tab, cdp, name, {
      viewport: ctx.viewport,
      seconds: ctx.seconds,
      browserCdp: ctx.browserCdp,
    });
    await tab.evaluate(() => scrollTo(0, 0));
    await tab.waitForTimeout(300);
  }
  result.height = await tab.evaluate(() => document.documentElement.scrollHeight);
  await context.close();
  return result;
}

const f1 = (n) => n.toFixed(1);
const pct = (n) => `${Math.round(n * 100)}%`;

function printTable(rows) {
  console.log(
    '| Página | Janela | fps | p50 ms | p95 ms | máx ms | >10 ms | >17 ms | tarefas longas | ms/quadro (thread) | CPU renderer | CPU GPU | estilo ms | layout ms | script ms |',
  );
  console.log('|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const row of rows) {
    for (const name of WINDOWS) {
      const w = row.result.windows[name];
      console.log(
        `| ${row.page.name} | ${name} | ${f1(w.fps)} | ${f1(w.p50)} | ${f1(w.p95)} | ${f1(w.max)} | ${pct(w.over120)} | ${pct(w.over60)} | ${w.longFrames} | ${f1(w.cpuPerFrame)} | ${f1(w.rendererCpu)} | ${f1(w.gpuCpu)} | ${Math.round(w.style * 1000)} | ${Math.round(w.layout * 1000)} | ${Math.round(w.script * 1000)} |`,
      );
    }
  }
}

function printCensus(rows) {
  console.log(
    '\n| Página | elementos | vidro (backdrop) visível | filtros | mix-blend | will-change | camadas | área em telas | animações infinitas fora do compositor |',
  );
  console.log('|---|---:|---:|---:|---:|---:|---:|---:|---|');
  for (const { page, result } of rows) {
    const c = result.census;
    const counts = new Map();
    for (const a of c.animations.filter((x) => x.running && x.offCompositor.length)) {
      const key = `${a.name}→${a.offCompositor.join(',')}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const off = [...counts].map(([key, n]) => (n > 1 ? `${key} ×${n}` : key));
    console.log(
      `| ${page.name} | ${c.elements} | ${c.backdrop.length} (${c.backdrop.map((b) => `${b.el} ${b.px}px²`).join('; ')}) | ${c.filters} | ${c.blend} | ${c.willChange} | ${result.layers.layers} | ${f1(result.layers.screens)} | ${off.join('; ') || '-'} |`,
    );
  }
}

function printLayers(rows) {
  console.log('\n#### Maiores camadas de composição (tamanho em px CSS · razões)\n');
  for (const { page, result } of rows) {
    console.log(
      `- ${page.name}: ${result.layers.layers} camadas, ${result.layers.drawn} desenham; ${result.layers.top.map((l) => `${l.size} [${l.reasons.join(', ')}]`).join(' | ')}`,
    );
  }
}

/** Abre a página como a medição a abre: CPU lenta, fontes e carregamento prontos. */
async function openPage(browser, page, ctx) {
  const context = await browser.newContext({
    viewport: ctx.viewport,
    deviceScaleFactor: ctx.dsf,
    ...(ctx.storageState ? { storageState: ctx.storageState } : {}),
  });
  const tab = await context.newPage();
  await tab.addInitScript(RECORDER);
  const cdp = await context.newCDPSession(tab);
  await cdp.send('Performance.enable');
  if (ctx.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: ctx.cpu });
  const api = [];
  const t0 = Date.now();
  tab.on('response', (r) => {
    if (r.url().includes('/api/'))
      api.push(`${r.status()} ${r.url().replace(ctx.base, '')} em ${Date.now() - t0} ms`);
  });
  tab.on('requestfailed', (r) => {
    if (r.url().includes('/api/'))
      api.push(`FALHOU ${r.url().replace(ctx.base, '')} (${r.failure()?.errorText})`);
  });
  await tab.goto(`${ctx.base}${page.target}`, { waitUntil: 'load', timeout: 120_000 });
  await tab.evaluate(() => document.fonts.ready);
  await tab.waitForTimeout(2500);
  const loaded = await tab
    .waitForFunction(
      () =>
        ![...document.querySelectorAll('.vh-skel, .pf-skel, [data-skeleton]')].some((el) => {
          const box = el.getBoundingClientRect();
          return box.bottom > 0 && box.top < innerHeight && box.width > 0;
        }),
      undefined,
      { timeout: 20_000 },
    )
    .then(() => true)
    .catch(() => false);
  if (!loaded) {
    ctx.diagnostics.push(
      `${page.name}: esqueleto ainda na tela após 22 s. Chamadas /api/: ${api.join(' | ') || '(nenhuma)'}`,
    );
  }
  await tab.waitForTimeout(500);
  return { context, tab, cdp };
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/**
 * Pausa as animações contínuas de uma em uma (sem recarregar a página) e mede o repouso, para ordenar pelo ganho de
 * desligar cada uma. As rodadas são intercaladas (base, A, B, …, todas, base, A, …) e vale a mediana de cada condição,
 * porque o relógio da máquina oscila. O custo é por quadro e com o vsync do monitor: CPU do renderer e da GPU
 * dividida pelos quadros, o que um efeito consome a cada quadro, a conta que decide se fecham 8,3 ms (120 fps).
 */
async function animationRanking(browser, page, ctx, rounds) {
  const { context, tab, cdp } = await openPage(browser, page, ctx);
  const groups = await tab.evaluate(() => window.__anim.groups());
  const ALL = 'todas as contínuas';
  const conditions = [{ name: 'base' }, ...groups, { name: ALL }];
  const samples = new Map(conditions.map((c) => [c.name, []]));
  for (let round = 0; round < rounds; round++) {
    for (const condition of conditions) {
      if (condition.name !== 'base') {
        await tab.evaluate(
          (only) => window.__anim.pause(only),
          condition.name === ALL ? null : condition.name,
        );
      }
      await tab.waitForTimeout(400);
      samples.get(condition.name).push(
        await measureWindow(tab, cdp, 'ocioso', {
          viewport: ctx.viewport,
          seconds: ctx.seconds,
          browserCdp: ctx.browserCdp,
        }),
      );
      await tab.evaluate(() => window.__anim.resume());
    }
  }
  await context.close();
  const reduce = (list) => {
    const perFrame = list.map((w) => ((w.rendererCpu + w.gpuCpu) / Math.max(w.fps, 0.001)) * 1000);
    return {
      fps: median(list.map((w) => w.fps)),
      msPerFrame: median(perFrame),
      thread: median(list.map((w) => w.cpuPerFrame)),
      renderer: median(list.map((w) => w.rendererCpu)),
      gpu: median(list.map((w) => w.gpuCpu)),
    };
  };
  const base = reduce(samples.get('base'));
  return {
    base,
    rows: conditions
      .filter((c) => c.name !== 'base')
      .map((c) => ({ ...c, ...reduce(samples.get(c.name)) }))
      .map((row) => ({
        ...row,
        saved: base.msPerFrame - row.msPerFrame,
        threadSaved: base.thread - row.thread,
      }))
      .sort(
        (a, b) =>
          (a.name === 'todas as contínuas') - (b.name === 'todas as contínuas') ||
          b.saved - a.saved,
      ),
  };
}

/**
 * Rastro (tracing) do repouso: quanto cada tipo de trabalho da thread principal custou e, nas invalidações de estilo,
 * o que as provocou (classe, atributo, propriedade). É o que mostra por que uma página "parada" não para.
 */
async function traceIdle(browser, tab, seconds) {
  await browser.startTracing(tab, {
    categories: [
      'devtools.timeline',
      'disabled-by-default-devtools.timeline',
      'disabled-by-default-devtools.timeline.invalidationTracking',
      'disabled-by-default-devtools.timeline.stack',
    ],
  });
  await tab.waitForTimeout(seconds * 1000);
  const buffer = await browser.stopTracing();
  const events = JSON.parse(buffer.toString('utf8')).traceEvents ?? [];
  const byName = new Map();
  const reasons = new Map();
  const timers = new Map();
  const stacks = new Map();
  for (const e of events) {
    const stack = e.args?.data?.stackTrace;
    if (
      stack?.length &&
      /^(InvalidateLayout|ScheduleStyleRecalculation|StyleRecalcInvalidationTracking|LayoutInvalidationTracking)$/.test(
        e.name,
      )
    ) {
      const key = stack
        .slice(0, 4)
        .map(
          (fr) =>
            `${fr.functionName || '(anônima)'}@${String(fr.url).split('/').pop()}:${fr.lineNumber}:${fr.columnNumber}`,
        )
        .join(' <- ');
      stacks.set(key, (stacks.get(key) ?? 0) + 1);
    }
    if (e.ph === 'X' && e.dur) {
      const entry = byName.get(e.name) ?? { ms: 0, n: 0 };
      entry.ms += e.dur / 1000;
      entry.n++;
      byName.set(e.name, entry);
    }
    const data = e.args?.data;
    if (/InvalidationTracking$/.test(e.name) && data) {
      const key = `${e.name.replace('InvalidationTracking', '')} · ${data.reason ?? data.changedClass ?? data.changedAttribute ?? data.changedPseudo ?? ''} · ${data.nodeName ?? ''}${data.selectorPart ? ` · ${data.selectorPart}` : ''}${data.extraData ? ` · ${data.extraData}` : ''}`;
      reasons.set(key, (reasons.get(key) ?? 0) + 1);
    }
    if (e.name === 'TimerFire' || e.name === 'FireAnimationFrame' || e.name === 'FunctionCall') {
      const where = data?.url
        ? `${data.url.split('/').pop()}:${data.lineNumber ?? ''}${data.functionName ? ` ${data.functionName}` : ''}`
        : '';
      const key = `${e.name} ${where}`.trim();
      timers.set(key, (timers.get(key) ?? 0) + (e.dur ?? 0) / 1000);
    }
  }
  const top = (map, pick, n) => [...map].sort((a, b) => pick(b[1]) - pick(a[1])).slice(0, n);
  return {
    work: top(byName, (v) => v.ms, 8).map(([name, v]) => ({ name, ms: v.ms, n: v.n })),
    reasons: top(reasons, (v) => v, 8).map(([key, n]) => ({ key, n })),
    callers: top(timers, (v) => v, 6).map(([key, ms]) => ({ key, ms })),
    stacks: top(stacks, (v) => v, 6).map(([key, n]) => ({ key, n })),
  };
}

/** Quem muda texto na página parada: elemento, quantas vezes por segundo e os últimos valores (o que não para de escrever). */
async function textMutations(tab, seconds) {
  return tab.evaluate(async (ms) => {
    const counts = new Map();
    const observer = new MutationObserver((records) => {
      for (const r of records) {
        const el = r.target.nodeType === 3 ? r.target.parentElement : r.target;
        if (!el) continue;
        const key = `${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}` : ''}`;
        const entry = counts.get(key) ?? { n: 0, last: [] };
        entry.n++;
        entry.last = [...entry.last.slice(-2), (el.textContent ?? '').slice(0, 24)];
        counts.set(key, entry);
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    await new Promise((resolve) => setTimeout(resolve, ms));
    observer.disconnect();
    return [...counts]
      .sort((a, b) => b[1].n - a[1].n)
      .slice(0, 6)
      .map(([key, v]) => ({ key, perSecond: v.n / (ms / 1000), last: v.last }));
  }, seconds * 1000);
}

/** O que a thread principal faz parada, sem animação: as funções que mais gastam (para o que não é efeito). */
async function idleProfile(browser, page, ctx) {
  const { context, tab, cdp } = await openPage(browser, page, ctx);
  await tab.evaluate(() => {
    for (const a of document.getAnimations()) a.pause();
  });
  await tab.waitForTimeout(400);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
  await cdp.send('Profiler.start');
  await tab.waitForTimeout(ctx.seconds * 1000);
  const { profile } = await cdp.send('Profiler.stop');
  await cdp.send('Profiler.disable');
  const texts = await textMutations(tab, ctx.seconds);
  const trace = await traceIdle(browser, tab, ctx.seconds);
  await context.close();
  const self = new Map();
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  profile.samples.forEach((id, index) => {
    const node = byId.get(id);
    const frame = node.callFrame;
    const key = `${frame.functionName || '(anônima)'} · ${frame.url.replace(ctx.base, '') || '(nativo)'}:${frame.lineNumber}`;
    self.set(key, (self.get(key) ?? 0) + (profile.timeDeltas[index] ?? 0));
  });
  const total = [...self.values()].reduce((a, b) => a + b, 0) || 1;
  return {
    texts,
    trace,
    busyMs: (total - (self.get('(idle) · (nativo):-1') ?? 0)) / 1000,
    top: [...self]
      .filter(([key]) => !key.startsWith('(idle)'))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([key, micro]) => ({ key, ms: micro / 1000 })),
  };
}

/** A mediana, janela a janela, de várias execuções da mesma página; o censo e as camadas vêm da primeira que os tem. */
function mergeRuns(runs) {
  if (runs.length === 1) return runs[0];
  const pick = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const withCensus = runs.find((r) => r.census) ?? runs[0];
  const merged = { ...withCensus, windows: {} };
  for (const name of WINDOWS) {
    merged.windows[name] = Object.fromEntries(
      Object.keys(runs[0].windows[name]).map((key) => [
        key,
        pick(runs.map((r) => r.windows[name][key])),
      ]),
    );
  }
  return merged;
}

/**
 * Limites do modo --guard (a verificação da CI): nada aqui depende do relógio da máquina, só de quanto trabalho a
 * página faz PARADA. Uma página quieta não recalcula estilo nem refaz layout nem escreve texto sem motivo; qualquer
 * laço (número que não para, animação de pintura) estoura isto em qualquer computador, com ou sem GPU.
 */
export const GUARD_LIMITS = {
  /** Fração de um núcleo que a thread principal gasta parada (0,15 = 15%), com a CPU sem estrangular. */
  mainThreadBusy: 0.15,
  /** Layouts por segundo, parada. */
  layoutsPerSecond: 4,
  /** Escritas de texto por segundo, parada. */
  textWritesPerSecond: 2,
  /** Animações contínuas fora do compositor (background-position, box-shadow, width…), em qualquer quantidade. */
  offCompositorAnimations: 0,
};

/** Uma página parada, 8 s depois de pronta (os pulsos decorativos já terminaram), medida por 3 s. */
async function idleGuard(browser, page, ctx) {
  const { context, tab, cdp } = await openPage(browser, page, { ...ctx, cpu: 1 });
  await tab.waitForTimeout(8000);
  // --pause <nome>: pausa as animações contínuas desse nome (ou 'todas') antes de medir, para atribuir o custo.
  if (ctx.pause) {
    await tab.evaluate(
      (only) => window.__anim.pause(only),
      ctx.pause === 'todas' ? null : ctx.pause,
    );
    await tab.waitForTimeout(300);
  }
  const before = await metricsOf(cdp);
  const texts = await textMutations(tab, 3);
  const after = await metricsOf(cdp);
  const census = await tab.evaluate(CENSUS);
  const trace = flag('--trace') ? await traceIdle(browser, tab, 3) : null;
  await context.close();
  const offCompositor = census.animations.filter(
    (a) => a.running && a.infinite && a.offCompositor.length > 0,
  );
  return {
    styleRecalcsPerSecond: (after.RecalcStyleCount - before.RecalcStyleCount) / 3,
    layoutsPerSecond: (after.LayoutCount - before.LayoutCount) / 3,
    mainThreadBusy: (after.TaskDuration - before.TaskDuration) / 3,
    textWritesPerSecond: texts.reduce((sum, t) => sum + t.perSecond, 0),
    offCompositorAnimations: offCompositor.length,
    offCompositorNames: [
      ...new Set(offCompositor.map((a) => `${a.name}(${a.offCompositor.join(',')})`)),
    ],
    running: [
      ...new Set(
        census.animations
          .filter((a) => a.running)
          .map((a) => `${a.name}${a.infinite ? ' (infinita)' : ''} em ${a.el}`),
      ),
    ],
    trace,
    topText: texts[0] ? `${texts[0].key} ${f1(texts[0].perSecond)}×/s` : '-',
  };
}

async function runGuard(browser, ctx, { only, serverPath, profilePath }) {
  console.log('Verificação de repouso (CPU sem estrangular, 3 s parada, 8 s depois de pronta)\n');
  console.log(
    '| Página | recálculos de estilo/s | layouts/s | escritas de texto/s | thread principal ocupada | animações fora do compositor | |',
  );
  console.log('|---|---:|---:|---:|---:|---:|---|');
  const failures = [];
  for (const page of PAGES) {
    if (only && !only.includes(page.name)) continue;
    const target =
      page.path === '{profile}' ? profilePath : page.path === '{server}' ? serverPath : page.path;
    if (!target || (page.auth && !ctx.storageState)) {
      console.log(`| ${page.name} | - | - | - | - | pulada |`);
      failures.push(`${page.name}: pulada (faltou sessão, perfil ou servidor)`);
      continue;
    }
    const r = await idleGuard(browser, { ...page, target }, ctx);
    const broken = Object.entries(GUARD_LIMITS)
      .filter(([key, limit]) => r[key] > limit)
      .map(([key, limit]) => `${key} ${f1(r[key])} > ${limit}`);
    if (broken.length) {
      failures.push(
        `${page.name}: ${broken.join('; ')}${r.offCompositorNames.length ? ` [${r.offCompositorNames.join(', ')}]` : ''}${r.textWritesPerSecond > GUARD_LIMITS.textWritesPerSecond ? ` [texto: ${r.topText}]` : ''}`,
      );
    }
    if (r.trace) {
      console.log(`  · ${page.name}: animações rodando: ${r.running.join(' | ') || '-'}`);
      for (const w of r.trace.work)
        console.log(`  · ${page.name}: ${f1(w.ms)} ms em ${w.n}× ${w.name}`);
      for (const x of r.trace.reasons)
        console.log(`  · ${page.name}: invalidação ${x.n}× ${x.key}`);
      for (const x of r.trace.stacks) console.log(`  · ${page.name}: pilha ${x.n}× ${x.key}`);
      for (const x of r.trace.callers) console.log(`  · ${page.name}: ${f1(x.ms)} ms ${x.key}`);
    }
    console.log(
      `| ${page.name} | ${f1(r.styleRecalcsPerSecond)} | ${f1(r.layoutsPerSecond)} | ${f1(r.textWritesPerSecond)} | ${pct(r.mainThreadBusy)} | ${r.offCompositorAnimations} | ${broken.length ? 'ACIMA' : 'ok'} |`,
    );
  }
  if (failures.length) {
    console.log(`\nReprovadas:\n${failures.map((x) => `- ${x}`).join('\n')}`);
    process.exitCode = 1;
  }
}

/** O modo --hydration: tarefas longas e quem as causa na carga fria de cada página (CPU lenta). */
async function runHydration(browser, ctx, { only, serverPath, profilePath }) {
  console.log(
    'Carga fria com a CPU ' +
      ctx.cpu +
      '× mais lenta: tarefas longas (>50 ms) e os scripts que as causam\n',
  );
  console.log(
    '| Página | TBT ms | tarefas longas | maior ms | JS (script) ms | estilo+layout ms | load ms |',
  );
  console.log('|---|---:|---:|---:|---:|---:|---:|');
  const details = [];
  for (const page of PAGES) {
    if (only && !only.includes(page.name)) continue;
    const target =
      page.path === '{profile}' ? profilePath : page.path === '{server}' ? serverPath : page.path;
    if (!target || (page.auth && !ctx.storageState)) continue;
    const context = await browser.newContext({
      viewport: ctx.viewport,
      deviceScaleFactor: ctx.dsf,
      ...(ctx.storageState ? { storageState: ctx.storageState } : {}),
    });
    const tab = await context.newPage();
    await tab.addInitScript(RECORDER);
    const cdp = await context.newCDPSession(tab);
    await cdp.send('Performance.enable');
    if (ctx.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: ctx.cpu });
    await tab.goto(ctx.base + target, { waitUntil: 'load', timeout: 120_000 });
    await tab.waitForTimeout(6000);
    const raw = await tab.evaluate(() => window.__fps.peek());
    const timing = await tab.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      return { load: nav.loadEventEnd };
    });
    const m = await metricsOf(cdp);
    await context.close();
    const tasks = raw.longtasks.map((x) => x.d);
    const tbt = tasks.reduce((sum, d) => sum + Math.max(0, d - 50), 0);
    console.log(
      '| ' +
        page.name +
        ' | ' +
        Math.round(tbt) +
        ' | ' +
        tasks.length +
        ' | ' +
        Math.round(Math.max(0, ...tasks)) +
        ' | ' +
        Math.round((m.ScriptDuration ?? 0) * 1000) +
        ' | ' +
        Math.round(((m.RecalcStyleDuration ?? 0) + (m.LayoutDuration ?? 0)) * 1000) +
        ' | ' +
        Math.round(timing.load) +
        ' |',
    );
    const byScript = new Map();
    for (const frame of raw.loaf) {
      for (const sc of frame.scripts) {
        const key = `${(sc.u || '(inline)').split('/').pop()} · ${sc.i || sc.f || ''}`;
        byScript.set(key, (byScript.get(key) ?? 0) + sc.d);
      }
    }
    details.push({ page: page.name, top: [...byScript].sort((a, b) => b[1] - a[1]).slice(0, 5) });
  }
  console.log(
    '\n#### Quem ocupa a thread na carga (soma da duração por script, nos quadros longos)\n',
  );
  for (const d of details) {
    console.log(
      '- ' +
        d.page +
        ': ' +
        (d.top.map(([k, ms]) => `${Math.round(ms)} ms ${k}`).join(' | ') ||
          '(nenhum quadro longo)'),
    );
  }
}

/** O modo --hidden: o que uma aba em segundo plano ainda faz (pedidos, recálculos, mutações). */
async function runHidden(browser, ctx, { only, serverPath, profilePath }) {
  console.log(
    'Aba em segundo plano (outra aba em primeiro plano), 8 s depois de pronta, medida por 10 s\n',
  );
  console.log(
    '| Página | document.hidden | pedidos | recálculos de estilo/s | layouts/s | mutações do DOM/s |',
  );
  console.log('|---|:-:|---:|---:|---:|---:|');
  const notes = [];
  for (const page of PAGES) {
    if (only && !only.includes(page.name)) continue;
    const target =
      page.path === '{profile}' ? profilePath : page.path === '{server}' ? serverPath : page.path;
    if (!target || (page.auth && !ctx.storageState)) continue;
    const context = await browser.newContext({
      viewport: ctx.viewport,
      deviceScaleFactor: ctx.dsf,
      ...(ctx.storageState ? { storageState: ctx.storageState } : {}),
    });
    const tab = await context.newPage();
    const cdp = await context.newCDPSession(tab);
    await cdp.send('Performance.enable');
    const requests = new Map();
    let counting = false;
    tab.on('request', (r) => {
      if (!counting) return;
      const key = `${r.method()} ${r.url().replace(ctx.base, '').split('?')[0]}`;
      requests.set(key, (requests.get(key) ?? 0) + 1);
    });
    await tab.goto(ctx.base + target, { waitUntil: 'load', timeout: 120_000 });
    await tab.waitForTimeout(8000);
    await tab.evaluate(() => {
      window.__hid = { mutations: 0 };
      new MutationObserver((r) => {
        window.__hid.mutations += r.length;
      }).observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
      });
    });
    const other = await context.newPage();
    await other.goto('about:blank');
    await other.bringToFront();
    await tab.waitForTimeout(500);
    const hidden = await tab.evaluate(() => document.hidden);
    const before = await metricsOf(cdp);
    const mutationsBefore = await tab.evaluate(() => window.__hid.mutations);
    counting = true;
    await tab.waitForTimeout(10_000);
    counting = false;
    const after = await metricsOf(cdp);
    const mutations = (await tab.evaluate(() => window.__hid.mutations)) - mutationsBefore;
    await context.close();
    const reqs = [...requests].sort((a, b) => b[1] - a[1]);
    console.log(
      '| ' +
        page.name +
        ' | ' +
        (hidden ? 'sim' : 'NÃO') +
        ' | ' +
        reqs.reduce((n, [, c]) => n + c, 0) +
        ' | ' +
        f1((after.RecalcStyleCount - before.RecalcStyleCount) / 10) +
        ' | ' +
        f1((after.LayoutCount - before.LayoutCount) / 10) +
        ' | ' +
        f1(mutations / 10) +
        ' |',
    );
    notes.push(
      `- ${page.name}: ${reqs.map(([k, c]) => `${c}× ${k}`).join(' | ') || 'nenhum pedido'}`,
    );
  }
  console.log('\n#### Pedidos de rede feitos com a aba oculta (10 s)\n');
  for (const n of notes) console.log(n);
}

/** O modo --animations: a lista das animações contínuas de cada página, ordenada pelo ganho de desligar cada uma. */
async function runAnimations(browser, ctx, { only, serverPath, profilePath, jsonPath }) {
  const rounds = Math.max(ctx.repeat, 3);
  const out = [];
  console.log(
    `Modo animações: ${rounds} rodadas intercaladas por condição (mediana), repouso de ${ctx.seconds}s, vsync do monitor.
`,
  );
  for (const page of PAGES) {
    if (only && !only.includes(page.name)) continue;
    const target =
      page.path === '{profile}' ? profilePath : page.path === '{server}' ? serverPath : page.path;
    if (!target || (page.auth && !ctx.storageState)) continue;
    const withTarget = { ...page, target };
    process.stderr.write(`animações de ${page.name}…
`);
    const ranking = flag('--idle-only')
      ? { base: { fps: 0, msPerFrame: 0, thread: 0 }, rows: [] }
      : await animationRanking(browser, withTarget, ctx, rounds);
    const profile = await idleProfile(browser, withTarget, ctx);
    out.push({ page: withTarget, ranking, profile });
    console.log(
      `#### ${page.name}: parada, ${f1(ranking.base.fps)} fps e ${f1(ranking.base.msPerFrame)} ms de CPU (renderer + GPU) por quadro; thread principal ${f1(ranking.base.thread)} ms/quadro
`,
    );
    console.log(
      '| Animação contínua | elementos | ms/quadro que saem | fps sem ela | thread ms/quadro sem ela |',
    );
    console.log('|---|---:|---:|---:|---:|');
    for (const row of ranking.rows) {
      console.log(
        `| ${row.name}${row.el ? ` (${row.el})` : ''} | ${row.count ?? '-'} | ${f1(row.saved)} | ${f1(row.fps)} | ${f1(row.thread)} |`,
      );
    }
    console.log(
      `
Sem nenhuma animação, a thread principal ainda trabalha ${f1(profile.busyMs)} ms em ${ctx.seconds}s. Mais caros:`,
    );
    for (const item of profile.top) console.log(`- ${f1(item.ms)} ms · ${item.key}`);
    console.log(
      '\nRastro do repouso (tipos de trabalho; invalidações de estilo e quem as chamou):',
    );
    for (const w of profile.trace.work) console.log(`- ${f1(w.ms)} ms em ${w.n}× ${w.name}`);
    for (const r of profile.trace.reasons) console.log(`- invalidação ${r.n}× ${r.key}`);
    for (const c of profile.trace.callers) console.log(`- ${f1(c.ms)} ms · ${c.key}`);
    for (const st of profile.trace.stacks) console.log(`- pilha ${st.n}× ${st.key}`);
    for (const t of profile.texts)
      console.log(
        `- texto muda ${f1(t.perSecond)}×/s em ${t.key} (últimos: ${t.last.join(' | ')})`,
      );
    console.log('');
  }
  for (const note of new Set(ctx.diagnostics)) console.log(`ATENÇÃO ${note}`);
  if (jsonPath) await writeFile(jsonPath, JSON.stringify(out, null, 2));
}

async function main() {
  const base = (option('--base') ?? 'http://localhost:3000').replace(/\/$/, '');
  const storagePath = option('--storage-state');
  const profilePath = option('--profile');
  const serverPath = option('--server');
  const only = option('--only')?.split(',');
  const ablateOption = option('--ablate');
  const ablations = ablateOption
    ? ablateOption === 'all'
      ? Object.keys(ABLATIONS)
      : ablateOption.split(',')
    : [];
  const [width, height] = (option('--viewport') ?? '1536x864').split('x').map(Number);
  const ctx = {
    base,
    cpu: Number(option('--cpu') ?? 4),
    dsf: Number(option('--dsf') ?? 1.25),
    seconds: Number(option('--seconds') ?? 3),
    repeat: Number(option('--repeat') ?? 1),
    diagnostics: [],
    pause: option('--pause'),
    fakeViewer: flag('--guard') || flag('--viewer-falso'),
    viewport: { width, height },
    storageState: storagePath ? JSON.parse(await readFile(storagePath, 'utf8')) : undefined,
  };

  const browser = await chromium.launch({
    headless: !flag('--headed'),
    args: [
      ...(flag('--vsync') || flag('--animations')
        ? []
        : ['--disable-frame-rate-limit', '--disable-gpu-vsync']),
      '--enable-benchmarking',
      ...(flag('--headed') ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
    ],
  });
  console.log(
    `Chromium ${browser.version()} · ${flag('--headed') ? 'janela com GPU' : 'sem janela (raster por software)'} · CPU ${ctx.cpu}× mais lenta · ${width}×${height} @${ctx.dsf}x · ${ctx.seconds}s por janela\n`,
  );

  ctx.browserCdp = await browser.newBrowserCDPSession();
  if (flag('--hydration')) {
    await runHydration(browser, ctx, { only, serverPath, profilePath });
    await browser.close();
    return;
  }
  if (flag('--hidden')) {
    await runHidden(browser, ctx, { only, serverPath, profilePath });
    await browser.close();
    return;
  }
  if (flag('--guard')) {
    await runGuard(browser, ctx, { only, serverPath, profilePath });
    await browser.close();
    return;
  }
  if (flag('--animations')) {
    await runAnimations(browser, ctx, {
      only,
      serverPath,
      profilePath,
      jsonPath: option('--json'),
    });
    await browser.close();
    return;
  }
  const baseline = [];
  const ablated = [];
  const conditions = [null, ...ablations];
  for (const page of PAGES) {
    if (only && !only.includes(page.name)) continue;
    const target =
      page.path === '{profile}' ? profilePath : page.path === '{server}' ? serverPath : page.path;
    if (!target || (page.auth && !ctx.storageState)) {
      console.log(`(pulada: ${page.name})`);
      continue;
    }
    const withTarget = { ...page, target };
    process.stderr.write(`medindo ${page.name}…\n`);
    // rodadas intercaladas: base, A, B, base, A, B… (a ordem não favorece ninguém)
    const runs = new Map(conditions.map((name) => [name, []]));
    for (let round = 0; round < ctx.repeat; round++) {
      for (const name of conditions) {
        runs
          .get(name)
          .push(
            await measurePage(browser, withTarget, ctx, name === null ? null : ABLATIONS[name]),
          );
      }
    }
    baseline.push({ page: withTarget, result: mergeRuns(runs.get(null)) });
    ablated.push({
      page: withTarget,
      per: Object.fromEntries(ablations.map((name) => [name, mergeRuns(runs.get(name))])),
    });
  }
  printTable(baseline);
  if (baseline.every((row) => row.result.census)) {
    printCensus(baseline);
    printLayers(baseline);
  }
  for (const { page, result } of baseline) {
    if (!result.settled)
      console.log(
        `\nATENÇÃO: ${page.name} ainda mostrava esqueleto ao medir (dado não chegou em 20 s).`,
      );
  }
  if (ablations.length) {
    console.log(
      '\n#### O custo de cada efeito (fps médio da janela, antes → depois de neutralizá-lo; rodadas intercaladas)\n',
    );
    console.log(`| Página | Janela | base | ${ablations.join(' | ')} |`);
    console.log(`|---|---|---:|${ablations.map(() => '---:').join('|')}|`);
    for (const row of ablated) {
      const base = baseline.find((b) => b.page.name === row.page.name).result;
      for (const w of WINDOWS) {
        const cells = ablations.map((name) => {
          const value = row.per[name].windows[w].fps;
          const baseValue = base.windows[w].fps;
          const delta = baseValue ? ((value - baseValue) / baseValue) * 100 : 0;
          return `${f1(value)} (${delta >= 0 ? '+' : ''}${Math.round(delta)}%)`;
        });
        console.log(
          '| ' +
            row.page.name +
            ' | ' +
            w +
            ' | ' +
            f1(base.windows[w].fps) +
            ' | ' +
            cells.join(' | ') +
            ' |',
        );
      }
    }
  }
  await browser.close();

  const jsonPath = option('--json');
  if (jsonPath) {
    await writeFile(
      jsonPath,
      JSON.stringify(
        { ctx: { ...ctx, storageState: undefined, browserCdp: undefined }, baseline, ablated },
        null,
        2,
      ),
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
