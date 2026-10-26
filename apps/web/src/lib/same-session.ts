/**
 * Igualdade estrutural de JSON (objetos sem ordem de chaves, arrays em ordem). Só a usamos para comparar uma
 * resposta da API com o que o navegador já tem; qualquer diferença cai no caminho completo, com o Zod.
 */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => sameJson(value, b[index]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => key in right && sameJson(left[key], right[key]))
  );
}

/** Os campos da resposta de `GET /api/me` que o navegador guarda (`firstLogin` fica de fora: só vale no servidor). */
export interface KnownSession {
  status: string;
  account: unknown;
  csrfToken: string | null;
  vip: unknown;
  staffRole: unknown;
  sanctions: unknown;
  displayNameChange: unknown;
}

/**
 * A resposta de `/api/me` é a mesma sessão que o navegador já tem (a conferência de rotina de toda carga de
 * página, que só renova a sessão deslizante). Nesse caso não há o que validar nem aplicar, e o Zod (~40 kB gz)
 * nem é baixado; se algo mudou (Punição nova, VIP, nome), o chamador valida com o schema e aplica.
 */
export function isKnownSession(known: KnownSession, body: unknown): boolean {
  if (known.status !== 'authenticated' || typeof body !== 'object' || body === null) return false;
  const response = body as Record<string, unknown>;
  return (
    sameJson(response.account, known.account) &&
    response.csrfToken === known.csrfToken &&
    sameJson(response.vip, known.vip) &&
    sameJson(response.staffRole ?? null, known.staffRole) &&
    sameJson(response.sanctions ?? [], known.sanctions) &&
    sameJson(response.displayNameChange ?? null, known.displayNameChange)
  );
}
