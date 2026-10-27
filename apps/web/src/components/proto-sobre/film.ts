import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * A montagem do "filme" do Sobre: as cenas, na ordem, cada uma presa à rolagem. **Este é o único arquivo que importa
 * o GSAP**, e o `sobre-filme.tsx` só o carrega por um `import('./film')` depois da hidratação: nenhuma outra página
 * do site baixa a biblioteca (e um só `import()` dinâmico, em vez de três, mantém o manifesto de chunks do runtime,
 * que vai em toda página, do mesmo tamanho). Roda dentro de um `gsap.matchMedia()` (só sem
 * `prefers-reduced-motion`) e tudo o que cria é desfeito quando a condição deixa de valer ou a página sai.
 */

/** Monta o filme em `root` se a pessoa aceita movimento; devolve a função que desfaz tudo. */
export function startFilm(root: HTMLElement): () => void {
  gsap.registerPlugin(ScrollTrigger);
  const media = gsap.matchMedia();
  media.add('(prefers-reduced-motion: no-preference)', () => buildFilm(root));
  return () => media.revert();
}

const SMALL = '(max-width: 760px)';

function buildFilm(root: HTMLElement): () => void {
  /** O que o GSAP não desfaz sozinho (ouvintes do DOM e a classe do filme). */
  const undo: (() => void)[] = [];
  const q = gsap.utils.selector(root);
  const small = window.matchMedia(SMALL).matches;
  const run = (desktop: string, mobile: string) => (small ? mobile : desktop);

  root.classList.add('is-film');
  undo.push(() => root.classList.remove('is-film'));

  /* ---------- 0 · a abertura: o papel amassado se solta e mostra o mapa ---------- */
  const shards = q<HTMLElement>('.sb-shard');
  const title = q('.sb-title');
  gsap
    .timeline({
      scrollTrigger: {
        trigger: q('[data-scene="hero"]')[0],
        start: 'top top',
        end: run('+=150%', '+=130%'),
        scrub: 0.6,
        pin: true,
        anticipatePin: 1,
      },
    })
    .to(
      shards,
      {
        xPercent: (_, el: HTMLElement) => Number(el.dataset.dx),
        yPercent: (_, el: HTMLElement) => Number(el.dataset.dy),
        rotation: (_, el: HTMLElement) => Number(el.dataset.rot),
        scale: 0.85,
        opacity: 0,
        ease: 'power2.in',
        duration: 0.45,
        delay: (_, el: HTMLElement) => Number(el.dataset.delay),
      },
      0,
    )
    .fromTo(q('.sb-bg-hero img'), { scale: 1.18 }, { scale: 1, ease: 'none', duration: 1.4 }, 0)
    .to(q('.sb-grain'), { opacity: 0, duration: 0.5 }, 0.2)
    .to(title, { color: '#ffffff', ease: 'power1.inOut', duration: 0.5 }, 0.55)
    .to(q('.sb-kicker'), { color: '#ffffff', duration: 0.5 }, 0.55)
    .to(q('.sb-lede'), { opacity: 1, y: 0, duration: 0.5 }, 0.85)
    .to(q('.sb-hint'), { opacity: 0, duration: 0.2 }, 0);

  /* ---------- 1 · o Spotlight Text: o foco passeia pela frase ---------- */
  const spot = q<HTMLElement>('.sb-spot-text')[0];
  if (spot) {
    gsap.fromTo(
      spot,
      { '--sx': '8%', '--sy': '22%' },
      {
        '--sx': '92%',
        '--sy': '78%',
        ease: 'none',
        scrollTrigger: {
          trigger: spot,
          start: 'top 80%',
          end: 'bottom 30%',
          scrub: true,
        },
      },
    );
    // Com mouse, o foco segue o ponteiro; ao sair, volta a seguir a rolagem.
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const box = spot.getBoundingClientRect();
      spot.style.setProperty('--sx', `${((event.clientX - box.left) / box.width) * 100}%`);
      spot.style.setProperty('--sy', `${((event.clientY - box.top) / box.height) * 100}%`);
    };
    spot.addEventListener('pointermove', move);
    undo.push(() => spot.removeEventListener('pointermove', move));
  }

  /* ---------- 2 · os dois Modos: o mapa, o servidor e o Loadout trocam ao rolar ---------- */
  const modes = q('[data-scene="modes"]')[0];
  const retake = q('.sb-mode[data-mode="retake"]')[0];
  const deathmatch = q('.sb-mode[data-mode="deathmatch"]')[0];
  if (modes && retake && deathmatch) {
    const state = { retake: 0, deathmatch: 0 };
    const retakeCount = q<HTMLElement>('[data-count="retake"]')[0];
    const deathmatchCount = q<HTMLElement>('[data-count="deathmatch"]')[0];
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: modes,
        start: 'top top',
        end: run('+=280%', '+=220%'),
        scrub: 0.5,
        pin: true,
        anticipatePin: 1,
      },
    });
    gsap.set(deathmatch, { autoAlpha: 0 });
    // O Retake entra antes de a cena grudar na tela: quando ela fixa, o texto já está lá.
    gsap.from(q('.sb-mode[data-mode="retake"] .sb-reveal'), {
      y: 44,
      opacity: 0,
      stagger: 0.12,
      ease: 'power3.out',
      scrollTrigger: { trigger: modes, start: 'top 80%', end: 'top 15%', scrub: 0.5 },
    });
    tl.to(
      state,
      {
        retake: 8,
        duration: 0.8,
        ease: 'none',
        onUpdate: () => {
          if (retakeCount) retakeCount.textContent = String(Math.round(state.retake));
        },
      },
      0.2,
    )
      .to(retake, { autoAlpha: 0, duration: 0.4 }, 1.6)
      .fromTo(
        q('.sb-mode[data-mode="retake"] .sb-bg img'),
        { scale: 1 },
        { scale: 1.12, duration: 0.6 },
        1.4,
      )
      .to(deathmatch, { autoAlpha: 1, duration: 0.4 }, 1.7)
      .fromTo(
        q('.sb-mode[data-mode="deathmatch"] .sb-bg img'),
        { scale: 1.14 },
        { scale: 1, duration: 1.2, ease: 'none' },
        1.7,
      )
      .from(
        q('.sb-mode[data-mode="deathmatch"] .sb-reveal'),
        {
          y: 44,
          opacity: 0,
          stagger: 0.12,
          duration: 0.5,
        },
        1.9,
      )
      .to(
        state,
        {
          deathmatch: 12,
          duration: 0.8,
          ease: 'none',
          onUpdate: () => {
            if (deathmatchCount) deathmatchCount.textContent = String(Math.round(state.deathmatch));
          },
        },
        2.1,
      )
      .to({}, { duration: 0.6 });
    // O Loadout é o mesmo nos dois: as skins entram uma a uma.
    q<HTMLElement>('.sb-skins').forEach((list) => {
      tl.from(
        list.children,
        { y: 30, opacity: 0, stagger: 0.1, duration: 0.4 },
        list.closest('[data-mode="deathmatch"]') ? 2.2 : 0.5,
      );
    });
  }

  /* ---------- 3 · o Ranking da semana: o pódio sobe e os números contam ---------- */
  const ranking = q('[data-scene="ranking"]')[0];
  if (ranking) {
    const tl = gsap.timeline({
      scrollTrigger: { trigger: ranking, start: 'top 65%', end: 'center 40%', scrub: 0.6 },
    });
    tl.from(q('.sb-step'), {
      scaleY: 0,
      transformOrigin: 'bottom',
      stagger: 0.12,
      duration: 0.6,
      ease: 'power3.out',
    })
      .from(q('.sb-podium-who'), { y: 24, opacity: 0, stagger: 0.12, duration: 0.4 }, 0.3)
      .from(q('.sb-row'), { x: -40, opacity: 0, stagger: 0.1, duration: 0.4 }, 0.6);
    q<HTMLElement>('[data-value]').forEach((el) => {
      const target = Number(el.dataset.value);
      const decimals = Number(el.dataset.decimals ?? 0);
      const box = { v: 0 };
      tl.to(
        box,
        {
          v: target,
          duration: 0.9,
          ease: 'none',
          onUpdate: () => {
            el.textContent = box.v.toLocaleString('pt-BR', {
              minimumFractionDigits: decimals,
              maximumFractionDigits: decimals,
            });
          },
        },
        0.2,
      );
    });
  }

  /* ---------- 4 · a comunidade: duas faixas de atividade, uma para cada lado ---------- */
  q<HTMLElement>('.sb-marquee-track').forEach((track, index) => {
    gsap.fromTo(
      track,
      { xPercent: index % 2 === 0 ? 0 : -50 },
      {
        xPercent: index % 2 === 0 ? -50 : 0,
        ease: 'none',
        scrollTrigger: { trigger: track, start: 'top bottom', end: 'bottom top', scrub: true },
      },
    );
  });

  /* ---------- 5 · o VIP: a vaga reservada ---------- */
  const vip = q('[data-scene="vip"]')[0];
  if (vip) {
    const tl = gsap.timeline({
      scrollTrigger: { trigger: vip, start: 'top 60%', end: 'center 35%', scrub: 0.6 },
    });
    tl.from(q('.sb-slot'), { scale: 0.4, opacity: 0, stagger: 0.05, duration: 0.3 })
      .to(q('.sb-slot[data-slot="last"]'), { opacity: 0, x: 14, duration: 0.3 }, '>+0.2')
      .fromTo(q('.sb-slot-vip'), { opacity: 0, x: 40 }, { opacity: 1, x: 0, duration: 0.4 }, '<')
      .from(q('.sb-perk'), { y: 40, opacity: 0, stagger: 0.12, duration: 0.5 }, 0.2);
  }

  /* ---------- 6 · o fim ---------- */
  const end = q('[data-scene="end"]')[0];
  if (end) {
    gsap.from(q('.sb-end-copy > *'), {
      y: 50,
      opacity: 0,
      stagger: 0.12,
      ease: 'power3.out',
      scrollTrigger: { trigger: end, start: 'top 70%', end: 'center 55%', scrub: 0.5 },
    });
  }

  /* ---------- o trilho de cenas: a bolinha da cena à vista acende ---------- */
  q<HTMLElement>('[data-scene]').forEach((scene) => {
    const id = scene.dataset.scene;
    ScrollTrigger.create({
      trigger: scene,
      start: 'top 55%',
      end: 'bottom 55%',
      onToggle: (self) => {
        for (const dot of q<HTMLElement>(`.sb-rail [data-dot="${id}"]`)) {
          dot.toggleAttribute('data-on', self.isActive);
        }
      },
    });
  });

  return () => {
    for (const fn of undo) fn();
  };
}
