import { describe, expect, it } from 'vitest';
import { displayNameFor, nextDisplayNameChange, normalizeDisplayName } from './display-name.js';

describe('displayNameFor', () => {
  it('usa o nome Steam quando ele passa no filtro', () => {
    expect(displayNameFor('coldzera', 10_016)).toBe('coldzera');
  });

  it('mostra "Jogador #ID" quando o nome Steam é ofensivo', () => {
    expect(displayNameFor('Filho da Puta', 10_016)).toBe('Jogador #10016');
  });

  it('remove caracteres de controle e espaços sobrando', () => {
    expect(displayNameFor('  João\u0000​   Vitor \n', 10_016)).toBe('João Vitor');
  });

  it('tira de um nome Steam a marcação que o jogo poderia interpretar', () => {
    expect(displayNameFor('<b>Fer</b> {red}', 10_016)).toBe('bFer/b red');
    expect(displayNameFor('<>&{}', 12_345)).toBe('Jogador #12345');
  });

  it('mostra "Jogador #ID" quando não sobra nada do nome', () => {
    expect(displayNameFor(' ​\t', 12_345)).toBe('Jogador #12345');
  });

  it('corta nomes acima de 32 caracteres (limite da Steam)', () => {
    expect(displayNameFor('a'.repeat(40), 10_016)).toBe('a'.repeat(32));
  });

  it('mostra "Jogador #ID" enquanto o nome Steam for o que a Staff resetou', () => {
    expect(displayNameFor('nome ruim', 10_016, 'nome ruim')).toBe('Jogador #10016');
    expect(displayNameFor('nome novo', 10_016, 'nome ruim')).toBe('nome novo');
  });
});

describe('displayNameFor com nome próprio (S11)', () => {
  it('o nome próprio vale mais que o nome Steam', () => {
    expect(displayNameFor('coldzera', 10_016, null, 'Fer')).toBe('Fer');
  });

  it('sem nome próprio, vale o nome Steam como antes', () => {
    expect(displayNameFor('coldzera', 10_016, null, null)).toBe('coldzera');
  });

  it('o nome próprio vale mesmo com o nome Steam resetado pela Staff', () => {
    expect(displayNameFor('nome ruim', 10_016, 'nome ruim', 'Fer')).toBe('Fer');
  });

  it('um nome próprio que o filtro (ampliado depois) reprova volta ao nome Steam', () => {
    expect(displayNameFor('coldzera', 10_016, null, 'Filho da Puta')).toBe('coldzera');
  });
});

describe('normalizeDisplayName', () => {
  const ok = (raw: string) => normalizeDisplayName(raw);

  it('aceita de 2 a 24 caracteres', () => {
    expect(ok('Fe')).toEqual({ ok: true, name: 'Fe' });
    expect(ok('a'.repeat(24))).toEqual({ ok: true, name: 'a'.repeat(24) });
  });

  it('recusa menos de 2 e mais de 24 caracteres, depois de normalizar', () => {
    expect(ok('F')).toEqual({ ok: false, reason: 'too_short' });
    expect(ok('   F   ')).toEqual({ ok: false, reason: 'too_short' });
    expect(ok('a'.repeat(25))).toEqual({ ok: false, reason: 'too_long' });
  });

  it('conta pontos de código, não unidades UTF-16', () => {
    expect(ok('𝒜'.repeat(24)).ok).toBe(true);
    expect(ok('𝒜'.repeat(25))).toEqual({ ok: false, reason: 'too_long' });
  });

  it('apara as pontas e colapsa espaços internos', () => {
    expect(ok('  João \t  Vitor\n')).toEqual({ ok: true, name: 'João Vitor' });
    expect(ok('A\u00A0\u3000B')).toEqual({ ok: true, name: 'A B' });
  });

  it('tira caracteres de controle e invisíveis (inclusive os que parecem letra)', () => {
    expect(ok('Fe\u0000r\u200B\u202E\uFEFF')).toEqual({ ok: true, name: 'Fer' });
    expect(ok('\u3164\u3164\u3164')).toEqual({ ok: false, reason: 'too_short' });
    expect(ok('\u2800\u2800')).toEqual({ ok: false, reason: 'too_short' });
    // Os códigos de cor do chat (0x01 a 0x10) são de controle.
    expect(ok('\u0004Fer')).toEqual({ ok: true, name: 'Fer' });
  });

  it('normaliza para NFC', () => {
    expect(ok('Jose\u0301')).toEqual({ ok: true, name: 'José' });
  });

  it('recusa o que pode quebrar chat e placar', () => {
    for (const raw of ['<b>Fer</b>', 'a&b', '{red}Fer', 'Fer}']) {
      expect(ok(raw), raw).toEqual({ ok: false, reason: 'invalid_chars' });
    }
  });

  it('recusa acentos empilhados (zalgo)', () => {
    expect(ok('F\u0300\u0301\u0302\u0303\u0304er')).toEqual({ ok: false, reason: 'invalid_chars' });
  });

  it('exige ao menos uma letra ou número', () => {
    expect(ok('...')).toEqual({ ok: false, reason: 'invalid_chars' });
    expect(ok('-_-')).toEqual({ ok: false, reason: 'invalid_chars' });
    expect(ok('x_x').ok).toBe(true);
    expect(ok('77').ok).toBe(true);
  });

  it('aceita acentos, outros alfabetos e pontuação comum', () => {
    for (const raw of ['Ação Zé', 'Игрок', '玩家一号', "o'brien", 'xX_Pro-100_Xx', '[BR] Fer']) {
      expect(ok(raw).ok, raw).toBe(true);
    }
  });

  it('reprova palavras ofensivas em PT-BR e EN, com variações óbvias', () => {
    for (const raw of ['Caralho', 'f0d4 s3', 'p u t a', 'FUCK you', 'xXcaralhoXx', 'fdp']) {
      expect(ok(raw), raw).toEqual({ ok: false, reason: 'offensive' });
    }
  });

  it('não reprova nomes inocentes que contêm um termo (computador, Niger)', () => {
    expect(ok('computador').ok).toBe(true);
    expect(ok('enviado').ok).toBe(true);
  });
});

describe('nextDisplayNameChange', () => {
  const changedAt = new Date('2026-10-18T12:00:00Z');
  const days = (n: number) => new Date(changedAt.getTime() + n * 86_400_000);

  it('sem troca anterior, pode trocar já', () => {
    expect(nextDisplayNameChange(null, changedAt)).toBeNull();
  });

  it('antes de 7 dias devolve quando a troca fica livre', () => {
    expect(nextDisplayNameChange(changedAt, days(0))).toEqual(days(7));
    expect(nextDisplayNameChange(changedAt, new Date(days(7).getTime() - 1))).toEqual(days(7));
  });

  it('a partir de 7 dias exatos, pode trocar', () => {
    expect(nextDisplayNameChange(changedAt, days(7))).toBeNull();
    expect(nextDisplayNameChange(changedAt, days(30))).toBeNull();
  });
});
