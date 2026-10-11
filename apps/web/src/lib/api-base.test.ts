import { describe, expect, it } from 'vitest';
import { apiRequestHeaders, VISITOR_IP_HEADER } from './api-base';

describe('apiRequestHeaders', () => {
  it('repassa o IP do visitante que o cloudflared entregou ao web', () => {
    expect(apiRequestHeaders({ visitorIp: '198.51.100.7' })).toEqual({
      accept: 'application/json',
      [VISITOR_IP_HEADER]: '198.51.100.7',
    });
  });

  it('sem túnel (desenvolvimento) não inventa o cabeçalho', () => {
    expect(apiRequestHeaders({ visitorIp: null })).toEqual({ accept: 'application/json' });
    expect(apiRequestHeaders()).toEqual({ accept: 'application/json' });
  });

  it('repassa o cookie da sessão', () => {
    expect(apiRequestHeaders({ cookie: 'a=b' })).toEqual({
      accept: 'application/json',
      cookie: 'a=b',
    });
  });

  it('é o cabeçalho que o Cloudflare usa', () => {
    expect(VISITOR_IP_HEADER).toBe('cf-connecting-ip');
  });
});
