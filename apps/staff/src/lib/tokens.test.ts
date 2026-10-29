import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Os tokens do painel são os do site (a identidade é a mesma): `apps/staff/src/app/tokens.css` é uma cópia fiel de
 * `apps/web/src/app/tokens.css`. Mudou lá, copie para cá: este teste é o que impede as duas de divergirem.
 */
describe('tokens do painel', () => {
  it('são iguais aos do site', () => {
    const staff = readFileSync(new URL('../app/tokens.css', import.meta.url), 'utf8');
    const web = readFileSync(new URL('../../../web/src/app/tokens.css', import.meta.url), 'utf8');
    expect(staff).toBe(web);
  });
});
