import { describe, expect, it } from 'vitest';
import {
  activeSettingsSection,
  SETTINGS_BASE,
  SETTINGS_SECTIONS,
  settingsHref,
} from './settings-nav';

describe('settingsHref', () => {
  it('monta o caminho de cada seção sob /configuracoes', () => {
    expect(SETTINGS_BASE).toBe('/configuracoes');
    expect(settingsHref('perfil')).toBe('/configuracoes/perfil');
    expect(settingsHref('conexoes')).toBe('/configuracoes/conexoes');
  });

  it('a ordem das seções é Perfil, Compras, Conexões, Aparência, Dados e conta', () => {
    expect(SETTINGS_SECTIONS).toEqual(['perfil', 'compras', 'conexoes', 'aparencia', 'dados']);
  });
});

describe('activeSettingsSection', () => {
  it('reconhece a seção pelo caminho', () => {
    expect(activeSettingsSection('/configuracoes/aparencia')).toBe('aparencia');
    expect(activeSettingsSection('/configuracoes/dados/')).toBe('dados');
  });

  it('o recibo é da seção Compras', () => {
    expect(activeSettingsSection('/configuracoes/compras')).toBe('compras');
    expect(
      activeSettingsSection('/configuracoes/compras/3f9c8b1e-7a52-4c1e-9d3a-2f6a8e0b4c11'),
    ).toBe('compras');
  });

  it('na raiz de /configuracoes, nenhuma está aberta (no celular é a lista)', () => {
    expect(activeSettingsSection('/configuracoes')).toBeNull();
    expect(activeSettingsSection('/configuracoes/')).toBeNull();
  });

  it('fora de /configuracoes ou com seção que não existe, nenhuma', () => {
    expect(activeSettingsSection('/inventario')).toBeNull();
    expect(activeSettingsSection('/configuracoes/vip')).toBeNull();
    expect(activeSettingsSection('/configuracoes-antigas/perfil')).toBeNull();
  });
});
