import * as THREE from 'three';
import { curved } from './toon';

const MAX_PARTICLES = 160;
const PETALS = 56;
const GRAVITY = 9;
const CALM_AMOUNT = 0.35;

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; total: number; size: number; scroll: number;
}

export interface BurstOptions { speed?: number; size?: number; life?: number; scroll?: number }

const dummy = new THREE.Object3D();
const tint = new THREE.Color();

export class Effects {
  calm = false;
  private mesh: THREE.InstancedMesh;
  private petals: THREE.InstancedMesh;
  private pool: Particle[] = [];
  private cursor = 0;
  private petalSeeds: { x: number; y: number; z: number; phase: number }[] = [];

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 0),
      curved(new THREE.MeshBasicMaterial({ color: 0xffffff })),
      MAX_PARTICLES,
    );
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, tint.set(0xffffff));
    scene.add(this.mesh);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.pool.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, total: 1, size: 0, scroll: 0 });
    }

    this.petals = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.13, 0.09),
      curved(new THREE.MeshBasicMaterial({ color: 0xffd5e1, side: THREE.DoubleSide })),
      PETALS,
    );
    this.petals.frustumCulled = false;
    scene.add(this.petals);
    for (let i = 0; i < PETALS; i++) {
      this.petalSeeds.push({
        x: (Math.random() - 0.5) * 26,
        y: Math.random() * 9,
        z: -Math.random() * 48,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  burst(x: number, y: number, z: number, count: number, colors: number[], options: BurstOptions = {}) {
    const { speed = 3.5, size = 0.045, life = 0.55, scroll = 0.4 } = options;
    const amount = Math.ceil(count * (this.calm ? CALM_AMOUNT : 1));
    for (let i = 0; i < amount; i++) {
      const slot = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;
      const angle = Math.random() * Math.PI * 2;
      const p = this.pool[slot];
      p.x = x; p.y = y; p.z = z;
      p.vx = Math.cos(angle) * speed * (0.4 + Math.random() * 0.6);
      p.vy = speed * (0.5 + Math.random() * 0.8);
      p.vz = Math.sin(angle) * speed * (0.4 + Math.random() * 0.6);
      p.life = p.total = life * (0.7 + Math.random() * 0.5);
      p.size = size * (0.7 + Math.random() * 0.6);
      p.scroll = scroll;
      this.mesh.setColorAt(slot, tint.set(colors[i % colors.length]));
    }
  }

  update(dt: number, speed: number, time: number) {
    this.pool.forEach((p, i) => {
      if (p.life > 0) {
        p.life -= dt;
        p.vy -= GRAVITY * dt;
        p.x += p.vx * dt;
        p.y = Math.max(0.03, p.y + p.vy * dt);
        p.z += (p.vz + speed * p.scroll) * dt;
      }
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(p.life > 0 ? p.size * Math.min(1, p.life / p.total * 2) : 0);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;

    this.petals.visible = !this.calm;
    if (this.calm) return;
    this.petalSeeds.forEach((seed, i) => {
      seed.z += (speed + 1.2) * dt;
      seed.y -= 0.7 * dt;
      if (seed.z > 9) seed.z -= 48;
      if (seed.y < 0) seed.y += 9;
      dummy.position.set(seed.x + Math.sin(time + seed.phase) * 0.5, seed.y, seed.z);
      dummy.rotation.set(time * 1.3 + seed.phase, time * 0.9 + seed.phase, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      this.petals.setMatrixAt(i, dummy.matrix);
    });
    this.petals.instanceMatrix.needsUpdate = true;
  }
}
