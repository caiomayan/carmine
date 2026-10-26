import { execFile } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';
import { createUnclaimedAccount, signInByRequest } from './accounts';
import { daysAgo, playWeek } from './game-events';
import { addAndEquip } from './loadout-api';

const run = promisify(execFile);
const KARAMBIT_FADE = 1327;
const AWP_ASIIMOV = 306;

/**
 * O orçamento de JS por página (`pnpm budget:js`, limites em js-budget.json) contra o build de produção que a
 * stack do E2E sobe. Roda à parte do E2E (`playwright.budget.config.ts`), num passo da CI: semeia uma Conta que
 * jogou três semanas e tem Itens equipados (o Perfil e o Loadout com dado de verdade puxam os gráficos e a
 * vitrine), entra com ela e mede as páginas. Falha se alguma passar do limite; a tabela vai para o log e para o
 * resumo do job.
 */
test('o JS de cada página fica dentro do orçamento', async ({ page, request, baseURL }) => {
  test.setTimeout(300_000);
  const player = await createUnclaimedAccount(request, 'Orçamento JS');
  const other = await createUnclaimedAccount(request, 'Parceiro do orçamento');
  const both = [player.steamId, other.steamId];
  const kills = (count: number, headshots: number) =>
    Array.from({ length: count }, (_, index) => ({
      killer: player.steamId,
      victim: other.steamId,
      headshot: index < headshots,
    }));
  await playWeek(request, {
    rounds: { steamIds: both, count: 60 },
    kills: kills(12, 4),
    sessions: [{ steamId: player.steamId, seconds: 5400 }],
  });
  await playWeek(request, {
    at: daysAgo(8),
    rounds: { steamIds: both, count: 40 },
    kills: kills(6, 3),
    sessions: [{ steamId: player.steamId, seconds: 3600 }],
  });
  await signInByRequest(page, player.steamId);
  await addAndEquip(page, { id: KARAMBIT_FADE });
  await addAndEquip(page, { id: AWP_ASIIMOV }, ['t']);

  const dir = await mkdtemp(path.join(tmpdir(), 'js-budget-'));
  const storageState = path.join(dir, 'sessao.json');
  await writeFile(storageState, JSON.stringify(await page.context().storageState()));

  const args = [
    'scripts/js-budget.mjs',
    '--base',
    baseURL ?? 'http://localhost:3000',
    '--storage-state',
    storageState,
    '--profile',
    `/${player.publicId}`,
    '--chunks',
  ];
  let table = '';
  let failed = false;
  try {
    table = (await run(process.execPath, args, { maxBuffer: 10_000_000 })).stdout;
  } catch (caught) {
    failed = true;
    const output = caught as { stdout?: string; stderr?: string };
    table = `${output.stdout ?? ''}\n${output.stderr ?? ''}`;
  }
  console.log(`\nOrçamento de JS por página (gzip, cache frio, 1440 px)\n\n${table}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    // No resumo só a tabela; a lista dos scripts de cada página (--chunks) fica no log.
    const summary = table.split('\n####')[0];
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Orçamento de JS por página\n\n${summary}\n`,
    );
  }
  expect(failed, `alguma página passou do orçamento de JS:\n${table}`).toBe(false);
  expect(table, 'nenhuma página foi pulada').not.toContain('pulada');
});
