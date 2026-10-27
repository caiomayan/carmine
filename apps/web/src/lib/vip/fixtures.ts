import type { VipStatus } from '@carmine/contracts';
import { VIP_PACKAGES, type VipPackages } from '@carmine/contracts/payments';

/**
 * Os estados da página do VIP com dados de exemplo, para a vitrine `/dev/vip` (só com CARMINE_UI_GALLERY=1) e os
 * testes: a compra nasce desligada e a homologação só mostra o que a API devolve, então é aqui que se vê cada caso
 * (compra aberta, visitante, cada motivo de bloqueio, VIP ativo, VIP acabado). Nada daqui vai para produção.
 */

export const VIP_STATES = [
  'aberta',
  'visitante',
  'em-breve',
  'banido',
  'bloqueado',
  'em-analise',
  'limite',
  'vip-ativo',
  'vip-acabando',
  'vip-acabou',
  'sandbox',
  'indisponivel',
] as const;

export type VipState = (typeof VIP_STATES)[number];

export const VIP_STATE_LABEL: Record<VipState, string> = {
  aberta: 'Compra aberta',
  visitante: 'Visitante',
  'em-breve': 'Em breve',
  banido: 'Ban permanente',
  bloqueado: 'Compras bloqueadas',
  'em-analise': 'Pagamento em análise',
  limite: 'Limite do dia',
  'vip-ativo': 'VIP ativo',
  'vip-acabando': 'VIP acabando',
  'vip-acabou': 'VIP acabou',
  sandbox: 'Ambiente de teste',
  indisponivel: 'API fora',
};

export function isVipState(value: string | undefined): value is VipState {
  return value !== undefined && (VIP_STATES as readonly string[]).includes(value);
}

const DAY = 24 * 60 * 60 * 1000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();

const packages = (over: Partial<VipPackages> = {}): VipPackages => ({
  enabled: true,
  sandbox: false,
  packages: VIP_PACKAGES.map((pack) => ({ ...pack })),
  eligibility: 'ok',
  ...over,
});

const active = (endsInDays: number): VipStatus => ({
  active: true,
  endsAt: iso(endsInDays),
  endedAt: null,
});

export function vipFixture(state: VipState): {
  packages: VipPackages | null;
  vip: VipStatus | null;
} {
  switch (state) {
    case 'aberta':
      return { packages: packages(), vip: null };
    case 'visitante':
      return { packages: packages({ eligibility: null }), vip: null };
    case 'em-breve':
      return { packages: packages({ enabled: false }), vip: null };
    case 'banido':
      return { packages: packages({ eligibility: 'banned' }), vip: null };
    case 'bloqueado':
      return { packages: packages({ eligibility: 'purchases_blocked' }), vip: null };
    case 'em-analise':
      return { packages: packages({ eligibility: 'purchase_in_progress' }), vip: null };
    case 'limite':
      return { packages: packages({ eligibility: 'daily_limit' }), vip: null };
    case 'vip-ativo':
      return { packages: packages(), vip: active(41) };
    case 'vip-acabando':
      return { packages: packages(), vip: active(2) };
    case 'vip-acabou':
      return {
        packages: packages(),
        vip: { active: false, endsAt: null, endedAt: iso(-3) },
      };
    case 'sandbox':
      return { packages: packages({ sandbox: true }), vip: null };
    case 'indisponivel':
      return { packages: null, vip: null };
  }
}
