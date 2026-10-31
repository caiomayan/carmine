/**
 * O que a pessoa lê quando a API recusa uma ação da Staff: um texto por código estável (`StaffErrorCode`), os mesmos do
 * site. O painel tem os próprios textos aqui (não usa o i18n do site): é outro app.
 */
export const STAFF_ERROR_MESSAGES: Record<string, string> = {
  invalid_body: 'Algum campo está fora do formato. Confira e tente de novo.',
  forbidden: 'O seu papel não permite esta ação.',
  account_not_found: 'Essa Conta não existe mais.',
  target_protected: 'Você não pode punir a si mesmo nem alguém da Staff com papel igual ou maior.',
  permanent_not_allowed: 'O seu papel não aplica punição permanente.',
  account_not_claimed: 'A Conta precisa ter entrado no site ao menos uma vez.',
  account_anonymized: 'Esta Conta já foi anonimizada por um pedido de exclusão de dados.',
  sanction_not_found: 'Essa punição não existe mais.',
  sanction_not_active: 'Essa punição já foi revogada ou já terminou.',
  revoke_not_allowed: 'Só Admin e Dono revogam punições aplicadas por outra pessoa.',
  report_not_found: 'Essa Denúncia não existe mais (ela some 90 dias depois de criada).',
  report_not_open: 'Esse caso já foi arquivado ou virou Punição.',
  report_target_mismatch: 'Essa Denúncia é contra outra Conta.',
  report_needs_evidence:
    'Denúncia de cheat ou voz só gera Punição com evidência adicional: informe a testemunha ou o link.',
  avatar_not_found: 'Essa foto não existe mais.',
  avatar_not_reviewable: 'Essa foto já foi decidida, trocada ou removida.',
  no_custom_avatar: 'Esta Conta não tem foto própria no ar.',
  unauthenticated: 'A sua sessão acabou. Entre de novo.',
  unknown: 'Não deu certo agora. Tente de novo em instantes.',
};

const FALLBACK = 'Não deu certo agora. Tente de novo em instantes.';

export const staffErrorMessage = (code: string | undefined): string =>
  STAFF_ERROR_MESSAGES[code ?? 'unknown'] ?? FALLBACK;
