import type { Page } from '@playwright/test';
import { newSteamId, signInFromHeader } from './accounts';
import { viewerItem } from './fake-viewer';
import { expect, test } from './fixtures';

const AK_REDLINE = 222;

/** Anota no `window` cada violação da CSP (o Chrome também as loga como erro de console). */
async function trackCspViolations(page: Page) {
  await page.addInitScript(() => {
    const seen: string[] = [];
    Object.assign(window, { __cspViolations: seen });
    document.addEventListener('securitypolicyviolation', (event) => {
      seen.push(
        `${event.violatedDirective}: ${event.blockedURI} (${event.sourceFile}:${event.lineNumber})`,
      );
    });
  });
}

const cspViolations = (page: Page) =>
  page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations);

test('as páginas trazem a CSP e os cabeçalhos de segurança', async ({ request }) => {
  const response = await request.get('/');
  const headers = response.headers();

  const csp = headers['content-security-policy'];
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("base-uri 'self'");
  expect(csp).toContain("form-action 'self'");
  expect(csp).toContain('frame-src https://3d.cstrike.app');
  expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);

  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['permissions-policy']).toContain('camera=()');
  // HSTS só existe no build de produção (não no `next dev`).
  if (process.env.E2E_DEV !== '1') {
    expect(headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
  } else {
    expect(headers['strict-transport-security']).toBeUndefined();
  }
});

test('cada resposta tem um nonce novo e todo <script> do HTML o carrega', async ({ request }) => {
  const nonceOf = (response: { headers(): Record<string, string> }) =>
    /'nonce-([^']+)'/.exec(response.headers()['content-security-policy'] ?? '')?.[1];

  const first = await request.get('/termos');
  const second = await request.get('/termos');
  expect(nonceOf(first)).toBeTruthy();
  expect(nonceOf(first)).not.toBe(nonceOf(second));

  const html = await first.text();
  const scripts = html.match(/<script\b[^>]*>/g) ?? [];
  expect(scripts.length).toBeGreaterThan(0);
  for (const tag of scripts) {
    expect(tag, 'script sem nonce').toContain(`nonce="${nonceOf(first)}"`);
  }
});

test('a API não ganha a CSP das páginas, mas tem nosniff', async ({ request }) => {
  const health = await request.get('/api/health');
  expect(health.headers()['content-security-policy']).toBeUndefined();
  expect(health.headers()['x-content-type-options']).toBe('nosniff');
});

test('home, entrar e login completo não violam a CSP', async ({ page }) => {
  await trackCspViolations(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Servidores' })).toBeVisible();
  // O script do tema (inline, com nonce) rodou antes da hidratação.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await cspViolations(page)).toEqual([]);

  await page.goto('/entrar');
  await expect(page.getByRole('heading', { level: 1, name: 'Entrar na Carmine' })).toBeVisible();
  expect(await cspViolations(page)).toEqual([]);

  // Home → Steam (falsa) → callback → volta ao site: nenhuma navegação é barrada.
  await page.goto('/');
  await signInFromHeader(page, newSteamId());
  await expect(page).toHaveURL('/');
  await expect(page.getByTestId('sign-in')).toHaveCount(0);
  expect(await cspViolations(page)).toEqual([]);
});

test('o editor com o viewer 3D abre o iframe do cstrike.app sem violar a CSP', async ({ page }) => {
  await trackCspViolations(page);
  await page.goto('/inventario');
  await signInFromHeader(page, newSteamId());
  await expect(page).toHaveURL('/inventario');

  await page.goto(`/inventario/adicionar/${AK_REDLINE}`);
  await expect(page.getByTestId('item-viewer')).toHaveAttribute('data-phase', 'ready');
  await expect(page.getByTestId('viewer-iframe')).toHaveAttribute(
    'src',
    /^https:\/\/3d\.cstrike\.app\/view/,
  );
  await expect.poll(() => viewerItem(page)).toMatchObject({});
  expect(await cspViolations(page)).toEqual([]);
});
