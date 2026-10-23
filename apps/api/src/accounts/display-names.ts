import type { DisplayNameErrorCode } from '@carmine/contracts';
import { eq } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { accounts } from '../database/schema.js';
import { recordStaffAudit, type StaffAction } from '../staff/audit-log.js';
import {
  displayNameCooldownEnd,
  displayNameFor,
  nextDisplayNameChange,
  normalizeDisplayName,
} from './display-name.js';

/** A troca do Nome de exibição foi recusada (`nextChangeAt` só em `too_soon`). */
export class DisplayNameRejected extends Error {
  constructor(
    readonly code: DisplayNameErrorCode,
    message: string,
    readonly nextChangeAt?: Date,
  ) {
    super(message);
  }
}

const REJECTION_MESSAGES = {
  too_short: 'O nome precisa ter pelo menos 2 caracteres.',
  too_long: 'O nome pode ter no máximo 24 caracteres.',
  invalid_chars:
    'Esse nome tem caracteres que não funcionam no jogo. Use letras, números e pontuação comum (sem < > & { }).',
  offensive: 'Esse nome não é permitido. Escolha outro.',
} as const;

const WHEN = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

/**
 * Nome de exibição próprio da Conta reivindicada (S11) e o reset da Staff. O nome efetivo
 * (`displayName`) é gravado junto com o próprio, então o próximo connect o devolve ao jogo sem
 * rota nova (ADR 0017).
 */
export class DisplayNames {
  constructor(private readonly db: Database) {}

  /**
   * Troca o nome da própria Conta. Recusa nome fora das regras, Conta não reivindicada e troca
   * antes do prazo. Repetir o nome atual não gasta o prazo.
   */
  async change(
    accountId: string,
    raw: string,
    now = new Date(),
  ): Promise<{ displayName: string; nextChangeAt: Date }> {
    const normalized = normalizeDisplayName(raw);
    if (!normalized.ok) {
      throw new DisplayNameRejected(normalized.reason, REJECTION_MESSAGES[normalized.reason]);
    }
    const { name } = normalized;
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .for('update');
      if (!existing || existing.claimedAt === null || existing.anonymizedAt !== null) {
        throw new DisplayNameRejected(
          'not_claimed',
          'Só a Conta que entrou no site pode escolher um nome.',
        );
      }
      const blockedUntil = nextDisplayNameChange(existing.displayNameChangedAt, now);
      if (existing.customDisplayName === name) {
        return { displayName: existing.displayName, nextChangeAt: blockedUntil ?? now };
      }
      if (blockedUntil) {
        throw new DisplayNameRejected(
          'too_soon',
          `Você trocou de nome há pouco. Dá para trocar de novo a partir de ${WHEN.format(blockedUntil)} (horário de Brasília).`,
          blockedUntil,
        );
      }
      const displayName = displayNameFor(
        existing.steamName,
        existing.publicId,
        existing.displayNameBlockedSteamName,
        name,
      );
      await tx
        .update(accounts)
        .set({ customDisplayName: name, displayName, displayNameChangedAt: now })
        .where(eq(accounts.id, accountId));
      return { displayName, nextChangeAt: displayNameCooldownEnd(now) };
    });
  }

  /**
   * A própria Conta apaga o nome próprio e volta a aparecer com o nome Steam, quando quiser.
   * **Não mexe no prazo**: ele continua contando da última troca, senão voltar ao nome Steam
   * viraria uma brecha para trocar de nome sem esperar os 7 dias. Repetir não muda nada.
   */
  async revert(
    accountId: string,
    now = new Date(),
  ): Promise<{ displayName: string; nextChangeAt: Date | null }> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .for('update');
      if (!existing || existing.claimedAt === null || existing.anonymizedAt !== null) {
        throw new DisplayNameRejected(
          'not_claimed',
          'Só a Conta que entrou no site pode escolher um nome.',
        );
      }
      const nextChangeAt = nextDisplayNameChange(existing.displayNameChangedAt, now);
      if (existing.customDisplayName === null) {
        return { displayName: existing.displayName, nextChangeAt };
      }
      const displayName = displayNameFor(
        existing.steamName,
        existing.publicId,
        existing.displayNameBlockedSteamName,
      );
      await tx
        .update(accounts)
        .set({ customDisplayName: null, displayName })
        .where(eq(accounts.id, accountId));
      return { displayName, nextChangeAt };
    });
  }

  /**
   * Reset do Nome de exibição pela Staff (S07 e S11), com auditoria e motivo.
   *
   * - Com nome próprio: ele é apagado e a Conta volta ao nome Steam. **O prazo de 7 dias recomeça
   *   do reset**: o reset é a resposta da moderação a um nome ruim, e sem o prazo a pessoa poderia
   *   pôr outro nome limítrofe na hora, multiplicando o trabalho da Staff. Com isso, a Staff
   *   reage no máximo uma vez por semana por Conta.
   * - Sem nome próprio (o nome ruim é o da Steam): a Conta passa a um nome fictício fixo enquanto mantiver
   *   o nome Steam atual (trocar o nome na Steam libera o novo, pelo filtro). Aqui o prazo não
   *   é tocado: a pessoa não fez nenhuma troca e pode escolher um nome próprio de imediato.
   *
   * No jogo, vale no próximo connect.
   */
  async reset(accountId: string, staff: StaffAction, now = new Date()) {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(accounts)
        .where(eq(accounts.id, accountId))
        .for('update');
      if (!existing) throw new Error(`Conta ${accountId} não existe`);
      const hadCustomName = existing.customDisplayName !== null;
      const blocked = hadCustomName ? existing.displayNameBlockedSteamName : existing.steamName;
      const displayName = displayNameFor(existing.steamName, existing.publicId, blocked);
      const [updated] = await tx
        .update(accounts)
        .set({
          customDisplayName: null,
          displayName,
          displayNameBlockedSteamName: blocked,
          displayNameChangedAt: hadCustomName ? now : existing.displayNameChangedAt,
        })
        .where(eq(accounts.id, accountId))
        .returning();
      await recordStaffAudit(tx, {
        action: 'display_name_reset',
        staff,
        target: { accountId, steamId: existing.steamId },
        details: {
          displayNameBefore: existing.displayName,
          displayNameAfter: displayName,
          steamName: existing.steamName,
          customNameBefore: existing.customDisplayName,
          cooldownRestarted: hadCustomName,
        },
        at: now,
      });
      return { ...(updated as typeof existing), steamId: existing.steamId.toString() };
    });
  }
}
