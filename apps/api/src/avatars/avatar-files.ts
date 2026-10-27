import { AVATAR_SIZES, type AvatarSize } from '@carmine/contracts/avatar';
import type { Database } from '../database/database.js';
import { avatarDeletions, avatarPrivateKey, avatarPublicKey } from './avatar-keys.js';
import type { MediaDeletions } from './media-deletions.js';
import type { MediaStorage } from './media-storage.js';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

const WEBP = 'image/webp';

/**
 * Os arquivos de uma foto no R2 (ADR 0022). Os 4 tamanhos de uma foto `<id>` ficam em
 * `avatars/<id>/<tamanho>.webp` no bucket **público** (servido pela CDN, URL imutável: um envio
 * novo é um ID novo). O que sai do ar (suspensa ou removida) vai para `removed/<id>/<tamanho>.webp`
 * no bucket **privado**, de onde a Staff a vê e de onde ela pode voltar. Remover do R2 passa sempre
 * pela fila `MediaDeletions` (transacional, com nova tentativa e purga da CDN).
 */
export class AvatarFiles {
  constructor(
    private readonly storage: MediaStorage | null,
    private readonly deletions: MediaDeletions,
    /** Origem pública das fotos, sem barra final; nulo com a funcionalidade desligada. */
    private readonly publicOrigin: string | null,
  ) {}

  /** A URL pública de um tamanho (a que vai em `accounts.avatarUrl` é a de 512 px). */
  url(id: string, size: AvatarSize = 512): string {
    return `${this.publicOrigin}/${avatarPublicKey(id, size)}`;
  }

  private get store(): MediaStorage {
    if (this.storage === null) throw new Error('Armazenamento de mídia desligado');
    return this.storage;
  }

  /** Publica os tamanhos no bucket público. Se algum falhar, apaga os que subiram e rejeita. */
  async publish(id: string, variants: Record<AvatarSize, Buffer>): Promise<void> {
    try {
      await Promise.all(
        AVATAR_SIZES.map((size) =>
          this.store.put(
            { bucket: 'public', key: avatarPublicKey(id, size) },
            variants[size],
            WEBP,
          ),
        ),
      );
    } catch (error) {
      await Promise.allSettled(
        AVATAR_SIZES.map((size) =>
          this.store.delete({ bucket: 'public', key: avatarPublicKey(id, size) }),
        ),
      );
      throw error;
    }
  }

  /** Lê a imagem (para a Staff): do bucket público se está no ar, senão do privado. */
  async read(id: string, size: AvatarSize = 512): Promise<Buffer | null> {
    return (
      (await this.store.get({ bucket: 'public', key: avatarPublicKey(id, size) })) ??
      (await this.store.get({ bucket: 'private', key: avatarPrivateKey(id, size) }))
    );
  }

  /**
   * Tira a foto do ar: copia os tamanhos para o bucket privado **antes** (se falhar, nada mudou) e
   * enfileira a remoção dos públicos, com purga da CDN. Chame dentro da transação que muda o estado.
   */
  async takeDown(tx: Transaction, id: string): Promise<void> {
    await Promise.all(
      AVATAR_SIZES.map((size) =>
        this.store.copy(
          { bucket: 'public', key: avatarPublicKey(id, size) },
          { bucket: 'private', key: avatarPrivateKey(id, size) },
        ),
      ),
    );
    await this.deletions.enqueue(
      tx,
      AVATAR_SIZES.map((size) => ({
        bucket: 'public' as const,
        key: avatarPublicKey(id, size),
        purge: true,
      })),
    );
  }

  /**
   * Devolve ao ar uma foto tirada: cancela as remoções públicas pendentes **antes** de copiar de
   * volta (senão a fila apagaria a cópia nova) e enfileira a remoção das cópias privadas.
   */
  async putBack(tx: Transaction, id: string): Promise<void> {
    await this.deletions.cancel(
      tx,
      'public',
      AVATAR_SIZES.map((size) => avatarPublicKey(id, size)),
    );
    await Promise.all(
      AVATAR_SIZES.map((size) =>
        this.store.copy(
          { bucket: 'private', key: avatarPrivateKey(id, size) },
          { bucket: 'public', key: avatarPublicKey(id, size) },
        ),
      ),
    );
    await this.deletions.enqueue(
      tx,
      AVATAR_SIZES.map((size) => ({ bucket: 'private' as const, key: avatarPrivateKey(id, size) })),
    );
  }

  /** A foto removida pela Staff fica no privado por `days` e depois sai. */
  async retain(tx: Transaction, id: string, days: number, now = new Date()): Promise<void> {
    const runAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    await this.deletions.enqueue(
      tx,
      AVATAR_SIZES.map((size) => ({
        bucket: 'private' as const,
        key: avatarPrivateKey(id, size),
        runAt,
      })),
    );
  }

  /**
   * Apaga a foto de vez (trocada, devolvida à Steam, Conta excluída): enfileira todos os
   * arquivos, públicos (com purga) e privados. Se ela estava em retenção, antecipa para agora.
   */
  async discard(tx: Transaction, id: string): Promise<void> {
    await this.deletions.enqueue(tx, avatarDeletions(id));
  }
}
