import { execFile } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { expect, test } from '@playwright/test';
import { createUnclaimedAccount, signInByRequest } from './accounts';
import { daysAgo, playWeek } from './game-events';
import { createServer, keepBeatingWith } from './live-servers';
import { addAndEquip } from './loadout-api';

const run = promisify(execFile);
const KARAMBIT_FADE = 1327;
const AWP_ASIIMOV = 306;

/**
 * A auditoria de quadros por segundo (`pnpm fps:audit`, `scripts/fps-audit.mjs`) contra o build de produção que a
 * stack do E2E sobe. Semeia o que as páginas mostram de verdade (uma Conta que jogou, com Itens equipados, um
 * Ranking com gente, um servidor com placar e jogadores ao vivo), entra com ela e mede as páginas com a CPU 4× mais
 * lenta. Os argumentos extras do script vêm de `FPS_ARGS` (ex.: `--headed --ablate all --only Home,Perfil`).
 *
 * Sem `FPS_ARGS`, é a verificação da CI (`--guard`): parada, a página não pode ocupar a thread principal, refazer layout nem
 * escrever texto sem parar, nem manter animação contínua fora do compositor. Nada disso depende do relógio da
 * máquina, então vale num runner compartilhado e sem GPU; os fps em si ficam só no relatório da auditoria.
 */
test('o fps de cada página', async ({ page, request, baseURL }) => {
  test.setTimeout(45 * 60_000);

  const player = await createUnclaimedAccount(request, 'Auditoria fps');
  const others = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      createUnclaimedAccount(request, `Parceiro fps ${index + 1}`),
    ),
  );
  const [first, second] = others as [(typeof others)[number], (typeof others)[number]];
  const everyone = [player.steamId, ...others.map((other) => other.steamId)];
  const kills = (killer: string, victim: string, count: number, headshots: number) =>
    Array.from({ length: count }, (_, index) => ({ killer, victim, headshot: index < headshots }));
  await playWeek(request, {
    rounds: { steamIds: everyone, count: 60 },
    kills: [
      ...kills(player.steamId, first.steamId, 12, 4),
      ...others.flatMap((other, index) =>
        kills(other.steamId, player.steamId, 2 + index, index % 3),
      ),
    ],
    sessions: everyone.map((steamId, index) => ({ steamId, seconds: 5400 - index * 300 })),
  });
  await playWeek(request, {
    at: daysAgo(8),
    rounds: { steamIds: everyone, count: 40 },
    kills: kills(player.steamId, second.steamId, 6, 3),
    sessions: [{ steamId: player.steamId, seconds: 3600 }],
  });
  await signInByRequest(page, player.steamId);
  await addAndEquip(page, { id: KARAMBIT_FADE });
  await addAndEquip(page, { id: AWP_ASIIMOV }, ['t']);

  const server = createServer();
  const stop = keepBeatingWith(request, server, () => ({
    map: 'de_mirage',
    players: everyone.slice(0, 8),
    maxPlayers: 10,
    match: { round: 14, ctScore: 9, tScore: 4, warmup: false },
    scoreboard: everyone.slice(0, 8).map((steamId, index) => ({
      steamId,
      team: index % 2 === 0 ? 'ct' : 't',
      kills: 12 - index,
      deaths: index + 2,
      score: 30 - index * 3,
    })),
  }));
  try {
    const { servers } = (await (await request.get('/api/servers')).json()) as {
      servers: { id: string; name: string }[];
    };
    const serverId = servers.find((candidate) => candidate.name === server.name)?.id;
    expect(serverId, 'o servidor semeado aparece na lista').toBeTruthy();

    const dir = path.join('test-results', 'fps');
    await mkdir(dir, { recursive: true });
    const storageState = path.join(dir, 'sessao.json');
    await writeFile(storageState, JSON.stringify(await page.context().storageState()));
    const json = path.join(dir, 'fps.json');

    // Com FPS_ARGS é a auditoria (medição, sem reprovar); sem, é a verificação de repouso da CI (reprova).
    const audit = (process.env.FPS_ARGS ?? '').split(/\s+/).filter(Boolean);
    const args = [
      'scripts/fps-audit.mjs',
      '--base',
      baseURL ?? 'http://localhost:3000',
      '--storage-state',
      storageState,
      '--profile',
      `/${player.publicId}`,
      '--server',
      `/servidores/${serverId}`,
      '--json',
      json,
      ...(audit.length ? audit : ['--guard']),
    ];
    let stdout = '';
    let failed = false;
    try {
      stdout = (await run(process.execPath, args, { maxBuffer: 50_000_000 })).stdout;
    } catch (caught) {
      failed = true;
      const output = caught as { stdout?: string; stderr?: string };
      stdout = `${output.stdout ?? ''}
${output.stderr ?? ''}`;
    }
    console.log(`
fps por página

${stdout}`);
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
        `### fps por página

${stdout}
`,
      );
    }
    expect(
      failed,
      `alguma página trabalha demais parada:
${stdout}`,
    ).toBe(false);
    expect(stdout, 'nenhuma página foi pulada').not.toContain('(pulada');
  } finally {
    stop();
  }
});
