import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GameServerRegistry } from '../src/game-servers/game-server-registry.js';
import { runServersCli } from '../src/game-servers/servers.cli-commands.js';
import { startPostgres, type TestPostgres } from './support/postgres.js';

describe('GameServerRegistry', () => {
  let postgres: TestPostgres;
  let registry: GameServerRegistry;

  beforeAll(async () => {
    postgres = await startPostgres();
    registry = new GameServerRegistry(postgres.db);
  });

  afterAll(async () => {
    await postgres?.stop();
  });

  it('cadastra um servidor e autentica pela chave gerada', async () => {
    const { server, key } = await registry.register({
      name: 'retake-1',
      mode: 'retake',
      address: '203.0.113.10:27015',
    });

    expect(server).toMatchObject({
      name: 'retake-1',
      mode: 'retake',
      address: '203.0.113.10:27015',
    });
    expect(key).toMatch(/^cmk_[A-Za-z0-9_-]{43}$/);
    expect(await registry.authenticate(key)).toMatchObject({ id: server.id, name: 'retake-1' });
  });

  it('não autentica uma chave desconhecida nem uma vazia', async () => {
    expect(await registry.authenticate('cmk_chave-que-nao-existe')).toBeNull();
    expect(await registry.authenticate('')).toBeNull();
  });

  it('rotacionar a chave invalida a anterior', async () => {
    const { key: oldKey } = await registry.register({
      name: 'dm-1',
      mode: 'deathmatch',
      address: 'dm.stcarmine.com:27016',
    });

    const newKey = await registry.rotateKey('dm-1');

    expect(newKey).not.toBe(oldKey);
    expect(await registry.authenticate(oldKey)).toBeNull();
    expect(await registry.authenticate(newKey)).toMatchObject({ name: 'dm-1' });
  });

  it('recusa nome repetido, endereço sem porta e rotação de servidor inexistente', async () => {
    await expect(
      registry.register({ name: 'retake-1', mode: 'retake', address: '203.0.113.11:27015' }),
    ).rejects.toThrow(/já existe/);
    await expect(
      registry.register({ name: 'retake-2', mode: 'retake', address: '203.0.113.11' }),
    ).rejects.toThrow(/endereço/);
    await expect(registry.rotateKey('nao-existe')).rejects.toThrow(/não encontrado/);
  });

  it('aposentar tira o servidor da lista e invalida a chave, mas mantém a linha', async () => {
    const { server, key } = await registry.register({
      name: 'velho-1',
      mode: 'retake',
      address: '203.0.113.20:27015',
    });

    expect(await registry.retire({ name: 'velho-1' })).toEqual(['velho-1']);

    expect((await registry.list()).map((s) => s.name)).not.toContain('velho-1');
    expect(await registry.authenticate(key)).toBeNull();
    expect(await registry.find(server.id)).toMatchObject({ name: 'velho-1' });
    expect((await registry.list({ includeRetired: true })).map((s) => s.name)).toContain('velho-1');
    await expect(registry.rotateKey('velho-1')).rejects.toThrow(/aposentado/);
    // Já aposentado: nada a fazer.
    expect(await registry.retire({ name: 'velho-1' })).toEqual([]);
  });
});

describe('CLI de Servidores Carmine', () => {
  let postgres: TestPostgres;
  let registry: GameServerRegistry;

  beforeAll(async () => {
    postgres = await startPostgres();
    registry = new GameServerRegistry(postgres.db);
  });

  afterAll(async () => {
    await postgres?.stop();
  });

  async function cli(...argv: string[]) {
    const lines: string[] = [];
    const errors: string[] = [];
    const exitCode = await runServersCli(argv, {
      registry,
      out: (line) => lines.push(line),
      err: (line) => errors.push(line),
    });
    return { exitCode, output: lines.join('\n'), errors: errors.join('\n') };
  }

  it('create mostra a chave uma única vez, e ela autentica', async () => {
    const result = await cli(
      'create',
      '--name',
      'retake-1',
      '--mode',
      'retake',
      '--address',
      '203.0.113.10:27015',
    );

    expect(result.exitCode).toBe(0);
    const key = result.output.match(/cmk_[A-Za-z0-9_-]{43}/)?.[0];
    expect(key).toBeDefined();
    expect(await registry.authenticate(key as string)).toMatchObject({ name: 'retake-1' });
  });

  it('rotate-key gera uma chave nova e list não mostra chave nenhuma', async () => {
    const rotated = await cli('rotate-key', '--name', 'retake-1');
    const list = await cli('list');

    expect(rotated.exitCode).toBe(0);
    expect(rotated.output).toMatch(/cmk_[A-Za-z0-9_-]{43}/);
    expect(list.exitCode).toBe(0);
    expect(list.output).toContain('retake-1');
    expect(list.output).toContain('203.0.113.10:27015');
    expect(list.output).not.toMatch(/cmk_/);
  });

  it('retire aposenta por nome ou por prefixo (ex.: o lixo dos E2E)', async () => {
    for (const name of ['e2e-a', 'e2e-b', 'deathmatch-1']) {
      await registry.register({ name, mode: 'retake', address: '203.0.113.30:27015' });
    }

    const one = await cli('retire', '--name', 'deathmatch-1');
    const many = await cli('retire', '--prefix', 'e2e-');
    const list = await cli('list');
    const none = await cli('retire', '--name', 'nao-existe');
    const both = await cli('retire', '--name', 'a', '--prefix', 'b');

    expect(one).toMatchObject({ exitCode: 0, output: expect.stringContaining('deathmatch-1') });
    expect(many.exitCode).toBe(0);
    expect(many.output).toMatch(/2 servidor/);
    expect(list.output).not.toMatch(/e2e-|deathmatch-1/);
    expect(none.exitCode).toBe(1);
    expect(none.errors).toMatch(/nenhum servidor/i);
    expect(both.exitCode).toBe(1);
  });

  it('falha com código 1 e mensagem clara para comando ou argumento inválido', async () => {
    const unknown = await cli('explode');
    const missing = await cli('create', '--name', 'dm-1');

    expect(unknown.exitCode).toBe(1);
    expect(unknown.errors).toMatch(/Uso:/);
    expect(missing.exitCode).toBe(1);
    expect(missing.errors).toMatch(/--mode/);
  });
});
