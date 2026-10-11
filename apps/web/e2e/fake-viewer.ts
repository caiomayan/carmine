import type { BrowserContext, Page } from '@playwright/test';

/** Como o 3d.cstrike.app responde no teste. */
export type ViewerMode = 'fake' | 'blocked';

const VIEWER_URL = 'https://3d.cstrike.app/**';

/**
 * Um viewer de mentira na mesma origem do de verdade, com o mesmo protocolo postMessage: responde
 * ao `ping` com `ready`, desenha (`rendered`) cada `setItem` e mostra o Item recebido num `<pre>`,
 * para o teste conferir o que o editor mandou ao 3D. Ao receber `setSelection`, "arrasta" o
 * sticker ou o charm selecionado e devolve a posição nova no `change`. Sem rede nem WebGL.
 */
const FAKE_VIEWER_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>fake viewer</title></head>
<body style="margin:0;background:transparent;color:#888;font:12px monospace">
<pre id="item" hidden></pre>
<script>
  const SOURCE = '3d.cstrike.app';
  let item = JSON.parse(new URL(location.href).searchParams.get('item') || 'null');
  const show = () => { document.getElementById('item').textContent = JSON.stringify(item); };
  const post = (type, data, id) =>
    parent.postMessage(Object.assign({ source: SOURCE, v: 1, type, data }, id ? { id } : {}), '*');
  show();
  addEventListener('message', (event) => {
    const m = event.data;
    if (!m || m.source !== SOURCE || m.v !== 1) return;
    if (m.type === 'ping') { post('ready', { v: 1 }); post('rendered', { item }); }
    if (m.type === 'setItem') { item = m.data.item; show(); post('rendered', { item }); }
    // Simula a pessoa arrastando o que foi selecionado: devolve a posição nova no change.
    if (m.type === 'setSelection' && m.data.selection) {
      const sel = m.data.selection;
      if (sel.kind === 'sticker' && item.stickers && item.stickers[sel.index]) {
        item.stickers[sel.index] = Object.assign({}, item.stickers[sel.index], { x: 0.25, y: 0.1 });
      }
      if (sel.kind === 'keychain' && item.keychains && item.keychains['0']) {
        item.keychains['0'] = Object.assign({}, item.keychains['0'], { x: 1, y: 0.5, z: 0 });
      }
      show();
      post('change', { item, selection: sel, activeSticker: null, schemaCount: 4 });
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
