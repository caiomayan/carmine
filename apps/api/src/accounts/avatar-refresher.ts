import { type BeforeApplicationShutdown, Logger } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '../database/database.js';
import { accounts } from '../database/schema.js';
import type { SteamProfiles, SteamSummary } from './steam-profiles.js';

/** Avatares mudam; um buscado há mais que isso é atualizado no próximo connect. */
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Busca o avatar Steam das Contas fora do caminho do connect: o jogador nunca espera a Steam.
 * Se ela falhar ou demorar, a Conta fica com o avatar neutro (`avatarUrl` nulo) e a busca é
 * tentada de novo no próximo connect.
 */
export class AvatarRefresher implements BeforeApplicationShutdown {
  private readonly logger = new Logger(AvatarRefresher.name);
  private readonly inFlight = new Map<string, Promise<void>>();

  /** `profiles` nulo quando não há chave da Steam Web API: nada é buscado. */
  constructor(
    private readonly db: Database,
    private readonly profiles: SteamProfiles | null,
  ) {}

  /** Agenda a busca se a Conta não tem avatar ou se ele está velho; retorna na hora. */
  refreshInBackground(
    account: {
      steamId: string;
      steamAvatarUrl: string | null;
      avatarFetchedAt: Date | null;
      anonymizedAt?: Date | null;
    },
    now = new Date(),
  ): void {
    if (account.anonymizedAt) return;
    const fresh =
      account.steamAvatarUrl !== null &&
      account.avatarFetchedAt !== null &&
      now.getTime() - account.avatarFetchedAt.getTime() < STALE_AFTER_MS;
    if (fresh || this.profiles === null || this.inFlight.has(account.steamId)) {
      return;
    }
    const task = this.refresh(this.profiles, account.steamId)
      .catch((error: unknown) =>
        this.logger.warn(
          `Avatar Steam de ${account.steamId} indisponível: ${(error as Error).message}`,
        ),
      )
      .finally(() => this.inFlight.delete(account.steamId));
    this.inFlight.set(account.steamId, task);
  }

  /**
   * Resumo do perfil Steam na hora, para quem pode esperar (a criação da Conta no login).
   * Nunca rejeita: sem chave, sem resposta ou com a Steam fora, `null` (vale o avatar neutro).
   */
  async lookup(steamId: string): Promise<SteamSummary | null> {
    if (this.profiles === null) {
      return null;
    }
    try {
      return await this.profiles.summaryOf(steamId);
    } catch (error) {
      this.logger.warn(`Perfil Steam de ${steamId} indisponível: ${(error as Error).message}`);
      return null;
    }
  }

  private async refresh(profiles: SteamProfiles, steamId: string): Promise<void> {
    const summary = await profiles.summaryOf(steamId);
    if (summary === null) {
      return;
    }
    await this.db
      .update(accounts)
      .set({
        steamAvatarUrl: summary.avatarUrl,
        avatarFetchedAt: new Date(),
        // Com foto própria no ar, o avatar efetivo é a foto: só o da Steam guardado se atualiza.
        avatarUrl: sql`case when ${accounts.avatarSource} = 'steam' then ${summary.avatarUrl} else ${accounts.avatarUrl} end`,
      })
      // Uma Conta anonimizada (S08) nunca recebe o avatar de volta.
      .where(and(eq(accounts.steamId, BigInt(steamId)), isNull(accounts.anonymizedAt)));
  }

  /** Termina as buscas em andamento antes de o pool do banco fechar. */
  async beforeApplicationShutdown(): Promise<void> {
    await Promise.allSettled(this.inFlight.values());
  }
}
