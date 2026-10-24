import { expect, type Page } from '@playwright/test';
import { csrfToken } from './accounts';

/** Põe um Item no Inventário da Conta logada e o equipa (nos dois lados, ou só em `sides`), por API. */
export async function addAndEquip(
  page: Page,
  item: Record<string, unknown>,
  sides?: ('ct' | 't')[],
) {
  const headers = { 'x-csrf-token': await csrfToken(page.context()) };
  const added = await page.request.post('/api/inventory/items', { headers, data: { item } });
  expect(added.status(), await added.text()).toBe(201);
  const { uid } = (await added.json()) as { uid: string };
  const equipped = await page.request.post('/api/loadout/equip', {
    headers,
    data: { uid, ...(sides ? { sides } : {}) },
  });
  expect(equipped.ok(), await equipped.text()).toBe(true);
  return uid;
}
