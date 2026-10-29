import type { Plan } from '@carmine/contracts';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Uma concessão de plano a uma Conta: uma compra de pacote, uma concessão da Staff ou uma compra de teste do
 * beta. É o registro imutável; o que a Conta tem em cada instante sai de {@link planTimeline}, nunca de datas
 * guardadas.
 */
export interface PlanGrant {
  id?: string;
  plan: Plan;
  days: number;
  /** Quando foi concedida. */
  at: Date;
  /** Compra de teste do beta (ninguém paga de verdade): acaba na data em que a cobrança real ligar. */
  test?: boolean;
}

export interface PlanTimelineOptions {
  /** Revogações da Staff: cada uma zera tudo o que a Conta tinha (inclusive a fila) naquele instante. */
  revokedAt?: readonly Date[];
  /**
   * O dia em que a cobrança real liga: nesse instante os dias de teste que ainda sobram acabam, e um teste
   * concedido a partir dele não vale. Os dias pagos não são tocados.
   */
  testsEndAt?: Date | null;
}

/** Um trecho de tempo com um plano ativo. Trechos seguidos do mesmo plano e do mesmo tipo vêm juntos. */
export interface PlanSegment {
  plan: Plan;
  test: boolean;
  startsAt: Date;
  endsAt: Date;
}

/**
 * O plano de uma Conta num instante e o que vem depois. `endsAt` é quando o último plano acaba (os benefícios
 * param); `planEndsAt` é quando o plano de agora acaba ou muda; `next` é o trecho que vem logo depois (o Capo
 * guardado que volta quando o Padrinho acaba). `endedAt` só vale sem plano: o fim do último trecho.
 */
export interface PlanStatus {
  active: boolean;
  plan: Plan | null;
  /** O trecho de agora é de teste. */
  test: boolean;
  planEndsAt: Date | null;
  endsAt: Date | null;
  next: PlanSegment | null;
  endedAt: Date | null;
}

type Kind = 'grant' | 'testsEnd' | 'revoke';

interface Event {
  at: number;
  kind: Kind;
  grant?: PlanGrant;
}

/** A ordem em que os dias se gastam: o Padrinho passa à frente do Capo e, no mesmo plano, o teste vai antes. */
const BUCKETS = [
  { plan: 'padrinho', test: true },
  { plan: 'padrinho', test: false },
  { plan: 'capo', test: true },
  { plan: 'capo', test: false },
] as const satisfies readonly { plan: Plan; test: boolean }[];

const bucketKey = (plan: Plan, test: boolean) => `${plan}:${test}`;

/**
 * A história dos planos de uma Conta, trecho a trecho (ADR 0026). É uma função pura das concessões: cada
 * concessão põe seus dias num "saldo" do plano e o tempo gasta primeiro o saldo do Padrinho e depois o do
 * Capo. Daí saem todas as regras de troca:
 * - o mesmo plano comprado com ele ativo soma ao fim;
 * - Padrinho sobre Capo começa na hora e os dias que sobram do Capo ficam guardados, voltando depois;
 * - Capo sobre Padrinho espera na fila, e outro Capo soma aos dias de Capo que esperam;
 * - tirar uma concessão (reembolso) recua o fim exatamente esses dias;
 * - a ordem das concessões na lista não importa.
 *
 * Dentro do mesmo plano, os dias de teste são gastos antes dos pagos, para a data em que o teste acaba
 * (`testsEndAt`) tirar só o que sobrar de teste e preservar o que foi pago.
 */
export function planTimeline(
  grants: readonly PlanGrant[],
  options: PlanTimelineOptions = {},
): PlanSegment[] {
  const testsEnd = options.testsEndAt?.getTime() ?? null;
  const events: Event[] = [];
  for (const grant of grants) {
    if (grant.days <= 0) continue;
    // Um teste concedido depois do fim dos testes não vale.
    if (grant.test && testsEnd !== null && grant.at.getTime() >= testsEnd) continue;
    events.push({ at: grant.at.getTime(), kind: 'grant', grant });
  }
  if (testsEnd !== null) events.push({ at: testsEnd, kind: 'testsEnd' });
  for (const at of options.revokedAt ?? []) events.push({ at: at.getTime(), kind: 'revoke' });
  const order: Record<Kind, number> = { grant: 0, testsEnd: 1, revoke: 2 };
  events.sort((a, b) => a.at - b.at || order[a.kind] - order[b.kind]);

  const balance = new Map<string, number>();
  const segments: PlanSegment[] = [];
  let cursor = events[0]?.at ?? 0;

  /** Gasta os saldos de `cursor` até `until` (ou até acabarem, com `Infinity`), emitindo os trechos. */
  const advance = (until: number) => {
    let time = cursor;
    for (const { plan, test } of BUCKETS) {
      if (time >= until) break;
      const available = balance.get(bucketKey(plan, test)) ?? 0;
      if (available <= 0) continue;
      const take = Math.min(available, until - time);
      emit({ plan, test, startsAt: new Date(time), endsAt: new Date(time + take) });
      balance.set(bucketKey(plan, test), available - take);
      time += take;
    }
    cursor = until;
  };

  const emit = (segment: PlanSegment) => {
    const last = segments[segments.length - 1];
    if (
      last &&
      last.plan === segment.plan &&
      last.test === segment.test &&
      last.endsAt.getTime() === segment.startsAt.getTime()
    ) {
      last.endsAt = segment.endsAt;
    } else {
      segments.push(segment);
    }
  };

  for (const event of events) {
    advance(event.at);
    if (event.kind === 'grant' && event.grant) {
      const { plan, days, test = false } = event.grant;
      const key = bucketKey(plan, test);
      balance.set(key, (balance.get(key) ?? 0) + days * DAY_MS);
    } else if (event.kind === 'testsEnd') {
      for (const { plan } of BUCKETS) balance.set(bucketKey(plan, true), 0);
    } else {
      balance.clear();
    }
  }
  advance(Number.POSITIVE_INFINITY);
  return segments;
}

/** O plano da Conta em `now`, com o que vem depois, a partir das concessões. */
export function planStatusAt(
  grants: readonly PlanGrant[],
  now: Date,
  options: PlanTimelineOptions = {},
): PlanStatus {
  const segments = planTimeline(grants, options);
  const time = now.getTime();
  const index = segments.findIndex(
    (s) => s.startsAt.getTime() <= time && time < s.endsAt.getTime(),
  );
  const current = segments[index];
  if (!current) {
    const past = segments.filter((s) => s.endsAt.getTime() <= time);
    const endedAt = past.reduce<Date | null>(
      (latest, s) => (latest === null || s.endsAt > latest ? s.endsAt : latest),
      null,
    );
    return {
      active: false,
      plan: null,
      test: false,
      planEndsAt: null,
      endsAt: null,
      next: null,
      endedAt,
    };
  }

  // O mesmo plano segue enquanto os trechos se encostam (teste e pago do mesmo plano são um plano só).
  let end = index;
  while (
    segments[end + 1] &&
    segments[end + 1]?.plan === current.plan &&
    segments[end + 1]?.startsAt.getTime() === segments[end]?.endsAt.getTime()
  ) {
    end++;
  }
  const next = segments[end + 1];
  const planEndsAt = (segments[end] as PlanSegment).endsAt;
  const adjacent = next && next.startsAt.getTime() === planEndsAt.getTime() ? next : null;

  let last = end;
  while (
    segments[last + 1] &&
    segments[last + 1]?.startsAt.getTime() === segments[last]?.endsAt.getTime()
  ) {
    last++;
  }
  return {
    active: true,
    plan: current.plan,
    test: current.test,
    planEndsAt,
    endsAt: (segments[last] as PlanSegment).endsAt,
    next: adjacent,
    endedAt: null,
  };
}
