// Testes do validador do addon. Rodar: node --test infra/cs2/addon/tools/
// Cada caso copia o addon real para uma pasta temporária, estraga UMA coisa e confere que a regra correspondente falha.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAddon, parseXml, LIMITE_ADDON_BYTES, LIMITE_PNG_BYTES } from './validate-addon.mjs';

const ADDON_REAL = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LAYOUT = 'src/panorama/layout/custom_game/carmine_card.xml';
const CSS = 'src/panorama/styles/custom_game/carmine_card.css';
const LOGO = 'src/panorama/images/carmine/logo.png';

// Copia só o que o validador lê (sem tools/ e sem README).
function addonTemporario() {
  const dir = mkdtempSync(join(tmpdir(), 'carmine-addon-'));
  cpSync(join(ADDON_REAL, 'src'), join(dir, 'src'), { recursive: true });
  cpSync(join(ADDON_REAL, 'addon.contract.json'), join(dir, 'addon.contract.json'));
  return dir;
}

function comAddon(mexe, esperado) {
  const dir = addonTemporario();
  try {
    mexe(dir);
    const erros = validateAddon(dir);
    if (esperado === undefined) {
      assert.deepEqual(erros, [], erros.join('\n'));
    } else {
      assert.ok(
        erros.some((e) => esperado.test(e)),
        `esperava um erro ${esperado}, veio:\n${erros.join('\n') || '(nenhum)'}`,
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const edita = (dir, arquivo, fn) => {
  const caminho = join(dir, arquivo);
  writeFileSync(caminho, fn(readFileSync(caminho, 'utf8')));
};

test('o addon real é válido', () => {
  assert.deepEqual(validateAddon(ADDON_REAL), []);
});

test('o contrato exporta painel, classes, variáveis e layout', () => {
  const c = JSON.parse(readFileSync(join(ADDON_REAL, 'addon.contract.json'), 'utf8'));
  assert.equal(c.panel, 'carmine_card');
  assert.equal(c.hiddenClass, 'CarmineCardHidden');
  assert.equal(c.rowHiddenClass, 'CarmineRowHidden');
  assert.deepEqual(c.variables, ['name', 'plan', 'rank', 'friends', 'rating']);
  assert.equal(c.layout, 'panorama/layout/custom_game/carmine_card.xml');
});

test('sem contrato, falha', () => {
  const dir = mkdtempSync(join(tmpdir(), 'carmine-addon-'));
  try {
    assert.match(validateAddon(dir)[0], /addon\.contract\.json/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- XML --------------------------------------------------------------------------------------------------
test('XML mal formado falha (tag não fechada)', () => {
  comAddon((d) => edita(d, LAYOUT, (t) => t.replace('</root>', '')), /nunca foi fechado/);
});

test('XML mal formado falha (fechamento trocado)', () => {
  comAddon((d) => edita(d, LAYOUT, (t) => t.replace('</styles>', '</style>')), /fecha <styles>/);
});

test('parseXml aceita comentário e auto-fechamento', () => {
  const { erros, raiz } = parseXml('<root><!-- oi --><Panel id="a" /></root>');
  assert.deepEqual(erros, []);
  assert.equal(raiz.filhos[0].attrs.id, 'a');
});

// --- Layout -----------------------------------------------------------------------------------------------
test('layout que referencia CSS inexistente falha', () => {
  comAddon((d) => edita(d, LAYOUT, (t) => t.replace('carmine_card.vcss_c', 'outro.vcss_c')), /CSS "src\/panorama\/styles\/custom_game\/outro\.css".*não existe/);
});

test('layout que inclui CSS com caminho fora do padrão falha', () => {
  comAddon((d) => edita(d, LAYOUT, (t) => t.replace('s2r://panorama/styles/custom_game/carmine_card.vcss_c', 'carmine_card.css')), /fora do padrão/);
});

test('variável fora da lista permitida falha', () => {
  comAddon((d) => edita(d, LAYOUT, (t) => t.replace('{s:rank}', '{s:senha}')), /\{s:senha\} fora da lista permitida/);
});

test('placeholder que não é {s:...} falha', () => {
  comAddon((d) => edita(d, LAYOUT, (t) => t.replace('{s:rank}', '{d:rank}')), /só \{s:\.\.\.\} é usada/);
});

test('<scripts> falha', () => {
  comAddon((d) => edita(d, LAYOUT, (t) => t.replace('<styles>', '<scripts></scripts><styles>')), /<scripts>/);
});

test('<Image> falha', () => {
  comAddon((d) => edita(d, LAYOUT, (t) => t.replace('<Panel class="carmine-rule" hittest="false" />', '<Image src="x.vtex" />')), /<Image>/);
});

test('<Button> falha (card não é clicável)', () => {
  comAddon((d) => edita(d, LAYOUT, (t) => t.replace('<Panel class="carmine-rule" hittest="false" />', '<Button id="x" />')), /<Button>/);
});

test('hittest="true" falha', () => {
  comAddon((d) => edita(d, LAYOUT, (t) => t.replace('class="carmine-rule" hittest="false"', 'class="carmine-rule" hittest="true"')), /hittest="true"/);
});

test('Panel raiz sem hittest="false" falha', () => {
  comAddon((d) => edita(d, LAYOUT, (t) => t.replace('<Panel class="carmine-root" hittest="false">', '<Panel class="carmine-root">')), /Panel raiz precisa de hittest/);
});

test('atributo não permitido falha', () => {
  comAddon((d) => edita(d, LAYOUT, (t) => t.replace('class="carmine-rule"', 'class="carmine-rule" onactivate="x()"')), /atributo "onactivate" não permitido/);
});

test('sem o painel carmine_card falha', () => {
  comAddon((d) => edita(d, LAYOUT, (t) => t.replace('id="carmine_card"', 'id="outro"')), /falta o painel id="carmine_card"/);
});

test('card que não nasce com CarmineCardHidden falha', () => {
  comAddon((d) => edita(d, LAYOUT, (t) => t.replace('carmine-card CarmineCardHidden', 'carmine-card')), /precisa nascer com a classe CarmineCardHidden/);
});

test('painel de linha sumido falha', () => {
  comAddon((d) => edita(d, LAYOUT, (t) => t.replace('id="carmine_row_rating"', 'id="x_rating"')), /falta o painel id="carmine_row_rating"/);
});

test('id repetido falha', () => {
  comAddon((d) => edita(d, LAYOUT, (t) => t.replace('id="carmine_row_rating"', 'id="carmine_row_rank"')), /repetido/);
});

// --- CSS --------------------------------------------------------------------------------------------------
test('combinador "~" no CSS falha', () => {
  comAddon((d) => edita(d, CSS, (t) => `${t}\n.a ~ .b { width: 1px; }\n`), /"~"/);
});

test('sem a classe CarmineCardHidden no CSS falha', () => {
  comAddon((d) => edita(d, CSS, (t) => t.replace('.CarmineCardHidden', '.OutraClasse')), /falta a regra da classe \.CarmineCardHidden/);
});

test('sem a classe CarmineRowHidden no CSS falha', () => {
  comAddon((d) => edita(d, CSS, (t) => t.replace('.CarmineRowHidden', '.OutraClasse')), /falta a regra da classe \.CarmineRowHidden/);
});

test('animation infinite falha', () => {
  comAddon((d) => edita(d, CSS, (t) => `${t}\n.carmine-logo { animation: pulsa 2s infinite; }\n`), /animation infinite/);
});

test('animation-iteration-count infinite falha', () => {
  comAddon((d) => edita(d, CSS, (t) => `${t}\n.carmine-logo { animation-iteration-count: infinite; }\n`), /animation infinite/);
});

test('@keyframes falha', () => {
  comAddon((d) => edita(d, CSS, (t) => `${t}\n@keyframes a { }\n`), /@keyframes/);
});

test('transition-property além de transform e opacity falha', () => {
  comAddon((d) => edita(d, CSS, (t) => t.replace('transition-property: transform, opacity;', 'transition-property: transform, width;')), /transition-property "width"/);
});

test('transition-property all falha', () => {
  comAddon((d) => edita(d, CSS, (t) => t.replace('transition-property: transform, opacity;', 'transition-property: all;')), /transition-property "all"/);
});

test('transition abreviado com propriedade fora da lista falha', () => {
  comAddon((d) => edita(d, CSS, (t) => `${t}\n.carmine-logo { transition: background-color 0.2s ease-in; }\n`), /transition "background-color"/);
});

test('transition abreviado só de transform e opacity passa', () => {
  comAddon((d) => edita(d, CSS, (t) => `${t}\n.carmine-logo { transition: opacity 0.2s ease-in, transform 0.2s ease-in; }\n`));
});

test('imagem do CSS que não existe falha', () => {
  comAddon((d) => edita(d, CSS, (t) => t.replace('carmine/logo.vtex', 'carmine/sumiu.vtex')), /não existe em src\/panorama\/images\/carmine\/sumiu\.vtex/);
});

test('url() fora do padrão s2r:// falha', () => {
  comAddon((d) => edita(d, CSS, (t) => t.replace('s2r://panorama/images/carmine/logo.vtex', 'https://exemplo.invalid/x.png')), /fora do padrão/);
});

// --- Imagens, materiais, tamanho --------------------------------------------------------------------------
test('logo.png ausente falha', () => {
  comAddon((d) => rmSync(join(d, LOGO)), /logo\.png não existe/);
});

test('logo.png com cabeçalho inválido falha', () => {
  comAddon((d) => writeFileSync(join(d, LOGO), Buffer.from('isto não é um png, é texto qualquer com mais de trinta e três bytes')), /PNG ilegível/);
});

test('PNG acima de 2 MB falha', () => {
  comAddon((d) => {
    const original = readFileSync(join(d, LOGO));
    // PNG válido (cabeçalho + IHDR) seguido de lixo: o limite é de tamanho de arquivo.
    writeFileSync(join(d, LOGO), Buffer.concat([original, Buffer.alloc(LIMITE_PNG_BYTES)]));
  }, /PNG com \d+ bytes/);
});

test('.vtex que aponta para PNG inexistente falha', () => {
  comAddon((d) => edita(d, 'src/panorama/images/carmine/logo.vtex', (t) => t.replace('carmine/logo.png', 'carmine/nada.png')), /textura de entrada .* não existe/);
});

test('.vtex fora de BGRA8888 falha', () => {
  comAddon((d) => edita(d, 'src/panorama/images/carmine/logo.vtex', (t) => t.replace('BGRA8888', 'DXT5')), /BGRA8888/);
});

test('.vmat com textura inexistente falha', () => {
  comAddon((d) => edita(d, 'src/materials/carmine/wall_logo.vmat', (t) => t.replace('wall_logo_trans.png', 'nada.png')), /textura "materials\/carmine\/nada\.png" não existe/);
});

test('addon acima de 5 MB falha', () => {
  comAddon((d) => {
    mkdirSync(join(d, 'src', 'sounds'), { recursive: true });
    writeFileSync(join(d, 'src', 'sounds', 'enorme.bin'), Buffer.alloc(LIMITE_ADDON_BYTES + 1));
  }, /addon com \d+ bytes/);
});
