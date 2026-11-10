import * as THREE from 'three';
import dotoUrl from '../models/meisho_doto_-_uma_musume.glb?url';
import teioUrl from '../models/tokai_teio_-_uma_musume.glb?url';
import { Animator } from './animation';
import { loadCharacter, type Character } from './character';
import type { Sim } from './sim';

// Both models come from the same author and share one skeleton, so poses and springs fit either.
export const CAST = {
  teio: {
    name: 'Tokai Teio',
    url: teioUrl,
    title: 'Tokai Teio - Uma Musume',
    page: 'https://sketchfab.com/3d-models/tokai-teio-uma-musume-c691aadbd14d4735810a01ac406fd940',
  },
  doto: {
    name: 'Meisho Doto',
    url: dotoUrl,
    title: 'Meisho Doto - Uma Musume',
    page: 'https://sketchfab.com/3d-models/meisho-doto-uma-musume-91c12bfd72b843929dc88a3857ce3593',
  },
} as const;

export type CastId = keyof typeof CAST;
export const isCastId = (value: unknown): value is CastId => typeof value === 'string' && value in CAST;

export interface Runner { id: CastId; character: Character; animator: Animator }

const loading = new Map<CastId, Promise<Runner>>();

/** Loads a character once; later calls return the same runner. */
export function summon(id: CastId, onProgress?: (ratio: number) => void): Promise<Runner> {
  let runner = loading.get(id);
  if (!runner) {
    runner = loadCharacter(CAST[id].url, onProgress).then(character => ({ id, character, animator: new Animator(character) }));
    runner.catch(() => loading.delete(id));
    loading.set(id, runner);
  }
  return runner;
}

const PORTRAIT_PX = 192;

/** Renders a head-and-shoulders portrait of the runner, standing idle, as an image URL. */
export function portrait(runner: Runner, sim: Sim): string {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(PORTRAIT_PX, PORTRAIT_PX, false);

  const { root } = runner.character;
  const parent = root.parent;
  const visible = root.visible;
  const stage = new THREE.Scene();
  stage.add(new THREE.HemisphereLight(0xffffff, 0xf3e6ee, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(1, 2, -3);
  stage.add(key, root);
  root.visible = true;

  // Let the idle pose and the springs settle before taking the picture.
  for (let i = 0; i < 40; i++) runner.animator.update(1 / 60, sim);
  root.updateMatrixWorld(true);
  const head = runner.character.bone('Head').getWorldPosition(new THREE.Vector3());
  head.y += 0.06;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 10);
  camera.position.set(head.x - 0.12, head.y + 0.02, head.z - 0.7);
  camera.lookAt(head.x, head.y - 0.04, head.z);
  renderer.render(stage, camera);
  const url = renderer.domElement.toDataURL('image/png');

  root.visible = visible;
  if (parent) parent.add(root);
  renderer.dispose();
  renderer.forceContextLoss();
  return url;
}
