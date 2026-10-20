import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import type { DiscordClient } from './discord-client.js';
import type { DiscordLinkFlow } from './discord-link-flow.js';
import type { DiscordLinks } from './discord-links.js';
import type { DiscordRoleSync } from './discord-role-sync.js';
import type { DiscordStatusBoard } from './discord-status-board.js';

/** Token de injeção: a integração, ou nulo quando as variáveis do Discord não estão configuradas. */
export const DISCORD = Symbol('DISCORD');

/**
 * A S15 inteira, ligada: o vínculo, a reconciliação dos cargos e o bot de status, com os dois jobs
 * periódicos. Existe só com as variáveis do Discord configuradas; sem elas, nada disso é criado e
 * nenhum job roda.
 */
export class DiscordIntegration implements OnModuleInit, OnApplicationShutdown {
  private timers: NodeJS.Timeout[] = [];

  constructor(
    readonly client: DiscordClient,
    readonly links: DiscordLinks,
    readonly roles: DiscordRoleSync,
    readonly flow: DiscordLinkFlow,
    /** Nulo: sem canal de status configurado. */
    readonly status: DiscordStatusBoard | null,
    private readonly intervals: { syncMs: number; statusMs: number },
  ) {}

  onModuleInit(): void {
    this.every(this.intervals.syncMs, () => this.roles.runOnce());
    if (this.status) {
      const status = this.status;
      this.every(this.intervals.statusMs, () => status.runOnce());
    }
  }

  onApplicationShutdown(): void {
    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];
  }

  /** Roda já e depois a cada `ms`; as duas classes nunca rejeitam. */
  private every(ms: number, job: () => Promise<void>): void {
    void job();
    const timer = setInterval(() => void job(), ms);
    timer.unref();
    this.timers.push(timer);
  }
}
