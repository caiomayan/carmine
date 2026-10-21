import type { BrowserContext, Page } from '@playwright/test';

/** Como o 3d.cstrike.app responde no teste. */
export type ViewerMode = 'fake' | 'blocked';

const VIEWER_URL = 'https://3d.cstrike.app/**';

/**
 * Um viewer de mentira na mesma origem do de verdade, com o mesmo protocolo postMessage: responde
 * ao `ping` com `ready`, desenha (`rendered`) cada `setItem` e mostra o Item recebido num `<pre>`,
 * para o teste conferir o que o editor mandou ao 3D. Guarda a seleção que recebe (`setSelection`)
 * e o histórico delas; `__fakeDrag()` "arrasta" o sticker ou o chaveiro selecionado e devolve a
 * posição nova no `change` (sem seleção, não arrasta: no viewer de verdade, fora do objeto
 * selecionado o arrasto gira a arma). Não faz hit-test; isso só se verifica no viewer real.
 * Sem rede nem WebGL.
 */
const FAKE_VIEWER_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>fake viewer</title></head>
<body style="margin:0;background:transparent;color:#888;font:12px monospace">
<pre id="item" hidden></pre>
<pre id="selection" hidden>null</pre>
<pre id="selections" hidden>[]</pre>
<script>
  const SOURCE = '3d.cstrike.app';
  let item = JSON.parse(new URL(location.href).searchParams.get('item') || 'null');
  let selection = null;
  const history = [];
  const show = () => {
    document.getElementById('item').textContent = JSON.stringify(item);
    document.getElementById('selection').textContent = JSON.stringify(selection);
    document.getElementById('selections').textContent = JSON.stringify(history);
  };
  // O que a pessoa faz ao arrastar com um objeto selecionado: move-o e avisa pelo change.
  window.__fakeDrag = () => {
    if (!selection) return false;
    if (selection.kind === 'sticker' && item.stickers && item.stickers[selection.index]) {
      item.stickers[selection.index] = Object.assign({}, item.stickers[selection.index], { x: 0.25, y: 0.1 });
    } else if (selection.kind === 'keychain' && item.keychains && item.keychains['0']) {
      item.keychains['0'] = Object.assign({}, item.keychains['0'], { x: 1, y: 0.5, z: 0 });
    } else return false;
    show();
    post('change', { item, selection, activeSticker: null, schemaCount: 4 });
    return true;
  };
  const post = (type, data, id) =>
    parent.postMessage(Object.assign({ source: SOURCE, v: 1, type, data }, id ? { id } : {}), '*');
  show();
  addEventListener('message', (event) => {
    const m = event.data;
    if (!m || m.source !== SOURCE || m.v !== 1) return;
    if (m.type === 'ping') { post('ready', { v: 1 }); post('rendered', { item }); }
    if (m.type === 'setItem') { item = m.data.item; show(); post('rendered', { item }); }
    if (m.type === 'setSelection') {
      selection = m.data.selection;
      history.push(selection);
      show();
    }
    if (m.type === 'getState') {
      post('state', { item, selection: null, activeSticker: null, schemaCount: 4 }, m.id);
    }
  });
</script>
</body></html>`;

export async function routeViewer(context: BrowserContext, mode: ViewerMode) {
  await context.route(VIEWER_URL, (route) =>
    mode === 'blocked'
      ? route.abort('blockedbyclient')
      : route.fulfill({ status: 200, contentType: 'text/html', body: FAKE_VIEWER_HTML }),
  );
}

/** O Item que o viewer (falso) está mostrando agora. */
export async function viewerItem(page: Page): Promise<Record<string, unknown> | null> {
  const text = await page
    .frameLocator('[data-testid="viewer-iframe"]')
    .locator('#item')
    .textContent({ timeout: 2000 })
    .catch(() => null);
  return text ? (JSON.parse(text) as Record<string, unknown>) : null;
}

/** A seleção que o viewer (falso) tem agora: o que ele deixaria arrastar. */
export async function viewerSelection(page: Page): Promise<Record<string, unknown> | null> {
  const text = await page
    .frameLocator('[data-testid="viewer-iframe"]')
    .locator('#selection')
    .textContent({ timeout: 2000 })
    .catch(() => null);
  return text ? (JSON.parse(text) as Record<string, unknown> | null) : null;
}

/** Todas as seleções que o viewer (falso) recebeu, na ordem. */
export async function viewerSelections(page: Page): Promise<(Record<string, unknown> | null)[]> {
  const text = await page
    .frameLocator('[data-testid="viewer-iframe"]')
    .locator('#selections')
    .textContent({ timeout: 2000 })
    .catch(() => null);
  return text ? JSON.parse(text) : [];
}

/** Arrasta, no viewer falso, o que estiver selecionado (devolve `false` se nada está). */
export async function dragSelectedInViewer(page: Page): Promise<boolean> {
  const frame = page
    .frames()
    .find((candidate) => candidate.url().startsWith('https://3d.cstrike.app'));
  if (!frame) throw new Error('o viewer falso não está na página');
  return frame.evaluate(() => (window as unknown as { __fakeDrag: () => boolean }).__fakeDrag());
}
