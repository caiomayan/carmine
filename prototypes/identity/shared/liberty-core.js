/* Liberty Lab — núcleo: geração de tokens neutros a partir de parâmetros, persistência e aplicação.
   Carrega no <head>, antes da primeira pintura (sem flash). Descartável. */
(function () {
  const CREAM = [243, 235, 214];
  const PRESETS = {
    negativo: { name: 'Negativo', desc: 'Preto quase absoluto, branco com um sopro de creme. O mais cinema.', black: 4, warm: 1, cream: 0.22, contrast: 1.1, mids: 1, grain: 0.55 },
    prata: { name: 'Prata', desc: 'Cinzas mais claros e menos contraste: fosco, calmo, de prata de filme.', black: 18, warm: 0.6, cream: 0, contrast: 0.82, mids: 1.1, grain: 0.35 },
    jornal: { name: 'Papel jornal', desc: 'O mais quente: creme de jornal e preto macio, quase sépia sem ser sépia.', black: 10, warm: 2.2, cream: 0.8, contrast: 1, mids: 1.05, grain: 0.7 },
    final: { name: 'Final do dono', desc: 'Negativo ajustado à mão pelo dono: preto 5/255, calor 3%, creme 90%, grão 70%.', black: 5, warm: 3, cream: 0.9, contrast: 1, mids: 0.6, grain: 0.7 },
    fumaca: { name: 'Fumaça', desc: 'Tons médios mais presentes: o preto cede espaço e a escala respira.', black: 12, warm: 0.8, cream: 0.15, contrast: 0.92, mids: 1.75, grain: 0.5 }
  };
  const LAYOUT = { container: 1280, margin: 48 };
  const KEY = 'liberty-lab-v1';

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const warmUp = (c, w) => {
    const v = (c[0] + c[1] + c[2]) / 3, d = 255 * (w / 100) * 0.8 * (0.25 + 0.75 * Math.min(1, v / 160));
    return [c[0] + d, c[1] + d * 0.35, c[2] - d];
  };
  const hex = (c) => '#' + c.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase();
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lum = (h) => {
    const [r, g, b] = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => { const x = lum(a), y = lum(b), hi = Math.max(x, y), lo = Math.min(x, y); return (hi + 0.05) / (lo + 0.05); };

  function hsl2hex(h, s, l) {
    s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return hex([f(0) * 255, f(8) * 255, f(4) * 255]);
  }

  const grain = (r, g, b) => `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 ${r}  0 0 0 0 ${g}  0 0 0 0 ${b}  0 0 0 .9 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

  /* parâmetros -> tokens de um tema */
  function tokens(p, theme, danger) {
    const blackV = clamp(p.black, 0, 40), paper = mix([255, 255, 255], CREAM, clamp(p.cream, 0, 1));
    const ink = [blackV, blackV, blackV], c = p.contrast, m = p.mids;
    const T = {
      s1: 0.035 * m, s2: 0.078 * m, line: Math.min(0.15 * m, 0.4), lineS: Math.min(0.3 * m, 0.52),
      faint: clamp(0.36 + 0.06 * (c - 1), 0.28, 0.5), muted: clamp(0.6 + 0.14 * (c - 1), 0.5, 0.74), text: clamp(0.7 + 0.25 * c, 0.8, 0.97)
    };
    const dark = theme === 'dark', from = dark ? ink : paper, to = dark ? paper : ink;
    const at = (t) => hex(warmUp(mix(from, to, t), p.warm));
    const bg = hex(warmUp(from, p.warm)), text = at(T.text);
    // piso de acessibilidade: secundário >= 4,5:1 sobre a superfície mais alta; linha forte >= 3:1 sobre o fundo
    const s2 = at(T.s2);
    while (ratio(at(T.muted), s2) < 4.5 && T.muted < 0.88) T.muted += 0.01;
    while (ratio(at(T.lineS), bg) < 3 && T.lineS < 0.8) T.lineS += 0.01;
    T.faint = Math.min(T.faint, T.muted - 0.14);
    const o = {
      'color-scheme': theme,
      '--bg': bg, '--surface': at(T.s1), '--surface-2': at(T.s2), '--line': at(T.line), '--line-strong': at(T.lineS),
      '--text': text, '--muted': at(T.muted), '--faint': at(T.faint)
    };
    o['--accent'] = o['--text'];
    o['--accent-hover'] = hex(mix(rgb(o['--text']), rgb(bg), 0.16));
    o['--accent-ink'] = bg;
    o['--leather'] = o['--line-strong'];
    o['--ok'] = o['--text']; o['--warn'] = o['--text'];
    o['--danger'] = danger ? (dark ? hsl2hex(4, 30, 64) : hsl2hex(4, 36, 38)) : o['--text'];
    o['--c-retake'] = o['--text']; o['--c-dm'] = o['--text']; o['--c-casual'] = o['--text'];
    o['--proto-bg'] = dark ? hex(warmUp(mix(ink, [0, 0, 0], 1), p.warm * 0.4)) : hex(warmUp(ink, p.warm));
    o['--proto-fg'] = dark ? at(0.82) : hex(paper);
    o['--grain-op'] = (clamp(p.grain, 0, 1) * (dark ? 0.12 : 0.14)).toFixed(3);
    o['--grain'] = dark ? grain(1, 0.97, 0.9) : grain(0.12, 0.1, 0.07);
    return o;
  }
  const decl = (o, skip) => Object.entries(o).filter(([k]) => !(skip && skip.includes(k))).map(([k, v]) => `${k}:${v}`).join(';');

  /* ---- estado ---- */
  let state = { preset: 'negativo', base: 'negativo', p: Object.assign({}, PRESETS.negativo), container: LAYOUT.container, margin: LAYOUT.margin, danger: false, guides: false };
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && s.p && typeof s.p.black === 'number') state = Object.assign(state, s, { p: Object.assign({}, PRESETS.negativo, s.p) });
  } catch (e) {}
  const subs = [];
  const style = document.createElement('style'); style.id = 'liberty-tokens';

  function apply() {
    const d = tokens(state.p, 'dark', state.danger), l = tokens(state.p, 'light', state.danger);
    style.textContent = `:root,[data-theme=dark]{${decl(d)}}[data-theme=light]{${decl(l)}}:root{--container:${state.container}px;--margin:${state.margin}px}`;
    document.documentElement.dataset.guides = state.guides ? '1' : '0';
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
    subs.forEach((f) => f(state));
  }
  function set(patch) {
    if (patch.preset && PRESETS[patch.preset]) { state.preset = patch.preset; state.base = patch.preset; state.p = Object.assign({}, PRESETS[patch.preset]); }
    if (patch.p) { Object.assign(state.p, patch.p); state.preset = 'custom'; }
    ['container', 'margin', 'danger', 'guides'].forEach((k) => { if (k in patch) state[k] = patch[k]; });
    apply();
  }

  function exportCSS() {
    const d = tokens(state.p, 'dark', state.danger), l = tokens(state.p, 'light', state.danger);
    const body = (o) => '  ' + Object.entries(o).filter(([k]) => k !== '--grain').map(([k, v]) => `${k}: ${v};`).join('\n  ');
    const name = state.preset === 'custom' ? (PRESETS[state.base] || PRESETS.negativo).name + ', ajustado à mão' : PRESETS[state.preset].name;
    return `/* Carmine · Liberty Lab · tokens finais (preset base: ${name}) */
/* Escala neutra: nenhuma cor de acento. --accent é o próprio --text (ação primária = preenchido invertido). */
:root,
[data-theme="dark"] {
${body(d)}
}
[data-theme="light"] {
${body(l)}
}
/* Parâmetros que geraram a paleta */
/* preto: ${state.p.black}/255 · calor: ${state.p.warm.toFixed(1)}% · creme: ${Math.round(state.p.cream * 100)}% · contraste: ${Math.round(state.p.contrast * 100)}% · tons médios: ${Math.round(state.p.mids * 100)}% · grão: ${Math.round(state.p.grain * 100)}% */
/* Grão de filme: sobreposição fixa com opacidade --grain-op (SVG feTurbulence, baseFrequency .9) */

/* Container global */
:root {
  --container: ${state.container}px;   /* largura máxima do conteúdo */
  --margin: ${state.margin}px;      /* margem lateral mínima (no mobile: 16px + 25% do excedente) */
}
.container { width: min(var(--container), calc(100% - 2 * var(--margin))); margin-inline: auto; }
`;
  }

  document.head.appendChild(style);
  try { const t = localStorage.getItem('carmine-proto-theme'); document.documentElement.dataset.theme = (t === 'light' || t === 'dark') ? t : 'dark'; } catch (e) { document.documentElement.dataset.theme = 'dark'; }
  apply();

  window.Liberty = { PRESETS, LAYOUT, tokens, decl, state: () => state, set, apply, subscribe: (f) => subs.push(f), exportCSS, ratio, lum, hex, rgb };
})();
