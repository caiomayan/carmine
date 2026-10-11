import { describe, expect, it } from 'vitest';
import { ipBucket } from './ip-bucket.js';

describe('ipBucket', () => {
  it('IPv4 é o próprio endereço', () => {
    expect(ipBucket('198.51.100.7')).toBe('198.51.100.7');
  });

  it('IPv6 é o /64: o resto do endereço o próprio cliente escolhe', () => {
    expect(ipBucket('2001:db8:1:2::1')).toBe('2001:db8:1:2::/64');
    expect(ipBucket('2001:db8:1:2:ffff:eeee:dddd:cccc')).toBe('2001:db8:1:2::/64');
    expect(ipBucket('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(ipBucket('::1')).toBe('0:0:0:0::/64');
  });

  it('o que não é IP fica como veio', () => {
    expect(ipBucket('unknown')).toBe('unknown');
  });
});
