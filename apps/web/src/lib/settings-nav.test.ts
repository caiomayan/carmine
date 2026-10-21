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

  it('a ordem das seções é Perfil, Conexões, Aparência, Dados e conta', () => {
    expect(SETTINGS_SECTIONS).toEqual(['perfil', 'conexoes', 'aparencia', 'dados']);
  });
});

describe('activeSettingsSection', () => {
  it('reconhece a seção pelo caminho', () => {
    expect(activeSettingsSection('/configuracoes/aparencia')).toBe('aparencia');
    expect(activeSettingsSection('/configuracoes/dados/')).toBe('dados');
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
