import {
  type ActivityEvent,
  type EventBatch,
  type KillEvent,
  type RecentActivity,
  recentActivitySchema,
} from '@carmine/contracts';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RankingLeaderWatch } from '../src/activity/ranking-leader-watch.js';
import { Catalog } from '../src/catalog/catalog.js';
import { accountStatsWeekly, accounts } from '../src/database/schema.js';
import { GameServerRegistry } from '../src/game-servers/game-server-registry.js';
import { weekStartOf } from '../src/stats/stats-week.js';
import { startTestApp, steamIdFor, type TestApp } from './support/app.js';
import { signedInPlayer } from './support/player.js';
import { installStableClock } from './support/stable-clock.js';

// Antes de qualquer `new Date()` do arquivo: sem cruzar a meia-noite de Brasília durante o teste.
installStableClock();

const NOW = () => new Date().toISOString();
const THIS_WEEK = weekStartOf(new Date());

/** Ids da @ianlucas/cs2-lib 9.5.0. */
const AK_REDLINE = 222; // classificada: vale o destaque
const AWP_ASIIMOV = 306;

let seq = 0;
/** UUID v7 de mentira, único por chamada. */
const eventId = () => `0199f2a0-7b1c-7000-8000-${String(++seq).padStart(12, '0')}`;

const kill = (killer: string, victim: string, over: Partial<KillEvent> = {}): KillEvent => ({
  id: eventId(),
  at: NOW(),
  warmup: false,
  killerSteamId: killer,
  killerIsBot: false,
  victimSteamId: victim,
  victimIsBot: false,
  assisterSteamId: null,
  assisterIsBot: false,
  headshot: false,
  weapon: 'ak47',
  teamKill: false,
  ...over,
});

const batch = (events: Partial<EventBatch>): EventBatch => ({
  kills: [],
  damages: [],
  roundEnds: [],
  sessionStarts: [],
  sessionEnds: [],
  ...events,
});

describe('Faixa de atividade ao vivo', () => {
  let t: TestApp;
  let next = 1;

  beforeAll(async () => {
    t = await startTestApp({ ACTIVITY_CACHE_TTL_SECONDS: '0', RANKING_CACHE_TTL_SECONDS: '0' });
  });

  afterAll(async () => {
    await t?.stop();
  });

  beforeEach(async () => {
    await t.valkey.executeCliCmd('flushall');
  });

  const player = () => signedInPlayer(t, 4000 + next++);
  type Player = Awaited<ReturnType<typeof player>>;

  const send = (events: EventBatch, key = t.serverKey) =>
    t.app.inject({
      method: 'POST',
      url: '/api/server/events',
      headers: { authorization: `Bearer ${key}` },
      payload: events,
    });

  const joins = (who: Player, at = NOW()) =>
    send(
      batch({
        sessionStarts: [
          { id: eventId(), at, sessionId: crypto.randomUUID(), steamId: who.steamId },
        ],
      }),
    );

  async function activity() {
    const response = await t.app.inject({ url: '/api/activity/recent' });
    expect(response.statusCode, response.body).toBe(200);
    return {
      response,
      body: recentActivitySchema.parse(response.json()) as RecentActivity,
    };
  }

  const ofType = <T extends ActivityEvent['type']>(events: ActivityEvent[], type: T) =>
    events.filter((event): event is Extract<ActivityEvent, { type: T }> => event.type === type);

  const makePrivate = (who: Player, value = true) =>
    t.postgres.db
      .update(accounts)
      .set({ profilePrivate: value })
      .where(eq(accounts.id, who.account.id));

  it('sem nada acontecendo: lista vazia e sem sessão', async () => {
    const { response, body } = await activity();

    expect(body.events).toEqual([]);
    // Sem cache no teste: nem o navegador guarda (o Perfil privado vale na hora).
    expect(response.headers['cache-control']).toBe('no-store');
  });

  describe('entrar num servidor', () => {
    it('aparece com o nome do jogador e o servidor, e nunca com o SteamID', async () => {
      const who = await player();

      expect((await joins(who)).statusCode).toBe(200);
      const { response, body } = await activity();

      const [joined] = ofType(body.events, 'joined');
      expect(joined).toMatchObject({
        type: 'joined',
        player: {
          private: false,
          publicId: who.account.publicId,
          displayName: who.account.displayName,
        },
        server: { name: 'retake-teste', mode: 'retake' },
      });
      expect(response.body).not.toContain(who.steamId);
      expect(response.body).not.toContain('accountId');
    });

    it('reconectar logo em seguida não repete', async () => {
      const who = await player();

      await joins(who);
      await joins(who);
      const { body } = await activity();

      expect(ofType(body.events, 'joined')).toHaveLength(1);
    });

    it('um "entrou" que chegou atrasado pela fila do plugin não é ao vivo', async () => {
      const who = await player();

      await joins(who, new Date(Date.now() - 60 * 60 * 1000).toISOString());
      const { body } = await activity();

      expect(body.events).toEqual([]);
    });

    it('Conta que não existe no site não aparece', async () => {
      await send(
        batch({
          sessionStarts: [
            {
              id: eventId(),
              at: NOW(),
              sessionId: crypto.randomUUID(),
              steamId: steamIdFor(99_999),
            },
          ],
        }),
      );

      expect((await activity()).body.events).toEqual([]);
    });
  });

  describe('multi-kill', () => {
    it('três mortes seguidas no Retake aparecem com a contagem', async () => {
      const who = await player();
      const victim = steamIdFor(98_000 + next++);
      const base = Date.now();
      const kills = [0, 4, 9].map((s) =>
        kill(who.steamId, victim, { at: new Date(base + s * 1000).toISOString() }),
      );

      await send(batch({ kills }));
      const { body } = await activity();

      expect(ofType(body.events, 'multi_kill')).toMatchObject([
        { kills: 3, player: { publicId: who.account.publicId }, server: { name: 'retake-teste' } },
      ]);
    });

    it('duas mortes não são destaque', async () => {
      const who = await player();
      const victim = steamIdFor(98_000 + next++);

      await send(batch({ kills: [kill(who.steamId, victim), kill(who.steamId, victim)] }));

      expect((await activity()).body.events).toEqual([]);
    });

    it('uma sequência nova logo depois (próximo lote) não enche a faixa: um destaque por minuto', async () => {
      const who = await player();
      const victim = steamIdFor(98_000 + next++);
      const streak = (offset: number) =>
        [0, 3, 6].map((s) =>
          kill(who.steamId, victim, {
            at: new Date(Date.now() + (offset + s) * 1000).toISOString(),
          }),
        );

      await send(batch({ kills: streak(0) }));
      await send(batch({ kills: streak(10) }));

      expect(ofType((await activity()).body.events, 'multi_kill')).toHaveLength(1);
    });

    it('o lote repetido não duplica o destaque', async () => {
      const who = await player();
      const victim = steamIdFor(98_000 + next++);
      const kills = [0, 3, 6].map((s) =>
        kill(who.steamId, victim, { at: new Date(Date.now() + s * 1000).toISOString() }),
      );

      await send(batch({ kills }));
      await send(batch({ kills }));

      expect(ofType((await activity()).body.events, 'multi_kill')).toHaveLength(1);
    });
  });

  describe('Perfil privado', () => {
    it('quem tem o Perfil privado não aparece ao entrar nem no multi-kill, mesmo se ligou depois', async () => {
      const open = await player();
      const hidden = await player();
      const victim = steamIdFor(98_000 + next++);
      await joins(open);
      await joins(hidden);
      await send(
        batch({
          kills: [0, 3, 6].map((s) =>
            kill(hidden.steamId, victim, { at: new Date(Date.now() + s * 1000).toISOString() }),
          ),
        }),
      );
      expect((await activity()).body.events).toHaveLength(3);

      await makePrivate(hidden);
      const { response, body } = await activity();

      expect(body.events).toHaveLength(1);
      expect(body.events[0]).toMatchObject({
        type: 'joined',
        player: { publicId: open.account.publicId },
      });
      expect(response.body).not.toContain(hidden.account.displayName);
    });

    it('desligar o Perfil privado traz de volta o que ainda está na janela', async () => {
      const who = await player();
      await joins(who);
      await makePrivate(who);
      expect((await activity()).body.events).toEqual([]);

      await makePrivate(who, false);

      expect((await activity()).body.events).toHaveLength(1);
    });

    it('Conta anonimizada some da faixa', async () => {
      const who = await player();
      await joins(who);

      await t.postgres.db
        .update(accounts)
        .set({ anonymizedAt: new Date() })
        .where(eq(accounts.id, who.account.id));

      expect((await activity()).body.events).toEqual([]);
    });
  });

  describe('primeiro lugar da semana', () => {
    const seed = (who: Player, over: Partial<typeof accountStatsWeekly.$inferInsert>) =>
      t.postgres.db.insert(accountStatsWeekly).values({
        accountId: who.account.id,
        mode: 'retake',
        weekStart: THIS_WEEK,
        roundsPlayed: 5000,
        secondsPlayed: 360_000,
        ...over,
      });
    const tick = () => t.app.get(RankingLeaderWatch).tick();

    it('a troca de líder vira evento; a primeira vez que o líder é visto não', async () => {
      const first = await player();
      const second = await player();
      await seed(first, { roundsWon: 90_000 });
      await tick();
      expect((await activity()).body.events).toEqual([]);

      await seed(second, { roundsWon: 95_000 });
      await tick();
      const { body } = await activity();

      expect(ofType(body.events, 'new_leader')).toMatchObject([
        { mode: 'retake', player: { private: false, publicId: second.account.publicId } },
      ]);
    });

    it('sem troca, olhar de novo não repete', async () => {
      const lead = await player();
      await seed(lead, { roundsWon: 100_000 });

      await tick();
      await tick();
      await tick();

      expect((await activity()).body.events).toEqual([]);
    });

    it('líderes que se revezam em poucos minutos não inundam a faixa', async () => {
      const first = await player();
      const second = await player();
      await seed(first, { roundsWon: 130_000 });
      await tick();
      await seed(second, { roundsWon: 140_000 });
      await tick();
      // O primeiro volta à frente logo em seguida.
      await t.postgres.db
        .update(accountStatsWeekly)
        .set({ roundsWon: 150_000 })
        .where(eq(accountStatsWeekly.accountId, first.account.id));
      await tick();

      expect(ofType((await activity()).body.events, 'new_leader')).toHaveLength(1);
    });

    it('líder com Perfil privado aparece como Jogador privado, igual ao Ranking', async () => {
      const first = await player();
      const second = await player();
      await seed(first, { roundsWon: 200_000 });
      await tick();
      await seed(second, { roundsWon: 210_000 });
      await makePrivate(second);
      await tick();

      const { response, body } = await activity();

      expect(ofType(body.events, 'new_leader')).toMatchObject([
        {
          player: {
            private: true,
            publicId: null,
            displayName: 'Jogador privado',
            avatarUrl: null,
          },
        },
      ]);
      expect(response.body).not.toContain(second.account.displayName);
    });
  });

  describe('skin equipada', () => {
    it('skin rara no Loadout ativo vira evento, com o id do catálogo e sem repetir logo em seguida', async () => {
      const who = await player();
      const ak = await who.add({ id: AK_REDLINE });
      const awp = await who.add({ id: AWP_ASIIMOV });

      await who.equip(ak);
      await who.equip(awp);
      const { response, body } = await activity();

      // O segundo equip veio dentro de 1 minuto: só o primeiro entra.
      expect(ofType(body.events, 'skin_equipped')).toMatchObject([
        { itemId: AK_REDLINE, player: { publicId: who.account.publicId } },
      ]);
      expect(response.body).not.toContain(who.steamId);
    });

    it('skin comum não vira evento', async () => {
      const who = await player();
      const catalog = t.app.get(Catalog);
      const common = [...catalog.economy.items.values()].find(
        (item) =>
          item.type === 'weapon' &&
          !item.isDefault &&
          !item.isBase &&
          item.rarityColor === '#b0c3d9' &&
          catalog.slotOf(item.id) !== null,
      );
      expect(common).toBeDefined();
      const uid = await who.add({ id: (common as NonNullable<typeof common>).id });

      await who.equip(uid);

      expect((await activity()).body.events).toEqual([]);
    });

    it('equipar num Preset que não é o ativo não conta (não vai para o jogo)', async () => {
      const who = await signedInPlayer(t, 4900 + next++, {
        vipUntil: Date.now() + 30 * 86_400_000,
      });
      const created = await who.call('POST', '/api/presets', { name: 'Treino', from: 'empty' });
      expect(created.statusCode, created.body).toBe(201);
      const preset = created.json() as { id: string };
      const ak = await who.add({ id: AK_REDLINE });

      const response = await who.call('POST', '/api/loadout/equip', {
        uid: ak,
        presetId: preset.id,
      });
      expect(response.statusCode, response.body).toBe(200);

      expect((await activity()).body.events).toEqual([]);
    });

    it('quem tem o Perfil privado não aparece', async () => {
      const who = await player();
      await makePrivate(who);
      const ak = await who.add({ id: AK_REDLINE });

      await who.equip(ak);

      expect((await activity()).body.events).toEqual([]);
    });
  });

  it('mistura os tipos do mais novo para o mais antigo e corta em 20', async () => {
    const crowd = await Promise.all(Array.from({ length: 22 }, () => player()));
    for (const who of crowd) await joins(who);

    const { body } = await activity();

    expect(body.events).toHaveLength(20);
    const times = body.events.map((event) => Date.parse(event.at));
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  it('evento de um servidor que foi aposentado some da faixa', async () => {
    const who = await player();
    const registry = t.app.get(GameServerRegistry);
    const { key } = await registry.register({
      name: 'retake-aposentado',
      mode: 'retake',
      address: '127.0.0.1:27999',
    });
    await joins(who);
    await send(
      batch({
        sessionStarts: [
          {
            id: eventId(),
            at: NOW(),
            sessionId: crypto.randomUUID(),
            steamId: (await player()).steamId,
          },
        ],
      }),
      key,
    );
    expect((await activity()).body.events).toHaveLength(2);

    await registry.retire({ name: 'retake-aposentado' });

    expect((await activity()).body.events).toHaveLength(1);
  });
});

describe('Faixa de atividade ao vivo, com cache', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await startTestApp({ ACTIVITY_CACHE_TTL_SECONDS: '30' });
  });

  afterAll(async () => {
    await t?.stop();
  });

  it('repete a mesma resposta dentro da janela, para todo mundo', async () => {
    await t.valkey.executeCliCmd('flushall');
    const read = async () =>
      recentActivitySchema.parse((await t.app.inject({ url: '/api/activity/recent' })).json());
    const who = await signedInPlayer(t, 5001);
    const other = await signedInPlayer(t, 5002);
    const join = (steamId: string) =>
      t.app.inject({
        method: 'POST',
        url: '/api/server/events',
        headers: { authorization: `Bearer ${t.serverKey}` },
        payload: batch({
          sessionStarts: [{ id: eventId(), at: NOW(), sessionId: crypto.randomUUID(), steamId }],
        }),
      });

    await join(who.steamId);
    const first = await read();
    await join(other.steamId);
    const second = await read();

    expect(first.events).toHaveLength(1);
    expect(second.generatedAt).toBe(first.generatedAt);
    expect(second.events).toHaveLength(1);
    // O navegador reaproveita pelo mesmo tempo do cache do servidor.
    const response = await t.app.inject({ url: '/api/activity/recent' });
    expect(response.headers['cache-control']).toBe('public, max-age=30');
  });
});
