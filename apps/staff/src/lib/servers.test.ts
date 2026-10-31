import { describe, expect, it } from 'vitest';
import { normalizeServerCode, previewHostname } from './servers';

describe('código do servidor', () => {
  it('aceita ponto, hífen ou espaço no lugar do ·', () => {
    expect(normalizeServerCode('sp.1')).toBe('SP·1');
    expect(normalizeServerCode(' rj - 12 ')).toBe('RJ·12');
    expect(normalizeServerCode('bra 2')).toBe('BRA·2');
  });

  it('devolve como veio o que não parece um código, para o contrato recusar', () => {
    expect(normalizeServerCode('  servidor  ')).toBe('servidor');
    expect(normalizeServerCode('SP·0')).toBe('SP·0');
  });
});

describe('hostname ao vivo', () => {
  it('monta o hostname só com nome e código válidos', () => {
    expect(previewHostname('Retake · Rotação', 'SP·2')).toBe('Carmine | Retake · Rotação | SP·2');
    expect(previewHostname(' Retake ', 'SP·2')).toBe('Carmine | Retake | SP·2');
  });

  it('é nulo quando falta ou está inválido', () => {
    expect(previewHostname('', 'SP·2')).toBeNull();
    expect(previewHostname('Retake', 'sp2')).toBeNull();
    expect(previewHostname('Re|take', 'SP·2')).toBeNull();
  });
});
