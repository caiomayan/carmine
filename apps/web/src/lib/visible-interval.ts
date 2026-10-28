/**
 * Um intervalo que só corre com a aba à vista. Com a aba escondida o navegador já espaça os temporizadores, mas o
 * React segue renderizando (e a rede, pedindo) a cada tique: um relógio ou uma releitura que ninguém vê custa CPU e
 * bateria à toa. Aqui o intervalo é desligado ao esconder e, ao voltar, `callback` roda UMA vez na hora (para o
 * relógio e os dados não mostrarem o instante em que a aba saiu) e o intervalo recomeça.
 *
 * Sem React, para ser testado em Node: o ambiente (`document`, `setInterval`) entra por parâmetro.
 */
export type VisibilityEnv = {
  hidden: () => boolean;
  /** Assina as mudanças de visibilidade; devolve quem cancela. */
  onChange: (listener: () => void) => () => void;
  setInterval: (callback: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
};

const browserEnv = (): VisibilityEnv => ({
  hidden: () => document.hidden,
  onChange: (listener) => {
    document.addEventListener('visibilitychange', listener);
    return () => document.removeEventListener('visibilitychange', listener);
  },
  setInterval: (callback, ms) => window.setInterval(callback, ms),
  clearInterval: (handle) => window.clearInterval(handle as number),
});

/** Começa a correr (parado, se a aba já está escondida); devolve a função que encerra tudo. */
export function startVisibleInterval(
  callback: () => void,
  ms: number,
  env: VisibilityEnv = browserEnv(),
): () => void {
  let handle: unknown = null;
  const run = () => {
    if (handle === null) handle = env.setInterval(callback, ms);
  };
  const pause = () => {
    if (handle !== null) {
      env.clearInterval(handle);
      handle = null;
    }
  };
  if (!env.hidden()) run();
  const stopListening = env.onChange(() => {
    if (env.hidden()) {
      pause();
      return;
    }
    // Voltou: o dado/relógio está velho, atualiza já e recomeça a contar.
    if (handle === null) {
      callback();
      run();
    }
  });
  return () => {
    stopListening();
    pause();
  };
}
