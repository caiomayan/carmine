import { randomUUID } from 'node:crypto';
import {
  AVATAR_MIN_ACCOUNT_AGE_HOURS,
  AVATAR_REMOVED_RETENTION_DAYS,
  AVATAR_UPLOADS_PER_DAY,
  type AvatarIneligibleReason,
  type AvatarState,
} from '@carmine/contracts/avatar';
import { and, asc, desc, eq, gt, inArray } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { accountAvatars, accounts } from '../database/schema.js';
import type { Sanctions } from '../moderation/sanctions.js';
import type { AvatarFiles } from './avatar-files.js';
import { AvatarRejection, processAvatar } from './avatar-processor.js';

type Executor = Pick<Database, 'select'>;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Quantas fotos o servidor processa ao mesmo tempo (o `sharp` usa CPU e memória da API). */
const MAX_CONCURRENT_PROCESSING = 2;

/** Fila de espera simples para limitar a concorrência do processamento. */
class Gate {
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly max: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      this.waiting.shift()?.();
    }
  }
}

interface Facts {
  account: typeof accounts.$inferSelect;
  /** A foto própria da Conta: no ar (`active`) ou fora por denúncias (`suspended`). */
  current: typeof accountAvatars.$inferSelect | null;
  /** Envios das últimas 24 h, do mais antigo para o mais novo. */
  recentUploads: Date[];
  /** A remoção mais recente pela Staff nos últimos 30 dias. */
  removal: {
    at: Date;
    reason: NonNullable<typeof accountAvatars.$inferSelect.decisionReason>;
  } | null;
}

/**
 * A foto de perfil própria (ADR 0022): enviar (publica na hora), voltar à foto da Steam e o estado
 * que o site mostra. `accounts.avatarUrl` é sempre o avatar efetivo (Steam ou foto no ar), então
 * quem lê o avatar não muda. A moderação (denúncia, suspensão, decisão da Staff) usa os
 * primitivos de `AvatarFiles` e as tabelas `account_avatars` e `avatar_reports`.
 */
export class Avatars {
  private readonly gate = new Gate(MAX_CONCURRENT_PROCESSING);

  constructor(
    private readonly db: Database,
    private readonly files: AvatarFiles,
    private readonly sanctions: Pick<Sanctions, 'activeOf'>,
    /** Funcionalidade ligada (R2 de mídia configurado). */
    readonly enabled: boolean,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** O estado da foto da Conta (`GET /api/me/avatar`). */
  async stateOf(accountId: string): Promise<AvatarState> {
    const now = this.now();
    const facts = await this.facts(this.db, accountId, now);
    const ineligible = this.enabled ? await this.ineligible(facts, now) : null;
    const suspended = facts.current?.status === 'suspended';
    return {
      enabled: this.enabled,
      // Suspensa: fora do ar, todos (inclusive o dono) veem a da Steam.
      source: facts.account.avatarSource,
      steamAvatarUrl: facts.account.steamAvatarUrl,
      custom:
        this.enabled && facts.current
          ? {
              url: this.files.url(facts.current.id),
              status: suspended ? 'suspended' : 'active',
              uploadedAt: facts.current.createdAt.toISOString(),
            }
          : null,
      canUpload: this.enabled && ineligible === null,
      cannotUploadReason: ineligible?.reason ?? null,
      retryAfter: ineligible?.retryAfter?.toISOString() ?? null,
      removal: facts.removal && {
        at: facts.removal.at.toISOString(),
        reason: facts.removal.reason,
      },
    };
  }

  /**
   * Recebe o recorte, refaz a imagem e **publica na hora**. Recusas viram `AvatarRejection`
   * (código do contrato). Os arquivos sobem antes da transação: se ela falhar, são apagados pela
   * fila, e a Conta nunca aponta para uma foto que não existe.
   */
  async upload(accountId: string, body: Buffer, contentType: string): Promise<AvatarState> {
    if (!this.enabled) throw new AvatarRejection('disabled', 'Foto de perfil indisponível');
    const now = this.now();
    const before = await this.ineligible(await this.facts(this.db, accountId, now), now);
    if (before) throw rejectionFor(before);

    const variants = await this.gate.run(() => processAvatar(body, contentType));
    const id = randomUUID();
    await this.files.publish(id, variants);
    try {
      await this.db.transaction(async (tx) => {
        // Trava a Conta: dois envios juntos não passam do limite nem deixam duas fotos no ar.
        await tx
          .select({ id: accounts.id })
          .from(accounts)
          .where(eq(accounts.id, accountId))
          .for('update');
        const facts = await this.facts(tx, accountId, this.now());
        const ineligible = await this.ineligible(facts, this.now());
        if (ineligible) throw rejectionFor(ineligible);
        if (facts.current) {
          await tx
            .update(accountAvatars)
            .set({ status: 'replaced', retiredAt: this.now() })
            .where(eq(accountAvatars.id, facts.current.id));
          await this.files.discard(tx, facts.current.id);
        }
        await tx.insert(accountAvatars).values({ id, accountId });
        await tx
          .update(accounts)
          .set({ avatarSource: 'custom', avatarUrl: this.files.url(id) })
          .where(eq(accounts.id, accountId));
      });
    } catch (error) {
      await this.db.transaction((tx) => this.files.discard(tx, id));
      throw error;
    }
    return this.stateOf(accountId);
  }

  /**
   * Volta à foto da Steam na hora, sem moderação: a foto própria é apagada (pela fila). Vale
   * também com a funcionalidade desligada e quando a foto estava suspensa. Idempotente.
   */
  async revertToSteam(accountId: string): Promise<AvatarState> {
    await this.db.transaction(async (tx) => {
      const [account] = await tx
        .select()
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .for('update');
      if (!account) return;
      const [current] = await tx
        .select()
        .from(accountAvatars)
        .where(
          and(
            eq(accountAvatars.accountId, accountId),
            inArray(accountAvatars.status, ['active', 'suspended']),
          ),
        );
      if (current) {
        await tx
          .update(accountAvatars)
          .set({ status: 'reverted', retiredAt: this.now() })
          .where(eq(accountAvatars.id, current.id));
        await this.files.discard(tx, current.id);
      }
      await tx
        .update(accounts)
        .set({ avatarSource: 'steam', avatarUrl: account.steamAvatarUrl })
        .where(eq(accounts.id, accountId));
    });
    return this.stateOf(accountId);
  }

  private async facts(q: Executor, accountId: string, now: Date): Promise<Facts> {
    const [account] = await q.select().from(accounts).where(eq(accounts.id, accountId));
    if (!account) throw new Error(`Conta ${accountId} não existe`);
    const [current] = await q
      .select()
      .from(accountAvatars)
      .where(
        and(
          eq(accountAvatars.accountId, accountId),
          inArray(accountAvatars.status, ['active', 'suspended']),
        ),
      );
    const recent = await q
      .select({ createdAt: accountAvatars.createdAt })
      .from(accountAvatars)
      .where(
        and(
          eq(accountAvatars.accountId, accountId),
          gt(accountAvatars.createdAt, new Date(now.getTime() - DAY_MS)),
        ),
      )
      .orderBy(asc(accountAvatars.createdAt));
    const [removal] = await q
      .select({ at: accountAvatars.decidedAt, reason: accountAvatars.decisionReason })
      .from(accountAvatars)
      .where(
        and(
          eq(accountAvatars.accountId, accountId),
          eq(accountAvatars.status, 'removed'),
          gt(
            accountAvatars.decidedAt,
            new Date(now.getTime() - AVATAR_REMOVED_RETENTION_DAYS * DAY_MS),
          ),
        ),
      )
      .orderBy(desc(accountAvatars.decidedAt))
      .limit(1);
    return {
      account,
      current: current ?? null,
      recentUploads: recent.map((row) => row.createdAt),
      removal: removal?.at && removal.reason ? { at: removal.at, reason: removal.reason } : null,
    };
  }

  /** Por que a Conta não envia agora (a ordem é a da interface: o primeiro motivo é o mostrado). */
  private async ineligible(
    facts: Facts,
    now: Date,
  ): Promise<{ reason: AvatarIneligibleReason; retryAfter?: Date } | null> {
    const { account } = facts;
    if (account.anonymizedAt !== null) return { reason: 'upload_blocked' };
    if (now.getTime() - account.createdAt.getTime() < AVATAR_MIN_ACCOUNT_AGE_HOURS * HOUR_MS) {
      return { reason: 'account_too_new' };
    }
    if ((await this.sanctions.activeOf(account.id, now)).length > 0) {
      return { reason: 'punished' };
    }
    // Foto suspensa por denúncias: até a Staff decidir não entra outra por cima.
    if (
      facts.current?.status === 'suspended' ||
      (account.avatarUploadBlockedUntil !== null && account.avatarUploadBlockedUntil > now)
    ) {
      return { reason: 'upload_blocked' };
    }
    if (facts.recentUploads.length >= AVATAR_UPLOADS_PER_DAY) {
      // Libera quando o envio mais antigo que ainda conta completar 24 h.
      const counting = facts.recentUploads[facts.recentUploads.length - AVATAR_UPLOADS_PER_DAY];
      return {
        reason: 'daily_limit',
        ...(counting && { retryAfter: new Date(counting.getTime() + DAY_MS) }),
      };
    }
    return null;
  }
}

function rejectionFor(ineligible: {
  reason: AvatarIneligibleReason;
  retryAfter?: Date;
}): AvatarRejection {
  const messages: Record<AvatarIneligibleReason, string> = {
    account_too_new: 'A Conta precisa ter mais de 24 horas para enviar uma foto',
    punished: 'Contas com Punição ativa não enviam foto',
    upload_blocked: 'O envio de foto não está disponível agora',
    daily_limit: 'Limite de envios do dia atingido',
  };
  return new AvatarRejection(ineligible.reason, messages[ineligible.reason], ineligible.retryAfter);
}
