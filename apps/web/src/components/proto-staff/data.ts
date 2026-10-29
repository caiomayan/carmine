/*
 * Dados FICTÍCIOS do protótipo do Painel da Staff (S25, PR A). Nada aqui vem da API: nomes, IDs e números são
 * inventados só para a direção visual. Tudo é determinístico (sem Math.random) e relativo ao `nowMs` do servidor,
 * para o HTML do servidor e o do cliente baterem.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;
export const MIN_MS = 60 * 1000;

export type ReportStatus = 'open' | 'review' | 'done';
export type ReportCategory = 'cheat' | 'voice' | 'chat' | 'grief' | 'other';

export const CATEGORY_LABEL: Record<ReportCategory, string> = {
  cheat: 'Cheat',
  voice: 'Voz ofensiva',
  chat: 'Chat ofensivo',
  grief: 'Antijogo',
  other: 'Outro',
};

export const STATUS_LABEL: Record<ReportStatus, string> = {
  open: 'Aberta',
  review: 'Em análise',
  done: 'Resolvida',
};

export type Report = {
  id: string;
  reported: string;
  reporter: string;
  category: ReportCategory;
  server: string;
  status: ReportStatus;
  /** Quando chegou (ms). O prazo de revisão é de 24 h a partir daqui. */
  createdAt: number;
  note: string;
  steamId: string;
  /** Quando a Staff assumiu e quando resolveu (ms), se já aconteceu. */
  assumedAt?: number;
  resolvedAt?: number;
};

export type Photo = {
  id: string;
  account: string;
  steamId: string;
  sentAt: number;
  hue: number;
};

export type Alert = { id: string; severity: 'danger' | 'warn'; title: string; detail: string };

const NAMES = [
  'rafa.exe',
  'Bruna_AWP',
  'Tchê',
  'm4nelzin',
  'Gui Sorriso',
  'lunaticx',
  'Pedrão',
  'Dudu7',
  'Vini',
  'marcelinho',
  'alê',
  'Josué',
  'nathy',
  'kauê',
  'Lari',
  'otavio_ct',
  'Samu',
  'BiaSmoke',
  'davi',
  'Carlinhos',
  'Fe.Rocha',
  'ju_tr',
];

const SERVERS = ['Retake #1', 'Retake #2', 'Retake #3', 'Deathmatch #1'];
const CATEGORIES: ReportCategory[] = ['cheat', 'chat', 'grief', 'voice', 'other', 'chat', 'cheat'];

const NOTES: Record<ReportCategory, string> = {
  cheat:
    'Mira travada através da parede em três rounds seguidos; o killcam mostra a mira acompanhando o jogador antes de ele aparecer.',
  chat: 'Xingamentos e ofensas dirigidas a um jogador do time por vários minutos no chat de texto.',
  grief:
    'Atirou nos próprios colegas e bloqueou a entrada do bomb site de propósito, round após round.',
  voice: 'Ofensas dirigidas a um jogador do time pelo chat de voz por vários minutos.',
  other: 'O jogador diz que foi expulso sem motivo e pede a revisão da Punição.',
};

/** Idade, em minutos, de cada denúncia: algumas a poucas horas de vencer, uma já vencida. */
const AGES = [
  1305, 1190, 1475, 1020, 880, 760, 640, 560, 470, 400, 340, 300, 255, 210, 180, 150, 125, 100, 85,
  70, 58, 47, 39, 31, 26, 20, 16, 12, 9, 6, 4, 3, 2, 1, 1700, 2100, 2600,
];

function pseudo(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** SteamID64 inventado (o prefixo não existe de verdade), só para parecer com um. */
const fakeSteamId = (n: number) => `7656119${String(8000000000 + n * 7919).slice(-10)}`;

export function makeReports(nowMs: number): Report[] {
  const rand = pseudo(2510);
  return AGES.map((age, index) => {
    const category = CATEGORIES[index % CATEGORIES.length] as ReportCategory;
    const done = age > 1500;
    const status: ReportStatus = done ? 'done' : rand() < 0.28 ? 'review' : 'open';
    const createdAt = nowMs - age * MIN_MS;
    return {
      id: `R-${2041 + index}`,
      reported: NAMES[Math.floor(rand() * NAMES.length)] as string,
      reporter: NAMES[Math.floor(rand() * NAMES.length)] as string,
      category,
      server: SERVERS[index % SERVERS.length] as string,
      status,
      createdAt,
      note: NOTES[category],
      steamId: fakeSteamId(index + 3),
      ...(status !== 'open' ? { assumedAt: createdAt + Math.min(age * 0.4, 360) * MIN_MS } : {}),
      ...(status === 'done' ? { resolvedAt: createdAt + age * 0.8 * MIN_MS } : {}),
    };
  });
}

export function makePhotos(nowMs: number): Photo[] {
  const ages = [1140, 760, 410, 190, 65, 22];
  const accounts = ['Fe.Rocha', 'ju_tr', 'Samu', 'BiaSmoke', 'davi', 'Carlinhos'];
  return ages.map((age, index) => ({
    id: `F-${512 + index}`,
    account: accounts[index] as string,
    steamId: fakeSteamId(40 + index),
    sentAt: nowMs - age * MIN_MS,
    hue: (index * 57 + 210) % 360,
  }));
}

export const ALERTS: Alert[] = [
  {
    id: 'a1',
    severity: 'danger',
    title: 'Servidor sem batimento',
    detail: 'Retake #3 não responde há 4 min',
  },
  {
    id: 'a2',
    severity: 'warn',
    title: 'Fila de eventos atrasada',
    detail: '3 min de atraso, 214 eventos esperando',
  },
];

/** Jogadores online por hora nas últimas 24 h (a última é agora). */
export const ONLINE_24H = [
  38, 31, 24, 19, 16, 15, 18, 26, 34, 41, 52, 61, 70, 78, 84, 96, 108, 121, 134, 148, 156, 151, 147,
  142,
];

export const PURCHASES = [
  { id: 'c1', who: 'Dudu7', what: 'VIP · 3 meses', value: 2690, at: '14:32', state: 'ok' as const },
  { id: 'c2', who: 'lunaticx', what: 'VIP · 1 mês', value: 990, at: '13:58', state: 'ok' as const },
  {
    id: 'c3',
    who: 'Gui Sorriso',
    what: 'VIP · 6 meses',
    value: 4990,
    at: '12:40',
    state: 'refund' as const,
  },
  { id: 'c4', who: 'nathy', what: 'VIP · 1 mês', value: 990, at: '11:15', state: 'ok' as const },
];

export const ACCOUNTS = [
  'Fe.Rocha',
  'ju_tr',
  'Samu',
  'BiaSmoke',
  'davi',
  'Carlinhos',
  'Bruna_AWP',
  'Tchê',
];

export type Deadline = {
  /** Minutos que faltam (negativo: venceu). */
  leftMin: number;
  /** Fração do prazo já gasta, de 0 a 1. */
  spent: number;
  tone: 'ok' | 'warn' | 'danger';
  label: string;
};

export function deadlineOf(createdAt: number, nowMs: number): Deadline {
  const elapsed = Math.floor((nowMs - createdAt) / MIN_MS);
  const leftMin = 24 * 60 - elapsed;
  const spent = Math.min(1, Math.max(0, elapsed / (24 * 60)));
  const tone = leftMin < 180 ? 'danger' : leftMin < 480 ? 'warn' : 'ok';
  const abs = Math.abs(leftMin);
  const text =
    abs >= 60 ? `${Math.floor(abs / 60)} h ${String(abs % 60).padStart(2, '0')} min` : `${abs} min`;
  return { leftMin, spent, tone, label: leftMin < 0 ? `venceu há ${text}` : `${text} restantes` };
}

export const brl = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export type TimelineEvent = { at: number | null; title: string; sub: string; done: boolean };

/** Os marcos de uma denúncia: o que já aconteceu (bolinha cheia) e o prazo que falta (bolinha vazada). */
export function timelineOf(report: Report): TimelineEvent[] {
  const events: TimelineEvent[] = [
    {
      at: report.createdAt,
      title: 'Denúncia recebida',
      sub: `Enviada por ${report.reporter} · ${report.server}`,
      done: true,
    },
    {
      at: report.createdAt + MIN_MS,
      title: 'Entrou na fila de revisão',
      sub: 'O prazo de 24 h começa a correr',
      done: true,
    },
  ];
  if (report.assumedAt) {
    events.push({
      at: report.assumedAt,
      title: 'Assumida pela Staff',
      sub: 'Mara Lopes · Moderadora',
      done: true,
    });
  }
  if (report.resolvedAt) {
    events.push({
      at: report.resolvedAt,
      title: 'Resolvida',
      sub: 'Sem Punição pendente',
      done: true,
    });
  } else {
    events.push({
      at: report.createdAt + DAY_MS,
      title: 'Fim do prazo de revisão',
      sub: '24 h depois de recebida',
      done: false,
    });
  }
  return events;
}

const STAMP = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});
export const stamp = (ms: number) => STAMP.format(ms).replace(',', '');

const HOUR = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  hourCycle: 'h23',
});
/** "Bom dia", "Boa tarde" ou "Boa noite" no horário de Brasília. */
export function greeting(ms: number): string {
  const hour = Number(HOUR.format(ms));
  return hour < 5 ? 'Boa noite' : hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
}

export type ModeId = 'all' | 'retake' | 'dm' | 'rooms';
export const MODES: { id: ModeId; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'retake', label: 'Retake' },
  { id: 'dm', label: 'Deathmatch' },
  { id: 'rooms', label: 'Salas' },
];

export const SERVER_LIST = [
  { name: 'Retake #1', mode: 'retake', up: true },
  { name: 'Retake #2', mode: 'retake', up: true },
  { name: 'Retake #3', mode: 'retake', up: false },
  { name: 'Retake #4', mode: 'retake', up: true },
  { name: 'Deathmatch #1', mode: 'dm', up: true },
  { name: 'Deathmatch #2', mode: 'dm', up: true },
] as const;

/** Jogadores online por Modo: a série das 24 h do Modo e o número de agora (as Salas só existem com a S23). */
export function onlineFor(mode: ModeId): { now: number; series: number[] } | null {
  if (mode === 'rooms') return null;
  const factor = mode === 'all' ? 1 : mode === 'retake' ? 0.64 : 0.36;
  const series = ONLINE_24H.map((value) => Math.round(value * factor));
  return { now: series[series.length - 1] as number, series };
}
