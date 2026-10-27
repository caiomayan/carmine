import type { Cs2Item } from '@carmine/contracts';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LogTransport, type OutgoingEvent } from '../src/analytics/analytics-transport.js';
import { accounts } from '../src/database/schema.js';
import { startTestApp, steamIdFor, type TestApp } from './support/app.js';
import { Browser } from './support/browser.js';
import { FakeSteam } from './support/fake-steam.js';
import { FakeSteamOpenId } from './support/fake-steam-openid.js';
import { signedInPlayer } from './support/player.js';
import { loginViaSteam } from './support/steam-login.js';

const WEB = 'http://localhost:3000';
const AK = 222;
const AGENT = 8620;

/**
 * Os eventos do plano de analytics emitidos pela API (A1b-1: login, Conta, Inventário), conferidos no ponto de
 * disparo. O transporte do modo `log` é espionado: o que chega a ele é exatamente o que iria para o PostHog.
 */
describe('Eventos de analytics: login e Inventário', () => {
  let t: TestApp;
  let openId: FakeSteamOpenId;
  let webApi: FakeSteam;
  const sent: OutgoingEvent[] = [];
  let next = 1;

  beforeAll(async () => {
    [openId, webApi] = await Promise.all([FakeSteamOpenId.start(), FakeSteam.start()]);
    t = await startTestApp({
      PUBLIC_WEB_URL: WEB,
      STEAM_OPENID_URL: openId.endpoint,
      STEAM_WEB_API_KEY: 'chave-de-teste',
      STEAM_WEB_API_URL: webApi.url,
      ANALYTICS_DRIVER: 'log',
      ANALYTICS_ENVIRONMENT: 'staging',
    });
  });

  afterAll(async () => {
    await t?.stop();
    await Promise.all([openId?.stop(), webApi?.stop()]);
  });

  beforeEach(() => {
    sent.length = 0;
    vi.spyOn(LogTransport.prototype, 'send').mockImplementation((event) => {
      sent.push(event);
    });
  });

  afterEach(() => vi.restoreAllMocks());

  /** O `capture` não espera o envio: cede o laço até o evento esperado chegar (ou desiste). */
  async function events(name: string, expected = 1) {
    for (let i = 0; i < 40; i += 1) {
      if (sent.filter((e) => e.event === name).length >= expected) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return sent.filter((e) => e.event === name);
  }

  /** Dá um tempo para um evento que NÃO deve sair. */
  const quiet = () => new Promise((resolve) => setTimeout(resolve, 150));

  const item = (extra: Partial<Cs2Item> = {}): Cs2Item => ({
    id: AK,
    wear: 0.15,
    seed: 661,
    ...extra,
  });

  describe('login', () => {
    it('começar o login mede a rota de origem, sem o caminho, e o login novo cria a Conta', async () => {
      const browser = new Browser(t.app);
      const steamId = steamIdFor(500);

      const done = await loginViaSteam(browser, openId, steamId, '/ranking?modo=retake');
      expect(done.statusCode, done.body).toBe(303);

      const [started] = await events('login_iniciado');
      expect(started?.properties).toMatchObject({
        destino: 'ranking',
        $process_person_profile: false,
        ambiente: 'staging',
        origem_evento: 'api',
      });
      expect(JSON.stringify(started)).not.toContain('retake');
      const [created] = await events('conta_criada');
      const [login] = await events('login_concluido');
      expect(created?.properties).toMatchObject({ origem: 'site', modo: null });
      expect(login?.properties).toMatchObject({
        primeiro_login: true,
        jogou_antes: false,
        conta_criada_no_login: true,
        dias_desde_primeiro_connect: null,
        destino: 'ranking',
      });
      // O distinct_id é o ID interno da Conta, nunca o SteamID64 nem o ID público.
      const [account] = await t.postgres.db
        .select()
        .from(accounts)
        .where(eq(accounts.steamId, BigInt(steamId)));
      expect(login?.properties.distinct_id).toBe(account?.id);
      expect(created?.uuid).toBe((await events('conta_criada'))[0]?.uuid);
      expect(JSON.stringify(sent)).not.toContain(steamId);
      expect(JSON.stringify(sent)).not.toContain(String(account?.publicId));
    });

    it('quem já jogava e só agora entra no site: jogou_antes, sem Conta criada, e o segundo login não é o primeiro', async () => {
      const steamId = steamIdFor(501);
      const connect = await t.app.inject({
        method: 'POST',
        url: '/api/server/player-connects',
        headers: { authorization: `Bearer ${t.serverKey}` },
        payload: { steamId, steamName: 'coldzera' },
      });
      expect(connect.statusCode, connect.body).toBe(200);
      sent.length = 0;

      await loginViaSteam(new Browser(t.app), openId, steamId, '/inventario');
      const [first] = await events('login_concluido');

      expect(first?.properties).toMatchObject({
        primeiro_login: true,
        jogou_antes: true,
        conta_criada_no_login: false,
        dias_desde_primeiro_connect: 0,
        destino: 'inventario',
      });
      expect(sent.filter((e) => e.event === 'conta_criada')).toEqual([]);

      await loginViaSteam(new Browser(t.app), openId, steamId, '/');
      const logins = await events('login_concluido', 2);
      expect(logins[1]?.properties).toMatchObject({ primeiro_login: false, destino: 'inicio' });
    });

    it('a pessoa desiste na Steam: login_falhou (cancelado), sem Conta e sem identidade', async () => {
      const browser = new Browser(t.app);
      const start = await browser.get('/api/auth/steam/login?returnTo=%2F');
      const back = new URL(
        new URL(String(start.headers.location)).searchParams.get('openid.return_to') ?? '',
      );
      back.searchParams.set('openid.ns', 'http://specs.openid.net/auth/2.0');
      back.searchParams.set('openid.mode', 'cancel');

      await browser.get(`${back.pathname}${back.search}`);

      const [failed] = await events('login_falhou');
      expect(failed?.properties).toMatchObject({
        motivo: 'cancelado',
        $process_person_profile: false,
      });
      expect(sent.filter((e) => e.event === 'login_concluido')).toEqual([]);
    });
  });

  describe('Inventário', () => {
    it('adicionar mede o tipo, o Item e o total; o texto da nametag não sai', async () => {
      const player = await signedInPlayer(t, next++, { vipUntil: Date.now() + 86_400_000 });

      const first = await player.call('POST', '/api/inventory/items', {
        item: item({ nameTag: 'segredo', statTrak: 0 }),
      });
      expect(first.statusCode, first.body).toBe(201);
      await player.call('POST', '/api/inventory/items', { item: item() });

      const [one, two] = await events('item_adicionado', 2);
      expect(one?.properties).toMatchObject({
        distinct_id: player.account.id,
        tipo: 'arma',
        item_id: AK,
        exclusivo_vip: true,
        tem_stattrak: true,
        tem_nametag: true,
        qtd_stickers: 0,
        tem_charm: false,
        total_apos: 1,
      });
      expect(two?.properties).toMatchObject({ exclusivo_vip: false, total_apos: 2 });
      expect(JSON.stringify(sent)).not.toContain('segredo');
    });

    it('editar, remover (com o uso e o total) e desfazer; o clique repetido em "desfazer" não mede', async () => {
      const player = await signedInPlayer(t, next++);
      const added = await player.call('POST', '/api/inventory/items', { item: item() });
      const { uid } = added.json() as { uid: string };
      await player.call('POST', '/api/loadout/equip', { uid });
      sent.length = 0;

      const edited = await player.call('PUT', `/api/inventory/items/${uid}`, {
        item: item({ wear: 0.2 }),
      });
      expect(edited.statusCode, edited.body).toBe(200);
      expect((await events('item_editado'))[0]?.properties).toMatchObject({
        tipo: 'arma',
        item_id: AK,
      });
      expect((await events('item_editado'))[0]?.properties).not.toHaveProperty('total_apos');

      const removed = await player.call('DELETE', `/api/inventory/items/${uid}`);
      expect(removed.statusCode, removed.body).toBe(200);
      expect((await events('item_removido'))[0]?.properties).toMatchObject({
        tipo: 'arma',
        item_id: AK,
        em_uso: true,
        total_apos: 0,
      });

      expect((await player.call('POST', `/api/inventory/items/${uid}/restore`)).statusCode).toBe(
        200,
      );
      const [restored] = await events('item_restaurado');
      expect(restored?.properties.segundos_ate_desfazer).toBeGreaterThanOrEqual(0);
      expect(restored?.properties.segundos_ate_desfazer).toBeLessThanOrEqual(30);

      // Segundo clique: o Item já estava de volta, nada voltou.
      await player.call('POST', `/api/inventory/items/${uid}/restore`);
      await quiet();
      expect(sent.filter((e) => e.event === 'item_restaurado')).toHaveLength(1);
    });

    it('recusas: item_recusado com o código estável; VIP vira recurso_vip_bloqueado; o resto é ruído', async () => {
      const player = await signedInPlayer(t, next++);

      const wear = await player.call('POST', '/api/inventory/items', { item: item({ wear: 0.9 }) });
      expect(wear.statusCode).toBe(422);
      expect((await events('item_recusado'))[0]?.properties).toMatchObject({
        motivo: 'wear_out_of_range',
        operacao: 'adicionar',
      });
      // O corpo do erro não ganhou o recurso VIP do analytics.
      const vip = await player.call('POST', '/api/inventory/items', { item: { id: AGENT } });
      expect(vip.statusCode).toBe(403);
      expect(vip.json()).not.toHaveProperty('feature');
      expect((await events('recurso_vip_bloqueado'))[0]?.properties).toMatchObject({
        recurso: 'agente',
        origem: 'inventario',
      });

      sent.length = 0;
      await player.call('DELETE', '/api/inventory/items/00000000-0000-4000-8000-000000000000');
      await player.call('PUT', '/api/inventory/items/00000000-0000-4000-8000-000000000000', {
        item: item(),
      });
      await player.call('POST', '/api/inventory/items', { item: 'nao e um item' });
      await quiet();
      expect(sent.filter((e) => e.event === 'item_recusado')).toEqual([]);
    });

    it('quem desligou "Participar da análise de uso" não gera nenhum evento', async () => {
      const player = await signedInPlayer(t, next++);
      await player.call('PUT', '/api/me/analytics', { participate: false });
      sent.length = 0;

      await player.call('POST', '/api/inventory/items', { item: item() });
      await player.call('POST', '/api/inventory/items', { item: item({ wear: 0.9 }) });
      await quiet();

      expect(sent).toEqual([]);
    });

    describe('Loadout e Presets', () => {
      it('equipar mede o slot, o lado e o Preset; repetir não mede; trocar diz "substituiu"; desequipar e desfazer medem', async () => {
        const player = await signedInPlayer(t, next++);
        const first = await player.add(item());
        const second = await player.add(item({ seed: 12 }));

        const equip = await player.call('POST', '/api/loadout/equip', { uid: first });
        expect(equip.statusCode, equip.body).toBe(200);
        const [equipped] = await events('item_equipado');
        expect(equipped?.properties).toMatchObject({
          distinct_id: player.account.id,
          tipo: 'arma',
          item_id: AK,
          substituiu: false,
          preset_ativo: true,
          preset_principal: true,
        });
        expect(['ct', 'tr', 'ambos']).toContain(equipped?.properties.lados);
        expect(typeof equipped?.properties.slot).toBe('string');

        // O mesmo Item no mesmo slot: nada mudou, nada é medido.
        await player.call('POST', '/api/loadout/equip', { uid: first });
        await quiet();
        expect(sent.filter((e) => e.event === 'item_equipado')).toHaveLength(1);

        const swap = await player.call('POST', '/api/loadout/equip', { uid: second });
        const swapped = await events('item_equipado', 2);
        expect(swapped[1]?.properties.substituiu).toBe(true);

        const undone = await player.call('POST', '/api/loadout/assign', {
          assignments: (swap.json() as { previous: object[] }).previous,
        });
        expect(undone.statusCode, undone.body).toBe(200);
        expect((await events('equipar_desfeito'))[0]?.properties).toMatchObject({
          slots_afetados: 1,
        });

        const slot = String(equipped?.properties.slot);
        const off = await player.call('POST', '/api/loadout/unequip', { slot });
        expect(off.statusCode, off.body).toBe(200);
        expect((await events('item_desequipado'))[0]?.properties).toMatchObject({
          slot,
          preset_ativo: true,
        });
      });

      it('Presets (VIP): criar, ativar e apagar medem os totais e se era o ativo', async () => {
        const player = await signedInPlayer(t, next++, { vipUntil: Date.now() + 86_400_000 });
        await player.add(item());

        const created = await player.call('POST', '/api/presets', {
          name: 'Treino',
          from: 'current',
        });
        expect(created.statusCode, created.body).toBe(201);
        const { id } = created.json() as { id: string };
        expect((await events('preset_criado'))[0]?.properties).toMatchObject({
          copiado_do_atual: true,
          total_presets_apos: 2,
        });
        expect(JSON.stringify(sent)).not.toContain('Treino');

        expect((await player.call('POST', `/api/presets/${id}/activate`)).statusCode).toBe(200);
        expect((await events('preset_ativado'))[0]?.properties).toMatchObject({ total_presets: 2 });

        expect((await player.call('DELETE', `/api/presets/${id}`)).statusCode).toBe(200);
        expect((await events('preset_apagado'))[0]?.properties).toMatchObject({
          era_ativo: true,
          total_presets_apos: 1,
        });
      });

      it('sem VIP, criar Preset vira recurso_vip_bloqueado (preset_extra, loadout)', async () => {
        const player = await signedInPlayer(t, next++);

        const refused = await player.call('POST', '/api/presets', {
          name: 'Treino',
          from: 'empty',
        });
        expect(refused.statusCode).toBe(403);

        expect((await events('recurso_vip_bloqueado'))[0]?.properties).toMatchObject({
          recurso: 'preset_extra',
          origem: 'loadout',
        });
      });
    });

    describe('Perfil', () => {
      it('trocar o nome mede só se foi a primeira troca (o nome não sai); repetir o mesmo nome não mede', async () => {
        const player = await signedInPlayer(t, next++);

        const changed = await player.call('PUT', '/api/me/display-name', {
          displayName: 'Lia Exe',
        });
        expect(changed.statusCode, changed.body).toBe(200);
        expect((await events('nome_exibicao_alterado'))[0]?.properties).toMatchObject({
          primeira_troca: true,
        });
        expect(JSON.stringify(sent)).not.toContain('Lia Exe');

        await player.call('PUT', '/api/me/display-name', { displayName: 'Lia Exe' });
        await quiet();
        expect(sent.filter((e) => e.event === 'nome_exibicao_alterado')).toHaveLength(1);
      });

      it('as recusas medem só o motivo: nome curto, prazo de 7 dias', async () => {
        const player = await signedInPlayer(t, next++);

        await player.call('PUT', '/api/me/display-name', { displayName: 'a' });
        await player.call('PUT', '/api/me/display-name', { displayName: 'Nome Bom' });
        await player.call('PUT', '/api/me/display-name', { displayName: 'Outro Nome' });

        const refused = await events('nome_exibicao_recusado', 2);
        expect(refused.map((e) => e.properties.motivo)).toEqual(['too_short', 'too_soon']);
        expect(JSON.stringify(refused)).not.toContain('Outro Nome');
      });

      it('voltar ao nome Steam mede uma vez; repetir não mede', async () => {
        const player = await signedInPlayer(t, next++);
        await player.call('PUT', '/api/me/display-name', { displayName: 'Nome Bom' });
        sent.length = 0;

        expect((await player.call('DELETE', '/api/me/display-name')).statusCode).toBe(200);
        expect(await events('nome_exibicao_revertido')).toHaveLength(1);
        await player.call('DELETE', '/api/me/display-name');
        await quiet();
        expect(sent.filter((e) => e.event === 'nome_exibicao_revertido')).toHaveLength(1);
      });

      it('o Perfil privado mede o estado novo', async () => {
        const player = await signedInPlayer(t, next++);

        expect((await player.call('PUT', '/api/me/privacy', { isPrivate: true })).statusCode).toBe(
          204,
        );

        expect((await events('perfil_privado_alterado'))[0]?.properties).toMatchObject({
          privado: true,
          distinct_id: player.account.id,
        });
      });
    });

    describe('jogo', () => {
      const connect = (steamId: string, over: object = {}) =>
        t.app.inject({
          method: 'POST',
          url: '/api/server/player-connects',
          headers: { authorization: `Bearer ${t.serverKey}` },
          payload: { steamId, steamName: 'coldzera', ...over },
        });

      it('o primeiro connect cria a Conta (origem jogo, com o Modo) e conta como primeiro; o seguinte, não', async () => {
        const steamId = steamIdFor(700);

        expect((await connect(steamId)).statusCode).toBe(200);
        const [created] = await events('conta_criada');
        const [connected] = await events('servidor_conectado');
        expect(created?.properties).toMatchObject({ origem: 'jogo', modo: 'retake' });
        expect(connected?.properties).toMatchObject({
          modo: 'retake',
          primeiro_connect: true,
          eh_vip: false,
          conta_reivindicada: false,
          itens_equipados: 0,
          reenvio: false,
        });
        expect(JSON.stringify(sent)).not.toContain(steamId);

        sent.length = 0;
        await connect(steamId);
        const [again] = await events('servidor_conectado');
        expect(again?.properties.primeiro_connect).toBe(false);
        expect(sent.filter((e) => e.event === 'conta_criada')).toEqual([]);
      });

      it('quem conecta com skin equipada leva itens_equipados > 0 (a promessa central); VIP e reivindicada aparecem', async () => {
        const player = await signedInPlayer(t, next++, { vipUntil: Date.now() + 86_400_000 });
        const uid = await player.add(item());
        await player.call('POST', '/api/loadout/equip', { uid });
        sent.length = 0;

        expect((await connect(player.steamId)).statusCode).toBe(200);

        const [connected] = await events('servidor_conectado');
        expect(connected?.properties).toMatchObject({
          distinct_id: player.account.id,
          eh_vip: true,
          conta_reivindicada: true,
          itens_equipados: 1,
          primeiro_connect: true,
        });
      });

      it('um connect reenviado pelo plugin sai com o horário original e marcado como reenvio', async () => {
        const steamId = steamIdFor(701);
        const at = new Date(Date.now() - 5 * 60_000);

        await connect(steamId, { connectedAt: at.toISOString() });

        const [connected] = await events('servidor_conectado');
        expect(connected?.timestamp).toBe(at.toISOString());
        expect(connected?.properties.reenvio).toBe(true);
      });

      it('o fim da Sessão de jogo mede o Modo e a duração; reenviar o lote não duplica', async () => {
        const player = await signedInPlayer(t, next++);
        const end = new Date();
        const start = new Date(end.getTime() - 30 * 60_000);
        const body = {
          kills: [],
          damages: [],
          roundEnds: [],
          sessionStarts: [],
          sessionEnds: [
            {
              id: '0199f2a0-7b1c-7000-8000-00000000a001',
              at: end.toISOString(),
              sessionId: '0199f2a0-7b1c-7000-8000-00000000a002',
              steamId: player.steamId,
              startedAt: start.toISOString(),
            },
          ],
        };
        const send = () =>
          t.app.inject({
            method: 'POST',
            url: '/api/server/events',
            headers: { authorization: `Bearer ${t.serverKey}` },
            payload: body,
          });

        expect((await send()).statusCode).toBe(200);
        const [ended] = await events('sessao_de_jogo_encerrada');
        expect(ended).toMatchObject({ timestamp: end.toISOString() });
        expect(ended?.properties).toMatchObject({
          distinct_id: player.account.id,
          modo: 'retake',
          duracao_segundos: 1800,
        });

        // O mesmo lote de novo: o fim já foi contado, nada novo é medido.
        await send();
        await quiet();
        expect(sent.filter((e) => e.event === 'sessao_de_jogo_encerrada')).toHaveLength(1);
      });
    });

    describe('Denúncias do jogo', () => {
      const report = (reporter: string, target: string, reason = 'cheat') =>
        t.app.inject({
          method: 'POST',
          url: '/api/server/reports',
          headers: { authorization: `Bearer ${t.serverKey}` },
          payload: {
            reporterSteamId: reporter,
            targetSteamId: target,
            reason,
            round: 3,
            map: 'de_nuke',
          },
        });

      it('enviada mede só o motivo e o Modo, na Conta de quem denunciou; o alvo nunca sai', async () => {
        const reporter = await signedInPlayer(t, next++);
        const target = await signedInPlayer(t, next++);

        const response = await report(reporter.steamId, target.steamId, 'griefing');
        expect(response.json()).toMatchObject({ accepted: true });

        const [sentReport] = await events('denuncia_enviada');
        expect(sentReport?.properties).toMatchObject({
          distinct_id: reporter.account.id,
          motivo: 'griefing',
          modo: 'retake',
        });
        const text = JSON.stringify(sent);
        expect(text).not.toContain(target.account.id);
        expect(text).not.toContain(target.steamId);
        expect(text).not.toContain(String(target.account.publicId));
      });

      it('recusada pelo limite (mesmo alvo em 10 minutos) mede a recusa; auto-denúncia e Conta desconhecida não', async () => {
        const reporter = await signedInPlayer(t, next++);
        const target = await signedInPlayer(t, next++);
        await report(reporter.steamId, target.steamId);
        sent.length = 0;

        const second = await report(reporter.steamId, target.steamId);
        expect(second.json()).toMatchObject({ accepted: false, refusal: 'same_target_cooldown' });
        const [refused] = await events('denuncia_recusada');
        expect(refused?.properties).toMatchObject({
          distinct_id: reporter.account.id,
          recusa: 'same_target_cooldown',
          modo: 'retake',
        });

        sent.length = 0;
        await report(reporter.steamId, reporter.steamId);
        await report(reporter.steamId, steamIdFor(799_999));
        await quiet();
        expect(sent).toEqual([]);
      });
    });
  });
});
