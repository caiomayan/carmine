'use client';

import { useEffect } from 'react';
import { parseTheme, THEME_STORAGE_KEY } from '@/lib/theme';

/**
 * Aplica o tema salvo na página 404. Quando um `notFound()` sai de uma rota dinâmica, o Next
 * responde com o documento de erro dele (sem o `<html>` do layout, então sem o script que aplica o
 * tema), e a 404 aparece sempre no escuro. Aqui o tema salvo entra assim que a página hidrata.
 */
export function SavedTheme() {
  useEffect(() => {
    try {
      document.documentElement.dataset.theme = parseTheme(localStorage.getItem(THEME_STORAGE_KEY));
    } catch {
      // Sem acesso ao armazenamento (janela privada): fica o tema padrão.
    }
  }, []);
  return null;
}
