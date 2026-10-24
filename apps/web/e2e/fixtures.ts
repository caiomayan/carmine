import AxeBuilder from '@axe-core/playwright';
import { test as base, expect, type Locator, type Page } from '@playwright/test';
import { routeViewer, type ViewerMode } from './fake-viewer';

export type Theme = 'dark' | 'light';

export const ROUTES = [
  '/',
  '/inventario',
  '/loadout',
  '/inventario/adicionar',
  '/inventario/adicionar?tipo=weapon&arma=AK-47',
  '/inventario/adicionar?q=nada-disso-existe',
  '/inventario/adicionar/222',
  '/inventario/adicionar/1781',
  '/termos',
  '/privacidade',
  '/regras',
  '/reembolso',
  '/contato',
  '/nao-existe',
  '/entrar',
  '/entrar?erro=indisponivel&motivo=sessao-expirada',
  '/entrar?erro=limite',
  '/configuracoes',
  '/dev/componentes',
] as const;
export const WIDTHS = [390, 820, 1100, 1440] as const;

/** Cor de fundo (--bg) de cada tema da Liberty, como o navegador a calcula. */
export const BG: Record<Theme, string> = {
  dark: 'rgb(10, 10, 10)',
  light: 'rgb(246, 246, 246)',
};

/** O Chrome registra a resposta 404 do próprio documento como erro de console. */
const EXPECTED_ERRORS = [/status of 404 \(Not Found\)/];

type Fixtures = {
  /** Erros de console e exceções da página; o teste falha se sobrar algum inesperado. */
  consoleErrors: string[];
  /**
   * Erros de console que o teste provoca de propósito (ex.: o 404 de um Perfil inexistente,
   * o 401 de uma sessão expirada). O teste acrescenta os padrões aqui.
   */
  expectedConsoleErrors: RegExp[];
  /**
   * O viewer 3D do teste: `fake` (padrão) responde ao protocolo postMessage sem rede externa;
   * `blocked` recusa o iframe, como um bloqueador ou o serviço fora do ar.
   */
  viewer: ViewerMode;
};

export const test = base.extend<Fixtures>({
  viewer: ['fake', { option: true }],
  page: async ({ page, viewer }, use) => {
    await routeViewer(page.context(), viewer);
    await use(page);
  },
  // biome-ignore lint/correctness/noEmptyPattern: o Playwright exige a desestruturação, mesmo vazia.
  expectedConsoleErrors: async ({}, use) => {
    await use([]);
  },
  consoleErrors: [
    async ({ page, expectedConsoleErrors }, use) => {
      const errors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(`${msg.text()} @ ${msg.location().url}`);
      });
      page.on('pageerror', (err) => errors.push(err.message));
      await use(errors);
      const unexpected = errors.filter(
        (e) =>
          !(e.includes('/nao-existe') && EXPECTED_ERRORS.some((re) => re.test(e))) &&
          !expectedConsoleErrors.some((re) => re.test(e)),
      );
      expect(unexpected, 'erros de console').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/**
 * Escolhe uma opção de um Select ou Combobox pelo valor (as opções levam `data-testid="option-<valor>"`;
 * o item "vazio" ("Todas") é `empty`). O botão é o que leva o rótulo ou o `data-testid` do campo.
 */
export async function chooseOption(page: Page, trigger: Locator, value: string) {
  await trigger.click();
  await page.getByTestId(`option-${value}`).click();
}

/** Grava o tema como se a pessoa já o tivesse escolhido numa visita anterior. */
export async function saveTheme(page: Page, theme: Theme) {
  await page.addInitScript((t) => {
    try {
      localStorage.setItem('carmine-theme', t);
    } catch {}
  }, theme);
}

/**
 * Espera a página parar: os blocos que carregam (`aria-busy`) terminarem e as animações finitas
 * no tempo (entradas, fades) acabarem. Um bloco que termina de carregar monta o conteúdo com uma
 * entrada nova (a lista de amigos depois do login), então ler `getAnimations()` uma vez não basta:
 * repete até um quadro sem nada novo. As ligadas à rolagem (o rodapé) só terminam rolando a
 * página, então ficam de fora. Uma animação cancelada no meio (um re-render) rejeita o
 * `finished` com AbortError: ela não existe mais, então não conta.
 */
export async function settle(page: Page) {
  for (let round = 0; round < 5; round++) {
    // Um esqueleto que nunca resolve (a API fora do ar) não é motivo para travar: segue adiante.
    await page
      .waitForFunction(() => !document.querySelector('[aria-busy="true"]'), undefined, {
        timeout: 5_000,
      })
      .catch(() => undefined);
    const again = await page.evaluate(async () => {
      const finite = () =>
        document
          .getAnimations()
          .filter(
            (a) =>
              a.timeline === document.timeline &&
              a.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY,
          );
      const running = finite();
      await Promise.all(running.map((a) => a.finished.catch(() => undefined)));
      // Dois quadros: o React monta o que acabou de chegar e as entradas novas já se registram.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return running.length > 0 || finite().length > 0;
    });
    if (!again) return;
  }
}

/**
 * Rola até o fim real da página, onde o rodapé termina de entrar. O fim pode andar enquanto a página
 * assenta (a fonte do wordmark do rodapé muda a altura dele, e a cortina reserva essa altura): rola de
 * novo até a altura parar e o fim estar à vista. Instantâneo: com `scroll-behavior: smooth` a rolagem
 * ainda estaria no meio quando o teste mede.
 */
export async function scrollToEnd(page: Page) {
  await page.evaluate(async () => {
    for (let round = 0; round < 6; round++) {
      const height = document.documentElement.scrollHeight;
      window.scrollTo({ top: height, behavior: 'instant' });
      await new Promise((resolve) => setTimeout(resolve, 250));
      const settled = document.documentElement.scrollHeight === height;
      if (settled && Math.abs(window.scrollY + window.innerHeight - height) <= 1) return;
    }
  });
}

/**
 * Leva as animações finitas que ainda correm (as do Motion, que a folha de medição não alcança)
 * ao último quadro, na hora de medir. `finish()` põe cada uma no estado que a pessoa vê no fim;
 * as infinitas (pulso, esqueleto) seguem como estão. Repete porque terminar uma entrada pode
 * montar outra.
 */
async function finishAnimations(page: Page) {
  for (let round = 0; round < 3; round++) {
    const pending = await page.evaluate(async () => {
      const finite = () =>
        document
          .getAnimations()
          .filter((a) => a.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY);
      let touched = 0;
      for (const animation of finite()) {
        if (animation.playState === 'finished') continue;
        touched++;
        try {
          animation.finish();
        } catch {
          // Sem último quadro possível: o estado sem a animação é o que fica.
          animation.cancel();
        }
      }
      // Dois quadros: o estilo final é aplicado e o que o React montou por causa dele já aparece.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return touched;
    });
    if (pending === 0) return;
  }
}

/** O que o axe diz de um nó, com as cores e a razão quando a regra as mede (contraste). */
function describe(node: { target: unknown[]; any: { data?: unknown }[] }): string {
  const selector = node.target.join(' ');
  for (const check of node.any) {
    const data = check.data as
      | {
          fgColor?: string;
          bgColor?: string;
          contrastRatio?: number;
          expectedContrastRatio?: string;
        }
      | undefined;
    if (data?.fgColor && data.bgColor && data.contrastRatio !== undefined) {
      return `${selector} [texto ${data.fgColor} sobre ${data.bgColor}: ${data.contrastRatio}:1, pede ${data.expectedContrastRatio}]`;
    }
  }
  return selector;
}

/**
 * As violações do axe (WCAG 2.2 AA) da página como está, uma linha por regra com os nós e, no
 * contraste, as cores e a razão medidas. Antes de medir, a página assenta, o rodapé entra e toda
 * animação finita vai ao último quadro: o axe mede o estado final, não o meio de uma entrada.
 */
export async function axeViolations(
  page: Page,
  { ignore = [], fixedHeader = false }: { ignore?: string[]; fixedHeader?: boolean } = {},
) {
  // O rodapé só fica opaco quando entra na tela: rola até o fim para o axe medir o contraste dele.
  await scrollToEnd(page);
  await settle(page);
  // A análise leva segundos, e o que começa a se mexer nesse meio tempo seria medido pela
  // metade: uma transição (o hover de uma linha quando o layout muda sob o mouse parado), a
  // entrada do rodapé (ligada à rolagem) ou a de uma linha de servidor que acabou de ficar
  // offline (o texto vinha a 1,1:1 de contraste, quase transparente). Com a página já assentada,
  // a folha de medição tira as transições e as animações CSS: o estilo sem elas é o final (as
  // entradas do site só têm o quadro de saída, "from"), e vale também para o que nascer durante a
  // análise. As regras do axe seguem todas ligadas. A folha construída por script não passa pela
  // CSP de estilos inline. O header fixo (a partir de 768 px) cobriria o que a rolagem até o fim
  // deixa embaixo dele e o `target-size` contaria o encontro como alvos sobrepostos: salvo pedido
  // (`fixedHeader`, para medir o próprio header rolado), a medição o solta do topo (o mesmo lugar
  // no fluxo).
  await page.evaluate((fixed) => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(
      `*, *::before, *::after { transition: none !important; animation: none !important; }${
        fixed ? '' : ' header[data-site-header] { position: static !important; }'
      }`,
    );
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    (window as unknown as { __axeFreeze: CSSStyleSheet }).__axeFreeze = sheet;
  }, fixedHeader);
  await finishAnimations(page);
  try {
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .disableRules(ignore)
      .analyze();
    return violations.map((v) => `${v.id}: ${v.nodes.map(describe).join(', ')}`);
  } finally {
    await page.evaluate(() => {
      const frozen = (window as unknown as { __axeFreeze?: CSSStyleSheet }).__axeFreeze;
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== frozen);
    });
  }
}
