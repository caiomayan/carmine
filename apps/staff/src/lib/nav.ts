import { type StaffPermission, type StaffRole, staffCan } from '@carmine/contracts/staff';

/** As telas do painel (S25). `permission` é a mesma que a API cobra: quem não pode não vê o item. */
export type NavId =
  | 'inicio'
  | 'denuncias'
  | 'fotos'
  | 'contas'
  | 'pagamentos'
  | 'servidores'
  | 'auditoria';

export type NavItem = {
  id: NavId;
  href: '/' | `/${string}`;
  label: string;
  group: 'revisao' | 'gestao';
  permission: StaffPermission | null;
};

export const NAV: NavItem[] = [
  { id: 'inicio', href: '/', label: 'Início', group: 'revisao', permission: null },
  {
    id: 'denuncias',
    href: '/denuncias',
    label: 'Denúncias',
    group: 'revisao',
    permission: 'reports.handle',
  },
  {
    id: 'fotos',
    href: '/fotos',
    label: 'Fotos denunciadas',
    group: 'revisao',
    permission: 'avatars.moderate',
  },
  { id: 'contas', href: '/contas', label: 'Contas', group: 'gestao', permission: 'accounts.read' },
  {
    id: 'pagamentos',
    href: '/pagamentos',
    label: 'Pagamentos',
    group: 'gestao',
    permission: 'payments.manage',
  },
  {
    id: 'servidores',
    href: '/servidores',
    label: 'Servidores',
    group: 'gestao',
    permission: 'servers.edit',
  },
  {
    id: 'auditoria',
    href: '/auditoria',
    label: 'Auditoria',
    group: 'gestao',
    permission: 'audit.read',
  },
];

/** O que o papel enxerga. */
export const navFor = (role: StaffRole): NavItem[] =>
  NAV.filter((item) => item.permission === null || staffCan(role, item.permission));
