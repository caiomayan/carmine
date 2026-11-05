import { describe, expect, it } from 'vitest';
import { staffPanelOrigin, staffPanelRedirect } from './staff-panel';

const PANEL = 'https://staff.example.test';

describe('origem do painel', () => {
  it('lê a origem e ignora o resto', () => {
    expect(staffPanelOrigin('https://staff.example.test/')).toBe(PANEL);
    expect(staffPanelOrigin('http://localhost:3200')).toBe('http://localhost:3200');
  });

  it('vazio, sem valor ou inválido: o painel não está ligado', () => {
    for (const raw of [
      undefined,
      '',
      '  ',
      'staff.example.test',
      'javascript:alert(1)',
      'ftp://x',
    ]) {
      expect(staffPanelOrigin(raw)).toBeNull();
    }
  });
});

describe('redirecionamento do /staff antigo', () => {
  it('/staff era a tela de Contas', () => {
    expect(staffPanelRedirect('/staff', '', PANEL)).toBe(`${PANEL}/contas`);
    expect(staffPanelRedirect('/staff/', '?q=10016', PANEL)).toBe(`${PANEL}/contas?q=10016`);
  });

  it('as outras telas mantêm o caminho e a consulta', () => {
    expect(staffPanelRedirect('/staff/denuncias', '', PANEL)).toBe(`${PANEL}/denuncias`);
    expect(staffPanelRedirect('/staff/fotos', '', PANEL)).toBe(`${PANEL}/fotos`);
    expect(staffPanelRedirect('/staff/contas/10016', '', PANEL)).toBe(`${PANEL}/contas/10016`);
    expect(staffPanelRedirect('/staff/pagamentos/abc', '', PANEL)).toBe(`${PANEL}/pagamentos/abc`);
    expect(staffPanelRedirect('/staff/servidores', '', PANEL)).toBe(`${PANEL}/servidores`);
    expect(staffPanelRedirect('/staff/auditoria', '?acao=vip_grant&alvo=1', PANEL)).toBe(
      `${PANEL}/auditoria?acao=vip_grant&alvo=1`,
    );
  });

  it('não encosta no que não é /staff', () => {
    for (const path of ['/', '/staffing', '/stafff/x', '/ranking', '/10016', '/dev/staff']) {
      expect(staffPanelRedirect(path, '', PANEL)).toBeNull();
    }
  });

  it('sem painel ligado, não redireciona (o site responde 404)', () => {
    expect(staffPanelRedirect('/staff', '', null)).toBeNull();
  });
});
