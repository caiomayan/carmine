// Gerador dos corpos que um Servidor Carmine manda à API: batimento (`POST /api/server/heartbeat`) e lote
// de eventos (`POST /api/server/events`). Módulo puro, sem imports do k6: o teste (test/eventos.spec.ts) o
// valida contra os schemas de @carmine/contracts, então um contrato que muda quebra aqui e não na madrugada
// do teste.
//
// O ritmo imita o Carmine.Core (plugins/src/Carmine.Core/CoreConfig.cs): batimento a cada 10 s, descarga
// da fila de eventos a cada 5 s. Um round de Retake dura ~75 s; o resto é um modelo, declarado em
// docs/operacao/teste-de-carga.md.

/** Bloco de SteamID64 do teste: válido para o contrato e distinto do bloco da demonstração (…9999000000). */
const STEAM_ID_BASE = 76561199990000000n;
const MAPAS = ['de_mirage', 'de_inferno', 'de_nuke', 'de_ancient', 'de_anubis'];
const ARMAS = ['ak47', 'm4a1', 'm4a1_silencer', 'awp', 'deagle', 'usp_silencer', 'glock', 'famas'];

/** SteamID64 do jogador `posicao` (0..) do servidor `indice` (1..). Até 100 jogadores por servidor. */
export function steamIdDoJogador(indice, posicao) {
  return String(STEAM_ID_BASE + BigInt(indice) * 100n + BigInt(posicao));
}

/** UUID v7 (48 bits de milissegundos + aleatório). `rng` devolve [0, 1). */
export function uuidV7(agoraMs, rng) {
  const hex = (n, largura) => Math.floor(n).toString(16).padStart(largura, '0');
  const tempo = hex(agoraMs, 12);
  const aleatorio = (largura) => hex(rng() * 16 ** largura, largura);
  const variante = (8 + Math.floor(rng() * 4)).toString(16);
  return `${tempo.slice(0, 8)}-${tempo.slice(8)}-7${aleatorio(3)}-${variante}${aleatorio(3)}-${aleatorio(12)}`;
}

/** Quantos eventos sorteados para uma média fracionária (2,4 vira 2 ou 3, na proporção certa). */
function sorteia(media, rng) {
  return Math.floor(media + rng());
}

/**
 * Um Servidor Carmine de Retake simulado.
 *
 * @param {object} opcoes
 * @param {number} opcoes.indice posição do servidor (1..), define o SteamID64 dos jogadores
 * @param {() => number} opcoes.rng
 * @param {number} [opcoes.jogadores] humanos no servidor
 * @param {number} [opcoes.segundosPorRound]
 * @param {number} [opcoes.segundosPorDescarga]
 * @param {number} [opcoes.abatesPorRound]
 * @param {number} [opcoes.danosPorRound]
 */
export function criaServidor({
  indice,
  rng,
  jogadores = 10,
  segundosPorRound = 75,
  segundosPorDescarga = 5,
  abatesPorRound = 8,
  danosPorRound = 28,
}) {
  const mapa = MAPAS[indice % MAPAS.length];
  const elenco = Array.from({ length: jogadores }, (_, i) => ({
    steamId: steamIdDoJogador(indice, i),
    time: i % 2 === 0 ? 'ct' : 't',
  }));
  let mapPlayId = null;
  let numeroDoRound = 0;
  let decorridoNoRound = 0;
  let placar = { ct: 0, t: 0 };

  const escolhe = (lista) => lista[Math.floor(rng() * lista.length)];
  const arma = () => escolhe(ARMAS);
  const posicao = () => ({
    x: Math.round(rng() * 4000 - 2000),
    y: Math.round(rng() * 4000 - 2000),
    z: Math.round(rng() * 200),
  });

  function iniciaRound(lote, agoraMs) {
    numeroDoRound += 1;
    decorridoNoRound = 0;
    lote.roundStarts.push({
      id: uuidV7(agoraMs, rng),
      at: new Date(agoraMs).toISOString(),
      atMs: agoraMs,
      warmup: false,
      mapPlayId,
      roundNumber: numeroDoRound,
      map: mapa,
      players: elenco.map((p) => ({
        steamId: p.steamId,
        team: p.time,
        equipmentValue: 800 + Math.floor(rng() * 4200),
      })),
      botsCt: 0,
      botsT: 0,
    });
  }

  function encerraRound(lote, agoraMs) {
    const vencedor = rng() < 0.5 ? 'ct' : 't';
    placar = { ...placar, [vencedor]: placar[vencedor] + 1 };
    const motivo = vencedor === 'ct' ? 'elimination' : 'bomb_exploded';
    lote.roundEnds.push({
      id: uuidV7(agoraMs, rng),
      at: new Date(agoraMs).toISOString(),
      warmup: false,
      winner: vencedor,
      players: elenco.map((p) => ({ steamId: p.steamId, team: p.time })),
      map: mapa,
      roundNumber: numeroDoRound,
      scoreCt: placar.ct,
      scoreT: placar.t,
      mapPlayId,
      atMs: agoraMs,
      reason: motivo,
      durationMs: Math.round(decorridoNoRound * 1000),
      alive: elenco.filter(() => rng() < 0.3).map((p) => p.steamId),
    });
    if (motivo === 'bomb_exploded') {
      lote.bombs.push({
        id: uuidV7(agoraMs, rng),
        at: new Date(agoraMs).toISOString(),
        atMs: agoraMs,
        warmup: false,
        mapPlayId,
        roundNumber: numeroDoRound,
        kind: 'explode',
        steamId: null,
        site: rng() < 0.5 ? 'a' : 'b',
      });
    }
  }

  function geraAbate(lote, agoraMs) {
    const assassino = escolhe(elenco);
    const vitima = escolhe(elenco.filter((p) => p.time !== assassino.time));
    const ajudante = rng() < 0.3 ? escolhe(elenco.filter((p) => p.time === assassino.time)) : null;
    lote.kills.push({
      id: uuidV7(agoraMs, rng),
      at: new Date(agoraMs).toISOString(),
      warmup: false,
      killerSteamId: assassino.steamId,
      killerIsBot: false,
      victimSteamId: vitima.steamId,
      victimIsBot: false,
      assisterSteamId: ajudante?.steamId ?? null,
      assisterIsBot: false,
      headshot: rng() < 0.4,
      weapon: arma(),
      teamKill: false,
      killerTeam: assassino.time,
      mapPlayId,
      roundNumber: numeroDoRound,
      atMs: agoraMs,
      victimTeam: vitima.time,
      flashAssist: false,
      penetrated: 0,
      throughSmoke: false,
      attackerBlind: false,
      noScope: false,
      distance: Math.round(rng() * 2500),
      killerPosition: posicao(),
      victimPosition: posicao(),
    });
  }

  function geraDano(lote, agoraMs) {
    const atacante = escolhe(elenco);
    const vitima = escolhe(elenco.filter((p) => p.time !== atacante.time));
    const bruto = 5 + Math.floor(rng() * 95);
    lote.damages.push({
      id: uuidV7(agoraMs, rng),
      at: new Date(agoraMs).toISOString(),
      warmup: false,
      attackerSteamId: atacante.steamId,
      victimIsBot: false,
      teamDamage: false,
      amount: bruto,
      mapPlayId,
      roundNumber: numeroDoRound,
      atMs: agoraMs,
      victimSteamId: vitima.steamId,
      weapon: arma(),
      hitgroup: 1 + Math.floor(rng() * 7),
      armorDamage: Math.floor(bruto * 0.2),
      healthDamage: Math.min(bruto, 100),
    });
  }

  return {
    elenco,
    mapa,

    /** O corpo de `POST /api/server/heartbeat`. */
    batimento() {
      return {
        map: mapa,
        players: elenco.map((p) => p.steamId),
        maxPlayers: 16,
      };
    },

    /**
     * O corpo de `POST /api/server/events` com o que aconteceu desde a descarga anterior. A primeira
     * descarga abre o mapa: entrada de todos os jogadores e o primeiro round.
     */
    descarga(agoraMs) {
      const lote = {
        kills: [],
        damages: [],
        roundEnds: [],
        sessionStarts: [],
        sessionEnds: [],
        roundStarts: [],
        bombs: [],
      };
      if (mapPlayId === null) {
        mapPlayId = uuidV7(agoraMs, rng);
        for (const p of elenco) {
          lote.sessionStarts.push({
            id: uuidV7(agoraMs, rng),
            at: new Date(agoraMs).toISOString(),
            sessionId: uuidV7(agoraMs, rng),
            steamId: p.steamId,
            map: mapa,
          });
        }
        iniciaRound(lote, agoraMs);
        return lote;
      }
      const fracao = segundosPorDescarga / segundosPorRound;
      for (let i = sorteia(abatesPorRound * fracao, rng); i > 0; i -= 1) geraAbate(lote, agoraMs);
      for (let i = sorteia(danosPorRound * fracao, rng); i > 0; i -= 1) geraDano(lote, agoraMs);
      decorridoNoRound += segundosPorDescarga;
      if (decorridoNoRound >= segundosPorRound) {
        encerraRound(lote, agoraMs);
        iniciaRound(lote, agoraMs);
      }
      return lote;
    },
  };
}

export function totalDeEventos(lote) {
  return (
    lote.kills.length +
    lote.damages.length +
    lote.roundEnds.length +
    lote.sessionStarts.length +
    lote.sessionEnds.length +
    lote.roundStarts.length +
    lote.bombs.length
  );
}
