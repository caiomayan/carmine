import * as THREE from 'three';

/**
 * O Lanyard da carta do jogador: um cordão preto com o nome da marca e o cartão pendurado, com física de verdade (uma
 * corda de Verlet em 3D, com o cartão preso na ponta e a torção dele). Dá para pegar o cartão e jogar de um lado
 * para o outro. **Só o three.js é importado, e só por `import()` no `lanyard.tsx`:** nenhuma outra página do site
 * carrega a biblioteca. A textura da frente é a própria imagem compartilhável (`/dev/carta/imagem`): o que está
 * pendurado é exatamente o que vai para o WhatsApp.
 */

const ROPE_SEGMENTS = 6;
const ROPE_LENGTH = 0.26;
const CARD_HANG = 0.95;
const CARD_W = 1.6;
const CARD_H = 2;
const ANCHOR_Y = 2.3;
const DT = 1 / 60;
const GRAVITY = -15;
const DAMPING = 0.994;
const ITERATIONS = 12;

type Node = { p: THREE.Vector3; prev: THREE.Vector3 };

export function mountLanyard(host: HTMLElement, imageUrl: string, onReady: () => void): () => void {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:pan-y;';
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  camera.position.set(0, 0, 7);

  const disposables: { dispose: () => void }[] = [];
  const track = <D extends { dispose: () => void }>(item: D): D => {
    disposables.push(item);
    return item;
  };

  /* ---------- a corda: o ponto 0 é o gancho (fixo); o último é o centro do cartão ---------- */
  const nodes: Node[] = [];
  for (let i = 0; i <= ROPE_SEGMENTS + 1; i++) {
    const y =
      i <= ROPE_SEGMENTS
        ? ANCHOR_Y - i * ROPE_LENGTH
        : ANCHOR_Y - ROPE_SEGMENTS * ROPE_LENGTH - CARD_HANG;
    const p = new THREE.Vector3(0, y, 0);
    nodes.push({ p, prev: p.clone() });
  }
  const card = nodes[nodes.length - 1] as Node;
  const clip = nodes[ROPE_SEGMENTS] as Node;
  // Um empurrãozinho para o cartão balançar sozinho ao entrar.
  card.prev.set(-0.05, card.p.y, -0.03);
  clip.prev.set(-0.02, clip.p.y, -0.01);
  const lengths = nodes.slice(1).map((_, i) => (i < ROPE_SEGMENTS ? ROPE_LENGTH : CARD_HANG));
  const reach = lengths.reduce((n, length) => n + length, 0) * 0.985;
  const anchor = nodes[0]?.p ?? new THREE.Vector3();
  let twist = 0;
  let twistVelocity = 0;

  /* ---------- o cartão (frente com a imagem, verso da marca, borda escura) ---------- */
  const rounded = (width: number, height: number, radius: number) => {
    const shape = new THREE.Shape();
    const x = -width / 2;
    const y = -height / 2;
    shape.moveTo(x + radius, y);
    shape.lineTo(x + width - radius, y);
    shape.absarc(x + width - radius, y + radius, radius, -Math.PI / 2, 0, false);
    shape.lineTo(x + width, y + height - radius);
    shape.absarc(x + width - radius, y + height - radius, radius, 0, Math.PI / 2, false);
    shape.lineTo(x + radius, y + height);
    shape.absarc(x + radius, y + height - radius, radius, Math.PI / 2, Math.PI, false);
    shape.lineTo(x, y + radius);
    shape.absarc(x + radius, y + radius, radius, Math.PI, Math.PI * 1.5, false);
    const geometry = track(new THREE.ShapeGeometry(shape, 12));
    const position = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    if (position && uv) {
      for (let i = 0; i < position.count; i++) {
        uv.setXY(
          i,
          (position.getX(i) + width / 2) / width,
          (position.getY(i) + height / 2) / height,
        );
      }
    }
    return geometry;
  };

  const group = new THREE.Group();
  scene.add(group);

  const frontTexture = track(new THREE.TextureLoader().load(imageUrl, () => onReady()));
  frontTexture.colorSpace = THREE.SRGBColorSpace;
  frontTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const front = new THREE.Mesh(
    rounded(CARD_W, CARD_H, 0.1),
    track(new THREE.MeshBasicMaterial({ map: frontTexture })),
  );
  front.position.z = 0.006;

  const backCanvas = document.createElement('canvas');
  backCanvas.width = 640;
  backCanvas.height = 800;
  const backContext = backCanvas.getContext('2d');
  if (backContext) {
    backContext.fillStyle = '#0c0c0c';
    backContext.fillRect(0, 0, 640, 800);
    backContext.fillStyle = '#f4f1ea';
    backContext.textAlign = 'center';
    backContext.font = '800 84px "Big Shoulders", "Impact", sans-serif';
    backContext.fillText('SAINT', 320, 380);
    backContext.fillText('CARMINE', 320, 460);
    backContext.fillStyle = '#6f6f6f';
    backContext.font = '500 22px "Inter", sans-serif';
    backContext.fillText('stcarmine.com', 320, 740);
  }
  const backTexture = track(new THREE.CanvasTexture(backCanvas));
  backTexture.colorSpace = THREE.SRGBColorSpace;
  const back = new THREE.Mesh(
    rounded(CARD_W, CARD_H, 0.1),
    track(new THREE.MeshBasicMaterial({ map: backTexture })),
  );
  back.rotation.y = Math.PI;
  back.position.z = -0.006;

  const edge = new THREE.Mesh(
    rounded(CARD_W + 0.018, CARD_H + 0.018, 0.108),
    track(new THREE.MeshBasicMaterial({ color: 0x0b0b0b, side: THREE.DoubleSide })),
  );
  group.add(edge, front, back);

  // O prendedor de metal no topo do cartão.
  const metal = new THREE.Mesh(
    track(new THREE.PlaneGeometry(0.34, 0.15)),
    track(new THREE.MeshBasicMaterial({ color: 0xb9b9b9, side: THREE.DoubleSide })),
  );
  const slot = new THREE.Mesh(
    track(new THREE.PlaneGeometry(0.2, 0.05)),
    track(new THREE.MeshBasicMaterial({ color: 0x2b2b2b, side: THREE.DoubleSide })),
  );
  slot.position.z = 0.002;
  metal.add(slot);
  group.add(metal);
  metal.position.set(0, CARD_H / 2 + 0.01, 0.012);

  /* ---------- o cordão: uma fita que segue os pontos da corda ---------- */
  const strapCanvas = document.createElement('canvas');
  strapCanvas.width = 128;
  strapCanvas.height = 512;
  const strapContext = strapCanvas.getContext('2d');
  if (strapContext) {
    strapContext.fillStyle = '#0d0d0d';
    strapContext.fillRect(0, 0, 128, 512);
    strapContext.save();
    strapContext.translate(64, 256);
    strapContext.rotate(-Math.PI / 2);
    strapContext.fillStyle = '#e9e5dc';
    strapContext.textAlign = 'center';
    strapContext.textBaseline = 'middle';
    strapContext.font = '800 64px "Big Shoulders", "Impact", sans-serif';
    strapContext.fillText('SAINT CARMINE', 0, 0);
    strapContext.restore();
  }
  const strapTexture = track(new THREE.CanvasTexture(strapCanvas));
  strapTexture.colorSpace = THREE.SRGBColorSpace;
  strapTexture.wrapT = THREE.RepeatWrapping;
  strapTexture.anisotropy = 4;

  const ribbonPoints = ROPE_SEGMENTS + 1;
  const ribbonGeometry = track(new THREE.BufferGeometry());
  const ribbonPosition = new THREE.BufferAttribute(new Float32Array(ribbonPoints * 2 * 3), 3);
  const ribbonUv = new THREE.BufferAttribute(new Float32Array(ribbonPoints * 2 * 2), 2);
  const indices: number[] = [];
  for (let i = 0; i < ribbonPoints - 1; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  ribbonGeometry.setAttribute('position', ribbonPosition);
  ribbonGeometry.setAttribute('uv', ribbonUv);
  ribbonGeometry.setIndex(indices);
  const ribbon = new THREE.Mesh(
    ribbonGeometry,
    track(new THREE.MeshBasicMaterial({ map: strapTexture, side: THREE.DoubleSide })),
  );
  ribbon.frustumCulled = false;
  scene.add(ribbon);

  /* ---------- a física ---------- */
  const gravity = new THREE.Vector3(0, GRAVITY, 0);
  const tmp = new THREE.Vector3();

  let dragging = false;
  const dragTarget = new THREE.Vector3();
  const dragOffset = new THREE.Vector3();

  const step = () => {
    // Verlet: a velocidade é a diferença entre a posição de agora e a anterior.
    for (let i = 1; i < nodes.length; i++) {
      const node = nodes[i] as Node;
      if (dragging && node === card) continue;
      tmp.copy(node.p).sub(node.prev).multiplyScalar(DAMPING);
      node.prev.copy(node.p);
      node.p.add(tmp).addScaledVector(gravity, DT * DT);
      // Uma mola fraca mantém tudo perto do plano do cartão, sem prender o movimento em 3D.
      node.p.z *= 0.992;
    }
    if (dragging) {
      card.prev.copy(card.p);
      card.p.lerp(dragTarget, 0.55);
    }
    for (let iteration = 0; iteration < ITERATIONS; iteration++) {
      for (let i = 0; i < lengths.length; i++) {
        const a = nodes[i] as Node;
        const b = nodes[i + 1] as Node;
        tmp.copy(b.p).sub(a.p);
        const distance = tmp.length() || 1e-6;
        const error = (distance - (lengths[i] ?? 0)) / distance;
        const fixedA = i === 0;
        const fixedB = dragging && b === card;
        if (fixedA && fixedB) continue;
        if (fixedA) b.p.addScaledVector(tmp, -error);
        else if (fixedB) a.p.addScaledVector(tmp, error);
        else {
          a.p.addScaledVector(tmp, error * 0.5);
          b.p.addScaledVector(tmp, -error * 0.5);
        }
      }
      anchor.set(0, ANCHOR_Y, 0);
    }
    // A torção do cartão: gira com o balanço e volta de frente, devagar.
    const lateral = (card.p.x - card.prev.x) / DT;
    const depth = (card.p.z - card.prev.z) / DT;
    twistVelocity += (-twist * 16 - twistVelocity * 2.6 + lateral * 1.7 + depth * 0.5) * DT;
    twist = Math.max(-2.4, Math.min(2.4, twist + twistVelocity * DT));
  };

  const axis = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const rotation = new THREE.Quaternion();
  const spin = new THREE.Quaternion();
  const side = new THREE.Vector3();
  const forward = new THREE.Vector3(0, 0, 1);
  const direction = new THREE.Vector3();

  const place = () => {
    // O cartão fica pendurado no ponto do prendedor e o eixo dele aponta para lá.
    axis.copy(clip.p).sub(card.p).normalize();
    rotation.setFromUnitVectors(up, axis);
    spin.setFromAxisAngle(axis, twist);
    group.quaternion.copy(spin.multiply(rotation));
    group.position.copy(card.p);

    // A fita: do gancho até o prendedor, com a largura virada para a câmera.
    let length = 0;
    for (let i = 0; i < ribbonPoints; i++) {
      const point = (nodes[i] as Node).p;
      const before = (nodes[Math.max(0, i - 1)] as Node).p;
      const after = (nodes[Math.min(ribbonPoints - 1, i + 1)] as Node).p;
      direction.copy(after).sub(before).normalize();
      side.crossVectors(direction, forward).normalize().multiplyScalar(0.085);
      ribbonPosition.setXYZ(i * 2, point.x - side.x, point.y - side.y, point.z - side.z);
      ribbonPosition.setXYZ(i * 2 + 1, point.x + side.x, point.y + side.y, point.z + side.z);
      if (i > 0) length += point.distanceTo((nodes[i - 1] as Node).p);
      ribbonUv.setXY(i * 2, 0, length * 1.5);
      ribbonUv.setXY(i * 2 + 1, 1, length * 1.5);
    }
    ribbonPosition.needsUpdate = true;
    ribbonUv.needsUpdate = true;
  };

  /* ---------- pegar e jogar o cartão ---------- */
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = new THREE.Vector3();

  const aim = (event: PointerEvent) => {
    const box = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - box.left) / box.width) * 2 - 1,
      -((event.clientY - box.top) / box.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
  };
  const overCard = () => raycaster.intersectObjects([front, back, edge], false).length > 0;

  const onDown = (event: PointerEvent) => {
    aim(event);
    if (!overCard()) return;
    dragging = true;
    plane.constant = -card.p.z;
    raycaster.ray.intersectPlane(plane, hit);
    dragOffset.copy(hit).sub(card.p);
    dragTarget.copy(card.p);
    renderer.domElement.setPointerCapture(event.pointerId);
    renderer.domElement.style.cursor = 'grabbing';
  };
  const onMove = (event: PointerEvent) => {
    aim(event);
    if (!dragging) {
      renderer.domElement.style.cursor = overCard() ? 'grab' : 'default';
      return;
    }
    if (!raycaster.ray.intersectPlane(plane, hit)) return;
    dragTarget.copy(hit).sub(dragOffset);
    // O cordão não estica: o cartão fica ao alcance do gancho.
    tmp.copy(dragTarget).sub(anchor);
    if (tmp.length() > reach) dragTarget.copy(anchor).addScaledVector(tmp.normalize(), reach);
  };
  const onUp = (event: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    renderer.domElement.releasePointerCapture(event.pointerId);
    renderer.domElement.style.cursor = 'grab';
  };
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointermove', onMove);
  renderer.domElement.addEventListener('pointerup', onUp);
  renderer.domElement.addEventListener('pointercancel', onUp);

  /* ---------- tamanho, visibilidade e o laço ---------- */
  const resize = () => {
    const width = host.clientWidth || 1;
    const height = host.clientHeight || 1;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(host);

  let visible = true;
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
  });
  intersection.observe(host);

  let frame = 0;
  let last = performance.now();
  let accumulator = 0;
  const loop = (now: number) => {
    frame = requestAnimationFrame(loop);
    const elapsed = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!visible || document.visibilityState === 'hidden') return;
    accumulator += elapsed;
    while (accumulator >= DT) {
      step();
      accumulator -= DT;
    }
    place();
    renderer.render(scene, camera);
  };
  place();
  frame = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    intersection.disconnect();
    renderer.domElement.removeEventListener('pointerdown', onDown);
    renderer.domElement.removeEventListener('pointermove', onMove);
    renderer.domElement.removeEventListener('pointerup', onUp);
    renderer.domElement.removeEventListener('pointercancel', onUp);
    for (const item of disposables) item.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };
}
