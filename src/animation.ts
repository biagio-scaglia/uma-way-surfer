import * as THREE from 'three';
import type { Character } from './character';
import { JUMP_V, LANE_X, type Sim } from './sim';
import { Springs } from './springs';

// The rig rests in a T-pose with identity bone rotations and the character facing +Z.
// Thigh.x < 0 swings forward, Knee.x > 0 bends, Arm.z drops the arm,
// Elbow.y bends the forearm forward (negative on the left, positive on the right).
const NAMES = [
  'Hip', 'Waist', 'Spine', 'Chest', 'Neck', 'Head',
  'Thigh_L', 'Thigh_R', 'Knee_L', 'Knee_R', 'Ankle_L', 'Ankle_R',
  'Arm_L', 'Arm_R', 'Elbow_L', 'Elbow_R', 'Wrist_L', 'Wrist_R',
] as const;
type Joint = (typeof NAMES)[number];
const SLOT = Object.fromEntries(NAMES.map((n, i) => [n, i])) as Record<Joint, number>;

class Pose {
  values = new Float32Array(NAMES.length * 3);
  set(joint: Joint, x: number, y = 0, z = 0) {
    const i = SLOT[joint] * 3;
    this.values[i] = x;
    this.values[i + 1] = y;
    this.values[i + 2] = z;
  }
}

function idle(p: Pose, time: number) {
  const breath = Math.sin(time * 1.9) * 0.018;
  p.set('Hip', 0, 0, Math.sin(time * 0.8) * 0.012);
  p.set('Waist', 0.02);
  p.set('Spine', breath);
  p.set('Chest', breath);
  p.set('Neck', 0);
  p.set('Head', -0.04, Math.sin(time * 0.6) * 0.1);
  for (const side of ['L', 'R'] as const) {
    const sign = side === 'L' ? 1 : -1;
    p.set(`Thigh_${side}`, 0, 0, sign * 0.03);
    p.set(`Knee_${side}`, 0.03);
    p.set(`Ankle_${side}`, -0.03, 0, -sign * 0.03);
    p.set(`Arm_${side}`, 0.05, 0, -sign * 1.32);
    p.set(`Elbow_${side}`, 0, -sign * 0.22);
    p.set(`Wrist_${side}`, 0);
  }
}

function runLeg(p: Pose, side: 'L' | 'R', t: number) {
  // The lift leads the thigh swing so the rear foot leaves the ground early.
  const lift = Math.max(0, -Math.sin(t + 0.5));
  p.set(`Thigh_${side}`, -0.24 - 0.7 * Math.cos(t));
  p.set(`Knee_${side}`, 0.22 + 1.5 * lift);
  p.set(`Ankle_${side}`, 0.12 + 0.55 * lift - 0.18 * Math.cos(t));
}

function runArm(p: Pose, side: 'L' | 'R', t: number) {
  const sign = side === 'L' ? 1 : -1;
  p.set(`Arm_${side}`, -0.1 - 0.8 * Math.cos(t), 0, -sign * 1.2);
  p.set(`Elbow_${side}`, 0, -sign * (1.45 + 0.3 * Math.cos(t)));
  p.set(`Wrist_${side}`, 0, -sign * 0.15);
}

function run(p: Pose, t: number) {
  const swing = Math.cos(t);
  p.set('Hip', 0.05, -0.14 * swing, 0.04 * swing);
  p.set('Waist', 0.15, 0.08 * swing);
  p.set('Spine', 0.1, 0.1 * swing);
  p.set('Chest', 0.08, 0.1 * swing);
  p.set('Neck', -0.08, -0.06 * swing);
  p.set('Head', -0.2, -0.06 * swing);
  runLeg(p, 'L', t);
  runLeg(p, 'R', t + Math.PI);
  runArm(p, 'L', t + Math.PI);
  runArm(p, 'R', t);
}

// rise: 1 at take-off, -1 when falling fast.
function leap(p: Pose, rise: number) {
  const reach = (1 + rise) / 2;
  p.set('Hip', -0.05);
  p.set('Waist', 0.14);
  p.set('Spine', 0.1);
  p.set('Chest', 0.06);
  p.set('Neck', -0.05);
  p.set('Head', -0.16);
  p.set('Thigh_L', -0.75 - 0.6 * reach);
  p.set('Knee_L', 0.35 + 0.5 * reach);
  p.set('Ankle_L', 0.05);
  p.set('Thigh_R', 0.25 + 0.5 * reach);
  p.set('Knee_R', 1.0 + 0.3 * reach);
  p.set('Ankle_R', 0.5);
  p.set('Arm_L', 0.55, 0, -1.05);
  p.set('Elbow_L', 0, -0.9);
  p.set('Wrist_L', 0);
  p.set('Arm_R', -1.0, 0, 1.1);
  p.set('Elbow_R', 0, 1.1);
  p.set('Wrist_R', 0);
}

function slide(p: Pose) {
  p.set('Hip', -1.2);
  p.set('Waist', 0.3);
  p.set('Spine', 0.22);
  p.set('Chest', 0.15);
  p.set('Neck', 0.15);
  p.set('Head', 0.3);
  p.set('Thigh_L', -0.1);
  p.set('Knee_L', 0.12);
  p.set('Ankle_L', -0.2);
  p.set('Thigh_R', -0.85, 0, -0.12);
  p.set('Knee_R', 1.6);
  p.set('Ankle_R', 0.1);
  p.set('Arm_L', 0.75, 0, -1.3);
  p.set('Elbow_L', 0, -0.25);
  p.set('Wrist_L', 0);
  p.set('Arm_R', 0.75, 0, 1.3);
  p.set('Elbow_R', 0, 0.25);
  p.set('Wrist_R', 0);
}

function fallen(p: Pose) {
  p.set('Hip', -0.95);
  p.set('Waist', 0.45);
  p.set('Spine', 0.25);
  p.set('Chest', 0.15);
  p.set('Neck', 0.2);
  p.set('Head', 0.32);
  for (const side of ['L', 'R'] as const) {
    const sign = side === 'L' ? 1 : -1;
    p.set(`Thigh_${side}`, -0.75, 0, sign * 0.3);
    p.set(`Knee_${side}`, 1.5);
    p.set(`Ankle_${side}`, 0.2);
    p.set(`Arm_${side}`, 0.8, 0, -sign * 1.25);
    p.set(`Elbow_${side}`, 0, -sign * 0.2);
    p.set(`Wrist_${side}`, 0);
  }
}

const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

export class Animator {
  private character: Character;
  private springs: Springs;
  private bones: THREE.Bone[];
  private poses = { idle: new Pose(), run: new Pose(), leap: new Pose(), slide: new Pose(), fallen: new Pose() };
  private weights = { idle: 1, run: 0, leap: 0, slide: 0, fallen: 0 };
  private feet: { bone: THREE.Bone; clearance: number }[];
  private phase = 0;
  private time = 0;
  private worldPos = new THREE.Vector3();

  constructor(character: Character) {
    this.character = character;
    this.bones = NAMES.map(n => character.bone(n));
    this.curlFingers();

    const clearanceOf = (name: string) => {
      const bone = character.bone(name);
      return { bone, clearance: bone.getWorldPosition(this.worldPos).y };
    };
    this.feet = ['Toe_L', 'Toe_R', 'Ankle_L', 'Ankle_R'].map(clearanceOf);
    this.feet.push({ bone: character.bone('Hip'), clearance: 0.15 });

    this.springs = new Springs(character);
  }

  private curlFingers() {
    const pattern = /^(Index|Middle|Ring|Pinky)_0[123]_([LR])_\d+$/;
    for (const bone of this.character.bones.values()) {
      const match = bone.name.match(pattern);
      if (match) bone.rotation.z = match[2] === 'L' ? -0.8 : 0.8;
    }
  }

  private targetPose(sim: Sim): keyof Animator['weights'] {
    if (sim.phase === 'ready') return 'idle';
    if (sim.phase === 'over') return 'fallen';
    if (sim.airborne) return 'leap';
    return sim.sliding ? 'slide' : 'run';
  }

  update(dt: number, sim: Sim) {
    if (sim.phase === 'paused') return;
    this.time += dt;
    if (sim.phase === 'running') this.phase += dt * sim.speed * 0.45 + dt * 11;

    const { poses, weights } = this;
    idle(poses.idle, this.time);
    run(poses.run, this.phase);
    leap(poses.leap, Math.max(-1, Math.min(1, sim.vy / JUMP_V)));
    slide(poses.slide);
    fallen(poses.fallen);

    const target = this.targetPose(sim);
    const blend = damp(target === 'run' ? 11 : 20, dt);
    let total = 0;
    for (const key of Object.keys(weights) as (keyof typeof weights)[]) {
      weights[key] += ((key === target ? 1 : 0) - weights[key]) * blend;
      total += weights[key];
    }

    this.applyPoses(total);
    this.placeRoot(sim, dt);
    this.springs.update(dt, sim.phase === 'running' ? sim.speed / 14 : 0.25);
  }

  private applyPoses(total: number) {
    const { poses, weights } = this;
    this.bones.forEach((bone, i) => {
      const c = [0, 0, 0];
      for (const key of Object.keys(poses) as (keyof typeof poses)[]) {
        const v = poses[key].values;
        for (let a = 0; a < 3; a++) c[a] += v[i * 3 + a] * weights[key] / total;
      }
      bone.rotation.set(c[0], c[1], c[2]);
    });
  }

  private placeRoot(sim: Sim, dt: number) {
    const { root, body } = this.character;
    const toward = LANE_X[sim.lane] - sim.x;
    root.position.set(sim.x, sim.y, 0);
    root.rotation.set(0, Math.PI - toward * 0.2, toward * 0.13);
    root.updateMatrixWorld(true);

    let lowest = Infinity;
    for (const { bone, clearance } of this.feet) {
      lowest = Math.min(lowest, bone.getWorldPosition(this.worldPos).y - clearance);
    }
    const lock = 1 - this.weights.leap;
    const goal = (body.position.y + sim.y - lowest) * lock;
    body.position.y += (goal - body.position.y) * damp(40, dt);
    root.updateMatrixWorld(true);
  }
}
