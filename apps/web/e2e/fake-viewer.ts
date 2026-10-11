import type { BrowserContext, Page } from '@playwright/test';

/** Como o 3d.cstrike.app responde no teste. */
export type ViewerMode = 'fake' | 'blocked';

const VIEWER_URL = 'https://3d.cstrike.app/**';

/**
 * Um viewer de mentira na mesma origem do de verdade, com o mesmo protocolo postMessage: responde
 * ao `ping` com `ready`, desenha (`rendered`) cada `setItem` e mostra o Item recebido num `<pre>`,
 * para o teste conferir o que o editor mandou ao 3D. Sem rede externa nem WebGL no E2E.
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
