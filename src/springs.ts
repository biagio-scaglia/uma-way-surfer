import * as THREE from 'three';
import type { Character } from './character';

const STEP = 1 / 60;
const GROUND = 0.04;

interface Tuning { stiffness: number; damping: number; gravity: number; wind: number; collide: boolean }

const GROUPS: [RegExp, Tuning][] = [
  [/^Sp_Hi_MSkirt/, { stiffness: 36, damping: 0.4, gravity: 1.2, wind: 1.2, collide: true }],
  [/^Sp_Hi_Tail/, { stiffness: 12, damping: 0.25, gravity: 0.6, wind: 3, collide: false }],
  [/^Sp_He_Ear/, { stiffness: 55, damping: 0.45, gravity: 0, wind: 1.2, collide: false }],
  [/^Sp_He_/, { stiffness: 20, damping: 0.3, gravity: 1, wind: 2.2, collide: false }],
  [/^Sp_El_/, { stiffness: 42, damping: 0.4, gravity: 1, wind: 1, collide: false }],
  [/^Sp_(Ch_Ribbon|An_|Si_)/, { stiffness: 16, damping: 0.25, gravity: 1, wind: 3, collide: false }],
];

interface Joint {
  bone: THREE.Bone;
  axis: THREE.Vector3;
  restQ: THREE.Quaternion;
  length: number;
  tail: THREE.Vector3;
  prev: THREE.Vector3;
  tuning: Tuning;
}

interface Collider { bone: THREE.Bone; offset: THREE.Vector3; radius: number; center: THREE.Vector3 }

const v0 = new THREE.Vector3();
const v1 = new THREE.Vector3();
const next = new THREE.Vector3();
const bonePos = new THREE.Vector3();
const q0 = new THREE.Quaternion();
const q1 = new THREE.Quaternion();
const q2 = new THREE.Quaternion();
const windDir = new THREE.Vector3(0, 0, 1);

export class Springs {
  private joints: Joint[] = [];
  private colliders: Collider[] = [];
  private acc = 0;

  constructor(character: Character) {
    for (const bone of character.bones.values()) {
      const parsed = bone.name.match(/^(Sp_.+?)_00_\d+$/);
      if (parsed) this.addChain(bone, parsed[1]);
    }
    const meter = bonePos.setFromMatrixPosition(character.bone('Hip').matrixWorld).y / 0.95;
    for (const side of ['L', 'R']) {
      const thigh = character.bone(`Thigh_${side}`);
      const knee = character.bone(`Knee_${side}`);
      const mid = knee.position.clone().multiplyScalar(0.5);
      this.colliders.push(
        { bone: thigh, offset: new THREE.Vector3(), radius: 0.1 * meter, center: new THREE.Vector3() },
        { bone: thigh, offset: mid, radius: 0.085 * meter, center: new THREE.Vector3() },
        { bone: knee, offset: new THREE.Vector3(), radius: 0.07 * meter, center: new THREE.Vector3() },
      );
    }
  }

  private addChain(rootBone: THREE.Bone, prefix: string) {
    const tuning = GROUPS.find(([pattern]) => pattern.test(prefix))?.[1];
    if (!tuning) return;
    let bone = rootBone;
    for (let index = 1; ; index++) {
      const childName = new RegExp(`^${prefix}_${String(index).padStart(2, '0')}_\\d+$`);
      const child = bone.children.find(c => childName.test(c.name)) as THREE.Bone | undefined;
      if (!child) return;
      const tail = child.getWorldPosition(new THREE.Vector3());
      this.joints.push({
        bone,
        axis: child.position.clone().normalize(),
        restQ: bone.quaternion.clone(),
        length: tail.distanceTo(bone.getWorldPosition(new THREE.Vector3())),
        tail,
        prev: tail.clone(),
        tuning,
      });
      bone = child;
    }
  }

  update(dt: number, windAmount: number) {
    this.acc = Math.min(this.acc + dt, STEP * 3);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.solve(windAmount);
    }
  }

  private solve(windAmount: number) {
    for (const c of this.colliders) c.center.copy(c.offset).applyMatrix4(c.bone.matrixWorld);

    for (const j of this.joints) {
      j.bone.updateWorldMatrix(false, false);
      bonePos.setFromMatrixPosition(j.bone.matrixWorld);
      j.bone.parent!.getWorldQuaternion(q0);
      q1.copy(q0).multiply(j.restQ);

      const { stiffness, damping, gravity, wind, collide } = j.tuning;
      v0.copy(j.axis).applyQuaternion(q1);

      next.copy(j.tail).sub(j.prev).multiplyScalar(1 - damping).add(j.tail)
        .addScaledVector(v0, j.length * stiffness * STEP);
      next.y -= j.length * gravity * STEP;
      next.addScaledVector(windDir, j.length * wind * windAmount * STEP);
      j.prev.copy(j.tail);

      this.constrain(j, bonePos);
      if (next.y < GROUND) {
        next.y = GROUND;
        this.constrain(j, bonePos);
      }
      if (collide) {
        for (const c of this.colliders) {
          v1.copy(next).sub(c.center);
          const d = v1.length();
          if (d < c.radius && d > 0) {
            next.copy(c.center).addScaledVector(v1, c.radius / d);
            this.constrain(j, bonePos);
          }
        }
      }
      j.tail.copy(next);

      v1.copy(next).sub(bonePos).normalize().applyQuaternion(q2.copy(q1).invert());
      j.bone.quaternion.copy(j.restQ).multiply(q2.setFromUnitVectors(j.axis, v1));
      j.bone.updateWorldMatrix(false, false);
    }
  }

  private constrain(j: Joint, origin: THREE.Vector3) {
    v1.copy(next).sub(origin).setLength(j.length);
    next.copy(origin).add(v1);
  }
}
