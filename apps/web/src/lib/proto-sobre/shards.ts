/**
 * Os cacos do papel amassado da abertura do Sobre (reimplementação da ideia do "Crumpled Paper Reveal"): uma grade
 * de pontos com jitter, cada célula em dois triângulos, cada triângulo um caco com tom de papel próprio (os vincos
 * aparecem onde um tom encontra o vizinho). A geração é determinística (semente fixa): o servidor e o navegador
 * produzem o mesmo HTML, sem diferença de hidratação.
 */

export type Shard = {
  /** `polygon(...)` em % da tela, para o `clip-path`. */
  clip: string;
  /** O centro do caco, em % (a origem da rotação). */
  cx: number;
  cy: number;
  /** O fundo de papel: ângulo e dois tons de luminosidade. */
  angle: number;
  tone: [number, number];
  /** Para onde o caco vai ao se soltar: deslocamento em % do próprio tamanho e rotação em graus. */
  dx: number;
  dy: number;
  rotation: number;
  /** Quando o caco se solta, de 0 a 1 do tempo total: começa pelo canto de onde o papel é puxado (embaixo à esquerda). */
  delay: number;
};

/** Gerador pseudoaleatório pequeno e estável (mulberry32). */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Point = { x: number; y: number };

export function makeShards(cols: number, rows: number, seed = 7): Shard[] {
  const random = rng(seed);
  // Os pontos da grade; os da borda ficam na borda (o papel cobre a tela inteira), os de dentro tremem.
  const grid: Point[][] = [];
  for (let j = 0; j <= rows; j++) {
    const line: Point[] = [];
    for (let i = 0; i <= cols; i++) {
      const edgeX = i === 0 || i === cols;
      const edgeY = j === 0 || j === rows;
      const jitterX = edgeX ? 0 : (random() - 0.5) * 0.7;
      const jitterY = edgeY ? 0 : (random() - 0.5) * 0.7;
      line.push({ x: ((i + jitterX) / cols) * 100, y: ((j + jitterY) / rows) * 100 });
    }
    grid.push(line);
  }

  const shards: Shard[] = [];
  const triangle = (a: Point, b: Point, c: Point) => {
    const cx = (a.x + b.x + c.x) / 3;
    const cy = (a.y + b.y + c.y) / 3;
    // Distância ao canto de onde o papel é puxado (embaixo à esquerda), normalizada de 0 a 1.
    const fromCorner = Math.hypot(cx, 100 - cy) / Math.hypot(100, 100);
    const lightness = 82 + random() * 14;
    shards.push({
      clip: `polygon(${a.x.toFixed(2)}% ${a.y.toFixed(2)}%, ${b.x.toFixed(2)}% ${b.y.toFixed(2)}%, ${c.x.toFixed(2)}% ${c.y.toFixed(2)}%)`,
      cx: Number(cx.toFixed(2)),
      cy: Number(cy.toFixed(2)),
      angle: Math.round(random() * 360),
      tone: [Number(lightness.toFixed(1)), Number((lightness - 4 - random() * 8).toFixed(1))],
      dx: Math.round(30 + random() * 90),
      dy: Math.round(-(30 + random() * 90)),
      rotation: Math.round((random() < 0.5 ? -1 : 1) * (40 + random() * 140)),
      delay: Number(Math.min(0.9, fromCorner * 0.78 + random() * 0.12).toFixed(3)),
    });
  };

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const tl = grid[j]?.[i];
      const tr = grid[j]?.[i + 1];
      const bl = grid[j + 1]?.[i];
      const br = grid[j + 1]?.[i + 1];
      if (!tl || !tr || !bl || !br) continue;
      // A diagonal alterna de um jeito imprevisível: os vincos não formam uma grade regular.
      if (random() < 0.5) {
        triangle(tl, tr, bl);
        triangle(tr, br, bl);
      } else {
        triangle(tl, tr, br);
        triangle(tl, br, bl);
      }
    }
  }
  return shards;
}
