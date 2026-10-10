/* Protótipo descartável: conteúdo fictício e renderização compartilhada das 3 direções. */
(function () {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------------- dados ---------------- */
  const MAPS = {
    de_mirage: ['#c9a36b', '#6b4a2b'], de_inferno: ['#b5753f', '#4a2a1c'], de_ancient: ['#6f8a5a', '#2d3b28'],
    de_dust2: ['#d4b27a', '#8a6a3c'], de_nuke: ['#8f9aa3', '#3c4650'], de_anubis: ['#c8a45a', '#5a4220'],
    de_overpass: ['#7e9a8a', '#33463d'], de_vertigo: ['#9aa7b4', '#46525e']
  };
  const MODES = { retake: 'Retake', dm: 'Deathmatch', casual: '5v5 casual' };
  const SERVERS = [
    ['retake', 'Carmine Retake #01', 'São Paulo', 'de_mirage', 9, 10, 12],
    ['retake', 'Carmine Retake #02', 'São Paulo', 'de_inferno', 10, 10, 14],
    ['dm', 'Carmine Deathmatch #01', 'São Paulo', 'de_dust2', 18, 24, 13],
    ['casual', 'Carmine 5v5 Casual #03', 'Rio de Janeiro', 'de_ancient', 8, 10, 24],
    ['retake', 'Carmine Retake #04', 'Rio de Janeiro', 'de_nuke', 6, 10, 26],
    ['dm', 'Carmine Deathmatch #02', 'Porto Alegre', 'de_anubis', 21, 24, 38],
    ['casual', 'Carmine 5v5 Casual #01', 'São Paulo', 'de_overpass', 10, 10, 15],
    ['casual', 'Carmine 5v5 Casual #02', 'Brasília', 'de_vertigo', 4, 10, 52],
    ['retake', 'Carmine Retake #05', 'Fortaleza', 'de_ancient', 3, 10, 71]
  ];
  const FRIENDS = [
    ['Rafa_Tabaco', 'on', 'Retake #01 · de_mirage'], ['bia.awp', 'on', '5v5 Casual #03 · de_ancient'],
    ['mateusz', 'on', 'Deathmatch #02 · de_anubis'], ['Lu Carvalho', 'away', 'No lobby · ausente há 12 min'],
    ['gordinho_ct', 'on', 'Retake #04 · de_nuke']
  ];
  const SK = (a, b) => [a, b];
  const WEAPONS = [
    // id, nome, skin, lado, categoria, cores, float, seed, stattrak
    ['usps', 'USP-S', 'Orion', 'ct', 'Pistolas', SK('#5a7384', '#1f2b33'), 0.09, 412, 0],
    ['p2000', 'P2000', 'Ivory', 'ct', 'Pistolas', SK('#d8cdb4', '#8a7e66'), 0.21, 87, 0],
    ['glock', 'Glock-18', 'Fade', 'tr', 'Pistolas', SK('#e0a24a', '#b3202a'), 0.03, 701, 1],
    ['tec9', 'Tec-9', 'Fuel Injector', 'tr', 'Pistolas', SK('#d58a2e', '#4a2a10'), 0.12, 19, 0],
    ['deagle', 'Desert Eagle', 'Blaze', 'both', 'Pistolas', SK('#e86a1c', '#7a1d0c'), 0.01, 333, 1],
    ['p250', 'P250', 'Asiimov', 'both', 'Pistolas', SK('#e8e4da', '#c2551a'), 0.38, 906, 0],
    ['mp9', 'MP9', 'Hypnotic', 'ct', 'SMGs', SK('#6fa07a', '#1e3a2a'), 0.14, 55, 0],
    ['mac10', 'MAC-10', 'Neon Rider', 'tr', 'SMGs', SK('#c43b8f', '#3a1a66'), 0.06, 640, 0],
    ['m4a4', 'M4A4', 'Neo-Noir', 'ct', 'Rifles', SK('#3a3a44', '#b3202a'), 0.07, 128, 1],
    ['m4a1s', 'M4A1-S', 'Printstream', 'ct', 'Rifles', SK('#f1efe9', '#2b2b30'), 0.04, 872, 1],
    ['ak47', 'AK-47', 'Vulcan', 'tr', 'Rifles', SK('#c9894a', '#2a2f3a'), 0.15, 266, 1],
    ['galil', 'Galil AR', 'Chatterbox', 'tr', 'Rifles', SK('#b8442c', '#2d1a14'), 0.27, 31, 0],
    ['awp', 'AWP', 'Dragon Lore', 'both', 'Rifles', SK('#9a8a4a', '#2c3a22'), 0.05, 4, 1],
    ['ssg', 'SSG 08', 'Dragonfire', 'both', 'Rifles', SK('#d96a1a', '#3a1608'), 0.11, 777, 0],
    ['knife', 'Faca Karambit', 'Tiger Tooth', 'both', 'Facas e luvas', SK('#e8b84a', '#7a4a10'), 0.02, 521, 1],
    ['gloves', 'Luvas Esportivas', 'Pandora', 'both', 'Facas e luvas', SK('#4a6fb0', '#1c2540'), 0.19, 98, 0]
  ].map((w) => ({ id: w[0], name: w[1], skin: w[2], side: w[3], cat: w[4], c1: w[5][0], c2: w[5][1], float: w[6], seed: w[7], st: !!w[8] }));
  const CAT_ORDER = ['Pistolas', 'SMGs', 'Rifles', 'Facas e luvas'];
  const PRESETS = ['Competitivo', 'Deathmatch (HS)', 'Retake — ofensivo', 'Clássico'];
  const STICKERS = ['Tigre Holo', 'Âncora', 'Ás de Copas', null];

  const wear = (f) => (f < 0.07 ? 'Nova de Fábrica' : f < 0.15 ? 'Pouco Usada' : f < 0.38 ? 'Testada em Campo' : f < 0.45 ? 'Bem Desgastada' : 'Veterana de Guerra');
  const initials = (n) => n.replace(/[^A-Za-zÀ-ú ]/g, '').trim().slice(0, 2).toUpperCase();

  function shape(cat, c1, c2, id) {
    const g = `<defs><linearGradient id="g${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>`;
    const paths = {
      Pistolas: 'M6 10h70l4 6h18v8H80l-2 4H58l-4 14H40l4-14H20l-4 5H8z',
      SMGs: 'M4 12h60l6-4h26v8h16v8H88l-4 6H66v10H52V28H20l-6 8H6z',
      Rifles: 'M2 20h32l10-8h30l4 6h38v8H80l-4 8H60l2-8H48l-6 12H30l4-12H14l-8 8H2z',
      'Facas e luvas': 'M6 30L84 6l8 8L24 36l-6 6-8-4z'
    };
    return `<svg viewBox="0 0 120 52" aria-hidden="true">${g}<path d="${paths[cat]}" fill="url(#g${id})"/></svg>`;
  }

  /* ---------------- componentes ---------------- */
  const NAV = ['Servidores', 'Loadout', 'Partidas', 'Ranking', 'Comunidade'];
  function header(active, cfg) {
    if (cfg && cfg.headerHTML) return cfg.headerHTML(active);
    return `<header class="app-header"><div class="container hdr">
      <a class="wm${cfg && cfg.wordmarkSVG ? ' wm-img' : ''}" href="#" aria-label="Carmine">${cfg && cfg.wordmarkSVG ? cfg.wordmarkSVG : 'Carmine'}</a>
      <nav class="nav" aria-label="Principal">${NAV.map((n) => `<a href="#"${n === active ? ' aria-current="page"' : ''}>${n}</a>`).join('')}</nav>
      <div class="hdr-end">
        <label class="search">${cfg && cfg.searchIcon ? cfg.searchIcon : '<span aria-hidden="true">⌕</span>'}<input type="search" placeholder="Buscar servidor ou jogador" aria-label="Buscar"></label>
        <span class="online"><span class="dot"></span><span class="num" data-total="players">2.431</span> online</span>
        <span class="avatar" title="Caio">CA</span>
      </div></div></header>`;
  }

  function serverRow(s) {
    const [mode, name, city, map, n, max, ping] = s;
    const [m1, m2] = MAPS[map];
    const pct = Math.round((n / max) * 100);
    const pc = ping < 30 ? '' : ping < 60 ? 'warn' : 'bad';
    return `<article class="srv" data-mode="${mode}" data-max="${max}">
      <div class="srv-main"><span class="chip ${mode}">${MODES[mode]}</span><h3>${name}</h3><div class="meta">${city} · 128 tick</div></div>
      <div class="srv-map"><span class="mapthumb" style="--m1:${m1};--m2:${m2}"></span><div><b>${map}</b><span>${mode === 'dm' ? 'Rotação' : 'Mapa atual'}</span></div></div>
      <div class="srv-pl"><span class="lbl">Jogadores</span><div class="row"><span class="num"><b class="cur">${n}</b>/${max}</span></div><span class="bar"><i class="${n >= max ? 'full' : ''}" style="width:${pct}%"></i></span></div>
      <div class="srv-ping"><span class="lbl">Ping</span><span class="dot ${pc}"></span><span class="num">${ping} ms</span></div>
      <button class="btn btn-primary" type="button">${n >= max ? 'Fila' : 'Conectar'}</button></article>`;
  }

  function screen1(cfg) {
    return `${header('Servidores', cfg)}
    <main class="container s1" id="s1">
      <div class="page-head"><div><h1>Servidores</h1><p class="sub">${cfg.live ? '<span class="live"><i class="live-dot"></i>Ao vivo</span><span class="num">' + SERVERS.length * 14 + '</span> servidores' : '<span class="num">' + SERVERS.length * 14 + '</span> ao vivo'} · <span class="num" data-total="players">2.431</span> jogadores · latência medida a partir de você (Curitiba)</p></div>
        <div class="seg" role="group" aria-label="Modo" id="modeSeg">
          <button type="button" aria-pressed="true" data-m="all">Todos</button><button type="button" aria-pressed="false" data-m="retake">Retake</button>
          <button type="button" aria-pressed="false" data-m="dm">Deathmatch</button><button type="button" aria-pressed="false" data-m="casual">5v5 casual</button></div></div>
      <div class="s1-grid"><section class="servers" aria-label="Lista de servidores">
        <div class="filters"><span class="label">Região</span><div class="seg" role="group" aria-label="Região"><button type="button" aria-pressed="true">Brasil</button><button type="button" aria-pressed="false">Sudeste</button><button type="button" aria-pressed="false">Sul</button></div>
        <span class="label" style="margin-left:8px">Ordenar</span><div class="seg" role="group" aria-label="Ordenar"><button type="button" aria-pressed="true">Ping</button><button type="button" aria-pressed="false">Jogadores</button></div></div>
        <div class="srv-cols label"><span>Servidor</span><span>Mapa</span><span>Jogadores</span><span>Ping</span><span></span></div>
        <div id="srvList">${SERVERS.map(serverRow).join('')}</div></section>
      <aside class="friends" aria-label="Amigos"><div class="friends-h"><h2>Seus amigos jogando agora</h2><span class="chip"><span class="num">${FRIENDS.filter((f) => f[1] === 'on').length}</span>&nbsp;online</span></div>
        ${FRIENDS.map((f) => `<div class="fr"><span class="avatar">${initials(f[0])}<span class="dot ${f[1] === 'on' ? '' : 'warn'}"></span></span><div class="fr-info"><b>${esc(f[0])}</b><span>${f[2]}</span></div>${f[1] === 'on' ? '<button class="btn btn-sm" type="button">Entrar</button>' : ''}</div>`).join('')}
        <div class="fr-off">+ 14 amigos offline</div></aside></div></main>`;
  }

  function screen2(cfg) {
    return `${header('Loadout', cfg)}
    <main class="container s2" id="s2">
      <div class="page-head"><div><h1>Loadout</h1><p class="sub">Suas skins valem em todos os servidores Carmine. Alterações aplicam no próximo round.</p></div>
        <div class="seg" role="group" aria-label="Lado" id="sideSeg"><button type="button" aria-pressed="true" data-s="ct">Contra-Terroristas</button><button type="button" aria-pressed="false" data-s="tr">Terroristas</button></div></div>
      <div class="s2-grid"><div class="wcol"><div id="wsk" aria-hidden="true" hidden></div><section id="wlist" aria-label="Armas"></section></div><aside class="panel" id="panel" aria-label="Item selecionado"></aside></div></main>`;
  }

  /* ---------------- marca ---------------- */
  const TOKENS = [['--bg', 'Fundo'], ['--surface', 'Superfície'], ['--surface-2', 'Elevada'], ['--line', 'Linha'], ['--text', 'Texto'], ['--muted', 'Texto secundário'], ['--accent', 'Carmim'], ['--leather', 'Couro / tabaco'], ['--ok', 'Online'], ['--warn', 'Atenção']];
  function brand(cfg) {
    const f = cfg.fonts;
    return `<section class="spec" id="marca"><div class="container">
      ${cfg.noKicker ? '' : `<h2 class="sec">Direção ${cfg.n} · ${esc(cfg.name)}</h2>`}
      <div class="spec-title">${esc(cfg.headline)}</div>
      <p class="spec-lead">${cfg.rationale}</p>
      ${cfg.brandHTML ? cfg.brandHTML : `<div class="spec-block"><h2 class="sec">Wordmark e variações</h2><div class="wm-grid">
        <div class="wm-card"><div class="stage"><span class="wm xl">Carmine</span></div><div class="cap">PRINCIPAL · ${esc(f.display.name)}</div></div>
        <div class="wm-card"><div class="stage"><span class="wm lg wm-saint"><small>Saint</small><span>Carmine</span></span></div><div class="cap">SAINT CARMINE · assinatura completa</div></div>
        <div class="wm-card"><div class="stage"><span class="wm lg wm-st"><em>St.</em>Carmine</span></div><div class="cap">ST. CARMINE · forma curta</div></div>
        <div class="wm-card inv"><div class="stage"><span class="wm lg">Carmine</span></div><div class="cap">SOBRE CARMIM</div></div></div></div>
      <div class="spec-block"><h2 class="sec">Monograma e favicon</h2><div class="mono-row">
        <figure><span class="mono">C</span><figcaption class="mono-cap">96 · avatar</figcaption></figure>
        <figure><span class="mono s64">C</span><figcaption class="mono-cap">64</figcaption></figure>
        <figure><span class="mono s32">C</span><figcaption class="mono-cap">32 · favicon</figcaption></figure>
        <figure><span class="mono s16">C</span><figcaption class="mono-cap">16 · aba</figcaption></figure>
        <figure><span class="mono alt">C</span><figcaption class="mono-cap">variante neutra</figcaption></figure></div></div>
      `}
      <div class="spec-block"><h2 class="sec">Tokens de cor · escuro quente (padrão) e papel creme</h2><div class="pal-wrap">
        ${['dark', 'light'].map((t) => `<div class="pal" data-theme="${t}"><h3>${t === 'dark' ? 'Escuro quente · padrão' : 'Claro · papel creme'}</h3><div class="sw-list">${TOKENS.map((k) => `<div class="sw"><i style="background:var(${k[0]})"></i><div><b>${k[1]}</b><span data-tok="${k[0]}">${k[0]}</span></div></div>`).join('')}</div></div>`).join('')}</div></div>
      <div class="spec-block"><h2 class="sec">Par tipográfico</h2><div class="type-pair">
        <div class="type-card"><div class="role">Wordmark e títulos · ${esc(f.display.name)}</div><div class="big" style="font-family:var(--font-display);font-weight:var(--wm-weight);font-style:var(--wm-style)">${f.display.sample}</div><p>${f.display.use}</p></div>
        <div class="type-card"><div class="role">Interface · ${esc(f.ui.name)}</div><div class="big" style="font-family:var(--font-ui);font-weight:600;font-size:34px">Retake · de_mirage</div><p>${f.ui.use}</p>
          <table class="num"><tr><td>Jogadores</td><td>10/10</td></tr><tr><td>Ping</td><td>12 ms</td></tr><tr><td>Float</td><td>0,0734</td></tr><tr><td>Seed</td><td>412</td></tr></table></div></div></div>
      ${cfg.extraSpec || ''}
    </div></section>`;
  }
  function paintHex() {
    document.querySelectorAll('.pal').forEach((p) => {
      const cs = getComputedStyle(p);
      p.querySelectorAll('[data-tok]').forEach((s) => { s.textContent = cs.getPropertyValue(s.dataset.tok).trim().toUpperCase(); });
    });
  }

  /* ---------------- interação ---------------- */
  function initS1() {
    const seg = document.getElementById('modeSeg');
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b));
      document.querySelectorAll('#srvList .srv').forEach((r) => { r.hidden = b.dataset.m !== 'all' && r.dataset.mode !== b.dataset.m; });
    });
    document.querySelectorAll('.filters .seg').forEach((s) => s.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      s.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b));
    }));
  }

  function initS2(cfg) {
    const state = { side: 'ct', sel: 'm4a4', st: {}, floats: {}, preset: 0 };
    const list = document.getElementById('wlist'), panel = document.getElementById('panel');
    const get = (id) => WEAPONS.find((w) => w.id === id);
    function drawList() {
      list.innerHTML = CAT_ORDER.map((c) => {
        const items = WEAPONS.filter((w) => w.cat === c && (w.side === 'both' || w.side === state.side));
        if (!items.length) return '';
        return `<div class="cat"><div class="cat-h"><span class="label"><b>${c}</b></span><span class="label num">${items.length}</span></div><div class="wgrid">${items.map((w) => `<button type="button" class="wcard" data-id="${w.id}" aria-pressed="${w.id === state.sel}">${(state.st[w.id] ?? w.st) ? '<span class="st">ST™</span>' : ''}${shape(w.cat, w.c1, w.c2, 'l' + w.id)}<div><b>${w.name}</b><span class="sk">${w.skin}</span></div></button>`).join('')}</div></div>`;
      }).join('');
    }
    function drawPanel() {
      const w = get(state.sel), f = state.floats[w.id] ?? w.float, st = state.st[w.id] ?? w.st;
      panel.innerHTML = `<div class="viewer">${shape(w.cat, w.c1, w.c2, 'v')}<span class="vlabel">Visualizador 3D</span><span class="vhint">Arraste para girar · espaço reservado</span></div>
      <div class="pbody">
        <div class="ptitle"><h2>${w.name} <span style="color:var(--muted);font-weight:400">|</span> ${w.skin}</h2><p>${wear(f)} · ${state.side === 'ct' ? 'Contra-Terroristas' : 'Terroristas'}</p></div>
        <div class="field"><div class="field-row"><label class="label" for="fl">Float</label><span class="val" id="flv">${f.toFixed(4).replace('.', ',')}</span></div>
          <input class="range" id="fl" type="range" min="0" max="1" step="0.0001" value="${f}"><div class="wear-scale"><span>NF</span><span>PU</span><span>TC</span><span>BD</span><span>VG</span></div></div>
        <div class="two"><div class="field"><label class="label" for="sd">Seed do padrão</label><input class="inp num" id="sd" inputmode="numeric" value="${w.seed}"></div>
          <div class="field"><span class="label">StatTrak™</span><button type="button" class="toggle" id="sttg" aria-pressed="${st}"><span>${st ? 'Ativado' : 'Desativado'}</span><span class="sw-t"></span></button></div></div>
        <div class="field"><label class="label" for="nt">Nametag</label><input class="inp" id="nt" maxlength="20" placeholder="Sem nome personalizado" value="${w.id === 'm4a4' ? 'Velha Guarda' : ''}"></div>
        <div class="field"><span class="label">Adesivos <span class="num">(2/4)</span></span><div class="slots">${STICKERS.map((s) => s ? `<div class="slot on"><div><i></i>${s}</div></div>` : '<div class="slot" aria-label="Slot vazio">+</div>').join('')}</div></div>
        <div class="field"><span class="label">Chaveiro (charm)</span><div class="slots"><div class="slot on"><div><i></i>Lanterna</div></div><div class="slot" aria-label="Slot vazio">+</div></div></div>
        <div class="field"><span class="label">Presets</span><div class="presets">${PRESETS.map((p, i) => `<button type="button" class="btn" data-p="${i}" aria-pressed="${i === state.preset}">${p}</button>`).join('')}<button type="button" class="btn btn-ghost" style="border-style:dashed">+ Novo</button></div></div>
      </div>
      <div class="pfoot"><button type="button" class="btn">Desfazer</button><button type="button" class="btn btn-primary">Salvar loadout</button></div>`;
    }
    function syncList() {
      list.querySelectorAll('.wcard').forEach((b) => {
        const w = get(b.dataset.id), on = state.st[w.id] ?? w.st; let t = b.querySelector('.st');
        b.setAttribute('aria-pressed', w.id === state.sel);
        if (on && !t) { t = document.createElement('span'); t.className = 'st'; t.textContent = 'ST™'; b.prepend(t); } else if (!on && t) t.remove();
      });
    }
    function draw(reason) {
      if (cfg.motion && reason === 'select') { syncList(); drawPanel(); } else { drawList(); drawPanel(); }
      if (cfg.onS2Draw) cfg.onS2Draw(reason || 'init');
    }
    list.addEventListener('click', (e) => { const b = e.target.closest('.wcard'); if (!b) return; state.sel = b.dataset.id; draw('select'); });
    panel.addEventListener('input', (e) => {
      if (e.target.id !== 'fl') return;
      const w = get(state.sel); state.floats[w.id] = parseFloat(e.target.value);
      panel.querySelector('#flv').textContent = state.floats[w.id].toFixed(4).replace('.', ',');
      panel.querySelector('.ptitle p').textContent = wear(state.floats[w.id]) + ' · ' + (state.side === 'ct' ? 'Contra-Terroristas' : 'Terroristas');
    });
    panel.addEventListener('click', (e) => {
      const t = e.target.closest('#sttg'), p = e.target.closest('[data-p]');
      if (t) {
        const w = get(state.sel); state.st[w.id] = !(state.st[w.id] ?? w.st);
        if (cfg.motion) { const on = state.st[w.id]; t.setAttribute('aria-pressed', on); t.firstElementChild.textContent = on ? 'Ativado' : 'Desativado'; syncList(); }
        else { draw(); panel.querySelector('#sttg').focus(); }
      }
      if (p) { state.preset = +p.dataset.p; panel.querySelectorAll('[data-p]').forEach((x) => x.setAttribute('aria-pressed', x === p)); }
    });
    document.getElementById('sideSeg').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      state.side = b.dataset.s;
      document.querySelectorAll('#sideSeg button').forEach((x) => x.setAttribute('aria-pressed', x === b));
      if (get(state.sel).side !== 'both' && get(state.sel).side !== state.side) state.sel = state.side === 'ct' ? 'm4a4' : 'ak47';
      draw('side');
    });
    draw('init');
  }

  /* ---------------- montagem ---------------- */
  window.Carmine = {
    mount(cfg) {
      let theme = 'dark';
      try { theme = localStorage.getItem('carmine-proto-theme') || 'dark'; } catch (e) {}
      document.documentElement.dataset.theme = theme;
      document.body.innerHTML = cfg.shell ? cfg.shell({ s1: screen1(cfg), s2: screen2(cfg) }) : `
        <div class="proto"><div class="container"><a href="index.html">← Comparativo</a><a href="#marca">Marca</a><a href="#tela1">Tela 1 · Servidores</a><a href="#tela2">Tela 2 · Loadout</a><span class="sp"></span><span class="tag">Direção ${cfg.n}</span>${cfg.protoExtra || ''}<button type="button" id="themeBtn" aria-pressed="false"></button></div></div>
        ${brand(cfg)}
        <div class="screen-label" id="tela1"><div class="container"><b>Tela 1</b> · Lista de servidores ao vivo</div></div>${screen1(cfg)}
        <div class="screen-label" id="tela2"><div class="container"><b>Tela 2</b> · Editor de loadout</div></div>${screen2(cfg)}`;
      const btn = document.getElementById('themeBtn');
      const paint = () => { const d = document.documentElement.dataset.theme === 'dark'; if (cfg.paintTheme) { cfg.paintTheme(btn, d); return; } btn.textContent = cfg.noGlyph ? (d ? 'Tema papel creme' : 'Tema escuro quente') : (d ? '☀ Tema papel creme' : '☾ Tema escuro quente'); btn.setAttribute('aria-pressed', !d); };
      btn.addEventListener('click', () => {
        const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        const apply = () => {
          document.documentElement.dataset.theme = next;
          try { localStorage.setItem('carmine-proto-theme', next); } catch (e) {}
          paint(); paintHex();
        };
        if (cfg.themeSwap) cfg.themeSwap(apply); else apply();
      });
      paint(); paintHex(); initS1(); initS2(cfg);
      if (cfg.onMount) cfg.onMount();
    },
    MAPS, MODES, SERVERS
  };
})();
