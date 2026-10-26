/**
 * O que a página do servidor mostra além do `LiveServer` (estado, mapa, vagas, endereço), que já vem da API: os
 * blocos da S12b (placar ao vivo, jogadores com time e K/D, histórico do dia). Cada bloco chega como
 * {@link Collectable}: `collecting` enquanto a API ainda não responde com ele (a página mostra "coletando desde X",
 * nunca um número inventado) e `ready` com o dado de verdade. Estes tipos são o que a página lê; quem liga a API
 * (um adaptador dos contratos da S12b) só precisa devolver esta forma.
 */

export type Side = 'ct' | 't';

/** Rounds ganhos por lado neste mapa, o round de agora e se é aquecimento (sem placar ainda). */
export type Match = { round: number; ctScore: number; tScore: number; warmup: boolean };

/** Uma linha da lista de jogadores: o Perfil privado vem sem nome nem link e conta no total. */
export type RosterPlayer = {
  /** Estável entre leituras (a linha se move, não some e volta). */
  id: string;
  name: string | null;
  avatarUrl: string | null;
  /** `publicId` do Perfil; nulo no Perfil privado. */
  publicId: number | null;
  /** Nulo no Deathmatch (todos contra todos). */
  team: Side | null;
  kills: number;
  deaths: number;
  score: number;
};

export type TodayMap = {
  map: string;
  /** "HH:MM" no relógio de Brasília. */
  from: string;
  /** Nulo no mapa de agora. */
  to: string | null;
  rounds: number;
  /** Rounds ganhos por lado neste mapa; nulos no Deathmatch. */
  ctWins: number | null;
  tWins: number | null;
};

export type Today = {
  /** O dia, ISO (`2026-10-26`). */
  date: string;
  /** A hora de agora no relógio de Brasília ("HH:MM"): o mapa de agora e o "há N min" saem dela. */
  clock: string;
  rounds: { played: number; ctWins: number | null; tWins: number | null };
  maps: TodayMap[];
  /** Rounds por hora, de 0h a 23h (24 valores). */
  hours: number[];
  peakPlayers: { at: string; count: number };
  uniquePlayers: number;
  /** Desde quando há dado detalhado do servidor (ISO); nulo se a API não disse. */
  since: string | null;
};

export type Collectable<T> =
  | {
      status: 'collecting';
      /** Desde quando há dado detalhado (ISO); nulo se a coleta ainda não começou. */
      since: string | null;
    }
  | { status: 'ready'; data: T };

/** `match` pronto e nulo é "sem partida em andamento" (servidor vazio, ou Deathmatch). */
export type ServerExtras = {
  match: Collectable<Match | null>;
  roster: Collectable<RosterPlayer[]>;
  today: Collectable<Today>;
};

/** Enquanto a API não entrega a S12b: todos os blocos "coletando", sem data. */
export const COLLECTING_EXTRAS: ServerExtras = {
  match: { status: 'collecting', since: null },
  roster: { status: 'collecting', since: null },
  today: { status: 'collecting', since: null },
};
