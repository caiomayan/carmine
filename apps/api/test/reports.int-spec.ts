import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  type ChatMessageEvent,
  eventBatchResultSchema,
  reportResultSchema,
  type StaffRole,
  staffAuditPageSchema,
  staffErrorSchema,
  staffReportPageSchema,
} from '@carmine/contracts';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chatMessages, reports } from '../src/database/schema.js';
import { DataRetention } from '../src/reports/data-retention.js';
import { StaffRoles } from '../src/staff/staff-roles.js';
import { startTestApp, steamIdFor, type TestApp } from './support/app.js';
import { signedInPlayer } from './support/player.js';

const FOUNDER = steamIdFor(9999);
const NOW = () => new Date().toISOString();

let seq = 0;
const messageId = () => `0199f2a0-7b1c-7000-8000-${String(++seq).padStart(12, '0')}`;

/** Aceite da S13: a Denúncia feita no jogo chega à fila e ao Discord, com o chat do momento. */
describe('Denúncias e log de chat (S13)', () => {
  let t: TestApp;
  let webhook: Server;
  const messages: string[] = [];
  let next = 1;
  let moderator: Awaited<ReturnType<typeof staffMember>>;
  let owner: Awaited<ReturnType<typeof staffMember>>;

  beforeAll(async () => {
    webhook = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        messages.push(
          (JSON.parse(Buffer.concat(chunks).toString()) as { content: string }).content,
        );
        response.writeHead(204).end();
      });
    });
    await new Promise<void>((resolve) => webhook.listen(0, '127.0.0.1', resolve));
    const { port } = webhook.address() as AddressInfo;
    t = await startTestApp({
      STAFF_REPORTS_WEBHOOK_URL: `http://127.0.0.1:${port}/staff`,
      PUBLIC_WEB_URL: 'https://stcarmine.test',
    });
    moderator = await staffMember('moderator');
    owner = await staffMember('owner');
  });

  afterAll(async () => {
    await t?.stop();
    webhook?.close();
  });

  async function staffMember(role: StaffRole | null) {
    const player = await signedInPlayer(t, next++);
    if (role) {
      await t.app
        .get(StaffRoles)
        .set(player.account.id, role, { actorSteamId: FOUNDER, reason: 'teste' });
    }
    return player;
  }

  /** Uma Conta que jogou (criada pelo connect). */
  async function player(name = `jogador${next}`) {
    const steamId = steamIdFor(next++);
    const response = await t.app.inject({
      method: 'POST',
      url: '/api/server/player-connects',
      headers: { authorization: `Bearer ${t.serverKey}` },
      payload: { steamId, steamName: name },
    });
    expect(response.statusCode, response.body).toBe(200);
    return { steamId, publicId: (response.json() as { publicId: number }).publicId };
  }

  const chat = (steamId: string, text: string, over: Partial<ChatMessageEvent> = {}) => ({
    id: messageId(),
    at: NOW(),
    steamId,
    team: 'ct' as const,
    teamChat: false,
    text,
    ...over,
  });

  const sendChat = (lines: ChatMessageEvent[]) =>
    t.app.inject({
      method: 'POST',
      url: '/api/server/events',
      headers: { authorization: `Bearer ${t.serverKey}` },
      payload: {
        kills: [],
        damages: [],
        roundEnds: [],
        sessionStarts: [],
        sessionEnds: [],
        chatMessages: lines,
      },
    });

  const report = (reporter: string, target: string, reason = 'offensive_chat', key = t.serverKey) =>
    t.app.inject({
      method: 'POST',
      url: '/api/server/reports',
      headers: { authorization: `Bearer ${key}` },
      payload: {
        reporterSteamId: reporter,
        targetSteamId: target,
        reason,
        round: 7,
        map: 'de_nuke',
      },
    });

  const queue = async (by = moderator, query = '') => {
    const response = await by.call('GET', `/api/staff/reports${query}`);
    expect(response.statusCode, response.body).toBe(200);
    return staffReportPageSchema.parse(response.json());
  };

  const errorCode = (response: { json(): unknown }) => staffErrorSchema.parse(response.json()).code;

  describe('o !report', () => {
    it('a Denúncia aparece na fila com o chat do momento e avisa a Staff no Discord', async () => {
      const reporter = await player('denunciante');
      const target = await player('Alvo *Ruim*');
      const other = await player('terceiro');
      expect(
        (
          await sendChat([
            chat(target.steamId, 'seu lixo', { team: 't' }),
            chat(other.steamId, 'calma pessoal'),
            chat(target.steamId, 'ninguém pediu', { teamChat: true, team: 't' }),
          ])
        ).statusCode,
      ).toBe(200);

      const response = await report(reporter.steamId, target.steamId);
      expect(response.statusCode, response.body).toBe(200);
      const result = reportResultSchema.parse(response.json());
      expect(result).toEqual({
        accepted: true,
        message: 'Denúncia recebida; a Staff analisa em até 72 h.',
        refusal: null,
        retryAfterSeconds: null,
      });

      const { reports: open, openCount } = await queue();
      const found = open.find((r) => r.target.publicId === target.publicId);
      expect(openCount).toBeGreaterThanOrEqual(1);
      expect(found).toMatchObject({
        status: 'open',
        reason: 'offensive_chat',
        round: 7,
        map: 'de_nuke',
        reporter: { publicId: reporter.publicId },
        server: { name: 'retake-teste', mode: 'retake' },
        needsEvidence: false,
      });
      expect(found?.chat.map((line) => [line.text, line.fromTarget, line.teamChat])).toEqual([
        ['seu lixo', true, false],
        ['calma pessoal', false, false],
        ['ninguém pediu', true, true],
      ]);

      await expect
        .poll(() => messages.find((m) => m.includes(`#${target.publicId}`)), { timeout: 5000 })
        .toBeDefined();
      const discord = messages.find((m) => m.includes(`#${target.publicId}`)) as string;
      expect(discord).toContain('Chat ofensivo');
      expect(discord).toContain('retake-teste');
      expect(discord).toContain('https://stcarmine.test/staff/denuncias');
      // Nada além do pedido: nem o denunciante, nem SteamID64, nem o texto do chat.
      expect(discord).not.toContain('denunciante');
      expect(discord).not.toContain(target.steamId);
      expect(discord).not.toContain('seu lixo');
    });

    it('a segunda Denúncia do mesmo alvo em 10 minutos é recusada, dizendo quando tentar de novo', async () => {
      const reporter = await player();
      const target = await player();
      expect((await report(reporter.steamId, target.steamId)).statusCode).toBe(200);

      const response = await report(reporter.steamId, target.steamId, 'griefing');
      expect(response.statusCode).toBe(200);
      const result = reportResultSchema.parse(response.json());
      expect(result.accepted).toBe(false);
      expect(result.refusal).toBe('same_target_cooldown');
      expect(result.retryAfterSeconds).toBeGreaterThan(9 * 60);
      expect(result.retryAfterSeconds).toBeLessThanOrEqual(10 * 60);
      expect(result.message).toMatch(
        /Você já denunciou este jogador há pouco\. Tente de novo em 10 min\./,
      );

      const { reports: open } = await queue(moderator, '?limit=100');
      expect(open.filter((r) => r.target.publicId === target.publicId)).toHaveLength(1);
    });

    it('outro denunciante pode denunciar o mesmo alvo; o limite é por denunciante', async () => {
      const target = await player();
      const a = await player();
      const b = await player();
      expect(
        reportResultSchema.parse((await report(a.steamId, target.steamId)).json()).accepted,
      ).toBe(true);
      expect(
        reportResultSchema.parse((await report(b.steamId, target.steamId)).json()).accepted,
      ).toBe(true);
      const { reports: open } = await queue(moderator, '?limit=100');
      const mine = open.find((r) => r.target.publicId === target.publicId);
      expect(mine?.otherOpenAgainstTarget).toBe(1);
    });

    it('5 por hora: a sexta Denúncia é recusada', async () => {
      const reporter = await player();
      for (let i = 0; i < 5; i++) {
        const target = await player();
        const result = reportResultSchema.parse(
          (await report(reporter.steamId, target.steamId)).json(),
        );
        expect(result.accepted, `denúncia ${i + 1}`).toBe(true);
      }
      const sixth = reportResultSchema.parse(
        (await report(reporter.steamId, (await player()).steamId)).json(),
      );
      expect(sixth).toMatchObject({ accepted: false, refusal: 'hourly_limit' });
      expect(sixth.message).toMatch(/limite de 5 denúncias por hora\. Tente de novo em \d+ min\./);
    });

    it('não dá para denunciar a si mesmo nem quem não tem Conta', async () => {
      const reporter = await player();
      const self = reportResultSchema.parse(
        (await report(reporter.steamId, reporter.steamId)).json(),
      );
      expect(self).toMatchObject({
        accepted: false,
        refusal: 'self',
        message: 'Você não pode denunciar a si mesmo.',
      });
      const ghost = reportResultSchema.parse(
        (await report(reporter.steamId, steamIdFor(777_777))).json(),
      );
      expect(ghost).toMatchObject({ accepted: false, refusal: 'unknown_account' });
    });

    it('exige a chave de um Servidor Carmine e um corpo válido', async () => {
      const reporter = await player();
      const target = await player();
      expect(
        (await report(reporter.steamId, target.steamId, 'offensive_chat', 'errada')).statusCode,
      ).toBe(401);
      expect((await report(reporter.steamId, target.steamId, 'ronco')).statusCode).toBe(400);
    });
  });

  describe('o log de chat', () => {
    it('é idempotente: reenviar o lote não duplica e Conta desconhecida é aceita e ignorada', async () => {
      const speaker = await player();
      const lines = [
        chat(speaker.steamId, 'primeira'),
        chat(speaker.steamId, 'segunda'),
        chat(steamIdFor(888_888), 'quem sou eu'),
      ];
      const first = eventBatchResultSchema.parse((await sendChat(lines)).json());
      expect(first).toEqual({ accepted: 3, duplicates: 0, ignored: 1 });

      const again = eventBatchResultSchema.parse((await sendChat(lines.slice(0, 2))).json());
      expect(again).toEqual({ accepted: 0, duplicates: 2, ignored: 0 });

      const saved = await t.postgres.db
        .select({ text: chatMessages.text, teamChat: chatMessages.teamChat })
        .from(chatMessages)
        .where(eq(chatMessages.id, lines[0]?.id as string));
      expect(saved).toEqual([{ text: 'primeira', teamChat: false }]);
    });

    it('a limpeza apaga o chat com mais de 30 dias e a Denúncia com mais de 90', async () => {
      const speaker = await player();
      const reporter = await player();
      const day = 24 * 60 * 60 * 1000;
      const server = await t.postgres.db.query.gameServers.findFirst();
      const accountId = (await t.accounts.findBySteamId(speaker.steamId))?.id as string;
      await t.postgres.db.insert(chatMessages).values([
        {
          id: messageId(),
          serverId: server?.id as string,
          accountId,
          team: 'ct',
          teamChat: false,
          text: 'velha',
          at: new Date(Date.now() - 31 * day),
          receivedAt: new Date(Date.now() - 31 * day),
        },
        {
          id: messageId(),
          serverId: server?.id as string,
          accountId,
          team: 'ct',
          teamChat: false,
          text: 'recente',
          at: new Date(Date.now() - 29 * day),
          receivedAt: new Date(Date.now() - 29 * day),
        },
      ]);
      expect((await report(reporter.steamId, speaker.steamId)).statusCode).toBe(200);
      await t.postgres.db
        .update(reports)
        .set({ createdAt: new Date(Date.now() - 91 * day) })
        .where(eq(reports.targetAccountId, accountId));

      const swept = await t.app.get(DataRetention).sweep();
      expect(swept.chatMessages).toBeGreaterThanOrEqual(1);
      expect(swept.reports).toBeGreaterThanOrEqual(1);
      const left = await t.postgres.db
        .select({ text: chatMessages.text })
        .from(chatMessages)
        .where(eq(chatMessages.accountId, accountId));
      expect(left.map((row) => row.text)).toEqual(['recente']);
      expect(
        await t.postgres.db.select().from(reports).where(eq(reports.targetAccountId, accountId)),
      ).toHaveLength(0);
    });
  });

  describe('a fila da Staff', () => {
    it('quem não é da Staff não vê a fila', async () => {
      const nobody = await staffMember(null);
      const response = await nobody.call('GET', '/api/staff/reports');
      expect(response.statusCode).toBe(403);
    });

    it('arquivar exige motivo, fecha a Denúncia e fica no log de auditoria', async () => {
      const reporter = await player();
      const target = await player();
      await report(reporter.steamId, target.steamId);
      const { reports: open } = await queue(moderator, '?limit=100');
      const found = open.find((r) => r.target.publicId === target.publicId);
      expect(found).toBeDefined();
      const url = `/api/staff/reports/${found?.id}/archive`;

      expect((await moderator.call('POST', url, {})).statusCode).toBe(400);
      expect((await moderator.call('POST', url, { reason: 'ok' })).statusCode).toBe(400);
      const done = await moderator.call('POST', url, { reason: 'Sem prova suficiente no chat' });
      expect(done.statusCode, done.body).toBe(204);

      const archived = await queue(moderator, '?status=archived&limit=100');
      const closed = archived.reports.find((r) => r.id === found?.id);
      expect(closed).toMatchObject({
        status: 'archived',
        resolution: {
          reason: 'Sem prova suficiente no chat',
          by: { publicId: moderator.account.publicId },
        },
      });
      expect((await queue(moderator, '?limit=100')).reports.some((r) => r.id === found?.id)).toBe(
        false,
      );

      const again = await moderator.call('POST', url, { reason: 'de novo' });
      expect(again.statusCode).toBe(409);
      expect(errorCode(again)).toBe('report_not_open');
      const missing = await moderator.call(
        'POST',
        '/api/staff/reports/0199f2a0-7b1c-7000-8000-00000000ffff/archive',
        { reason: 'não existe' },
      );
      expect(errorCode(missing)).toBe('report_not_found');

      const audit = staffAuditPageSchema.parse(
        (await owner.call('GET', '/api/staff/audit?action=report_archive')).json(),
      );
      expect(audit.entries[0]).toMatchObject({
        action: 'report_archive',
        reason: 'Sem prova suficiente no chat',
        targetAccount: { publicId: target.publicId },
        actor: { publicId: moderator.account.publicId },
      });
    });

    it('a Punição aplicada a partir da Denúncia a fecha; cheat e voz exigem evidência adicional', async () => {
      const reporter = await player();
      const target = await player();
      await report(reporter.steamId, target.steamId, 'cheat');
      const found = (await queue(moderator, '?limit=100')).reports.find(
        (r) => r.target.publicId === target.publicId,
      );
      expect(found).toMatchObject({ reason: 'cheat', needsEvidence: true });
      const sanction = {
        category: 'cheat',
        reason: 'Aimbot óbvio',
        measures: [{ type: 'kick', durationMinutes: null }],
        reportId: found?.id,
      };
      const url = `/api/staff/accounts/${target.publicId}/sanctions`;

      // Sem demo, só a Denúncia não basta.
      const bare = await moderator.call('POST', url, sanction);
      expect(bare.statusCode).toBe(400);
      expect(errorCode(bare)).toBe('report_needs_evidence');
      expect((await queue(moderator, '?limit=100')).reports.some((r) => r.id === found?.id)).toBe(
        true,
      );

      const withClip = await moderator.call('POST', url, {
        ...sanction,
        evidenceUrl: 'https://discord.com/channels/1/2/3',
      });
      expect(withClip.statusCode, withClip.body).toBe(201);
      const sanctioned = await queue(moderator, '?status=sanctioned&limit=100');
      expect(sanctioned.reports.find((r) => r.id === found?.id)).toMatchObject({
        status: 'sanctioned',
        resolution: { reason: null },
      });

      const reuse = await moderator.call('POST', url, {
        ...sanction,
        evidenceUrl: 'https://discord.com/channels/1/2/3',
      });
      expect(errorCode(reuse)).toBe('report_not_open');
    });

    it('a Denúncia de outra Conta não fecha com a Punição de uma terceira', async () => {
      const reporter = await player();
      const target = await player();
      const bystander = await player();
      await report(reporter.steamId, target.steamId);
      const found = (await queue(moderator, '?limit=100')).reports.find(
        (r) => r.target.publicId === target.publicId,
      );
      const response = await moderator.call(
        'POST',
        `/api/staff/accounts/${bystander.publicId}/sanctions`,
        {
          category: 'offensive_chat',
          reason: 'Errei a Conta',
          measures: [{ type: 'warning', durationMinutes: null }],
          reportId: found?.id,
        },
      );
      expect(response.statusCode).toBe(400);
      expect(errorCode(response)).toBe('report_target_mismatch');
    });
  });

  describe('a anonimização da Conta (S08)', () => {
    it('apaga o chat da pessoa e desliga as Denúncias dela, sem tocar nas feitas contra ela', async () => {
      const leaving = await player('quem vai sair');
      const stays = await player('quem fica');
      const third = await player();
      await sendChat([
        chat(leaving.steamId, 'meu chat'),
        chat(stays.steamId, 'ofensa'),
        chat(third.steamId, 'oi'),
      ]);
      // Uma Denúncia que a pessoa fez (contra `stays`) e outra contra `third`, com ela no chat.
      expect((await report(leaving.steamId, stays.steamId)).statusCode).toBe(200);
      expect((await report(stays.steamId, third.steamId)).statusCode).toBe(200);
      // E uma contra ela mesma.
      expect((await report(third.steamId, leaving.steamId)).statusCode).toBe(200);

      const response = await owner.call(
        'POST',
        `/api/staff/accounts/${leaving.publicId}/anonymize`,
        { reason: 'pedido de exclusão, protocolo 13' },
      );
      expect(response.statusCode, response.body).toBe(200);

      const accountId = (
        await t.postgres.db.query.accounts.findFirst({
          where: (a, { eq: same }) => same(a.publicId, leaving.publicId),
        })
      )?.id as string;
      expect(
        await t.postgres.db
          .select()
          .from(chatMessages)
          .where(eq(chatMessages.accountId, accountId)),
      ).toHaveLength(0);

      const open = (await queue(moderator, '?limit=100')).reports;
      const madeByLeaving = open.find((r) => r.target.publicId === stays.publicId);
      expect(madeByLeaving?.reporter).toBeNull();
      // O texto dela sai do chat copiado em Denúncia de outras pessoas.
      const copiedElsewhere = open.find((r) => r.target.publicId === third.publicId);
      expect(copiedElsewhere?.chat.map((line) => line.text)).not.toContain('meu chat');
      // A Denúncia contra ela fica como registro de moderação até o prazo.
      const againstLeaving = open.find((r) => r.target.publicId === leaving.publicId);
      expect(againstLeaving?.chat.map((line) => line.text)).toContain('meu chat');
    });
  });
});
