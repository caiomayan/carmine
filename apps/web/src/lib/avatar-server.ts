import { mediaOrigin } from './security-headers';

/**
 * A foto de perfil própria está ligada neste ambiente? O web sabe pelo `MEDIA_PUBLIC_URL` (o mesmo da API): é o que
 * mostra o convite no avatar do Perfil e o botão "Denunciar foto". A API é quem manda de verdade (`enabled`).
 */
export const avatarsEnabled = (): boolean => mediaOrigin() !== null;
