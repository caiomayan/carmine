import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AccountsService } from '../src/accounts/accounts.service.js';
import { AvatarRefresher } from '../src/accounts/avatar-refresher.js';
import { accounts } from '../src/database/schema.js';
import { StaffAuditLog } from '../src/staff/audit-log.js';
import { runStaffCli } from '../src/staff/staff.cli-commands.js';
import { StaffRoles } from '../src/staff/staff-roles.js';
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
