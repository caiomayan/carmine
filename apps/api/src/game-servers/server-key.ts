import { createHash, randomBytes } from 'node:crypto';

const PREFIX = 'cmk_';

/**
 * Chave de um Servidor Carmine: 256 bits aleatórios com prefixo reconhecível (para achar
 * vazamentos em logs e repositórios). Mostrada uma única vez, ao gerar.
 */
export function generateServerKey(): string {
  return `${PREFIX}${randomBytes(32).toString('base64url')}`;
}

/**
 * Hash guardado no banco. SHA-256 basta: a chave tem 256 bits de entropia, então não há
 * dicionário a atacar e um hash lento (bcrypt, argon2) só atrasaria cada requisição dos plugins.
 * Por ser determinístico, permite achar o servidor pelo índice único do hash.
 */
export function hashServerKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}
