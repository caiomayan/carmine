/*
 * Dados FICTÍCIOS do protótipo do Painel da Staff (S25, PR A). Nada aqui vem da API: nomes, IDs e números são
 * inventados só para a direção visual. Tudo é determinístico (sem Math.random) e relativo ao `nowMs` do servidor,
 * para o HTML do servidor e o do cliente baterem.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;
export const MIN_MS = 60 * 1000;

export type ReportStatus = 'open' | 'review' | 'done';
export type ReportCategory = 'cheat' | 'chat' | 'grief' | 'profile' | 'other';

export const CATEGORY_LABEL: Record<ReportCategory, string> = {
  cheat: 'Trapaça',
  chat: 'Ofensa no chat',
  grief: 'Griefing',
  profile: 'Nome ou foto',
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
const CATEGORIES: ReportCategory[] = [
  'cheat',
  'chat',
  'grief',
  'profile',
  'other',
  'chat',
  'cheat',
];

const NOTES: Record<ReportCategory, string> = {
  cheat:
    'Mira travada através da parede em três rounds seguidos; o killcam mostra a mira acompanhando o jogador antes de ele aparecer.',
  chat: 'Xingamentos e ofensas dirigidas a um jogador do time por vários minutos no chat de texto.',
  grief:
    'Atirou nos próprios colegas e bloqueou a entrada do bomb site de propósito, round após round.',
  profile: 'O nome de jogador contém um insulto e a foto de perfil tem conteúdo impróprio.',
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
    return {
      id: `R-${2041 + index}`,
      reported: NAMES[Math.floor(rand() * NAMES.length)] as string,
      reporter: NAMES[Math.floor(rand() * NAMES.length)] as string,
      category,
      server: SERVERS[index % SERVERS.length] as string,
      status,
      createdAt: nowMs - age * MIN_MS,
      note: NOTES[category],
      steamId: fakeSteamId(index + 3),
    };
  });
}

export function makePhotos(nowMs: number): Photo[] {
  const ages = [1260, 760, 410, 190, 65, 22];
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
