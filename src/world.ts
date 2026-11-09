import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LANE_X, type Kind, type Sim } from './sim';
import { curve, curved, toonGradient } from './toon';

const LOOP = 96;
const TILE = 8;
const VISIBLE_NEAR = 12;
const VISIBLE_FAR = -215;

const COLORS = {
  turfA: 0x4faa5c, turfB: 0x469c53, verge: 0x7cbf63, chalk: 0xf8f5e9, rail: 0xffffff,
  trunk: 0x6a4a44, sakura: 0xffb4cb, sakuraPale: 0xffd2df, standDark: 0x35506e, standLight: 0xdfe6ea,
  roof: 0xc8203f, hurdle: 0xf0641e, brush: 0x2f7d44, gate: 0x2467d6, block: 0xf2b632, ink: 0x1c3250,
  carrot: 0xff8a1f, leaf: 0x46a83f,
};

type G = THREE.BufferGeometry;

function paint(geometry: G, hex: number): G {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.deleteAttribute('uv');
  const color = new THREE.Color(hex);
  const data = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < data.length; i += 3) { data[i] = color.r; data[i + 1] = color.g; data[i + 2] = color.b; }
  g.setAttribute('color', new THREE.BufferAttribute(data, 3));
  return g;
}

const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: number) =>
  paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), c);

const blob = (r: number, x: number, y: number, z: number, c: number) =>
  paint(new THREE.IcosahedronGeometry(r, 1).translate(x, y, z), c);

function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ground(parts: G[], z: number) {
  for (let i = 0; i < LOOP / TILE; i++) {
    const tz = z - i * TILE - TILE / 2;
    parts.push(box(6.4, 0.1, TILE, 0, -0.05, tz, i % 2 ? COLORS.turfA : COLORS.turfB));
    for (const side of [-1, 1]) {
      parts.push(box(70, 0.1, TILE, side * 38.2, -0.08, tz, COLORS.verge));
      if (i % 2) parts.push(box(0.09, 0.02, TILE, side, 0.01, tz, COLORS.chalk));
    }
  }
}

function rails(parts: G[], z: number) {
  for (let i = 0; i < LOOP / 4; i++) {
    const tz = z - i * 4;
    for (const side of [-1, 1]) {
      const x = side * 3.6;
      parts.push(box(0.12, 1.1, 0.12, x, 0.55, tz, COLORS.rail));
      parts.push(box(0.14, 0.14, 4, x, 1.1, tz - 2, COLORS.rail));
      if (i % 6 === 0) {
        parts.push(box(0.07, 1.9, 0.07, x, 2, tz, COLORS.rail));
        parts.push(paint(new THREE.ConeGeometry(0.3, 0.9, 3).rotateZ(-side * Math.PI / 2).scale(1, 0.7, 0.15)
          .translate(x + side * 0.45, 2.65, tz), i % 12 ? COLORS.gate : COLORS.roof));
      }
    }
  }
  for (let i = 0; i < 6; i++) {
    parts.push(box(0.2, 0.8, 0.2, 3.95, 3.2 + i * 0.8, z - 2, i % 2 ? COLORS.roof : COLORS.rail));
  }
}

function grandstand(parts: G[], z: number) {
  const moduleLen = 24;
  for (let m = 0; m < LOOP / moduleLen; m += 2) {
    const mz = z - m * moduleLen - moduleLen / 2;
    for (let step = 0; step < 6; step++) {
      parts.push(box(2, 1.5 + step * 1.5, moduleLen, -14 - step * 2, (1.5 + step * 1.5) / 2, mz,
        step % 2 ? COLORS.standDark : COLORS.standLight));
    }
    parts.push(box(16, 0.4, moduleLen + 2, -19, 14, mz, COLORS.roof));
    for (let p = -1; p <= 1; p++) parts.push(box(0.4, 14, 0.4, -12.5, 7, mz + p * 10, COLORS.standLight));
  }
}

function trees(parts: G[], z: number) {
  const rand = seeded(11);
  for (let i = 0; i < 26; i++) {
    const right = i % 5 !== 0;
    const x = (right ? 1 : -1) * (right ? 7 + rand() * 32 : 36 + rand() * 12);
    const tz = z - rand() * LOOP;
    const size = 1.5 + rand() * 1.4;
    parts.push(box(0.5, size * 2, 0.5, x, size, tz, COLORS.trunk));
    parts.push(blob(size * 1.25, x, size * 2.5, tz, COLORS.sakura));
    parts.push(blob(size * 0.85, x + size * 0.8, size * 2.1, tz + 0.5, COLORS.sakuraPale));
    parts.push(blob(size * 0.8, x - size * 0.8, size * 2.25, tz - 0.4, COLORS.sakura));
  }
}

function buildScenery(material: THREE.Material) {
  const parts: G[] = [];
  for (let k = -2; k <= 4; k++) {
    const z = -k * LOOP;
    ground(parts, z);
    rails(parts, z);
    grandstand(parts, z);
    trees(parts, z);
  }
  const mesh = new THREE.Mesh(mergeGeometries(parts), material);
  mesh.frustumCulled = false;
  return mesh;
}

function hurdleGeometry() {
  const parts = [
    box(0.14, 1.05, 0.14, -0.92, 0.52, 0, COLORS.rail),
    box(0.14, 1.05, 0.14, 0.92, 0.52, 0, COLORS.rail),
    box(1.9, 0.16, 0.08, 0, 0.32, 0, COLORS.rail),
    box(1.9, 0.16, 0.08, 0, 0.6, 0, COLORS.hurdle),
    box(1.9, 0.22, 0.34, 0, 0.92, 0, COLORS.brush),
  ];
  for (let i = -2; i <= 2; i++) parts.push(box(0.3, 0.2, 0.09, i * 0.4, 0.6, 0, i % 2 ? COLORS.rail : COLORS.hurdle));
  return mergeGeometries(parts);
}

function gateGeometry() {
  const parts = [
    box(0.2, 3, 0.2, -0.92, 1.5, 0, COLORS.rail),
    box(0.2, 3, 0.2, 0.92, 1.5, 0, COLORS.rail),
    box(1.7, 1.25, 0.1, 0, 1.8, 0, COLORS.gate),
    box(1.7, 0.14, 0.13, 0, 1.2, 0, COLORS.rail),
    box(1.7, 0.14, 0.13, 0, 2.4, 0, COLORS.rail),
    box(2, 0.2, 0.3, 0, 3, 0, COLORS.ink),
  ];
  for (let i = -1; i <= 1; i++) parts.push(paint(new THREE.ConeGeometry(0.22, 0.5, 3).rotateX(Math.PI).scale(1, 1, 0.1)
    .translate(i * 0.55, 1.8, 0.1), COLORS.rail));
  return mergeGeometries(parts);
}

function blockGeometry() {
  const parts = [
    box(1.8, 2.7, 6, 0, 1.35, -3, COLORS.block),
    box(1.9, 0.26, 6.1, 0, 2.8, -3, COLORS.ink),
    box(1.45, 2.1, 0.1, 0, 1.25, 0.03, COLORS.ink),
    box(1.45, 0.24, 0.14, 0, 1.2, 0.08, COLORS.block),
    box(1.45, 0.24, 0.14, 0, 1.9, 0.08, COLORS.block),
  ];
  for (let z = 1; z < 6; z++) parts.push(box(1.84, 2.2, 0.16, 0, 1.2, -z, COLORS.rail));
  return mergeGeometries(parts);
}

function carrotGeometry() {
  const parts = [paint(new THREE.ConeGeometry(0.17, 0.62, 8).rotateX(Math.PI), COLORS.carrot)];
  for (let i = -1; i <= 1; i++) {
    parts.push(paint(new THREE.ConeGeometry(0.06, 0.32, 5).rotateZ(i * 0.45).translate(i * 0.08, 0.42, 0), COLORS.leaf));
  }
  return mergeGeometries(parts);
}

function shadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(24,40,40,.55)');
  gradient.addColorStop(1, 'rgba(24,40,40,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

export class World {
  private scenery: THREE.Mesh;
  private instances: Record<Kind, THREE.InstancedMesh>;
  private carrots: THREE.InstancedMesh;
  private shadow: THREE.Mesh;
  private matrix = new THREE.Matrix4();
  private spin = new THREE.Matrix4();

  constructor(scene: THREE.Scene) {
    const material = curved(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient }));
    this.scenery = buildScenery(material);
    scene.add(this.scenery);

    const instanced = (geometry: G, count: number) => {
      const mesh = new THREE.InstancedMesh(geometry, material, count);
      mesh.frustumCulled = false;
      mesh.count = 0;
      scene.add(mesh);
      return mesh;
    };
    this.instances = {
      hurdle: instanced(hurdleGeometry(), 64),
      gate: instanced(gateGeometry(), 64),
      block: instanced(blockGeometry(), 64),
    };
    this.carrots = instanced(carrotGeometry(), 180);

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2),
      curved(new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false })),
    );
    this.shadow.position.y = 0.03;
    this.shadow.frustumCulled = false;
    scene.add(this.shadow);
  }

  sync(sim: Sim, time: number) {
    this.scenery.position.z = sim.distance % LOOP;
    curve.uCurveX.value = Math.sin(sim.distance * 0.006) * 0.0016;

    const counts: Record<Kind, number> = { hurdle: 0, gate: 0, block: 0 };
    for (const o of sim.obstacles) {
      const z = sim.distance - o.s;
      if (z > VISIBLE_NEAR || z < VISIBLE_FAR) continue;
      this.matrix.makeTranslation(LANE_X[o.lane], 0, z);
      this.instances[o.kind].setMatrixAt(counts[o.kind]++, this.matrix);
    }
    for (const kind of Object.keys(counts) as Kind[]) {
      this.instances[kind].count = counts[kind];
      this.instances[kind].instanceMatrix.needsUpdate = true;
    }

    let carrotCount = 0;
    this.spin.makeRotationY(time * 3);
    for (const c of sim.carrots) {
      const z = sim.distance - c.s;
      if (z > VISIBLE_NEAR || z < VISIBLE_FAR) continue;
      this.matrix.makeTranslation(LANE_X[c.lane], c.y + Math.sin(time * 4 + c.s) * 0.06, z).multiply(this.spin);
      this.carrots.setMatrixAt(carrotCount++, this.matrix);
    }
    this.carrots.count = carrotCount;
    this.carrots.instanceMatrix.needsUpdate = true;

    this.shadow.position.x = sim.x;
    this.shadow.scale.setScalar(Math.max(0.45, 1 - sim.y * 0.3) * (sim.sliding ? 1.25 : 1));
  }
}
