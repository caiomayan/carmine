import { VIP_NOTICE_TIME_ZONE } from '@carmine/contracts/rules';

/**
 * A faixa do fim do VIP em todas as páginas (S14b): quando ela aparece, quando volta depois de dispensada e o script que a
 * esconde antes da primeira pintura. O dia é o de Brasília, o mesmo dos avisos (`vipNoticeAt`).
 */

/** Os avisos que viram faixa: os 3 dias antes e o dia do fim. O "acabou hoje" fica só no Loadout. */
export type EndingNotice = 'ending_soon' | 'ending_today';

export const isEndingNotice = (notice: string | null): notice is EndingNotice =>
  notice === 'ending_soon' || notice === 'ending_today';

/** Onde o navegador guarda a última dispensa: `"AAAA-MM-DD|aviso"`. */
export const VIP_ENDING_STORAGE_KEY = 'carmine:vip-ending';

/** As páginas que já têm o assunto do VIP e não repetem a faixa. */
const HIDDEN_ON = ['/plans', '/loadout'];

export const hiddenOnPath = (pathname: string) =>
  HIDDEN_ON.some((path) => pathname === path || pathname.startsWith(`${path}/`));

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: VIP_NOTICE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * O que se guarda ao dispensar: o dia e o aviso. Dispensar vale só até o fim do dia e só para aquele aviso: no dia seguinte,
 * e no dia do fim (`ending_today`, outro aviso), a faixa volta.
 */
export const vipEndingKey = (notice: EndingNotice, now: Date = new Date()) =>
  `${dayFormat.format(now)}|${notice}`;

/** A faixa está dispensada hoje para este aviso? `stored` é o que o navegador guardou (ou nulo). */
export const isDismissed = (stored: string | null, notice: EndingNotice, now: Date = new Date()) =>
  stored === vipEndingKey(notice, now);

/** Lê a dispensa guardada; o localStorage pode faltar ou lançar (aba privada, dados bloqueados): então não está dispensada. */
export function readDismissed(notice: EndingNotice): boolean {
  try {
    return isDismissed(localStorage.getItem(VIP_ENDING_STORAGE_KEY), notice);
  } catch {
    return false;
  }
}

export function writeDismissed(notice: EndingNotice): void {
  try {
    localStorage.setItem(VIP_ENDING_STORAGE_KEY, vipEndingKey(notice));
  } catch {
    // Sem armazenamento, a faixa só some até recarregar.
  }
}

/** O id do elemento da faixa, que o script e o botão de dispensar procuram. */
export const VIP_ENDING_ID = 'vip-ending';

/**
 * Roda logo depois da faixa, antes da primeira pintura: se ela já foi dispensada hoje, esconde na hora (sem piscar nem
 * empurrar a página). Mesma conta de {@link vipEndingKey}, em texto porque vai inline no HTML do servidor.
 */
export const vipEndingInitScript = `(function(){try{var d=new Intl.DateTimeFormat('en-CA',{timeZone:'${VIP_NOTICE_TIME_ZONE}',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());var e=document.getElementById('${VIP_ENDING_ID}');if(e&&localStorage.getItem('${VIP_ENDING_STORAGE_KEY}')===d+'|'+e.getAttribute('data-notice'))e.hidden=true}catch(x){}})()`;
