#!/usr/bin/env node
// Validador do addon do Carmine (S19). Não precisa do jogo nem do Workshop Tools: só confere os arquivos de
// `src/` contra o contrato (`addon.contract.json`) e contra o que o Panorama do CS2 rejeita.
//
// Uso:   node infra/cs2/addon/tools/validate-addon.mjs [pasta-do-addon]
// Código: import { validateAddon } from './validate-addon.mjs'  ->  string[] (lista vazia = tudo certo)
//
// As regras de "o que o Panorama rejeita" (sem scripts, sem Image, sem o combinador de irmãos, imagem como
// background-image .vtex) vêm do projeto de referência MIT CustomHudProbeSW2; as de fps e tamanho são nossas
// (AGENTS.md: nada anima em loop, só transform e opacity; addon pequeno, poucos MB).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const LIMITE_PNG_BYTES = 2 * 1024 * 1024;
export const LIMITE_ADDON_BYTES = 5 * 1024 * 1024;
export const PROPRIEDADES_ANIMAVEIS = ['transform', 'opacity'];
export const LOGO_PNG = 'panorama/images/carmine/logo.png';

const ELEMENTOS = {
  root: [],
  styles: [],
  include: ['src'],
  Panel: ['id', 'class', 'hittest'],
  Label: ['id', 'class', 'hittest', 'text'],
};

// ---------------------------------------------------------------------------------------------------------
// XML mínimo (sem dependência): comentários, <?...?>, tags, atributos, auto-fechamento, aninhamento.
// ---------------------------------------------------------------------------------------------------------
function linhaDe(texto, indice) {
  let linha = 1;
  for (let i = 0; i < indice && i < texto.length; i++) if (texto[i] === '\n') linha++;
  return linha;
}

export function parseXml(fonte) {
  const erros = [];
  const texto = fonte.replace(/^\uFEFF/, '');
  const pilha = [];
  let raiz = null;
  let i = 0;
  const abrir = (no) => {
    if (pilha.length === 0) {
      if (raiz) erros.push(`XML: mais de um elemento na raiz (linha ${no.linha})`);
      else raiz = no;
    } else {
      pilha[pilha.length - 1].filhos.push(no);
    }
  };
  while (i < texto.length) {
    const lt = texto.indexOf('<', i);
    const trecho = texto.slice(i, lt === -1 ? texto.length : lt);
    if (trecho.trim() !== '') erros.push(`XML: texto solto fora de tag (linha ${linhaDe(texto, i)})`);
    if (lt === -1) break;
    if (texto.startsWith('<!--', lt)) {
      const fim = texto.indexOf('-->', lt + 4);
      if (fim === -1) {
        erros.push(`XML: comentário sem fechamento (linha ${linhaDe(texto, lt)})`);
        break;
      }
      i = fim + 3;
      continue;
    }
    if (texto.startsWith('<?', lt)) {
      const fim = texto.indexOf('?>', lt + 2);
      if (fim === -1) {
        erros.push(`XML: instrução <? sem fechamento (linha ${linhaDe(texto, lt)})`);
        break;
      }
      i = fim + 2;
      continue;
    }
    if (texto.startsWith('<![CDATA[', lt) || texto.startsWith('<!', lt)) {
      erros.push(`XML: construção não suportada (linha ${linhaDe(texto, lt)})`);
      break;
    }
    const gt = texto.indexOf('>', lt + 1);
    if (gt === -1) {
      erros.push(`XML: tag sem ">" (linha ${linhaDe(texto, lt)})`);
      break;
    }
    const linha = linhaDe(texto, lt);
    const miolo = texto.slice(lt + 1, gt);
    i = gt + 1;
    if (miolo.startsWith('/')) {
      const nome = miolo.slice(1).trim();
      const topo = pilha.pop();
      if (!topo) erros.push(`XML: </${nome}> sem abertura (linha ${linha})`);
      else if (topo.nome !== nome) {
        erros.push(`XML: </${nome}> fecha <${topo.nome}> aberto na linha ${topo.linha} (linha ${linha})`);
      }
      continue;
    }
    const autoFecha = miolo.endsWith('/');
    const corpo = autoFecha ? miolo.slice(0, -1) : miolo;
    const m = /^([A-Za-z_][\w:.-]*)([\s\S]*)$/.exec(corpo);
    if (!m) {
      erros.push(`XML: tag inválida "<${miolo}>" (linha ${linha})`);
      continue;
    }
    const attrs = {};
    const resto = m[2].replace(/([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g, (_t, k, v1, v2) => {
      if (k in attrs) erros.push(`XML: atributo ${k} repetido em <${m[1]}> (linha ${linha})`);
      attrs[k] = v1 !== undefined ? v1 : v2;
      return ' ';
    });
    if (resto.trim() !== '') erros.push(`XML: atributo mal formado em <${m[1]}> (linha ${linha})`);
    const no = { nome: m[1], attrs, filhos: [], linha };
    abrir(no);
    if (!autoFecha) pilha.push(no);
  }
  for (const aberto of pilha) erros.push(`XML: <${aberto.nome}> (linha ${aberto.linha}) nunca foi fechado`);
  if (!raiz && erros.length === 0) erros.push('XML: documento vazio');
  return { erros, raiz };
}

function* percorre(no) {
  yield no;
  for (const f of no.filhos) yield* percorre(f);
}

// ---------------------------------------------------------------------------------------------------------
// Arquivos
// ---------------------------------------------------------------------------------------------------------
function lista(dir) {
  const saida = [];
  if (!existsSync(dir)) return saida;
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    const st = statSync(caminho);
    if (st.isDirectory()) saida.push(...lista(caminho));
    else saida.push({ caminho, tamanho: st.size });
  }
  return saida;
}

function lePng(caminho) {
  const b = readFileSync(caminho);
  const assinatura = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (b.length < 33 || !b.subarray(0, 8).equals(assinatura)) return { erro: 'assinatura PNG inválida' };
  if (b.readUInt32BE(8) !== 13 || b.toString('ascii', 12, 16) !== 'IHDR') return { erro: 'falta o chunk IHDR' };
  const largura = b.readUInt32BE(16);
  const altura = b.readUInt32BE(20);
  if (largura === 0 || altura === 0) return { erro: 'dimensões zeradas' };
  return { largura, altura };
}

// ---------------------------------------------------------------------------------------------------------
// CSS
// ---------------------------------------------------------------------------------------------------------
function semComentariosCss(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
}

function regrasCss(css) {
  const regras = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const decls = [];
    for (const pedaco of m[2].split(';')) {
      const corte = pedaco.indexOf(':');
      if (corte === -1) continue;
      decls.push({ nome: pedaco.slice(0, corte).trim().toLowerCase(), valor: pedaco.slice(corte + 1).trim() });
    }
    regras.push({ seletor: m[1].trim(), decls, linha: linhaDe(css, m.index + m[0].indexOf(m[1].trim())) });
  }
  return regras;
}

function validaCss(nomeArquivo, fonte, srcRoot, erros) {
  const css = semComentariosCss(fonte);
  const quando = (idx) => `${nomeArquivo}:${linhaDe(css, idx)}`;
  const til = css.indexOf('~');
  if (til !== -1) erros.push(`${quando(til)}: o combinador "~" é rejeitado pelo Panorama do CS2`);
  const kf = css.search(/@keyframes/i);
  if (kf !== -1) erros.push(`${quando(kf)}: @keyframes não é permitido (nada anima em loop; só transition de transform e opacity)`);

  for (const regra of regrasCss(css)) {
    for (const { nome, valor } of regra.decls) {
      const onde = `${nomeArquivo}:${regra.linha} (${regra.seletor})`;
      if (nome === 'animation' || nome === 'animation-iteration-count') {
        if (/infinite/i.test(valor)) erros.push(`${onde}: animation infinite (nada anima em loop)`);
      }
      if (nome === 'transition-property') {
        for (const p of valor.split(',').map((s) => s.trim().toLowerCase())) {
          if (p !== 'none' && !PROPRIEDADES_ANIMAVEIS.includes(p)) {
            erros.push(`${onde}: transition-property "${p}" (só ${PROPRIEDADES_ANIMAVEIS.join(' e ')} podem animar)`);
          }
        }
      }
      if (nome === 'transition') {
        for (const parte of valor.split(',').map((s) => s.trim().toLowerCase())) {
          const prop = parte.split(/\s+/)[0];
          if (prop !== 'none' && !PROPRIEDADES_ANIMAVEIS.includes(prop)) {
            erros.push(`${onde}: transition "${prop}" (só ${PROPRIEDADES_ANIMAVEIS.join(' e ')} podem animar)`);
          }
        }
      }
      for (const u of valor.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
        const url = u[1];
        const m = /^s2r:\/\/(panorama\/images\/.+?)\.vtex(?:_c)?$/.exec(url);
        if (!m) {
          erros.push(`${onde}: url("${url}") fora do padrão s2r://panorama/images/...vtex`);
          continue;
        }
        const vtex = join(srcRoot, `${m[1]}.vtex`);
        const pngDireto = join(srcRoot, `${m[1].replace(/_png$/, '')}.png`);
        if (!existsSync(vtex) && !(m[1].endsWith('_png') && existsSync(pngDireto))) {
          erros.push(`${onde}: imagem "${url}" não existe em src/${m[1]}.vtex`);
        }
      }
    }
  }
  return regrasCss(css);
}

// ---------------------------------------------------------------------------------------------------------
// Validação principal
// ---------------------------------------------------------------------------------------------------------
export function validateAddon(rootDir) {
  const erros = [];
  const raizAddon = resolve(rootDir);
  const srcRoot = join(raizAddon, 'src');

  // Contrato
  const caminhoContrato = join(raizAddon, 'addon.contract.json');
  if (!existsSync(caminhoContrato)) return [`addon.contract.json não existe em ${raizAddon}`];
  let contrato;
  try {
    contrato = JSON.parse(readFileSync(caminhoContrato, 'utf8'));
  } catch (e) {
    return [`addon.contract.json inválido: ${e.message}`];
  }
  const texto = (k) => typeof contrato[k] === 'string' && contrato[k] !== '';
  for (const k of ['layout', 'style', 'panel', 'hiddenClass', 'rowHiddenClass']) {
    if (!texto(k)) erros.push(`addon.contract.json: campo "${k}" ausente ou vazio`);
  }
  if (!Array.isArray(contrato.variables) || contrato.variables.some((v) => typeof v !== 'string')) {
    erros.push('addon.contract.json: "variables" deve ser uma lista de textos');
  }
  if (typeof contrato.rowPanels !== 'object' || contrato.rowPanels === null) {
    erros.push('addon.contract.json: "rowPanels" ausente');
  }
  if (erros.length) return erros;
  if (!/^panorama\/layout\/custom_game\/[\w-]+\.xml$/.test(contrato.layout)) {
    erros.push('addon.contract.json: "layout" deve ser panorama/layout/custom_game/<nome>.xml');
  }
  const permitidas = contrato.variables;

  // Layout
  const caminhoLayout = join(srcRoot, contrato.layout);
  const layoutRel = `src/${contrato.layout}`;
  let raiz = null;
  if (!existsSync(caminhoLayout)) {
    erros.push(`${layoutRel} não existe`);
  } else {
    const fonte = readFileSync(caminhoLayout, 'utf8');
    const { erros: errosXml, raiz: r } = parseXml(fonte);
    erros.push(...errosXml.map((e) => `${layoutRel}: ${e}`));
    raiz = r;
  }

  if (raiz) {
    const aqui = (no) => `${layoutRel}:${no.linha}`;
    if (raiz.nome !== 'root') erros.push(`${layoutRel}: o elemento raiz deve ser <root>, não <${raiz.nome}>`);
    const ids = new Map();
    const placeholders = [];
    for (const no of percorre(raiz)) {
      if (no.nome === 'scripts') {
        erros.push(`${aqui(no)}: <scripts> é rejeitado pelo custom_hud_layout (sem script no cliente)`);
        continue;
      }
      if (no.nome === 'Image') {
        erros.push(`${aqui(no)}: <Image> quebra o layout; use background-image .vtex num Panel`);
        continue;
      }
      if (no.nome === 'Button') {
        erros.push(`${aqui(no)}: <Button> torna o card clicável; o card é só para ler`);
        continue;
      }
      if (!(no.nome in ELEMENTOS)) {
        erros.push(`${aqui(no)}: elemento <${no.nome}> não permitido`);
        continue;
      }
      for (const [k, v] of Object.entries(no.attrs)) {
        if (!ELEMENTOS[no.nome].includes(k)) erros.push(`${aqui(no)}: atributo "${k}" não permitido em <${no.nome}>`);
        if (k === 'hittest' && v !== 'false') erros.push(`${aqui(no)}: hittest="${v}" (nenhum painel pode capturar o mouse)`);
        for (const p of v.matchAll(/\{([^}:]*):([^}]*)\}/g)) placeholders.push({ no, tipo: p[1], nome: p[2] });
      }
      if (no.attrs.id) {
        if (ids.has(no.attrs.id)) erros.push(`${aqui(no)}: id "${no.attrs.id}" repetido (primeiro na linha ${ids.get(no.attrs.id).linha})`);
        else ids.set(no.attrs.id, no);
      }
    }
    for (const p of placeholders) {
      if (p.tipo !== 's') erros.push(`${aqui(p.no)}: variável {${p.tipo}:${p.nome}} (só {s:...} é usada)`);
      else if (!permitidas.includes(p.nome)) {
        erros.push(`${aqui(p.no)}: variável {s:${p.nome}} fora da lista permitida (${permitidas.join(', ')})`);
      }
    }

    // O painel raiz de conteúdo também não pode capturar clique (hittest="false" explícito).
    const painelRaiz = raiz.filhos.find((f) => f.nome === 'Panel');
    if (!painelRaiz) erros.push(`${layoutRel}: falta o <Panel> de raiz dentro de <root>`);
    else if (painelRaiz.attrs.hittest !== 'false') erros.push(`${aqui(painelRaiz)}: o Panel raiz precisa de hittest="false"`);

    // Painel do card, nascendo escondido, e painéis das linhas
    const card = ids.get(contrato.panel);
    if (!card) erros.push(`${layoutRel}: falta o painel id="${contrato.panel}"`);
    else {
      if (card.nome !== 'Panel') erros.push(`${aqui(card)}: id="${contrato.panel}" deve ser um <Panel>`);
      if (!(card.attrs.class || '').split(/\s+/).includes(contrato.hiddenClass)) {
        erros.push(`${aqui(card)}: o painel ${contrato.panel} precisa nascer com a classe ${contrato.hiddenClass}`);
      }
    }
    for (const [variavel, id] of Object.entries(contrato.rowPanels)) {
      if (!ids.has(id)) erros.push(`${layoutRel}: falta o painel id="${id}" (linha de "${variavel}")`);
    }

    // CSS incluído
    const includes = [...percorre(raiz)].filter((n) => n.nome === 'include');
    const cssIncluidos = [];
    if (includes.length === 0) erros.push(`${layoutRel}: falta <styles><include .../></styles>`);
    for (const inc of includes) {
      const m = /^s2r:\/\/(panorama\/styles\/custom_game\/[\w-]+)\.vcss_c$/.exec(inc.attrs.src || '');
      if (!m) {
        erros.push(`${aqui(inc)}: include "${inc.attrs.src}" fora do padrão s2r://panorama/styles/custom_game/<nome>.vcss_c`);
        continue;
      }
      const css = `${m[1]}.css`;
      if (!existsSync(join(srcRoot, css))) erros.push(`${aqui(inc)}: o CSS "src/${css}" referenciado não existe`);
      else cssIncluidos.push(css);
    }
    if (!cssIncluidos.includes(contrato.style)) {
      erros.push(`${layoutRel}: o layout não inclui o CSS do contrato (${contrato.style})`);
    }
  }

  // CSS do contrato
  const caminhoCss = join(srcRoot, contrato.style);
  if (existsSync(caminhoCss)) {
    const regras = validaCss(`src/${contrato.style}`, readFileSync(caminhoCss, 'utf8'), srcRoot, erros);
    for (const classe of [contrato.hiddenClass, contrato.rowHiddenClass]) {
      if (!regras.some((r) => new RegExp(`\\.${classe}(?![\\w-])`).test(r.seletor))) {
        erros.push(`src/${contrato.style}: falta a regra da classe .${classe}`);
      }
    }
  } else {
    erros.push(`src/${contrato.style} não existe`);
  }

  // Arquivos de imagem e materiais
  const arquivos = lista(srcRoot);
  const logo = join(srcRoot, LOGO_PNG);
  if (!existsSync(logo)) erros.push(`src/${LOGO_PNG} não existe`);
  for (const { caminho, tamanho } of arquivos) {
    const rel = relative(srcRoot, caminho).split('\\').join('/');
    const minusculo = rel.toLowerCase();
    if (minusculo.endsWith('.png')) {
      const png = lePng(caminho);
      if (png.erro) erros.push(`src/${rel}: PNG ilegível (${png.erro})`);
      if (tamanho > LIMITE_PNG_BYTES) erros.push(`src/${rel}: PNG com ${tamanho} bytes (máximo ${LIMITE_PNG_BYTES})`);
    } else if (minusculo.endsWith('.vtex')) {
      const v = readFileSync(caminho, 'utf8');
      if (!/"m_outputFormat"\s+"string"\s+"BGRA8888"/.test(v)) erros.push(`src/${rel}: o .vtex do Panorama deve sair em BGRA8888`);
      const f = /"m_fileName"\s+"string"\s+"([^"]+)"/.exec(v);
      if (!f) erros.push(`src/${rel}: .vtex sem m_fileName`);
      else if (!existsSync(join(srcRoot, f[1]))) erros.push(`src/${rel}: textura de entrada "${f[1]}" não existe`);
    } else if (minusculo.endsWith('.vmat')) {
      const v = readFileSync(caminho, 'utf8').replace(/\/\/[^\n]*/g, '');
      const texturas = [...v.matchAll(/\bTexture\w*\s+"([^"]+)"/g)].map((m) => m[1]).filter(Boolean);
      if (texturas.length === 0) erros.push(`src/${rel}: .vmat sem nenhuma textura`);
      for (const t of texturas) {
        if (!existsSync(join(srcRoot, t))) erros.push(`src/${rel}: textura "${t}" não existe`);
      }
    }
  }
  if (contrato.wallLogoMaterial && !existsSync(join(srcRoot, contrato.wallLogoMaterial))) {
    erros.push(`src/${contrato.wallLogoMaterial} (wallLogoMaterial do contrato) não existe`);
  }

  const total = arquivos.reduce((soma, a) => soma + a.tamanho, 0);
  if (total > LIMITE_ADDON_BYTES) erros.push(`addon com ${total} bytes em src/ (máximo ${LIMITE_ADDON_BYTES}: poucos MB)`);

  return erros;
}

// ---------------------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const padrao = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const raiz = process.argv[2] ? resolve(process.argv[2]) : padrao;
  const erros = validateAddon(raiz);
  if (erros.length === 0) {
    console.log(`Addon válido: ${raiz}`);
  } else {
    console.error(`Addon inválido (${erros.length} problema${erros.length > 1 ? 's' : ''}):`);
    for (const e of erros) console.error(`  - ${e}`);
    process.exit(1);
  }
}
