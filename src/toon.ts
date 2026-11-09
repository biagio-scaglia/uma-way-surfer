import * as THREE from 'three';

export const curve = { uCurveX: { value: 0 }, uCurveY: { value: 0.0011 } };

type Shader = Parameters<THREE.Material['onBeforeCompile']>[0];

// Bends every vertex away from the camera, giving the rolling-horizon look.
export function curved<T extends THREE.Material>(material: T, extra?: (s: Shader) => void): T {
  material.onBeforeCompile = shader => {
    shader.uniforms.uCurveX = curve.uCurveX;
    shader.uniforms.uCurveY = curve.uCurveY;
    shader.vertexShader = 'uniform float uCurveX;\nuniform float uCurveY;\n' + shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      mvPosition.x += uCurveX * mvPosition.z * mvPosition.z;
      mvPosition.y -= uCurveY * mvPosition.z * mvPosition.z;
      gl_Position = projectionMatrix * mvPosition;`,
    );
    extra?.(shader);
  };
  return material;
}

export const toonGradient = new THREE.DataTexture(new Uint8Array([140, 205, 255]), 3, 1, THREE.RedFormat);
toonGradient.minFilter = toonGradient.magFilter = THREE.NearestFilter;
toonGradient.needsUpdate = true;
