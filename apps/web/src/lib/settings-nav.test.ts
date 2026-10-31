import { describe, expect, it } from 'vitest';
import {
  activeSettingsSection,
  SETTINGS_BASE,
  SETTINGS_SECTIONS,
  settingsHref,
} from './settings-nav';

describe('settingsHref', () => {
  it('monta o caminho de cada seção sob /settings', () => {
    expect(SETTINGS_BASE).toBe('/settings');
    expect(settingsHref('perfil')).toBe('/settings/profile');
    expect(settingsHref('conexoes')).toBe('/settings/connections');
    expect(settingsHref('compras')).toBe('/settings/purchases');
    expect(settingsHref('aparencia')).toBe('/settings/appearance');
    expect(settingsHref('dados')).toBe('/settings/data');
  });

  it('a ordem das seções é Perfil, Compras, Conexões, Aparência, Dados e conta', () => {
    expect(SETTINGS_SECTIONS).toEqual(['perfil', 'compras', 'conexoes', 'aparencia', 'dados']);
  });
});

describe('activeSettingsSection', () => {
  it('reconhece a seção pelo caminho', () => {
    expect(activeSettingsSection('/settings/appearance')).toBe('aparencia');
    expect(activeSettingsSection('/settings/data/')).toBe('dados');
  });

  it('o recibo é da seção Compras', () => {
    expect(activeSettingsSection('/settings/purchases')).toBe('compras');
    expect(activeSettingsSection('/settings/purchases/3f9c8b1e-7a52-4c1e-9d3a-2f6a8e0b4c11')).toBe(
      'compras',
    );
  });

  it('na raiz de /settings, nenhuma está aberta (no celular é a lista)', () => {
    expect(activeSettingsSection('/settings')).toBeNull();
    expect(activeSettingsSection('/settings/')).toBeNull();
  });

  it('fora de /settings ou com seção que não existe, nenhuma', () => {
    expect(activeSettingsSection('/inventory')).toBeNull();
    expect(activeSettingsSection('/settings/vip')).toBeNull();
    expect(activeSettingsSection('/settings-old/profile')).toBeNull();
  });
});
