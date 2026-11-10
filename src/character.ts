import * as THREE from 'three';
import { GLTFLoader, type GLTFLoaderPlugin, type GLTFParser } from 'three/addons/loaders/GLTFLoader.js';
import { curved, toonGradient } from './toon';

const HEIGHT = 1.7;
const OUTLINE = 0.035;
const KEEP_ATTRIBUTES = new Set(['position', 'normal', 'uv', 'skinIndex', 'skinWeight']);

// Three.js dropped this extension; Sketchfab still exports it, so map its diffuse texture.
class SpecGlossPlugin implements GLTFLoaderPlugin {
  name = 'KHR_materials_pbrSpecularGlossiness';
  private parser: GLTFParser;
  constructor(parser: GLTFParser) { this.parser = parser; }

  extendMaterialParams(index: number, params: Record<string, unknown>) {
    const def = this.parser.json.materials[index].extensions?.[this.name];
    if (!def) return Promise.resolve();
    params.metalness = 0;
    params.roughness = 1;
    if (!def.diffuseTexture) return Promise.resolve();
    return this.parser.assignTexture(params, 'map', def.diffuseTexture, THREE.SRGBColorSpace);
  }
}

function sameGeometry(a: THREE.BufferGeometry, b: THREE.BufferGeometry) {
  const same = (x: ArrayLike<number>, y: ArrayLike<number>) => {
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    return true;
  };
  return same(a.attributes.position.array, b.attributes.position.array)
    && same(a.index!.array, b.index!.array);
}

// A hard-edged rim of warm light, as in cel animation, lifts the character off the green turf.
function addRim(shader: { fragmentShader: string }) {
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <opaque_fragment>',
    `float rim = 1.0 - saturate(dot(normalize(vViewPosition), normal));
    outgoingLight += vec3(1.0, 0.93, 0.82) * smoothstep(0.55, 0.63, rim) * 0.9 * mix(vec3(1.0), diffuseColor.rgb, 0.5);
    #include <opaque_fragment>`,
  );
}

function addOutline(mesh: THREE.SkinnedMesh, material: THREE.Material) {
  const outline = new THREE.SkinnedMesh(mesh.geometry, material);
  outline.bind(mesh.skeleton, mesh.bindMatrix);
  outline.frustumCulled = false;
  mesh.parent!.add(outline);
}

export interface Character {
  root: THREE.Group;
  body: THREE.Group;
  bones: Map<string, THREE.Bone>;
  bone(name: string): THREE.Bone;
}

export async function loadCharacter(url: string, onProgress?: (ratio: number) => void): Promise<Character> {
  const loader = new GLTFLoader();
  loader.register(parser => new SpecGlossPlugin(parser));
  const gltf = await loader.loadAsync(url, event => {
    if (event.total) onProgress?.(event.loaded / event.total);
  });

  const meshes: THREE.SkinnedMesh[] = [];
  gltf.scene.traverse(o => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh); });

  const kept: THREE.SkinnedMesh[] = [];
  for (const mesh of meshes) {
    if (kept.some(k => sameGeometry(k.geometry, mesh.geometry))) mesh.removeFromParent();
    else kept.push(mesh);
  }

  const outlineMaterial = curved(
    new THREE.MeshBasicMaterial({ color: 0x2a1c33, side: THREE.BackSide }),
    shader => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\ntransformed += normalize(normal) * ${OUTLINE.toFixed(3)};`,
      );
    },
  );

  const skeleton = kept[0].skeleton;
  for (const mesh of kept) {
    for (const name of Object.keys(mesh.geometry.attributes)) {
      if (!KEEP_ATTRIBUTES.has(name)) mesh.geometry.deleteAttribute(name);
    }
    const source = mesh.material as THREE.MeshStandardMaterial;
    mesh.material = curved(new THREE.MeshToonMaterial({
      map: source.map,
      side: THREE.DoubleSide,
      gradientMap: toonGradient,
    }), addRim);
    mesh.frustumCulled = false;
    mesh.bind(skeleton, mesh.bindMatrix);

    const small = mesh.geometry.index!.count / 3 < 100;
    // No outline on the face: the expanded hull shows through the lips as a black gash.
    if (!small && !/eye|mayu|face/.test(source.name)) addOutline(mesh, outlineMaterial);
  }

  gltf.scene.updateMatrixWorld(true);
  const box = new THREE.Box3();
  for (const mesh of kept) box.expandByObject(mesh, true);
  const scale = HEIGHT / (box.max.y - box.min.y);

  const scaled = new THREE.Group();
  scaled.scale.setScalar(scale);
  scaled.position.y = -box.min.y * scale;
  scaled.add(gltf.scene);

  const body = new THREE.Group();
  body.add(scaled);
  const root = new THREE.Group();
  root.rotation.y = Math.PI;
  root.add(body);
  root.updateMatrixWorld(true);

  const bones = new Map(skeleton.bones.map(b => [b.name, b]));
  return {
    root,
    body,
    bones,
    bone(name) {
      const pattern = new RegExp(`^${name}(_\\d+)?$`);
      const found = skeleton.bones.find(b => pattern.test(b.name));
      if (!found) throw new Error(`Bone not found: ${name}`);
      return found;
    },
  };
}
