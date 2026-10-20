/** O usuário do Discord que a pessoa autorizou no vínculo. */
export interface DiscordUser {
  id: string;
  username: string;
}

/** O que cabe numa mensagem de status: só embeds (texto formatado), sem menções. */
export interface DiscordMessage {
  embeds: Record<string, unknown>[];
}

/**
 * Tudo o que a S15 usa do Discord, só por REST (sem gateway). A implementação real é o
 * {@link DiscordRest}; os testes falam com um Discord falso por HTTP local.
 */
export interface DiscordClient {
  /** A URL da tela de autorização do Discord, com o `state` do fluxo. */
  authorizeUrl(state: string): string;
  /** Troca o `code` pelo token de uso único e já lê quem é o usuário. */
  exchangeCode(code: string): Promise<{ accessToken: string; user: DiscordUser }>;
  /** Os cargos da pessoa no servidor; nulo se ela não está nele. */
  memberRoles(userId: string): Promise<string[] | null>;
  /** Põe a pessoa no servidor (`guilds.join`) com o token do vínculo. */
  joinGuild(userId: string, accessToken: string): Promise<void>;
  /** Dá o cargo; falso se a pessoa não está no servidor. */
  addRole(userId: string, roleId: string, reason: string): Promise<boolean>;
  /** Tira o cargo; falso se a pessoa não está no servidor. */
  removeRole(userId: string, roleId: string, reason: string): Promise<boolean>;
  /** Posta a mensagem e devolve o ID dela. */
  postMessage(channelId: string, message: DiscordMessage): Promise<string>;
  /** Edita a mensagem; falso se ela não existe mais. */
  editMessage(channelId: string, messageId: string, message: DiscordMessage): Promise<boolean>;
}

/** O Discord recusou ou não respondeu. */
export class DiscordApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'DiscordApiError';
  }
}
