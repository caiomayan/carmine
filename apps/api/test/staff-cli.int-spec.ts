import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountsService } from '../src/accounts/accounts.service.js';
import { AvatarRefresher } from '../src/accounts/avatar-refresher.js';
import { DisplayNames } from '../src/accounts/display-names.js';
import { placeholderNameFor } from '../src/accounts/placeholder-names.js';
import { accountStatsWeekly, accounts } from '../src/database/schema.js';
import { StaffReports } from '../src/reports/staff-reports.js';
import { StaffAuditLog } from '../src/staff/audit-log.js';
import { runStaffCli } from '../src/staff/staff.cli-commands.js';
import { StaffRoles } from '../src/staff/staff-roles.js';
import { RankingRemovals } from '../src/stats/ranking-removals.js';
import { steamIdFor } from './support/app.js';
import { startPostgres, type TestPostgres } from './support/postgres.js';

describe('CLI staff (S07)', () => {
  let postgres: TestPostgres;
  let roles: StaffRoles;
  let accountsService: AccountsService;

  beforeAll(async () => {
    postgres = await startPostgres();
    roles = new StaffRoles(postgres.db);
    accountsService = new AccountsService(postgres.db, new AvatarRefresher(postgres.db, null));
  });

  afterAll(async () => {
    await postgres?.stop();
  });

  async function run(...argv: string[]) {
    const out: string[] = [];
    const err: string[] = [];
    const code = await runStaffCli(argv, {
      findAccountId: async (steamId) => {
        const [row] = await postgres.db
          .select({ id: accounts.id })
          .from(accounts)
          .where(eq(accounts.steamId, BigInt(steamId)));
        return row?.id ?? null;
      },
      roles,
      displayNames: new DisplayNames(postgres.db),
      rankingRemovals: new RankingRemovals(postgres.db),
      reports: new StaffReports(postgres.db),
      out: (line) => out.push(line),
      err: (line) => err.push(line),
    });
    return { code, out: out.join('\n'), err: err.join('\n') };
  }

  it('cria o primeiro Dono, lista a Staff e registra no log de auditoria', async () => {
    const steamId = steamIdFor(1);
    const { account } = await accountsService.claimOnLogin(steamId);

    const granted = await run(
      'grant',
      '--steam-id',
      steamId,
      '--role',
      'owner',
      '--by',
      steamId,
      '--reason',
      'fundador',
    );

    expect(granted.code, granted.err).toBe(0);
    expect(granted.out).toBe(`${steamId} agora é Dono.`);
    expect((await run('list')).out).toContain(`Dono\t${steamId}\t#${account.publicId}`);
    const [entry] = (await new StaffAuditLog(postgres.db).page({ targetSteamId: steamId })).entries;
    expect(entry).toMatchObject({
      action: 'role_grant',
      reason: 'fundador',
      details: { roleBefore: null, roleAfter: 'owner' },
    });
  });

  it('reset-name volta o nome ao do Steam e registra o motivo', async () => {
    const steamId = steamIdFor(7);
    const { account } = await accountsService.claimOnLogin(steamId);
    await new DisplayNames(postgres.db).change(account.id, 'Nome Ruim');
    const by = steamIdFor(1);

    const done = await run('reset-name', '--steam-id', steamId, '--by', by, '--reason', 'ofensivo');

    expect(done.code, done.err).toBe(0);
    expect(done.out).toContain(
      `${steamId} agora aparece como "${placeholderNameFor(account.publicId)}"`,
    );
    const { entries } = await new StaffAuditLog(postgres.db).page({ targetSteamId: steamId });
    expect(entries[0]).toMatchObject({ action: 'display_name_reset', reason: 'ofensivo' });
    const noReason = await run('reset-name', '--steam-id', steamId, '--by', by);
    expect(noReason.code).toBe(1);
    expect(noReason.err).toContain('--reason é obrigatório');
  });

  it('ranking-remove tira a entrada do Ranking, registra o motivo e mantém as Estatísticas', async () => {
    const steamId = steamIdFor(8);
    const { account } = await accountsService.claimOnLogin(steamId);
    await postgres.db
      .insert(accountStatsWeekly)
      .values({ accountId: account.id, mode: 'retake', weekStart: '2026-10-12', kills: 3 });
    const args = (week: string) => [
      'ranking-remove',
      '--steam-id',
      steamId,
      '--mode',
      'retake',
      '--week',
      week,
      '--by',
      steamIdFor(1),
      '--reason',
      'bot farm',
    ];

    const done = await run(...args('2026-10-12'));
    const again = await run(...args('2026-10-12'));
    const notMonday = await run(...args('2026-10-13'));

    expect(done.code, done.err).toBe(0);
    expect(done.out).toContain('saiu do Ranking de retake da semana 2026-10-12');
    expect(again.err).toContain('já foi removida');
    expect(notMonday.err).toContain('segunda-feira');
    const { entries } = await new StaffAuditLog(postgres.db).page({ targetSteamId: steamId });
    expect(entries[0]).toMatchObject({
      action: 'ranking_entry_remove',
      reason: 'bot farm',
      details: { mode: 'retake', weekStart: '2026-10-12' },
    });
    const [stats] = await postgres.db.select().from(accountStatsWeekly);
    expect(stats?.kills).toBe(3);
  });

  it('não tira o último Dono', async () => {
    const result = await run(
      'revoke',
      '--steam-id',
      steamIdFor(1),
      '--by',
      steamIdFor(1),
      '--reason',
      'x',
    );

    expect(result.code).toBe(1);
    expect(result.err).toContain('ao menos um Dono');
  });

  it.each([
    [
      [
        'grant',
        '--steam-id',
        steamIdFor(2),
        '--role',
        'chefe',
        '--by',
        steamIdFor(1),
        '--reason',
        'x',
      ],
      '--role',
    ],
    [['grant', '--steam-id', steamIdFor(2), '--role', 'admin', '--by', steamIdFor(1)], '--reason'],
    [
      [
        'grant',
        '--steam-id',
        steamIdFor(404),
        '--role',
        'admin',
        '--by',
        steamIdFor(1),
        '--reason',
        'x',
      ],
      'nenhuma Conta',
    ],
    [['frobnicate'], 'Uso:'],
  ])('recusa %j', async (argv, message) => {
    const result = await run(...argv);

    expect(result.code).toBe(1);
    expect(result.err).toContain(message);
  });
});
