import { describe, expect, it } from 'vitest';
import { legalHeadings, parseLegalDocument, slugify } from './document';

const source = (version: string, body: string) =>
  `---\ntitle: Regras de conduta\nupdatedAt: 2026-10-12\nversion: ${version}\n---\n\n${body}`;

describe('documento legal em markdown (docs/legal)', () => {
  it('lê o front-matter: título, data de atualização e versão', () => {
    const doc = parseLegalDocument(source('1.0.0', 'Texto.'));
    expect(doc.title).toBe('Regras de conduta');
    expect(doc.updatedAt).toBe('2026-10-12');
    expect(doc.version).toBe('1.0.0');
    expect(doc.body).toBe('Texto.');
    expect(doc.draft).toBe(false);
  });

  it('aceita quebras de linha do Windows', () => {
    const doc = parseLegalDocument(source('1.0.0', 'Texto.').replaceAll('\n', '\r\n'));
    expect(doc.title).toBe('Regras de conduta');
    expect(doc.body).toBe('Texto.');
  });

  it('recusa um arquivo sem front-matter completo', () => {
    expect(() => parseLegalDocument('# Só texto')).toThrow();
    expect(() => parseLegalDocument('---\ntitle: X\n---\nTexto')).toThrow();
  });

  it('versão abaixo de 1.0.0 é rascunho', () => {
    expect(parseLegalDocument(source('0.1.0', 'x')).draft).toBe(true);
    expect(parseLegalDocument(source('0.9.12', 'x')).draft).toBe(true);
    expect(parseLegalDocument(source('1.0.0', 'x')).draft).toBe(false);
    expect(parseLegalDocument(source('2.3.1', 'x')).draft).toBe(false);
  });

  it('no rascunho, tira os marcadores de revisão e o bloco final de rascunho', () => {
    const doc = parseLegalDocument(
      source(
        '0.1.0',
        'Comunicamos às autoridades (art. 27). [VALIDAR COM ADVOGADO]\n\nOutro parágrafo.\n\n> Rascunho redigido com IA para revisão do dono.\n> Segunda linha.\n',
      ),
    );
    expect(doc.body).toBe('Comunicamos às autoridades (art. 27).\n\nOutro parágrafo.');
  });

  it('no rascunho, as lacunas do dono viram pendências destacadas (link #pendencia)', () => {
    const doc = parseLegalDocument(
      source('0.2.0', 'Operado por [DONO: nome completo] (CPF [CONFIRMAR: CPF]), em São Paulo.'),
    );
    expect(doc.body).toBe(
      'Operado por [DONO: nome completo](#pendencia) (CPF [CONFIRMAR: CPF](#pendencia)), em São Paulo.',
    );
  });

  it('fora do rascunho, o texto fica como veio', () => {
    const body = 'Texto.\n\n> Uma citação de verdade.';
    expect(parseLegalDocument(source('1.0.0', body)).body).toBe(body);
  });
});

describe('âncoras das seções', () => {
  it('vira minúsculas sem acento, com hífens', () => {
    expect(slugify('Recurso')).toBe('recurso');
    expect(slugify('Punições no Perfil')).toBe('punicoes-no-perfil');
    expect(slugify('Griefing, AFK proposital e TK proposital')).toBe(
      'griefing-afk-proposital-e-tk-proposital',
    );
    expect(slugify('  Se você é menor de idade? ')).toBe('se-voce-e-menor-de-idade');
  });

  it('lista os títulos ## para o sumário, sem confundir com código', () => {
    const body =
      '## Resumo\n\nTexto ## não\n\n### Tipos\n\n## Recurso\n\n```\n## dentro de código\n```';
    expect(legalHeadings(body)).toEqual([
      { id: 'resumo', text: 'Resumo' },
      { id: 'recurso', text: 'Recurso' },
    ]);
  });
});
