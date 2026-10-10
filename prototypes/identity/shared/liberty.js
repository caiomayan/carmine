/* Liberty Lab — interface do laboratório, telas e rodapé. Descartável. */
(function () {
  const L = Liberty, B = CarmineBrand, html = document.documentElement;
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => mq.matches || html.dataset.motion === 'reduced';
  const cssv = (n) => getComputedStyle(html).getPropertyValue(n).trim();
  const ms = (n) => parseFloat(cssv(n)) || 0;
  const fmt = (n) => n.toLocaleString('pt-BR');
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];

  /* ---------------- ícones (stroke 1.5, grade 16) ---------------- */
  const IC = {
    sun: '<circle cx="8" cy="8" r="2.8"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/>',
    moon: '<path d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8z"/>',
    search: '<circle cx="7" cy="7" r="4.7"/><path d="M10.6 10.6 14 14"/>',
    bell: '<path d="M4 11V7.2a4 4 0 0 1 8 0V11l1.2 1.4H2.8zM6.6 14.2h2.8"/>',
    copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="1"/><path d="M10.5 5.5V3.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/>',
    star: '<path d="M8 1.8l1.9 4 4.3.5-3.2 2.9.9 4.3L8 11.4 4.1 13.5 5 9.2 1.8 6.3l4.3-.5z"/>',
    pin: '<path d="M8 14.2s4.6-4.2 4.6-7.7a4.6 4.6 0 1 0-9.2 0c0 3.5 4.6 7.7 4.6 7.7z"/><circle cx="8" cy="6.5" r="1.6"/>',
    users: '<circle cx="6" cy="5.6" r="2.3"/><path d="M1.8 13.4c.3-2.4 2.1-3.8 4.2-3.8s3.9 1.4 4.2 3.8M10.6 3.6a2.2 2.2 0 0 1 0 4.2M11.4 9.8c1.7.3 2.8 1.6 3 3.6"/>',
    shield: '<path d="M8 1.8l5 1.8v4.2c0 3-2.2 5.2-5 6.4-2.8-1.2-5-3.4-5-6.4V3.6z"/>',
    clock: '<circle cx="8" cy="8" r="6"/><path d="M8 4.6V8l2.3 1.4"/>',
    map: '<path d="M1.8 3.6l4.2-1.6 4 1.6 4.2-1.6v10.8l-4.2 1.6-4-1.6-4.2 1.6zM6 2v10.8M10 3.6v10.8"/>',
    check: '<path d="M3 8.4l3.2 3.2L13 4.6"/>',
    alert: '<path d="M8 2.2l6.2 11H1.8z"/><path d="M8 6.6v3.2M8 11.7v.1"/>',
    x: '<path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/>',
    crown: '<path d="M2 12.6l-.4-7 3.5 3L8 3.6l2.9 5 3.5-3-.4 7z"/>',
    link: '<path d="M6.8 9.2a2.6 2.6 0 0 0 3.7 0l2.2-2.2a2.6 2.6 0 0 0-3.7-3.7l-.8.8M9.2 6.8a2.6 2.6 0 0 0-3.7 0L3.3 9a2.6 2.6 0 0 0 3.7 3.7l.8-.8"/>'
  };
  const ic = (n, c) => `<svg class="ic ${c || ''}" viewBox="0 0 16 16" aria-hidden="true">${IC[n]}</svg>`;
  const sig = (lv) => `<svg class="ic sig" viewBox="0 0 16 16" role="img" aria-label="Sinal ${lv} de 3"><rect class="${lv >= 1 ? 'f' : 'f d'}" x="2" y="10" width="2.8" height="4" rx=".5"/><rect class="${lv >= 2 ? 'f' : 'f d'}" x="6.6" y="6.5" width="2.8" height="7.5" rx=".5"/><rect class="${lv >= 3 ? 'f' : 'f d'}" x="11.2" y="3" width="2.8" height="11" rx=".5"/></svg>`;

  /* ---------------- movimento (mesma base da 2c) ---------------- */
  function enter(els) {
    els.forEach((el, i) => {
      el.style.setProperty('--i', i);
      el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter');
      el.addEventListener('animationend', (e) => { if (e.target === el) el.classList.remove('enter'); }, { once: true });
    });
  }
  function roll(el, to, dir) {
    const from = el.dataset.v ?? el.textContent; to = String(to);
    el.dataset.v = to;
    if (from === to) return;
    if (reduced()) { el.textContent = to; return; }
    const d = ms('--dur-base'), ease = cssv('--ease-out'), up = dir > 0;
    el.innerHTML = `<span>${from}</span><span>${to}</span>`;
    const [a, b] = el.children;
    a.animate([{ transform: 'none', opacity: 1 }, { transform: `translateY(${up ? '-60%' : '60%'})`, opacity: 0 }], { duration: d, easing: ease, fill: 'forwards' });
    b.animate([{ transform: `translateY(${up ? '60%' : '-60%'})`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: d, easing: ease, fill: 'both' })
      .onfinish = () => { if (el.dataset.v === to) el.textContent = to; };
  }
  function tween(el, to) {
    const from = (el._v ?? parseInt(el.textContent.replace(/\D/g, ''), 10)) || 0, dur = ms('--dur-count');
    el._v = to; cancelAnimationFrame(el._raf);
    if (!dur || from === to) { el.textContent = fmt(to); return; }
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur), e = k === 1 ? 1 : 1 - Math.pow(2, -10 * k);
      el.textContent = fmt(Math.round(from + (to - from) * e));
      if (k < 1) el._raf = requestAnimationFrame(step);
    };
    el._raf = requestAnimationFrame(step);
  }
  function initSegs(root) {
    $$('.seg', root).forEach((seg) => {
      if ($('.thumb', seg)) return;
      const t = document.createElement('i'); t.className = 'thumb'; t.setAttribute('aria-hidden', 'true'); seg.prepend(t);
      const place = () => {
        const b = $('[aria-pressed=true]', seg); if (!b || !b.offsetWidth) return;
        if (!seg._placed) { // primeira medida (view estava oculta): posiciona sem animar
          seg.classList.remove('thumb-ready');
          seg.style.setProperty('--x', b.offsetLeft + 'px'); seg.style.setProperty('--sx', b.offsetWidth / 100);
          void seg.offsetWidth; seg._placed = true;
          requestAnimationFrame(() => seg.classList.add('thumb-ready')); return;
        }
        seg.style.setProperty('--x', b.offsetLeft + 'px'); seg.style.setProperty('--sx', b.offsetWidth / 100);
      };
      seg.classList.add('has-thumb'); place();
      new MutationObserver(place).observe(seg, { subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });
      new ResizeObserver(place).observe(seg);
      if (document.fonts) document.fonts.ready.then(place);
    });
  }

  /* ---------------- cabeçalho, rodapé ---------------- */
  const NAVL = [['Servidores', '#servidores'], ['Loadout', '#loadout'], ['Partidas', '#'], ['Ranking', '#'], ['Comunidade', '#conteudo']];
  const headerHTML = (active) => `<header class="app-header"><div class="container hdr">
    <a class="wm wm-img" href="#servidores" aria-label="Carmine">${B.refined()}</a>
    <nav class="nav" aria-label="Principal">${NAVL.map((n) => `<a href="${n[1]}"${n[0] === active ? ' aria-current="page"' : ''}>${n[0]}</a>`).join('')}</nav>
    <div class="hdr-end">
      <label class="search">${ic('search')}<input type="search" placeholder="Buscar servidor ou jogador" aria-label="Buscar"></label>
      <span class="online"><span class="dot"></span><span class="num" data-total="players">2.431</span> online</span>
      <button class="ibtn theme-ic js-theme" type="button" aria-label="Alternar entre tema escuro e papel">${ic('sun', 'sun')}${ic('moon', 'moon')}</button>
      <span class="avatar" title="Caio">CA</span>
    </div></div></header>`;

  const footerHTML = `<footer class="app-foot" id="foot"><div class="container">
    <div class="foot-top">
      <div class="foot-brand"><div class="row">${B.seal(44, 'compact')}${B.refined()}</div>
        <p>Servidores comunitários de CS2 no Brasil. Retake, deathmatch e 5v5 casual, com as suas skins em todos eles.</p></div>
      <nav class="foot-col" aria-label="Jogar"><h3>Jogar</h3><ul><li><a href="#servidores">Servidores</a></li><li><a href="#loadout">Inventário</a></li><li><a href="#">Partidas</a></li></ul></nav>
      <nav class="foot-col" aria-label="Comunidade"><h3>Comunidade</h3><ul><li><a href="#conteudo">Regras de conduta</a></li><li><a href="#">Discord</a></li><li><a href="#">Ranking</a></li></ul></nav>
      <nav class="foot-col" aria-label="Legal"><h3>Legal</h3><ul><li><a href="#">Termos de uso</a></li><li><a href="#">Política de privacidade</a></li><li><a href="#">Contato e exclusão de dados</a></li></ul></nav>
    </div>
    <div class="foot-status" role="status"><span class="live"><i class="live-dot"></i>Ao vivo</span><span><b>126</b> servidores online</span><span class="sep"></span><span><b class="num" data-total="players">2.431</b> jogadores</span><span class="sep"></span><span>latência média <b>14 ms</b></span><span class="sep"></span><span class="info-ic">${ic('pin')}Servidores em São Paulo</span></div>
    <div class="foot-base"><p>© 2026 Carmine. Todos os direitos reservados.</p><p>Projeto independente da comunidade. Counter-Strike 2 e Valve são marcas da Valve Corporation; a Carmine não é afiliada nem endossada por ela.</p></div>
  </div></footer>`;

  /* ---------------- página de conteúdo longo ---------------- */
  const SECT = ['Respeito entre jogadores', 'Jogo limpo', 'Chat de texto e de voz', 'Nomes, nametags e adesivos', 'Contas e acesso', 'Penalidades', 'Denúncias e recursos', 'Mudanças nesta política'];
  const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
  const article = `<p class="lede">Os servidores da Carmine são de quem joga neles. Estas regras existem para que um retake às onze da noite continue divertido, justo e seguro para quem entra pela primeira vez.</p>
  <h2 id="r1"><span class="rn">I</span>Respeito entre jogadores</h2>
  <p>Trate os outros como você gostaria de ser tratado numa partida sem moderação. Provocação leve entre amigos faz parte do jogo; perseguir, humilhar ou insistir depois de um pedido para parar, não.</p>
  <ul><li>Nada de ofensas pessoais, discriminação, assédio ou ameaças, dentro ou fora do jogo.</li><li>Não exponha dados pessoais de ninguém (nome, endereço, perfis, fotos).</li><li>Não incite brigas entre comunidades nem organize ataques a servidores ou jogadores.</li></ul>
  <h2 id="r2"><span class="rn">II</span>Jogo limpo</h2>
  <p>Vantagem injusta estraga a partida de dez pessoas ao mesmo tempo. Por isso a regra aqui é objetiva: qualquer software que altere o jogo ou dê informação que ele não daria está proibido, mesmo que seja “só para testar”.</p>
  <h3>O que conta como trapaça</h3>
  <ul><li>Cheats, wallhack, aimbot, triggerbot, scripts de recuo e macros que automatizem mira ou disparo.</li><li>Ghosting: passar informação de uma partida em andamento a quem não está nela.</li><li>Explorar falhas de mapa ou do servidor em vez de reportá-las.</li><li>Boosting de ranking, smurf para jogar contra iniciantes e derrota combinada.</li></ul>
  <p>Nosso sistema de detecção analisa demos e comportamento de forma automática, e todos os casos duvidosos passam por revisão humana antes de qualquer punição permanente.</p>
  <h2 id="r3"><span class="rn">III</span>Chat de texto e de voz</h2>
  <p>O chat é para coordenar o round. Spam, caixa-alta contínua, músicas no microfone e divulgação de outros servidores atrapalham todo mundo e podem silenciar você.</p>
  <blockquote>“A melhor call é a curta: onde, quantos, quanto de vida.”<cite>Guia de comunicação · equipe de moderação</cite></blockquote>
  <h2 id="r4"><span class="rn">IV</span>Nomes, nametags e adesivos</h2>
  <p>Nomes de perfil, nametags de armas e combinações de adesivos aparecem para os outros jogadores e seguem as mesmas regras do chat. Conteúdo ofensivo, político-partidário ou que imite a identidade de moderadores e da equipe é removido sem aviso.</p>
  <p>Se um nome for alterado pela moderação, você recebe uma notificação e pode escolher outro na hora, sem perder o acesso.</p>
  <h2 id="r5"><span class="rn">V</span>Contas e acesso</h2>
  <p>Cada pessoa joga com a própria conta. Compartilhar acesso, vender ou comprar contas e usar contas alternativas para contornar uma punição levam ao banimento de todas elas. Menores de 13 anos não podem criar conta.</p>
  <h2 id="r6"><span class="rn">VI</span>Penalidades</h2>
  <p>A punição acompanha a gravidade e o histórico. Comportamentos que colocam outras pessoas em risco pulam etapas.</p>
  <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Infração</th><th>1ª ocorrência</th><th>Reincidência</th></tr></thead><tbody>
    <tr><td>Spam e chat abusivo</td><td>Silenciamento de 24 h</td><td>Silenciamento de 7 dias</td></tr>
    <tr><td>Ofensas e assédio</td><td>Suspensão de 3 dias</td><td>Suspensão de 30 dias</td></tr>
    <tr><td>Ghosting e exploração de falhas</td><td>Suspensão de 14 dias</td><td>Banimento permanente</td></tr>
    <tr><td>Cheats e boosting</td><td>Banimento permanente</td><td>Não se aplica</td></tr>
    <tr><td>Ameaças e exposição de dados</td><td>Banimento permanente</td><td>Não se aplica</td></tr></tbody></table></div>
  <h2 id="r7"><span class="rn">VII</span>Denúncias e recursos</h2>
  <p>Para denunciar, use o botão no placar durante a partida ou abra o perfil da pessoa depois. Anexamos automaticamente os últimos minutos de demo e do chat.</p>
  <ol><li>Abra a denúncia e escolha o motivo mais próximo.</li><li>Descreva o que aconteceu em uma ou duas frases (opcional, mas ajuda).</li><li>Acompanhe o resultado em “Minhas denúncias”: respondemos em até 72 horas.</li></ol>
  <p>Se você foi punido e discorda, peça revisão em até 30 dias pela página da punição. Uma pessoa diferente da que aplicou a medida analisa o caso e responde por escrito.</p>
  <h2 id="r8"><span class="rn">VIII</span>Mudanças nesta política</h2>
  <p>Podemos atualizar estas regras conforme a comunidade cresce. Mudanças relevantes são avisadas no Discord e no topo do site com pelo menos sete dias de antecedência.</p>
  <div class="note">${ic('clock')}<p style="margin:0;opacity:1">Versão 1.2, em vigor desde 3 de outubro de 2026. As versões anteriores ficam disponíveis a pedido pelo contato de privacidade.</p></div>`;
  const docHTML = `${headerHTML('Comunidade')}<main class="container"><div class="page-head"><div><h1>Regras de conduta</h1><p class="sub">Versão 1.2 · atualizada em 3 de outubro de 2026 · leitura de 6 min</p></div></div>
    <div class="doc"><nav class="toc" aria-label="Neste documento"><h2>Neste documento</h2>${SECT.map((s, i) => `<a href="#r${i + 1}" data-toc="r${i + 1}"><span>${roman[i]}</span>${s}</a>`).join('')}</nav>
    <article class="article">${article}</article></div></main>`;

  /* ---------------- laboratório ---------------- */
  const SL = [
    { k: 'black', label: 'Luminosidade do preto', min: 0, max: 24, step: 1, sc: 1, hint: '0 é preto absoluto. Acima de 12 já vira grafite.' },
    { k: 'warm', label: 'Calor (0–3%)', min: 0, max: 3, step: 0.1, sc: 1, hint: 'Inclina a escala para o âmbar. 1% é quase imperceptível; 3% já se nota.' },
    { k: 'cream', label: 'Intensidade do creme no branco', min: 0, max: 100, step: 1, sc: 100, hint: '0% é branco puro; 100% é papel de jornal (#F3EBD6).' },
    { k: 'contrast', label: 'Contraste da escala de cinzas', min: 60, max: 140, step: 1, sc: 100, hint: 'Afasta ou aproxima os textos do fundo (principal, secundário, desabilitado).' },
    { k: 'mids', label: 'Presença dos tons médios', min: 60, max: 200, step: 1, sc: 100, hint: 'Separação entre fundo, superfícies e linhas. Mais alto = tons médios mais presentes.' },
    { k: 'grain', label: 'Intensidade do grão', min: 0, max: 100, step: 1, sc: 100, hint: 'Película sobre toda a interface. 0% desliga.' }
  ];
  const sliderOut = (k, p) => {
    if (k === 'black') return `${p.black}/255 · ${L.tokens(p, 'dark')['--bg']}`;
    if (k === 'warm') return p.warm.toFixed(1) + '%';
    return Math.round(p[k] * 100) + '%';
  };
  const slider = (s) => `<div class="ctl"><div class="field-row"><label class="label" for="c-${s.k}">${s.label}</label><output class="val num" id="o-${s.k}" for="c-${s.k}"></output></div>
    <input class="range" id="c-${s.k}" data-k="${s.k}" type="range" min="${s.min}" max="${s.max}" step="${s.step}"><small>${s.hint}</small></div>`;
  const QUICK = [['2c · 1280 / 24', 1280, 24], ['Mais largo · 1440 / 24', 1440, 24], ['Mais respiro · 1280 / 80', 1280, 80], ['Equilíbrio · 1360 / 56', 1360, 56]];

  const controls = `<aside class="ctls" aria-label="Controles do laboratório">
    <div class="grp"><h3>Paleta base</h3><div class="pre-btns" id="preBtns">${Object.entries(L.PRESETS).map(([k, v]) => `<button class="btn" type="button" data-pre="${k}" aria-pressed="false">${v.name}</button>`).join('')}</div>
      <small id="preState" style="color:var(--muted);font-size:11.5px;line-height:1.4"></small></div>
    <div class="grp"><h3>Cor e película</h3>${SL.map(slider).join('')}
      <div class="btn-row"><button class="btn btn-sm" type="button" id="reset">Restaurar preset</button></div></div>
    <div class="grp"><h3>Container global</h3>
      <div class="ctl"><div class="field-row"><label class="label" for="c-container">Largura máxima do conteúdo</label><output class="val num" id="o-container" for="c-container"></output></div><input class="range" id="c-container" type="range" min="1040" max="1600" step="20"><small>Quanto o conteúdo pode crescer em telas grandes.</small></div>
      <div class="ctl"><div class="field-row"><label class="label" for="c-margin">Margem lateral mínima</label><output class="val num" id="o-margin" for="c-margin"></output></div><input class="range" id="c-margin" type="range" min="16" max="120" step="4"><small>Respiro entre a borda da tela e o conteúdo. No celular vale 25% do excedente sobre 16 px.</small></div>
      <div class="quick" id="quick">${QUICK.map((q) => `<button class="btn" type="button" data-c="${q[1]}" data-m="${q[2]}">${q[0]}</button>`).join('')}</div>
      <button class="chk" type="button" id="guides" aria-pressed="false"><span class="box">${ic('check')}</span><span>Mostrar guias do container<small>Duas linhas verticais nas bordas do conteúdo, sobre qualquer tela.</small></span></button></div>
    <div class="grp"><h3>Exportar</h3><div class="btn-row"><button class="btn btn-primary" type="button" id="expBtn2">Exportar tokens</button></div><small id="copied" class="copied" role="status"></small></div>
  </aside>`;

  const sample = (th) => `<div class="sample" data-theme="${th}"><div class="tn"><span>${th === 'dark' ? 'Escuro' : 'Claro · papel'}</span><span data-hexbg></span></div>
    ${B.refined()}
    <div class="ramp">${[['--bg', 'Fundo'], ['--surface', 'Superfície'], ['--surface-2', 'Elevada'], ['--line', 'Linha'], ['--line-strong', 'Linha forte'], ['--faint', 'Desabilitado'], ['--muted', 'Secundário'], ['--text', 'Principal']].map((t) => `<div><i style="background:var(${t[0]})"></i><b>${t[1]}</b><span data-tok="${t[0]}"></span></div>`).join('')}</div>
    <div class="txt-lv"><p class="t1"><span>Texto principal · Retake #01</span><span data-tok="--text"></span></p><p class="t2"><span>Texto secundário · São Paulo · 128 tick</span><span data-tok="--muted"></span></p><p class="t3"><span>Desabilitado · servidor em manutenção</span><span data-tok="--faint"></span></p></div>
    <div class="mtab"><div class="mrow"><span class="chip retake">Retake</span><span><b>Carmine Retake #01</b><br><span class="m">de_mirage</span></span><span class="num">9/10</span><span class="info-ic">${sig(3)}<span class="num">12 ms</span></span></div>
      <div class="mrow"><span class="chip dm">Deathmatch</span><span><b>Carmine DM #02</b><br><span class="m">de_anubis</span></span><span class="num">21/24</span><span class="info-ic">${sig(2)}<span class="num">38 ms</span></span></div></div>
    <div class="ctl-row"><button class="btn btn-primary" type="button">Conectar</button><button class="btn" type="button">Entrar</button><button class="btn" type="button" disabled>Indisponível</button><button class="ibtn" type="button" aria-label="Copiar IP">${ic('copy')}</button><input class="inp" placeholder="Buscar servidor" aria-label="Campo de exemplo"></div>
  </div>`;

  const presetCard = (k) => {
    const half = (th) => { const t = L.tokens(L.PRESETS[k], th); return `<div class="half" style="${L.decl(t, ['--grain', 'color-scheme', '--grain-op'])}">${B.refined()}<div class="bars"><i style="background:var(--surface)"></i><i style="background:var(--surface-2)"></i><i style="background:var(--line-strong)"></i></div><p>Principal<span>Secundário</span><em>Desabilitado</em></p><div class="pbtn">Conectar</div></div>`; };
    const p = L.PRESETS[k];
    return `<button class="pcard" type="button" data-pre="${k}" aria-pressed="false"><div class="halves">${half('dark')}${half('light')}</div><h3>${p.name}<small>${p.black}/255 · ${p.warm}% · ${Math.round(p.cream * 100)}%</small></h3><p class="d">${p.desc}</p></button>`;
  };

  const stChip = {
    live: '<span class="st st-live"><i class="live-dot"></i>Ao vivo</span>',
    full: `<span class="st st-full">${ic('users')}Lotado</span>`,
    off: '<span class="st st-off"><i class="hole"></i>Offline</span>',
    err: `<span class="st st-err">${ic('alert')}Erro</span>`,
    ok: `<span class="st st-ok">${ic('check')}Sucesso</span>`,
    vip: `<span class="st st-vip">${ic('crown')}VIP</span>`
  };
  const fcell = (th) => `<div class="sample fcell" data-theme="${th}"><div class="tn"><span>${th === 'dark' ? 'Escuro' : 'Claro · papel'}</span></div><div class="mtab">
    <div class="mrow">${stChip.live}<div><b>Retake #01</b> <span class="m">9/10 · 12 ms</span><span class="mbar"><i style="width:90%"></i></span></div></div>
    <div class="mrow">${stChip.full}<div><b>Retake #02</b> <span class="m">10/10 · fila de 3</span><span class="mbar"><i class="full" style="width:100%"></i></span></div></div>
    <div class="mrow" style="color:var(--faint)">${stChip.off}<div><b>Retake #06</b> <span class="m" style="color:inherit">sem resposta há 4 min</span><span class="mbar dashed"></span></div></div>
    <div class="mrow">${stChip.err}<div><b>Não foi possível conectar.</b> <span class="m">Verifique sua rede e tente de novo.</span></div></div>
    <div class="mrow">${stChip.ok}<div><b>Loadout salvo.</b> <span class="m">Vale a partir do próximo round.</span></div></div>
    <div class="mrow">${stChip.vip}<div><b>Fila prioritária</b> <span class="m">acesso antecipado a mapas</span></div></div></div></div>`;
  const LEG = [
    ['live', 'Ao vivo', 'Ponto cheio com pulso discreto; rótulo em versalete peso 650. Sem moldura: o movimento é o sinal.'],
    ['full', 'Lotado', 'Preenchido: texto invertido sobre o tom principal. A barra de jogadores vira hachura diagonal a 100%.'],
    ['off', 'Offline', 'Ponto vazado, moldura tracejada e tom apagado. É o único estado sem peso nenhum.'],
    ['err', 'Erro', 'Ícone de alerta, moldura de 2 px e hachura fina. É o mais pesado do sistema, então não precisa de cor para chamar atenção.'],
    ['ok', 'Sucesso', 'Ícone de check, contorno de 1 px e cantos arredondados. Leve, passageiro: some em poucos segundos.'],
    ['vip', 'VIP', 'Filete duplo (art déco) e coroa, tracking largo. Distinção por forma, nunca por brilho ou dourado.']
  ];

  const icBefore = `<div class="ba-col"><h3>Antes <span>tudo em caixa</span></h3>
    <div class="ba-blk"><b>Cabeçalho</b><div class="fake-hdr"><span class="tile">${ic('search')}</span><span class="sp"></span><span class="tile">${ic('bell')}</span><span class="tile">${ic('sun')}</span><span class="avatar">CA</span></div></div>
    <div class="ba-blk"><b>Linha de servidor</b><div class="fake-meta"><span><span class="tile">${ic('pin')}</span>São Paulo</span><span><span class="tile">${ic('users')}</span>9/10</span><span><span class="tile">${ic('clock')}</span>12 ms</span><span><span class="tile">${ic('shield')}</span>VAC</span></div></div>
    <div class="ba-blk"><b>Ações do servidor</b><div class="ctl-row"><span class="tile sq">${ic('copy')}</span><span class="tile sq">${ic('star')}</span><button class="btn btn-primary btn-sm" type="button">Conectar</button></div></div></div>`;
  const icAfter = `<div class="ba-col"><h3>Depois <span>caixa só no que se clica</span></h3>
    <div class="ba-blk"><b>Cabeçalho</b><div class="fake-hdr"><button class="ibtn" type="button" aria-label="Buscar">${ic('search')}</button><span class="sp"></span><button class="ibtn" type="button" aria-label="Notificações">${ic('bell')}</button><button class="ibtn" type="button" aria-label="Tema">${ic('sun')}</button><span class="avatar">CA</span></div></div>
    <div class="ba-blk"><b>Linha de servidor</b><div class="fake-meta"><span class="info-ic">${ic('pin')}São Paulo</span><span class="info-ic">${ic('users')}9/10</span><span class="info-ic">${sig(3)}12 ms</span><span class="info-ic">${ic('shield')}VAC</span></div></div>
    <div class="ba-blk"><b>Ações do servidor</b><div class="ctl-row"><button class="ibtn" type="button" aria-label="Copiar IP">${ic('copy')}</button><button class="ibtn" type="button" aria-pressed="true" aria-label="Favorito">${ic('star')}</button><button class="btn btn-primary btn-sm" type="button">Conectar</button></div></div></div>`;

  const lab = `<div class="container lab-head"><h1>Liberty Lab</h1><p>Preto e branco de filme de máfia dos anos 60, sem nenhum acento. Mexa nos controles e as três telas abaixo (Servidores, Loadout e Conteúdo) mudam junto, com o rodapé no fim de cada uma. Tudo aqui é exploração: nada disso é código de produto.</p></div>
  <div class="container lab-wrap">${controls}
  <div class="lab-main">
    <section class="lab-sec"><h2>Amostra viva <small>os dois temas ao mesmo tempo</small></h2><div class="pair">${sample('dark')}${sample('light')}</div></section>
    <section class="lab-sec"><h2>Presets <small>clique para aplicar</small></h2><p class="lead">Cada card mostra o preset nos dois temas. O claro é o negativo do escuro: o papel vira o fundo e o preto vira a tinta, com a mesma escala.</p><div class="pgrid">${Object.keys(L.PRESETS).map(presetCard).join('')}</div></section>
    <section class="lab-sec"><h2>Contraste WCAG <small>calculado ao vivo</small></h2><p class="lead">Razão de contraste para texto principal, secundário e desabilitado em cada superfície. Meta: 4,5:1 para AA e 7:1 para AAA em texto; 3:1 para linhas e ícones. Desabilitado é isento pela WCAG, mas mostramos o número para você ver o quanto ele ainda se lê.</p>
      <div class="pair"><div class="ct-wrap" id="ctDark"></div><div class="ct-wrap" id="ctLight"></div></div></section>
    <section class="lab-sec"><h2>Container e margem <small id="diagTitle"></small></h2><p class="lead">Largura e margem são controles separados: a largura limita o quanto o conteúdo cresce; a margem garante o respiro mínimo nas laterais. Em telas largas só a largura aparece; em telas médias, só a margem.</p><div class="diag"><div class="vp" id="vp"><div class="ct-box" id="ctBox">Conteúdo</div></div><p id="diagTxt"></p></div></section>
    <section class="lab-sec"><h2>Estados funcionais, só com neutros <small>peso, ícone, preenchido ou contorno, padrão</small></h2>
      <p class="lead">Sem verde, vermelho ou amarelo: cada estado se distingue por forma e peso, então também funciona para daltonismo e em impressão P&amp;B.</p>
      <div class="fpair">${fcell('dark')}${fcell('light')}</div>
      <div class="legend">${LEG.map((l) => `<div>${stChip[l[0]]}<p>${l[2]}</p></div>`).join('')}</div>
      <button class="chk" type="button" id="dangerAlt" aria-pressed="false" style="margin-top:18px"><span class="box">${ic('check')}</span><span>Alternativa: um único tom funcional, só para erro<small>Liga um vermelho-tijolo bem dessaturado apenas no ícone e na moldura do erro. Todo o resto segue neutro.</small></span></button>
      <p class="alt-note" id="altNote"></p></section>
    <section class="lab-sec"><h2>Ícones <small>antes e depois</small></h2><p class="lead">Regra: caixa é para o que se clica. Ícone informativo fica solto, em tom secundário, alinhado ao texto. O ping vira o ícone de sinal (3 níveis) no lugar do ponto colorido.</p>
      <div class="ba">${icBefore}${icAfter}</div>
      <div class="rules"><div><b>Ação</b><span class="ics"><span class="ibtn">${ic('sun')}</span><span class="ibtn">${ic('bell')}</span><span class="ibtn">${ic('copy')}</span></span><p>Caixa com contorno de 1 px, 34 px (40 px no toque). Hover preenche; ativo inverte. Sempre com rótulo acessível.</p></div>
        <div><b>Informação</b><span class="ics info-ic">${ic('pin')}${ic('users')}${sig(3)}${ic('shield')}</span><p>Solto: 14–16 px, tom secundário, no mesmo alinhamento do texto. Sem fundo, sem contorno, sem hover.</p></div>
        <div><b>Estado</b><span class="ics"><i class="dot"></i><i class="dot warn"></i></span><p>Forma em vez de cor: cheio = ativo, vazado = ausente. Também sem caixa.</p></div></div></section>
    <section class="lab-sec exp"><h2>Exportar <small>tokens dos dois temas + container</small></h2><div class="btn-row"><button class="btn btn-primary" type="button" id="expBtn3">Copiar tokens</button><span class="copied" id="copied3" role="status"></span></div><pre id="expPre" tabindex="0" aria-label="Tokens exportados"></pre></section>
  </div></div>`;

  /* ---------------- sincronização da interface do laboratório ---------------- */
  let base = 'negativo';
  function sync() {
    const s = L.state(), p = s.p;
    if (s.preset !== 'custom') base = s.preset;
    SL.forEach((d) => {
      const el = $('#c-' + d.k), o = $('#o-' + d.k);
      if (!el) return;
      if (document.activeElement !== el) el.value = d.sc === 1 ? p[d.k] : Math.round(p[d.k] * d.sc);
      o.textContent = sliderOut(d.k, p);
    });
    const cEl = $('#c-container'), mEl = $('#c-margin');
    if (document.activeElement !== cEl) cEl.value = s.container;
    if (document.activeElement !== mEl) mEl.value = s.margin;
    $('#o-container').textContent = s.container + ' px'; $('#o-margin').textContent = s.margin + ' px';
    $$('[data-pre]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.pre === s.preset));
    $('#preState').textContent = s.preset === 'custom' ? `Personalizado (a partir de ${L.PRESETS[base].name}).` : L.PRESETS[s.preset].desc;
    $$('#quick .btn').forEach((b) => b.setAttribute('aria-pressed', +b.dataset.c === s.container && +b.dataset.m === s.margin));
    $('#guides').setAttribute('aria-pressed', s.guides); $('#dangerAlt').setAttribute('aria-pressed', s.danger);
    cancelAnimationFrame(sync.r); sync.r = requestAnimationFrame(heavy);
  }
  function ctTable(th) {
    const s = L.state(), t = L.tokens(s.p, th, s.danger), name = th === 'dark' ? 'Escuro' : 'Claro · papel';
    const row = (label, fg, bg, kind) => {
      const r = L.ratio(t[fg], t[bg]);
      let aa, aaa;
      if (kind === 'dis') { aa = `<span class="badge na">isento</span>`; aaa = `<span class="badge na">isento</span>`; }
      else if (kind === 'nt') { aa = r >= 3 ? `<span class="badge">${ic('check')}3:1</span>` : `<span class="badge no">${ic('x')}3:1</span>`; aaa = '<span class="badge na">n/a</span>'; }
      else { aa = r >= 4.5 ? `<span class="badge">${ic('check')}Passa</span>` : `<span class="badge no">${ic('x')}Falha</span>`; aaa = r >= 7 ? `<span class="badge">${ic('check')}Passa</span>` : `<span class="badge no">${ic('x')}Falha</span>`; }
      return `<tr><td><span class="sw" style="color:${t[fg]};background:${t[bg]}">Aa</span></td><td>${label}</td><td class="n">${r.toFixed(2).replace('.', ',')}:1</td><td>${aa}</td><td>${aaa}</td></tr>`;
    };
    const bgs = [['--bg', 'fundo'], ['--surface', 'superfície'], ['--surface-2', 'elevada']];
    const rows = [['--text', 'Principal', ''], ['--muted', 'Secundário', ''], ['--faint', 'Desabilitado', 'dis']].flatMap(([fg, n, kind]) => bgs.map(([bg, b]) => row(`${n} sobre ${b}`, fg, bg, kind)));
    rows.push(row('Linha forte sobre fundo', '--line-strong', '--bg', 'nt'), row('Botão primário (rótulo)', '--bg', '--text', ''));
    if (s.danger) rows.push(row('Erro (ícone) sobre fundo', '--danger', '--bg', 'nt'));
    return `<table class="ct"><caption>${name} · fundo ${t['--bg']}</caption><thead><tr><th></th><th>Combinação</th><th>Razão</th><th>AA</th><th>AAA</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
  }
  function heavy() {
    const s = L.state();
    ['dark', 'light'].forEach((th) => {
      const t = L.tokens(s.p, th, s.danger);
      $$(`.sample[data-theme=${th}] [data-tok]`).forEach((e) => { e.textContent = t[e.dataset.tok]; });
      const h = $(`.sample[data-theme=${th}] [data-hexbg]`); if (h) h.textContent = t['--bg'];
    });
    $('#ctDark').innerHTML = ctTable('dark'); $('#ctLight').innerHTML = ctTable('light');
    const dk = L.tokens(s.p, 'dark', s.danger), lt = L.tokens(s.p, 'light', s.danger);
    $('#altNote').innerHTML = s.danger
      ? `<b>Ligado.</b> Erro usa <span class="sw-dang" style="background:${dk['--danger']}"></span>${dk['--danger']} no escuro (${L.ratio(dk['--danger'], dk['--bg']).toFixed(1).replace('.', ',')}:1 sobre o fundo) e <span class="sw-dang" style="background:${lt['--danger']}"></span>${lt['--danger']} no claro (${L.ratio(lt['--danger'], lt['--bg']).toFixed(1).replace('.', ',')}:1). O rótulo continua em tom principal, então a cor só reforça.`
      : '<b>Desligado.</b> O erro se distingue só por ícone, moldura de 2 px e hachura. Ligue para ver a versão com um tom único dessaturado.';
    $('#expPre').textContent = L.exportCSS();
    diag();
  }
  function diag() {
    const ref = $('.proto .container'); if (!ref) return;
    const vw = html.clientWidth, w = Math.round(ref.getBoundingClientRect().width), m = Math.round((vw - w) / 2), s = L.state();
    $('#ctBox').style.cssText = `left:${(vw - w) / 2 / vw * 100}%;right:${(vw - w) / 2 / vw * 100}%`;
    $('#diagTitle').textContent = `viewport ${vw} px`;
    $('#diagTxt').innerHTML = `Viewport <b>${vw} px</b> · conteúdo <b>${w} px</b> · margem real <b>${m} px</b> por lado (mínima configurada: ${s.margin} px, largura máxima: ${s.container} px). ${vw - 2 * s.margin >= s.container ? 'A <b>largura máxima</b> está mandando agora.' : 'A <b>margem lateral</b> está mandando agora.'}`;
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;top:0'; document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (_) {} ta.remove(); return ok;
    }
  }
  let toastT;
  async function doExport() {
    const text = L.exportCSS(), ok = await copyText(text), msg = ok ? `Tokens copiados · ${text.split('\n').length} linhas` : 'Não foi possível copiar: o texto está na seção Exportar';
    $$('.copied').forEach((e) => { e.textContent = msg; });
    const t = $('#toast'); t.textContent = msg; t.hidden = false; t.classList.remove('in'); void t.offsetWidth; t.classList.add('in');
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; $$('.copied').forEach((e) => { e.textContent = ''; }); }, 2600);
  }

  /* ---------------- roteamento ---------------- */
  const VIEWS = ['lab', 'servidores', 'loadout', 'conteudo'];
  let liveOn = false;
  function show(v) {
    $$('.view').forEach((e) => { e.hidden = e.dataset.view !== v; });
    $$('.proto [data-v]').forEach((a) => { if (a.dataset.v === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    window.scrollTo({ top: 0, behavior: 'instant' });
    liveOn = v === 'servidores';
    const names = { lab: 'Laboratório', servidores: 'Servidores', loadout: 'Loadout', conteudo: 'Regras de conduta' };
    document.title = names[v] + ' · Carmine Liberty Lab';
    if (v === 'servidores') enter($$('#srvList .srv:not([hidden])').filter((r) => r.dataset.rhide !== '1').concat($$('.fr')));
    if (v === 'loadout') enter($$('.cat-h', $('#wlist')).concat($$('.wcard', $('#wlist'))));
    if (v === 'conteudo') enter($$('.article > *').slice(0, 8));
    if (v === 'lab') diag();
    const f = $('#foot'); f.classList.remove('foot-rise');
  }
  function route() { const h = location.hash.slice(1); show(VIEWS.includes(h) ? h : 'lab'); }

  /* ---------------- boot ---------------- */
  function boot() {
    // ping vira sinal; local ganha ícone solto
    $$('.srv-ping').forEach((e) => { const d = $('.dot', e); if (!d) return; const lv = d.classList.contains('bad') ? 1 : d.classList.contains('warn') ? 2 : 3; d.outerHTML = sig(lv); });
    $$('.srv .meta').forEach((m) => { const [c, ...r] = m.textContent.split(' · '); m.innerHTML = ic('pin') + '<span>' + c + '</span><span class="tick"> · ' + r.join(' · ') + '</span>'; });
    const list = $('#srvList');
    $$('.bar i', list).forEach((i) => { i.style.setProperty('--p', (parseFloat(i.style.width) || 100) / 100); i.style.width = ''; });
    $$('.cur', list).forEach((c) => { c.dataset.v = c.textContent; });
    list.insertAdjacentHTML('afterend', '<div class="empty" id="srvEmpty" hidden><span><b>Nenhum servidor com esses filtros.</b></span><button class="btn btn-sm" type="button" id="clearF">Limpar filtros</button></div>');
    const vis = () => $$('.srv', list).filter((r) => !r.hidden && r.dataset.rhide !== '1');
    const updateEmpty = () => { $('#srvEmpty').hidden = vis().length > 0; };
    const REG = { Brasil: null, Sudeste: ['São Paulo', 'Rio de Janeiro'], Sul: ['Porto Alegre'] };
    function sortRows(by) {
      const key = (r) => by === 'Ping' ? parseInt($('.srv-ping .num', r).textContent, 10) : -parseInt(($('.cur', r).dataset.v || $('.cur', r).textContent), 10);
      $$('.srv', list).sort((a, b) => key(a) - key(b)).forEach((r) => list.appendChild(r));
    }
    sortRows('Ping');
    function refresh() {
      const segs = $$('.filters .seg'), reg = $('[aria-pressed=true]', segs[0]).textContent.trim(), set = REG[reg];
      sortRows($('[aria-pressed=true]', segs[1]).textContent.trim());
      $$('.srv', list).forEach((r) => { const city = $('.meta', r).textContent.split(' · ')[0].trim(); r.dataset.rhide = set && !set.includes(city) ? '1' : '0'; });
      updateEmpty(); enter(vis());
    }
    $$('.filters .seg').forEach((s) => s.addEventListener('click', (e) => { if (e.target.closest('button')) refresh(); }));
    $('#modeSeg').addEventListener('click', () => { updateEmpty(); enter(vis()); });
    $('#clearF').addEventListener('click', () => { $$('.seg', $('#s1')).forEach((s) => { const b = $$('button', s)[0]; b && b.click(); }); });

    // ao vivo
    let total = 2431;
    (function tick() {
      if (!document.hidden && liveOn) {
        const rows = $$('.srv', list), n = Math.random() < 0.4 ? 2 : 1;
        for (let k = 0; k < n; k++) {
          const r = rows[Math.floor(Math.random() * rows.length)], c = $('.cur', r), max = +r.dataset.max, cur = +(c.dataset.v || c.textContent);
          const dir = Math.random() < (cur < max / 2 ? 0.66 : 0.42) ? 1 : -1, next = Math.max(0, Math.min(max, cur + dir));
          if (next === cur) continue;
          roll(c, next, dir); total += next - cur;
          const bar = $('.bar i', r); bar.style.setProperty('--p', next / max); bar.classList.toggle('full', next >= max);
          const b = $('.btn', r); if (b) b.textContent = next >= max ? 'Fila' : 'Conectar';
        }
        $$('[data-total=players]').forEach((el) => tween(el, total));
      }
      setTimeout(tick, 2600 + Math.random() * 2600);
    })();
    const pio = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle('is-offscreen', !e.isIntersecting)));
    $$('.live,.online').forEach((el) => pio.observe(el));

    // rodapé: entra suave ao chegar
    const fio = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { $('#foot .container').classList.add('foot-rise'); fio.disconnect(); } }), { threshold: 0.05 });
    fio.observe($('#foot'));

    // sumário do documento
    $$('.toc a').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); $('#' + a.dataset.toc).scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); }));
    const tio = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) $$('.toc a').forEach((a) => a.setAttribute('aria-current', a.dataset.toc === e.target.id)); }), { rootMargin: '-20% 0px -70% 0px' });
    $$('.article h2').forEach((h) => tio.observe(h));

    // links vazios não saltam para o topo
    document.addEventListener('click', (e) => { const a = e.target.closest('a[href="#"]'); if (a) e.preventDefault(); });
    $$('.js-theme').forEach((b) => b.addEventListener('click', () => $('#themeBtn').click()));

    // controles
    $$('.range[data-k]').forEach((r) => r.addEventListener('input', () => { const d = SL.find((x) => x.k === r.dataset.k); L.set({ p: { [d.k]: parseFloat(r.value) / d.sc } }); }));
    $('#c-container').addEventListener('input', (e) => L.set({ container: +e.target.value }));
    $('#c-margin').addEventListener('input', (e) => L.set({ margin: +e.target.value }));
    $$('[data-pre]').forEach((b) => b.addEventListener('click', () => L.set({ preset: b.dataset.pre })));
    $('#reset').addEventListener('click', () => L.set({ preset: base }));
    $$('#quick .btn').forEach((b) => b.addEventListener('click', () => L.set({ container: +b.dataset.c, margin: +b.dataset.m })));
    $('#guides').addEventListener('click', () => L.set({ guides: !L.state().guides }));
    $('#dangerAlt').addEventListener('click', () => L.set({ danger: !L.state().danger }));
    $('#presetSel').addEventListener('change', (e) => L.set({ preset: e.target.value }));
    ['#expBtn', '#expBtn2', '#expBtn3'].forEach((s) => $(s).addEventListener('click', doExport));
    L.subscribe((s) => { $('#presetSel').value = s.preset === 'custom' ? 'custom' : s.preset; sync(); });
    addEventListener('resize', () => { cancelAnimationFrame(diag.r); diag.r = requestAnimationFrame(diag); });
    initSegs(document);
    sync(); $('#presetSel').value = L.state().preset;
    addEventListener('hashchange', route); route();
  }

  Carmine.mount({
    n: 'Liberty', name: 'Liberty Lab', live: true, motion: true, headerHTML,
    shell: (p) => `<div class="proto"><div class="container"><a href="index.html">← Comparativo</a>
        <a data-v="lab" href="#lab">Laboratório</a><a data-v="servidores" href="#servidores">Servidores</a><a data-v="loadout" href="#loadout">Loadout</a><a data-v="conteudo" href="#conteudo">Conteúdo</a>
        <span class="sp"></span>
        <select id="presetSel" aria-label="Preset de paleta">${Object.entries(L.PRESETS).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('')}<option value="custom" disabled>Personalizado</option></select>
        <button type="button" id="themeBtn"></button><button type="button" id="expBtn">Exportar</button></div></div>
      <div id="views">
        <div class="view lab" data-view="lab" hidden>${lab}</div>
        <div class="view" data-view="servidores" hidden>${p.s1}</div>
        <div class="view" data-view="loadout" hidden>${p.s2}</div>
        <div class="view" data-view="conteudo" hidden>${docHTML}</div>
      </div>${footerHTML}<div class="toast" id="toast" role="status" hidden></div>`,
    paintTheme(btn, dark) { btn.textContent = dark ? 'Tema: escuro' : 'Tema: papel'; btn.setAttribute('aria-pressed', !dark); },
    themeSwap(apply) {
      if (reduced() || !document.startViewTransition) {
        html.classList.add('no-tx'); apply();
        requestAnimationFrame(() => requestAnimationFrame(() => html.classList.remove('no-tx')));
        return;
      }
      document.startViewTransition(apply);
    },
    onS2Draw(reason) {
      if (!window.__lsw) return;
      const w = window.__lsw;
      if (reason === 'select') w.swap();
      if (reason === 'side') { const l = $('#wlist'); enter($$('.cat-h', l).concat($$('.wcard', l))); w.swap(); }
    },
    onMount() {
      const panel = $('#panel');
      window.__lsw = { swap() { panel.classList.remove('swap'); void panel.offsetWidth; panel.classList.add('swap'); clearTimeout(this.t); this.t = setTimeout(() => panel.classList.remove('swap'), 800); } };
      boot();
    }
  });
})();
