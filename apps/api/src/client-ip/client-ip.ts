import { BlockList, isIP } from 'node:net';

/** Cabeçalho em que o Cloudflare (via `cloudflared`) entrega o IP do visitante. */
export const CF_CONNECTING_IP = 'cf-connecting-ip';

const IPV4_MAPPED = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

/**
 * O IP real de quem fez a requisição. Atrás do Cloudflare Tunnel toda requisição chega à API
 * vinda do `cloudflared` (ADR 0015), e o IP do visitante vem em `CF-Connecting-IP`. Esse
 * cabeçalho só vale quando o socket é de um proxy confiável (`TRUSTED_PROXIES`): de qualquer
 * outro lugar ele é forjável, e o IP considerado é o do socket. `X-Forwarded-For` nunca é lido.
 */
export class ClientIpResolver {
  private readonly trusted = new BlockList();
  private readonly hasTrusted: boolean;

  /** `trustedProxies`: endereços e redes CIDR, já validados por {@link parseTrustedProxies}. */
  constructor(trustedProxies: readonly string[]) {
    for (const entry of trustedProxies) {
      const [address = '', prefix] = entry.split('/');
      const type = isIP(address) === 6 ? 'ipv6' : 'ipv4';
      if (prefix === undefined) {
        this.trusted.addAddress(address, type);
      } else {
        this.trusted.addSubnet(address, Number(prefix), type);
      }
    }
    this.hasTrusted = trustedProxies.length > 0;
  }

  /** `socketAddress`: o IP do socket; `cfConnectingIp`: o cabeçalho, como chegou. */
  resolve(
    socketAddress: string | undefined,
    cfConnectingIp: string | string[] | undefined,
  ): string {
    const peer = normalizeIp(socketAddress);
    if (peer === null) {
      return 'unknown';
    }
    if (!this.hasTrusted || typeof cfConnectingIp !== 'string' || !this.isTrusted(peer)) {
      return peer;
    }
    return normalizeIp(cfConnectingIp.trim()) ?? peer;
  }

  private isTrusted(ip: string): boolean {
    return this.trusted.check(ip, isIP(ip) === 6 ? 'ipv6' : 'ipv4');
  }
}

/** IP em forma canônica (IPv4 mapeado em IPv6 vira IPv4; IPv6 em minúsculas), ou `null`. */
export function normalizeIp(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const mapped = IPV4_MAPPED.exec(value)?.[1];
  if (mapped && isIP(mapped) === 4) {
    return mapped;
  }
  const family = isIP(value);
  if (family === 4) {
    return value;
  }
  // A URL normaliza o IPv6 (zeros, minúsculas) sem dependência extra.
  return family === 6 ? new URL(`http://[${value}]`).hostname.slice(1, -1) : null;
}

/**
 * Lê `TRUSTED_PROXIES`: endereços IP e redes CIDR separados por vírgula. Recusa o que não é IP
 * e redes que confiariam em todo mundo (`/0`).
 */
export function parseTrustedProxies(value: string): string[] {
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  for (const entry of entries) {
    if (!isValidEntry(entry)) {
      throw new Error(`proxy confiável inválido: "${entry}" (use um IP ou uma rede CIDR)`);
    }
  }
  return entries;
}

function isValidEntry(entry: string): boolean {
  const [address = '', prefix, ...rest] = entry.split('/');
  const family = isIP(address);
  if (family === 0 || rest.length > 0) {
    return false;
  }
  if (prefix === undefined) {
    return true;
  }
  const bits = Number(prefix);
  return /^\d{1,3}$/.test(prefix) && bits >= 1 && bits <= (family === 4 ? 32 : 128);
}
