import { createHmac } from 'node:crypto';

/** Prefixo dos Servidores Carmine do teste de carga; `servers retire --prefix carga-` os aposenta. */
export const LOAD_TEST_DEFAULT_PREFIX = 'carga-';

/** Teto de servidores por rodada (o nome tem 3 dígitos e o endereço de documentação acaba em 250 por porta). */
/** O prefixo tem de começar com `carga-`: o upsert sobrescreve servidor de mesmo nome, e "" ou `retake-` pisaria nos reais. */
export const LOAD_TEST_PREFIX_PATTERN = /^carga-[a-z0-9-]*$/;

export const LOAD_TEST_MAX_SERVERS = 500;

export const LOAD_TEST_SECRET_MIN_LENGTH = 32;

/** `carga-001`, `carga-002`... (índice a partir de 1). */
export function loadTestServerName(prefix: string, index: number): string {
  return `${prefix}${String(index).padStart(3, '0')}`;
}

/**
 * Endereço de documentação (RFC 5737): não existe de verdade e não repete entre servidores de uma
 * mesma rodada. A porta sobe a cada 250 servidores.
 */
export function loadTestServerAddress(index: number): string {
  return `203.0.113.${((index - 1) % 250) + 1}:${27_015 + Math.floor((index - 1) / 250)}`;
}

/**
 * A chave de um servidor do teste de carga, derivada do segredo da rodada: o CLI grava só o hash e o
 * gerador de carga (`infra/teste-de-carga`) calcula a mesma chave, sem imprimir centenas de chaves de
 * uma vez. Mesmo formato das chaves de verdade (`cmk_...`). O vetor de teste que fixa esta função
 * também está em `infra/teste-de-carga/test/chaves.spec.ts`: mudar uma pede mudar a outra.
 */
export function loadTestServerKey(secret: string, name: string): string {
  return `cmk_${createHmac('sha256', secret).update(`carga:${name}`).digest('base64url')}`;
}
