import { isIP } from 'node:net';

/**
 * O balde de um IP (já normalizado). IPv4: o endereço. IPv6: o /64, porque um provedor entrega
 * ao cliente uma rede /64 inteira e trocar de endereço dentro dela é de graça.
 */
export function ipBucket(ip: string): string {
  if (isIP(ip) !== 6) {
    return ip;
  }
  const [head = '', tail] = ip.split('::');
  const left = head === '' ? [] : head.split(':');
  const right = tail === undefined || tail === '' ? [] : tail.split(':');
  const groups =
    tail === undefined
      ? left
      : [...left, ...Array(8 - left.length - right.length).fill('0'), ...right];
  return `${groups.slice(0, 4).join(':')}::/64`;
}
