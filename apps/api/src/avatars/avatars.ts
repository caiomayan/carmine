import { randomUUID } from 'node:crypto';
import {
  AVATAR_HISTORY_SIZE,
  AVATAR_REMOVED_RETENTION_DAYS,
  AVATAR_UPLOAD_GAP_SECONDS,
  AVATAR_UPLOAD_WINDOW_MINUTES,
  AVATAR_UPLOADS_PER_WINDOW,
  type AvatarIneligibleReason,
  type AvatarState,
} from '@carmine/contracts/avatar';
import { and, asc, desc, eq, gt, inArray, isNull } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { accountAvatars, accounts } from '../database/schema.js';
import type { Sanctions } from '../moderation/sanctions.js';
import type { AvatarFiles } from './avatar-files.js';
import { AvatarRejection, processAvatar } from './avatar-processor.js';

type Executor = Pick<Database, 'select'>;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type AvatarRow = typeof accountAvatars.$inferSelect;

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** Quantas fotos o servidor processa ao mesmo tempo (o `sharp` usa CPU e memória da API). */
const MAX_CONCURRENT_PROCESSING = 2;

/** As fotos que contam no histórico: as que ficaram no ar e ainda têm arquivos (a removida nunca volta). */
const IN_HISTORY = ['active', 'replaced', 'reverted'] as const;

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
  /** A foto própria da Conta: no ar (`active`) ou, no estado antigo, fora por denúncias (`suspended`). */
  current: AvatarRow | null;
  /** Envios dos últimos `AVATAR_UPLOAD_WINDOW_MINUTES` min, do mais antigo para o mais novo. */
  recentUploads: Date[];
  /** A remoção mais recente pela Staff nos últimos 30 dias. */
  removal: {
    at: Date;
    reason: NonNullable<typeof accountAvatars.$inferSelect.decisionReason>;
  } | null;
}

interface Ineligible {
  reason: AvatarIneligibleReason;
  retryAfter?: Date;
}

/**
 * A foto de perfil própria (ADR 0022 e 0025): enviar (publica na hora), o histórico das últimas
 * `AVATAR_HISTORY_SIZE` fotos (escolher uma, apagar uma), voltar à foto da Steam e o estado que o site mostra.
 * `accounts.avatarUrl` é sempre o avatar efetivo (Steam ou foto no ar), então quem lê o avatar não muda. A
 * moderação (denúncia, decisão da Staff) usa os primitivos de `AvatarFiles` e as tabelas `account_avatars` e
 * `avatar_reports`.
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
    const restriction = this.enabled ? await this.restriction(facts, now) : null;
    // O intervalo de poucos segundos entre envios não entra aqui: passaria logo, e a tela ficaria travada.
    const ineligible = this.enabled ? (restriction ?? this.overLimit(facts)) : null;
    const suspended = facts.current?.status === 'suspended';
    const history = this.enabled ? await this.history(this.db, accountId) : [];
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
      history: history.map((photo) => ({
        id: photo.id,
        url: this.files.url(photo.id),
        uploadedAt: photo.createdAt.toISOString(),
        current: photo.status === 'active',
      })),
      canUseHistory: this.enabled && restriction === null,
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
   * fila, e a Conta nunca aponta para uma foto que não existe. A foto que estava no ar vai para o
   * histórico; passando de `AVATAR_HISTORY_SIZE`, a mais velha sai e é apagada.
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
        const at = this.now();
        const facts = await this.facts(tx, accountId, at);
        const ineligible = await this.ineligible(facts, at);
        if (ineligible) throw rejectionFor(ineligible);
        if (facts.current) {
          await tx
            .update(accountAvatars)
            .set({ status: 'replaced', retiredAt: at })
            .where(eq(accountAvatars.id, facts.current.id));
        }
        await tx.insert(accountAvatars).values({ id, accountId });
        await tx
          .update(accounts)
          .set({ avatarSource: 'custom', avatarUrl: this.files.url(id) })
          .where(eq(accounts.id, accountId));
        await this.evictOldest(tx, accountId, at);
      });
    } catch (error) {
      await this.db.transaction((tx) => this.files.discard(tx, id));
      throw error;
    }
    return this.stateOf(accountId);
  }

  /**
   * Volta à foto da Steam na hora, sem moderação. A foto própria segue no histórico (dá para voltar a ela).
   * Vale também com a funcionalidade desligada e quando a foto estava no estado antigo de suspensa (essa, que já
   * estava fora do ar, é apagada). Idempotente.
   */
  async revertToSteam(accountId: string): Promise<AvatarState> {
    await this.db.transaction(async (tx) => {
      const [account] = await tx
        .select()
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .for('update');
      if (!account) return;
      const now = this.now();
      const [current] = await tx
        .select()
        .from(accountAvatars)
        .where(
          and(
            eq(accountAvatars.accountId, accountId),
            inArray(accountAvatars.status, ['active', 'suspended']),
          ),
        );
      if (current?.status === 'active') {
        await tx
          .update(accountAvatars)
          .set({ status: 'reverted', retiredAt: now })
          .where(eq(accountAvatars.id, current.id));
      } else if (current) {
        await tx
          .update(accountAvatars)
          .set({ status: 'reverted', retiredAt: now, deletedAt: now })
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

  /**
   * Escolhe uma foto do histórico: ela volta ao ar na hora, e a que estava no ar passa a ser do histórico. Não é
   * um envio, então não conta nos limites de envio; mas quem tem Punição ativa ou o envio bloqueado depois de uma
   * remoção também não troca por aqui.
   */
  async chooseFromHistory(accountId: string, photoId: string): Promise<AvatarState> {
    if (!this.enabled) throw new AvatarRejection('disabled', 'Foto de perfil indisponível');
    await this.db.transaction(async (tx) => {
      await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .for('update');
      const now = this.now();
      const facts = await this.facts(tx, accountId, now);
      const restricted = await this.restriction(facts, now);
      if (restricted) throw rejectionFor(restricted);
      const photo = await this.inHistory(tx, accountId, photoId);
      if (!photo) throw notInHistory();
      if (photo.status === 'active') return;
      if (facts.current) {
        await tx
          .update(accountAvatars)
          .set({ status: 'replaced', retiredAt: now })
          .where(eq(accountAvatars.id, facts.current.id));
      }
      await tx
        .update(accountAvatars)
        .set({ status: 'active', retiredAt: null })
        .where(eq(accountAvatars.id, photo.id));
      await tx
        .update(accounts)
        .set({ avatarSource: 'custom', avatarUrl: this.files.url(photo.id) })
        .where(eq(accounts.id, accountId));
    });
    return this.stateOf(accountId);
  }

  /**
   * Apaga uma foto do histórico e do armazenamento (pela fila, com purga da CDN). Se era a que estava no ar, a
   * Conta volta à foto da Steam. A linha fica, sem arquivos, para os limites de envio não zerarem.
   */
  async deleteFromHistory(accountId: string, photoId: string): Promise<AvatarState> {
    await this.db.transaction(async (tx) => {
      const [account] = await tx
        .select()
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .for('update');
      if (!account) throw notInHistory();
      const photo = await this.inHistory(tx, accountId, photoId);
      if (!photo) throw notInHistory();
      const now = this.now();
      await tx
        .update(accountAvatars)
        .set({
          ...(photo.status === 'active' && { status: 'reverted' as const }),
          retiredAt: photo.retiredAt ?? now,
          deletedAt: now,
        })
        .where(eq(accountAvatars.id, photo.id));
      await this.files.discard(tx, photo.id);
      if (photo.status === 'active') {
        await tx
          .update(accounts)
          .set({ avatarSource: 'steam', avatarUrl: account.steamAvatarUrl })
          .where(eq(accounts.id, accountId));
      }
    });
    return this.stateOf(accountId);
  }

  /** As fotos do histórico da Conta, da mais nova para a mais velha. */
  private async history(q: Executor, accountId: string): Promise<AvatarRow[]> {
    return q
      .select()
      .from(accountAvatars)
      .where(
        and(
          eq(accountAvatars.accountId, accountId),
          inArray(accountAvatars.status, IN_HISTORY),
          isNull(accountAvatars.deletedAt),
        ),
      )
      .orderBy(desc(accountAvatars.createdAt))
      .limit(AVATAR_HISTORY_SIZE);
  }

  /** Uma foto do histórico desta Conta (e só dela); nula se já saiu, foi apagada ou removida pela moderação. */
  private async inHistory(
    q: Executor,
    accountId: string,
    photoId: string,
  ): Promise<AvatarRow | null> {
    const [photo] = await q
      .select()
      .from(accountAvatars)
      .where(
        and(
          eq(accountAvatars.id, photoId),
          eq(accountAvatars.accountId, accountId),
          inArray(accountAvatars.status, IN_HISTORY),
          isNull(accountAvatars.deletedAt),
        ),
      );
    return photo ?? null;
  }

  /** Entrou a foto seguinte: as que passam de `AVATAR_HISTORY_SIZE` saem do histórico e do armazenamento. */
  private async evictOldest(tx: Transaction, accountId: string, now: Date): Promise<void> {
    const overflow = await tx
      .select()
      .from(accountAvatars)
      .where(
        and(
          eq(accountAvatars.accountId, accountId),
          inArray(accountAvatars.status, IN_HISTORY),
          isNull(accountAvatars.deletedAt),
        ),
      )
      .orderBy(desc(accountAvatars.createdAt))
      .offset(AVATAR_HISTORY_SIZE);
    for (const photo of overflow) {
      await tx
        .update(accountAvatars)
        .set({ deletedAt: now, retiredAt: photo.retiredAt ?? now })
        .where(eq(accountAvatars.id, photo.id));
      await this.files.discard(tx, photo.id);
    }
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
    // Todas as linhas contam, inclusive as de fotos já apagadas: apagar não zera o limite.
    const recent = await q
      .select({ createdAt: accountAvatars.createdAt })
      .from(accountAvatars)
      .where(
        and(
          eq(accountAvatars.accountId, accountId),
          gt(
            accountAvatars.createdAt,
            new Date(now.getTime() - AVATAR_UPLOAD_WINDOW_MINUTES * MINUTE_MS),
          ),
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

  /**
   * O que impede a Conta de pôr uma foto no ar, por qualquer caminho (enviar ou escolher do histórico): Conta
   * anonimizada, Punição ativa, foto no estado antigo de suspensa ou envio bloqueado pela Staff.
   */
  private async restriction(facts: Facts, now: Date): Promise<Ineligible | null> {
    const { account } = facts;
    if (account.anonymizedAt !== null) return { reason: 'upload_blocked' };
    if ((await this.sanctions.activeOf(account.id, now)).length > 0) {
      return { reason: 'punished' };
    }
    if (
      facts.current?.status === 'suspended' ||
      (account.avatarUploadBlockedUntil !== null && account.avatarUploadBlockedUntil > now)
    ) {
      return { reason: 'upload_blocked' };
    }
    return null;
  }

  /** Passou de `AVATAR_UPLOADS_PER_WINDOW` envios na janela deslizante? */
  private overLimit(facts: Facts): Ineligible | null {
    if (facts.recentUploads.length < AVATAR_UPLOADS_PER_WINDOW) return null;
    // Libera quando o envio mais antigo que ainda conta sair da janela.
    const counting = facts.recentUploads[facts.recentUploads.length - AVATAR_UPLOADS_PER_WINDOW];
    return {
      reason: 'upload_limit',
      ...(counting && {
        retryAfter: new Date(counting.getTime() + AVATAR_UPLOAD_WINDOW_MINUTES * MINUTE_MS),
      }),
    };
  }

  /** O envio de poucos segundos antes pede para esperar. */
  private tooSoon(facts: Facts, now: Date): Ineligible | null {
    const last = facts.recentUploads[facts.recentUploads.length - 1];
    if (!last) return null;
    const retryAfter = new Date(last.getTime() + AVATAR_UPLOAD_GAP_SECONDS * SECOND_MS);
    return retryAfter > now ? { reason: 'upload_too_soon', retryAfter } : null;
  }

  /** Por que a Conta não envia agora: as travas, depois o limite da janela e por fim o intervalo entre envios. */
  private async ineligible(facts: Facts, now: Date): Promise<Ineligible | null> {
    return (
      (await this.restriction(facts, now)) ?? this.overLimit(facts) ?? this.tooSoon(facts, now)
    );
  }
}

const notInHistory = (): AvatarRejection =>
  new AvatarRejection('not_in_history', 'Essa foto não está mais no histórico');

function rejectionFor(ineligible: Ineligible): AvatarRejection {
  const messages: Record<AvatarIneligibleReason, string> = {
    punished: 'Contas com Punição ativa não enviam foto',
    upload_blocked: 'O envio de foto não está disponível agora',
    upload_limit: 'Você trocou de foto muitas vezes. Tente de novo mais tarde.',
    upload_too_soon: 'Espere alguns segundos para enviar outra foto.',
  };
  return new AvatarRejection(ineligible.reason, messages[ineligible.reason], ineligible.retryAfter);
}
