import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LANE_X, MILESTONE, type Kind, type Sim } from './sim';
import type { Props } from './props';
import { curve, curved, toonGradient } from './toon';

const LOOP = 96;
const TILE = 8;
const VISIBLE_NEAR = 12;
const VISIBLE_FAR = -215;
const OCCLUSION = 0.2;
const CARROT_SCALE = 0.85;

// The background stays pale and quiet; only what the player must react to is saturated.
const COLORS = {
  turfA: 0x5fbb6d, turfB: 0x52aa61, turfShadow: 0x3f8f50, verge: 0xaed89a, chalk: 0xfbf8ef, rail: 0xfaf7ee,
  path: 0xe6d5ae, hedge: 0x7cb878, hedgeLight: 0x93c98c,
  trunk: 0x927268, sakura: 0xfbd0dc, sakuraPale: 0xfde4eb,
  stand: 0xf3eee3, standBlue: 0xcfdde7, roof: 0xf8d8d2, flagA: 0xa9c7e8, flagB: 0xf2b8b2,
  poleRed: 0xe0787a,
  hurdle: 0xff5a1f, brush: 0x1f7a3f, brushLight: 0x34994f,
  gate: 0x1f62e0, gold: 0xffc53d,
  block: 0xffc21f, ink: 0x1c3250, silk: 0xc8173d,
  carrot: 0xff8412, carrotDark: 0xe2670a, leaf: 0x3fb13a, leafLight: 0x62c956,
  skin: 0xf6dcc8, skinWarm: 0xd9a988,
  lampPost: 0x4a5670, lampOff: 0xeae6da, lampOn: 0xfff1b0, lampGlow: 0xffd98a,
  petalPink: 0xf7a8c0, petalYellow: 0xffdc73, petalLilac: 0xc9b3f2, tuft: 0x8cc47b, stone: 0xd8d2c4,
  hill: 0xbfdccb, hillFar: 0xd2e6dc, cloud: 0xffffff,
};

const CROWD = [0xe8a0a8, 0xa9c7e8, 0xf3d98f, 0xb9dbb0, 0xd9c2ec, 0xf6f1e6];

type G = THREE.BufferGeometry;

function paint(geometry: G, hex: number): G {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.deleteAttribute('uv');
  g.computeBoundingBox();
  const { min, max } = g.boundingBox!;
  const height = max.y - min.y;
  const position = g.attributes.position;
  const color = new THREE.Color(hex);
  const data = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const shade = height > 0.25 ? 1 - OCCLUSION * (1 - (position.getY(i) - min.y) / height) : 1;
    data[i * 3] = color.r * shade;
    data[i * 3 + 1] = color.g * shade;
    data[i * 3 + 2] = color.b * shade;
  }
  g.setAttribute('color', new THREE.BufferAttribute(data, 3));
  return g;
}

const box = (w: number, h: number, d: number, x: number, y: number, z: number, c: number) =>
  paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), c);

const soft = (w: number, h: number, d: number, radius: number, x: number, y: number, z: number, c: number) =>
  paint(new RoundedBoxGeometry(w, h, d, 2, radius).translate(x, y, z), c);

const post = (radius: number, h: number, x: number, y: number, z: number, c: number) =>
  paint(new THREE.CylinderGeometry(radius, radius, h, 8).translate(x, y, z), c);

// Radial normals make foliage read as soft round puffs instead of faceted rocks.
function blob(r: number, x: number, y: number, z: number, c: number, detail = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  g.setAttribute('normal', g.attributes.position.clone());
  g.normalizeNormals();
  return paint(g.translate(x, y, z), c);
}

/** Triangular prism with its point facing down. */
const chevron = (r: number, x: number, y: number, z: number, c: number) =>
  paint(new THREE.CylinderGeometry(r, r, 0.05, 3).rotateX(Math.PI / 2).translate(x, y, z), c);

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
    parts.push(box(6.4, 0.1, TILE / 2, 0, -0.05, tz + TILE / 4, i % 2 ? COLORS.turfA : COLORS.turfB));
    parts.push(box(6.4, 0.1, TILE / 2, 0, -0.05, tz - TILE / 4, i % 2 ? COLORS.turfB : COLORS.turfA));
    for (const side of [-1, 1]) {
      parts.push(box(1, 0.1, TILE, side * 3.7, -0.05, tz, COLORS.path));
      parts.push(box(70, 0.1, TILE, side * 39.2, -0.08, tz, COLORS.verge));
      if (i % 2) parts.push(box(0.09, 0.02, TILE, side, 0.01, tz, COLORS.chalk));
    }
  }
}

function fences(parts: G[], z: number) {
  for (let i = 0; i < LOOP / 4; i++) {
    const tz = z - i * 4;
    for (const side of [-1, 1]) {
      const x = side * 3.6;
      parts.push(post(0.06, 1.1, x, 0.55, tz, COLORS.rail));
      parts.push(paint(new THREE.CylinderGeometry(0.06, 0.06, 4, 6).rotateX(Math.PI / 2).translate(x, 1.08, tz - 2), COLORS.rail));
      parts.push(blob(0.85, side * 5, 0.42, tz - 1, COLORS.hedge, 2));
      parts.push(blob(0.62, side * 4.9, 0.72, tz - 2.6, COLORS.hedgeLight, 2));
      if (i % 6 === 0) {
        parts.push(post(0.035, 2.2, x, 2.1, tz, COLORS.rail));
        parts.push(paint(new THREE.ConeGeometry(0.26, 0.8, 3).rotateZ(-side * Math.PI / 2).scale(1, 0.7, 0.15)
          .translate(x + side * 0.4, 2.9, tz), i % 12 ? COLORS.flagA : COLORS.flagB));
      }
    }
  }
  for (let i = 0; i < 6; i++) parts.push(post(0.1, 0.8, 4.05, 3.2 + i * 0.8, z - 2, i % 2 ? COLORS.poleRed : COLORS.rail));
  for (const [x, lz, side] of lampSpots(z)) {
    parts.push(post(0.07, 3.4, x, 1.7, lz, COLORS.lampPost));
    parts.push(soft(0.2, 0.16, 0.2, 0.04, x, 0.08, lz, COLORS.lampPost));
    parts.push(box(LAMP_REACH, 0.07, 0.07, x - side * LAMP_REACH / 2, 3.38, lz, COLORS.lampPost));
    parts.push(soft(0.42, 0.1, 0.42, 0.04, x - side * LAMP_REACH, 3.36, lz, COLORS.lampPost));
  }
}

const LAMP_REACH = 0.6;
const LAMP_EVERY = 16;

/** Street lamps just outside the rail, every 16 m on alternating sides. */
function lampSpots(z: number): [number, number, number][] {
  const spots: [number, number, number][] = [];
  for (let i = 0; i < LOOP / LAMP_EVERY; i++) {
    const side = i % 2 ? 1 : -1;
    spots.push([side * 4, z - i * LAMP_EVERY - 6, side]);
  }
  return spots;
}

function allLampSpots() {
  const spots: [number, number, number][] = [];
  for (let k = -2; k <= 3; k++) spots.push(...lampSpots(-k * LOOP));
  return spots;
}

function grandstand(parts: G[], z: number) {
  const moduleLen = 24;
  for (let m = 0; m < LOOP / moduleLen; m += 2) {
    const mz = z - m * moduleLen - moduleLen / 2;
    for (let step = 0; step < 6; step++) {
      const h = 1.2 + step * 1.3;
      parts.push(box(2, h, moduleLen, -16 - step * 2, h / 2, mz, step % 2 ? COLORS.standBlue : COLORS.stand));
    }
    parts.push(box(15, 0.35, moduleLen + 1.5, -22, 11.6, mz, COLORS.roof));
    parts.push(box(0.2, 0.5, moduleLen + 1.5, -14.55, 11.45, mz, COLORS.silk));
    // Striped awning under the roof; its normals face up so it stays bright from below.
    for (let st = 0; st < 6; st++) {
      const ceiling = box(2.5, 0.04, moduleLen + 1.4, -15.75 - st * 2.5, 11.4, mz, st % 2 ? COLORS.roof : COLORS.rail);
      const normal = ceiling.attributes.normal;
      for (let i = 0; i < normal.count; i++) normal.setXYZ(i, 0, 1, 0);
      parts.push(ceiling);
    }
    // A striped valance along the front of the roof.
    for (let v = 0; v < moduleLen / 0.8; v++) {
      const vz = mz - moduleLen / 2 + 0.4 + v * 0.8;
      parts.push(chevron(0.36, 0, 0, 0, v % 2 ? COLORS.rail : COLORS.silk).rotateY(Math.PI / 2).translate(-14.5, 11.02, vz));
    }
    for (let p = -1; p <= 1; p++) {
      const pz = mz + p * 10.5;
      parts.push(post(0.16, 11.6, -15.5, 5.8, pz, COLORS.stand));
      parts.push(post(0.04, 1.8, -15.5, 12.7, pz, COLORS.rail));
      parts.push(paint(new THREE.ConeGeometry(0.3, 1, 3).rotateZ(-Math.PI / 2).scale(1, 0.7, 0.15)
        .translate(-15, 13.2, pz), p ? COLORS.flagA : COLORS.flagB));
    }
    crowd(parts, mz, moduleLen);
  }
}

/** A quiet, pastel crowd on the terraces: just a body and a head each. */
function crowd(parts: G[], mz: number, moduleLen: number) {
  const rand = seeded(Math.round(mz * 7) | 0);
  for (let step = 0; step < 6; step++) {
    const top = 1.2 + step * 1.3;
    const x = -16 - step * 2 + 0.2;
    for (let s = 0.7; s < moduleLen - 0.5; s += 0.9 + rand() * 0.5) {
      if (rand() < 0.3) continue;
      const pz = mz - moduleLen / 2 + s;
      const height = 0.75 + rand() * 0.2;
      const shirt = CROWD[Math.floor(rand() * CROWD.length)];
      parts.push(paint(new THREE.CylinderGeometry(0.15, 0.22, height, 6).translate(x, top + height / 2, pz), shirt));
      parts.push(blob(0.17, x, top + height + 0.15, pz, rand() < 0.5 ? COLORS.skin : COLORS.skinWarm, 0));
    }
  }
}

/** Adds a Kenney prop, repainting each of its materials from our palette. */
function place(parts: G[], props: Props, name: string, colors: Record<string, number>, scale: number, x: number, z: number, turn = 0) {
  for (const part of props.get(name) ?? []) {
    const g = part.geometry.clone().scale(scale, scale, scale).rotateY(turn).translate(x, 0, z);
    parts.push(paint(g, colors[part.material] ?? colors.other));
  }
}

const TREES = ['tree_oak', 'tree_default', 'tree_detailed', 'tree_fat', 'tree_plateau'];

function trees(parts: G[], props: Props, z: number) {
  const rand = seeded(11);
  for (let i = 0; i < 22; i++) {
    const right = i % 5 !== 0;
    const x = right ? 10 + rand() * 32 : -(46 + rand() * 12);
    const tz = z - rand() * LOOP;
    const size = 1.5 + rand() * 1.4;
    const leaves = i % 3 ? COLORS.sakura : COLORS.sakuraPale;
    place(parts, props, TREES[i % TREES.length], { leafsGreen: leaves, woodBark: COLORS.trunk, other: COLORS.sakuraPale },
      size * 3.2, x, tz, rand() * Math.PI * 2);
  }
}

const FLOWER_KINDS = ['flower_redA', 'flower_yellowA', 'flower_purpleA'];

function meadow(parts: G[], props: Props, z: number) {
  const rand = seeded(23);
  const flowerColors = { grass: COLORS.hedge, colorRed: COLORS.petalPink, colorYellow: COLORS.petalYellow, colorPurple: COLORS.petalLilac, other: COLORS.hedge };
  for (const side of [-1, 1]) {
    // Flowers at the foot of the hedge, where the eye passes on its way down the track.
    for (let i = 0; i < LOOP / 2; i++) {
      place(parts, props, FLOWER_KINDS[(i + (side > 0 ? 1 : 0)) % 3], flowerColors,
        1.7 + rand() * 0.5, side * (4.12 + rand() * 0.12), z - i * 2 - rand(), rand() * 6);
    }
    // Beyond the hedge: tufts of grass, a few bushes and stones on the verge.
    for (let i = 0; i < 18; i++) {
      const x = side * (6.2 + rand() * (side > 0 ? 3 : 8));
      const tz = z - rand() * LOOP;
      const pick = rand();
      if (pick < 0.55) place(parts, props, 'grass_large', { grass: COLORS.tuft, other: COLORS.tuft }, 2.6, x, tz, rand() * 6);
      else if (pick < 0.85) place(parts, props, 'plant_bushDetailed', { grass: COLORS.hedgeLight, other: COLORS.hedgeLight }, 2.4, x, tz, rand() * 6);
      else place(parts, props, 'rock_smallA', { grass: COLORS.tuft, dirt: COLORS.stone, other: COLORS.stone }, 2, x, tz, rand() * 6);
    }
  }
}

function buildScenery(material: THREE.Material, props: Props) {
  const parts: G[] = [];
  for (let k = -2; k <= 3; k++) {
    const z = -k * LOOP;
    ground(parts, z);
    fences(parts, z);
    grandstand(parts, z);
    trees(parts, props, z);
    meadow(parts, props, z);
  }
  const mesh = new THREE.Mesh(mergeGeometries(parts), material);
  mesh.frustumCulled = false;
  return mesh;
}

function buildBackdrop() {
  const rand = seeded(5);
  const parts: G[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const x = -340 + i * 85 + rand() * 30;
      const r = 70 + rand() * 40;
      parts.push(paint(new THREE.IcosahedronGeometry(1, 2).scale(r, r * 0.38, 30).translate(x, -6, side * 430), i % 2 ? COLORS.hill : COLORS.hillFar));
    }
    for (let i = 0; i < 12; i++) {
      const x = -300 + rand() * 600;
      const y = 62 + rand() * 90;
      const r = 12 + rand() * 12;
      for (let puff = -1; puff <= 1; puff++) {
        parts.push(paint(new THREE.IcosahedronGeometry(1, 2).scale(r * (puff ? 0.8 : 1.1), r * 0.5, 10)
          .translate(x + puff * r * 1.05, y + (puff ? -r * 0.12 : 0), side * 390), COLORS.cloud));
      }
    }
  }
  const mesh = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  mesh.frustumCulled = false;
  return mesh;
}

function hurdleGeometry() {
  const parts = [
    box(2.1, 0.01, 0.8, 0, 0.025, 0, COLORS.turfShadow),
    soft(0.5, 0.1, 0.5, 0.04, -0.92, 0.06, 0, COLORS.rail),
    soft(0.5, 0.1, 0.5, 0.04, 0.92, 0.06, 0, COLORS.rail),
    post(0.08, 1.05, -0.92, 0.52, 0, COLORS.rail),
    post(0.08, 1.05, 0.92, 0.52, 0, COLORS.rail),
  ];
  for (let i = -3; i <= 3; i++) {
    const c = i % 2 ? COLORS.rail : COLORS.hurdle;
    parts.push(soft(0.26, 0.2, 0.1, 0.03, i * 0.26, 0.58, 0, c));
    parts.push(soft(0.26, 0.13, 0.08, 0.03, i * 0.26, 0.3, 0, i % 2 ? COLORS.hurdle : COLORS.rail));
  }
  for (let i = -3; i <= 3; i++) {
    parts.push(blob(0.2, i * 0.29, 0.88, 0, COLORS.brush));
    parts.push(blob(0.13, i * 0.29 + 0.1, 1.02, 0.03, COLORS.brushLight));
  }
  return mergeGeometries(parts);
}

function gateGeometry() {
  const parts = [
    box(2.1, 0.01, 0.7, 0, 0.025, 0, COLORS.turfShadow),
    post(0.11, 3.05, -0.93, 1.52, 0, COLORS.rail),
    post(0.11, 3.05, 0.93, 1.52, 0, COLORS.rail),
    soft(2.1, 0.24, 0.3, 0.08, 0, 3.05, 0, COLORS.ink),
    soft(1.72, 1.3, 0.1, 0.04, 0, 2.02, 0, COLORS.gate),
    soft(1.72, 0.1, 0.13, 0.03, 0, 1.4, 0, COLORS.rail),
  ];
  for (let i = -1; i <= 1; i++) parts.push(chevron(0.3, i * 0.55, 2.2, 0.07, COLORS.rail));
  for (let i = -4; i <= 4; i++) parts.push(chevron(0.1, i * 0.19, 1.26, 0, COLORS.gold));
  return mergeGeometries(parts);
}

function blockGeometry() {
  const parts = [
    box(2.1, 0.01, 6.5, 0, 0.025, -3, COLORS.turfShadow),
    soft(1.8, 2.7, 6, 0.1, 0, 1.35, -3, COLORS.block),
    soft(2, 0.3, 6.25, 0.1, 0, 2.82, -3, COLORS.ink),
    soft(1.48, 2.2, 0.12, 0.08, 0, 1.26, 0.03, COLORS.ink),
    paint(new RoundedBoxGeometry(1.5, 0.24, 0.05, 2, 0.02).rotateZ(0.78).translate(0, 1.32, 0.12), COLORS.block),
    paint(new RoundedBoxGeometry(1.5, 0.24, 0.05, 2, 0.02).rotateZ(-0.78).translate(0, 1.32, 0.13), COLORS.block),
  ];
  for (let z = 1; z < 6; z++) parts.push(soft(1.86, 2.1, 0.16, 0.05, 0, 1.2, -z, COLORS.rail));
  return mergeGeometries(parts);
}

function carrotGeometry() {
  const profile = [[0, -0.46], [0.06, -0.34], [0.13, -0.08], [0.19, 0.2], [0.17, 0.32], [0.09, 0.37], [0, 0.38]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const parts = [paint(new THREE.LatheGeometry(profile, 12), COLORS.carrot)];
  for (const [r, y] of [[0.155, 0.12], [0.11, -0.12], [0.075, -0.28]]) {
    parts.push(paint(new THREE.TorusGeometry(r, 0.012, 4, 12).rotateX(Math.PI / 2).translate(0, y, 0), COLORS.carrotDark));
  }
  for (let i = 0; i < 5; i++) {
    const angle = (i - 2) * 0.42;
    parts.push(paint(new THREE.IcosahedronGeometry(1, 1).scale(0.07, 0.17, 0.03)
      .translate(0, 0.16, 0).rotateZ(angle).translate(0, 0.35, 0), i % 2 ? COLORS.leafLight : COLORS.leaf));
  }
  return mergeGeometries(parts);
}

function archGeometry() {
  const parts: G[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 7; i++) parts.push(post(0.2, 1, side * 4.35, 0.5 + i, 0, i % 2 ? COLORS.silk : COLORS.rail));
    parts.push(blob(0.34, side * 4.35, 7.25, 0, COLORS.gold));
  }
  parts.push(soft(8.7, 1.2, 0.24, 0.1, 0, 6.5, 0, COLORS.silk));
  parts.push(soft(8.7, 0.13, 0.3, 0.05, 0, 7.05, 0, COLORS.gold));
  parts.push(soft(8.7, 0.13, 0.3, 0.05, 0, 5.95, 0, COLORS.gold));
  for (let i = -10; i <= 10; i++) parts.push(chevron(0.2, i * 0.4, 5.72, 0, i % 2 ? COLORS.gold : COLORS.rail));
  return mergeGeometries(parts);
}

function glowTexture(inner: string, outer: string) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(1, outer);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

function buildLampLights() {
  const glass: G[] = [];
  const glowAt: number[] = [];
  const pools: G[] = [];
  for (const [x, z, side] of allLampSpots()) {
    const lx = x - side * LAMP_REACH;
    glass.push(new THREE.CylinderGeometry(0.15, 0.11, 0.28, 8).translate(lx, 3.17, z));
    glowAt.push(lx, 3.15, z);
    pools.push(new THREE.CircleGeometry(1.9, 20).rotateX(-Math.PI / 2).scale(1, 1, 1.4).translate(lx, 0.03, z));
  }
  const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 };
  const glassMesh = new THREE.Mesh(mergeGeometries(glass), curved(new THREE.MeshBasicMaterial({ color: COLORS.lampOff })));
  const points = new THREE.BufferGeometry();
  points.setAttribute('position', new THREE.Float32BufferAttribute(glowAt, 3));
  const glow = new THREE.Points(points, curved(new THREE.PointsMaterial({
    ...additive, color: COLORS.lampGlow, size: 2.6, map: glowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'),
  })));
  const poolMesh = new THREE.Mesh(mergeGeometries(pools), curved(new THREE.MeshBasicMaterial({
    ...additive, color: COLORS.lampGlow, map: glowTexture('rgba(255,255,255,.9)', 'rgba(255,255,255,0)'),
  })));
  for (const o of [glassMesh, glow, poolMesh]) o.frustumCulled = false;
  return [glassMesh, glow, poolMesh] as const;
}

function shadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(24,60,48,.5)');
  gradient.addColorStop(1, 'rgba(24,60,48,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

export class World {
  private scenery: THREE.Mesh;
  private backdrop: THREE.Mesh;
  private instances: Record<Kind, THREE.InstancedMesh>;
  private carrots: THREE.InstancedMesh;
  private arches: THREE.InstancedMesh;
  private shadow: THREE.Mesh;
  private lampGlass: THREE.Mesh<G, THREE.MeshBasicMaterial>;
  private lampGlow: THREE.Points<G, THREE.PointsMaterial>;
  private lampPools: THREE.Mesh<G, THREE.MeshBasicMaterial>;
  private matrix = new THREE.Matrix4();
  private spin = new THREE.Matrix4();
  private lampColor = new THREE.Color();

  /** Lights the lamps as night falls and tints the distant hills and clouds. */
  setLight(night: number, tint: THREE.Color) {
    const on = THREE.MathUtils.smoothstep(night, 0.25, 0.7);
    this.lampGlass.material.color.setHex(COLORS.lampOff).lerp(this.lampColor.setHex(COLORS.lampOn), on);
    this.lampGlow.material.opacity = on * 0.9;
    this.lampPools.material.opacity = on * 0.5;
    this.lampGlow.visible = this.lampPools.visible = on > 0.01;
    (this.backdrop.material as THREE.MeshBasicMaterial).color.copy(tint);
  }

  constructor(scene: THREE.Scene, props: Props) {
    const material = curved(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient }));
    this.scenery = buildScenery(material, props);
    scene.add(this.scenery);
    [this.lampGlass, this.lampGlow, this.lampPools] = buildLampLights();
    this.scenery.add(this.lampGlass, this.lampGlow, this.lampPools);
    this.backdrop = buildBackdrop();
    scene.add(this.backdrop);

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
    this.arches = instanced(archGeometry(), 2);

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2),
      curved(new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false })),
    );
    this.shadow.position.y = 0.04;
    this.shadow.frustumCulled = false;
    scene.add(this.shadow);
  }

  sync(sim: Sim, time: number) {
    this.scenery.position.z = sim.distance % LOOP;
    this.backdrop.position.x = Math.sin(time * 0.02) * 24;
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
    this.spin.makeRotationY(time * 3).scale(new THREE.Vector3(CARROT_SCALE, CARROT_SCALE, CARROT_SCALE));
    for (const c of sim.carrots) {
      const z = sim.distance - c.s;
      if (z > VISIBLE_NEAR || z < VISIBLE_FAR) continue;
      this.matrix.makeTranslation(LANE_X[c.lane], c.y + Math.sin(time * 4 + c.s) * 0.06, z).multiply(this.spin);
      this.carrots.setMatrixAt(carrotCount++, this.matrix);
    }
    this.carrots.count = carrotCount;
    this.carrots.instanceMatrix.needsUpdate = true;

    let archCount = 0;
    for (const meters of [sim.nextMilestone, sim.nextMilestone - MILESTONE]) {
      const z = sim.distance - meters;
      if (meters <= 0 || z > VISIBLE_NEAR || z < VISIBLE_FAR) continue;
      this.matrix.makeTranslation(0, 0, z);
      this.arches.setMatrixAt(archCount++, this.matrix);
    }
    this.arches.count = archCount;
    this.arches.instanceMatrix.needsUpdate = true;

    this.shadow.position.x = sim.x;
    this.shadow.scale.setScalar(Math.max(0.45, 1 - sim.y * 0.3) * (sim.sliding ? 1.25 : 1));
  }
}
