import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Kenney's Nature Kit (CC0): small flat-shaded models, one material per part.
const URLS = import.meta.glob('../models/kenney/*.glb', { query: '?url', import: 'default', eager: true }) as Record<string, string>;

/** One part of a prop: its geometry in model space and the name of the material it used. */
export interface PropPart { material: string; geometry: THREE.BufferGeometry }
export type Props = Map<string, PropPart[]>;

export async function loadProps(): Promise<Props> {
  const loader = new GLTFLoader();
  const entries = await Promise.all(Object.entries(URLS).map(async ([path, url]) => {
    const gltf = await loader.loadAsync(url);
    gltf.scene.updateMatrixWorld(true);
    const parts: PropPart[] = [];
    gltf.scene.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', mesh.geometry.attributes.position.clone());
      geometry.setAttribute('normal', mesh.geometry.attributes.normal.clone());
      if (mesh.geometry.index) geometry.setIndex(mesh.geometry.index.clone());
      geometry.applyMatrix4(mesh.matrixWorld);
      parts.push({ material: (mesh.material as THREE.Material).name, geometry });
    });
    return [path.split('/').pop()!.replace('.glb', ''), parts] as const;
  }));
  return new Map(entries);
}
