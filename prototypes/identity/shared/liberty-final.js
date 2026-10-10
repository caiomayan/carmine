/* Liberty Final — telas de referência (derivado do liberty.js sem o laboratório). */
(function () {
  const B = CarmineBrand, html = document.documentElement;
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => mq.matches || html.dataset.motion === 'reduced';
  const cssv = (n) => getComputedStyle(html).getPropertyValue(n).trim();
  const ms = (n) => parseFloat(cssv(n)) || 0;
  const fmt = (n) => n.toLocaleString('pt-BR');
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];

  /* ---------------- ícones: Lucide 0.469.0 (unpkg, versão fixada) ---------------- */
  const LUC = { sun: 'sun', moon: 'moon', search: 'search', pin: 'map-pin', clock: 'clock', check: 'check', crown: 'crown', alert: 'triangle-alert', info: 'info' };
  const ic = (n, c) => `<i data-lucide="${LUC[n] || n}" class="ic ${c || ''}" aria-hidden="true"></i>`;
  const sig = (lv) => `<i data-lucide="${lv >= 3 ? 'signal-high' : lv === 2 ? 'signal-medium' : 'signal-low'}" class="ic sig sig-${lv}" role="img" aria-label="Sinal ${['', 'ruim', 'médio', 'bom'][lv]}"></i>`;
  const paintIcons = () => { if (window.lucide) lucide.createIcons(); };

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

  /* ---------------- cores de contexto ---------------- */
  const CTX = [['--status-online', 'Online · ao vivo'], ['--status-success', 'Sucesso'], ['--status-warn', 'Atenção · lotado'], ['--status-danger', 'Erro'], ['--status-info', 'Informação'], ['--status-vip', 'VIP'], ['--status-offline', 'Offline (= faint)']];
  const ctxPane = (th) => `<div class="ctx-pane" data-theme="${th}"><h2 class="ctx-h">${th === 'dark' ? 'Escuro' : 'Claro · papel'}</h2>
    <table class="ctx-t"><thead><tr><th>Token</th><th>Hex</th><th>Sobre bg</th><th>Sobre surface</th></tr></thead><tbody>${CTX.map((c) => `<tr data-tok="${c[0]}"><td><i class="sw" style="background:var(${c[0]})"></i><span>${c[1]}<code>${c[0]}</code></span></td><td class="hx"></td><td class="r1"></td><td class="r2"></td></tr>`).join('')}</tbody></table>
    <div class="ctx-demo">
      <div class="row"><span class="live"><i class="live-dot"></i>Ao vivo</span><span class="info-ic"><i class="dot"></i>Online</span><span class="info-ic"><i class="dot warn"></i>Ausente</span></div>
      <div class="bars"><span class="bar"><i style="--p:.6"></i></span><span class="bar"><i class="high" style="--p:.9"></i></span><span class="bar"><i class="full" style="--p:1"></i></span></div>
      <div class="row">${sig(3)}${sig(2)}${sig(1)}<span class="vip">${ic('crown')}VIP</span></div>
      <div class="msg err">${ic('alert')}<span>Não foi possível conectar. Tente de novo.</span></div>
      <div class="msg ok">${ic('check')}<span>Loadout salvo. Vale a partir do próximo round.</span></div>
      <div class="msg info">${ic('info')}<span>Manutenção programada para domingo, 4h.</span></div>
    </div></div>`;
  const ctxHTML = `${headerHTML('')}<main class="container"><div class="page-head"><div><h1>Cores de contexto</h1><p class="sub">Não fazem parte da identidade da marca: só sinalizam estado, em pontos, ícones e mensagens pequenas.</p></div></div>
    <div class="ctx-grid">${ctxPane('dark')}${ctxPane('light')}</div>
    <div class="ctx-rules"><div><h3>Usar em</h3><ul><li>Ponto de “ao vivo” e de presença dos amigos</li><li>Barra de lotação e estado “Fila”</li><li>Ícone de ping por faixa: bom, médio, ruim</li><li>Ícone de mensagens de erro, sucesso e informação</li><li>Selo VIP</li></ul></div>
    <div><h3>Nunca em</h3><ul><li>Botões, navegação e controles</li><li>Fundos de card, painel ou página</li><li>Texto corrido e títulos</li><li>Qualquer área maior que um ícone ou uma barra fina</li></ul></div></div></main>`;
  function paintCtx() {
    const lum = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const norm = (v) => { v = v.trim(); if (v[0] === '#') return v; const m = v.match(/\d+/g); return '#' + m.slice(0, 3).map((n) => (+n).toString(16).padStart(2, '0')).join(''); };
    $$('.ctx-pane').forEach((p) => {
      const cs = getComputedStyle(p), bg = norm(cs.getPropertyValue('--bg')), sf = norm(cs.getPropertyValue('--surface'));
      $$('tr[data-tok]', p).forEach((tr) => {
        const probe = document.createElement('i'); probe.style.color = `var(${tr.dataset.tok})`; p.appendChild(probe);
        const hex = norm(getComputedStyle(probe).color).toUpperCase(); probe.remove();
        const cell = (bgc, n) => { const r = ratio(hex, bgc), off = tr.dataset.tok === '--status-offline'; $(n, tr).innerHTML = `<b class="num">${r.toFixed(1).replace('.', ',')}:1</b> <span class="bd${off ? ' na' : r >= 4.5 ? '' : ' no'}">${off ? 'decorativo' : r >= 4.5 ? 'AA' : r >= 3 ? 'ícone' : 'falha'}</span>`; };
        $('.hx', tr).textContent = hex; cell(bg, '.r1'); cell(sf, '.r2');
      });
    });
  }

  /* ---------------- roteamento ---------------- */
  const VIEWS = ['servidores', 'loadout', 'conteudo', 'contexto'];
  let liveOn = false;
  function show(v) {
    $$('.view').forEach((e) => { e.hidden = e.dataset.view !== v; });
    $$('.proto [data-v]').forEach((a) => { if (a.dataset.v === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    window.scrollTo({ top: 0, behavior: 'instant' });
    liveOn = v === 'servidores';
    const names = { contexto: 'Cores de contexto', servidores: 'Servidores', loadout: 'Loadout', conteudo: 'Regras de conduta' };
    document.title = names[v] + ' · Carmine';
    if (v === 'servidores') enter($$('#srvList .srv:not([hidden])').filter((r) => r.dataset.rhide !== '1').concat($$('.fr')));
    if (v === 'loadout') enter($$('.cat-h', $('#wlist')).concat($$('.wcard', $('#wlist'))));
    if (v === 'contexto') paintCtx();
    if (v === 'conteudo') enter($$('.article > *').slice(0, 8));
    const f = $('#foot'); f.classList.remove('foot-rise');
  }
  function route() { const h = location.hash.slice(1); show(VIEWS.includes(h) ? h : 'servidores'); }

  /* ---------------- boot ---------------- */
  function boot() {
    // ping vira sinal; local ganha ícone solto
    $$('.srv-ping').forEach((e) => { const d = $('.dot', e); if (!d) return; const lv = d.classList.contains('bad') ? 1 : d.classList.contains('warn') ? 2 : 3; d.outerHTML = sig(lv); });
    $$('.srv .meta').forEach((m) => { const [c, ...r] = m.textContent.split(' · '); m.innerHTML = ic('pin') + '<span>' + c + '</span><span class="tick"> · ' + r.join(' · ') + '</span>'; });
    const list = $('#srvList');
    $$('.fr-info b').forEach((b) => { if (b.textContent === 'Rafa_Tabaco') b.insertAdjacentHTML('beforeend', `<span class="vip">${ic('crown')}VIP</span>`); });
    $$('.bar i', list).forEach((i) => { const p = (parseFloat(i.style.width) || 100) / 100; i.style.setProperty('--p', p); i.style.width = ''; i.classList.toggle('high', p >= 0.8 && p < 1); });
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
          const bar = $('.bar i', r); bar.style.setProperty('--p', next / max); bar.classList.toggle('full', next >= max); bar.classList.toggle('high', next / max >= 0.8 && next < max);
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

    const panel = $('#panel');
    panel.addEventListener('click', (e) => {
      if (!e.target.closest('.pfoot .btn-primary')) return;
      const f = $('.pfoot', panel); const o = $('.msg', f); if (o) o.remove();
      f.insertAdjacentHTML('afterbegin', `<div class="msg ok" role="status">${ic('check')}<span>Loadout salvo. Vale a partir do próximo round.</span></div>`); paintIcons();
      setTimeout(() => { const m = $('.msg', f); if (m) m.remove(); }, 3200);
    });
    initSegs(document);
    paintIcons();
    addEventListener('hashchange', route); route();
  }

  Carmine.mount({
    n: 'Liberty', name: 'Liberty Lab', live: true, motion: true, headerHTML,
    shell: (p) => `<div class="proto"><div class="container"><a href="index.html">← Comparativo</a><a href="liberty-lab.html">Laboratório</a>
        <a data-v="servidores" href="#servidores">Servidores</a><a data-v="loadout" href="#loadout">Loadout</a><a data-v="conteudo" href="#conteudo">Conteúdo</a><a data-v="contexto" href="#contexto">Cores de contexto</a>
        <span class="sp"></span><button type="button" id="themeBtn"></button></div></div>
      <div id="views">
        <div class="view" data-view="servidores" hidden>${p.s1}</div>
        <div class="view" data-view="loadout" hidden>${p.s2}</div>
        <div class="view" data-view="conteudo" hidden>${docHTML}</div>
        <div class="view" data-view="contexto" hidden>${ctxHTML}</div>
      </div>${footerHTML}`,
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
