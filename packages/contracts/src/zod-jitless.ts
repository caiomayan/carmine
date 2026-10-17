import { z } from 'zod';

// Importado primeiro pelo índice, antes de qualquer schema. Com a CSP do web (sem
// `'unsafe-eval'`), o Zod tentaria um `new Function` na criação do primeiro schema para saber
// se pode, e o navegador registraria uma violação mesmo com o erro engolido. No navegador o
// Zod fica sem JIT; no Node (API e Server Components) segue com ele.
export const jitless = 'window' in globalThis;
if (jitless) z.config({ jitless: true });
