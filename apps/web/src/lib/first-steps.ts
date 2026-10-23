/**
 * Primeiros passos (S03): a orientação aparece sozinha na sessão do primeiro login da Conta
 * (`firstLogin` do `/api/me`) até a pessoa fechá-la; depois, só reabre pelo menu. Quem fechou
 * fica num cookie (lido no servidor, então a página já chega sem a orientação, sem piscar),
 * por Conta: o primeiro login de outra Conta no mesmo navegador ainda a mostra.
 */
export const FIRST_STEPS_COOKIE = 'carmine_primeiros_passos';

const MAX_ACCOUNTS = 20;
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

function dismissedIds(value: string | undefined): number[] {
  if (!value) return [];
  return value
    .split('.')
    .filter((part) => /^[1-9]\d{0,14}$/.test(part))
    .map(Number);
}

export function hasDismissedFirstSteps(value: string | undefined, publicId: number): boolean {
  return dismissedIds(value).includes(publicId);
}

/** O `document.cookie` que lembra que esta Conta fechou a orientação. */
export function firstStepsCookie(value: string | undefined, publicId: number): string {
  const ids = [...dismissedIds(value).filter((id) => id !== publicId), publicId].slice(
    -MAX_ACCOUNTS,
  );
  return `${FIRST_STEPS_COOKIE}=${ids.join('.')}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
}

/**
 * Onde a faixa de uma linha aparece: só na home e no Perfil da própria Conta. Nas demais rotas
 * (Termos, 404, Staff) ela não interrompe quem está lendo; o Dialog continua a um clique, no menu.
 */
export function showsFirstStepsStrip(pathname: string, publicId: number): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return path === '/' || path === `/${publicId}`;
}
