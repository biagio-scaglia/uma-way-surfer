import * as THREE from 'three';

/** Metres for a full day: sunset falls around 420 m, night lasts until about 800 m. */
export const DAY_LENGTH = 1000;

const SKY_RADIUS = 700;
const BODY_DISTANCE = 600;
const SUN_NEAR = 340;

export type TimeOfDay = 'day' | 'sunset' | 'night' | 'dawn';

interface Look {
  top: number; mid: number; horizon: number; glow: number;
  hemiSky: number; hemiGround: number; hemi: number;
  light: number; lightI: number; fill: number;
  tint: number; night: number;
}

const DAY: Look = {
  top: 0x6fb4e8, mid: 0xb9e2f4, horizon: 0xfdeee6, glow: 0xfff4cd,
  hemiSky: 0xfff5ee, hemiGround: 0xa8cf98, hemi: 1.25,
  light: 0xffffff, lightI: 1.75, fill: 1, tint: 0xffffff, night: 0,
};
const SUNSET: Look = {
  top: 0x5d74c4, mid: 0xf4a98f, horizon: 0xffc98f, glow: 0xffa860,
  hemiSky: 0xffd9bf, hemiGround: 0x9fbf8a, hemi: 1.1,
  light: 0xffb070, lightI: 1.6, fill: 0.9, tint: 0xffd2bd, night: 0.4,
};
// Night stays blue rather than black, so every obstacle is still easy to read.
const NIGHT: Look = {
  top: 0x0f1b40, mid: 0x263766, horizon: 0x4a5a8e, glow: 0x8fa2e0,
  hemiSky: 0xa4b4ec, hemiGround: 0x3d5e4e, hemi: 1,
  light: 0xb0c0ff, lightI: 0.85, fill: 0.85, tint: 0x5d6c9c, night: 1,
};
const DAWN: Look = {
  top: 0x7a8fd6, mid: 0xf6bfd0, horizon: 0xffe2c6, glow: 0xffc0a0,
  hemiSky: 0xffe6e0, hemiGround: 0x9fc492, hemi: 1.1,
  light: 0xffd2b0, lightI: 1.4, fill: 0.9, tint: 0xffe3e0, night: 0.3,
};

const KEYS: [number, Look][] = [
  [0, DAY], [0.3, DAY], [0.42, SUNSET], [0.52, NIGHT], [0.8, NIGHT], [0.9, DAWN], [1, DAY],
];

const smooth = (a: number, b: number, x: number) => THREE.MathUtils.smoothstep(x, a, b);

/** Direction in the sky from a compass angle (0 = straight down the track, + = right) and an elevation. */
function direction(azimuth: number, elevation: number, target: THREE.Vector3) {
  const a = THREE.MathUtils.degToRad(azimuth), e = THREE.MathUtils.degToRad(elevation);
  return target.set(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
}

function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function moonTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fdf6e3';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#e6dcc4';
  for (const [x, y, r] of [[40, 50, 14], [80, 36, 9], [76, 84, 18], [30, 92, 8], [104, 64, 7]]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export interface Lights {
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  fill: THREE.DirectionalLight;
}

export class DayNight {
  /** 0 = noon of the first day; wraps at 1. */
  phase = 0;
  night = 0;
  tint = new THREE.Color();
  private sky: THREE.Group;
  private uniforms = {
    uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() },
    uGlowDir: { value: new THREE.Vector3() },
  };
  private sun: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  private sunHalo: THREE.Sprite;
  private moon: THREE.Mesh;
  private moonHalo: THREE.Sprite;
  private stars: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private sunDir = new THREE.Vector3();
  private moonDir = new THREE.Vector3();
  private a = new THREE.Color();
  private b = new THREE.Color();

  constructor(private scene: THREE.Scene, private lights: Lights) {
    this.sky = new THREE.Group();
    scene.add(this.sky);

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(SKY_RADIUS, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        side: THREE.BackSide,
        depthWrite: false,
        vertexShader: `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            gl_Position.z = gl_Position.w;
          }`,
        fragmentShader: `
          uniform vec3 uTop, uMid, uHorizon, uGlow, uGlowDir;
          varying vec3 vDir;
          void main() {
            vec3 dir = normalize(vDir);
            vec3 c = mix(uHorizon, uMid, smoothstep(-0.02, 0.2, dir.y));
            c = mix(c, uTop, smoothstep(0.2, 0.65, dir.y));
            float d = max(dot(dir, uGlowDir), 0.0);
            c += uGlow * (pow(d, 6.0) * 0.32 + pow(d, 60.0) * 0.35);
            gl_FragColor = vec4(c, 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    );
    dome.renderOrder = -2;
    dome.frustumCulled = false;
    this.sky.add(dome);

    const starCount = 420;
    const positions = new Float32Array(starCount * 3);
    const v = new THREE.Vector3();
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < starCount; i++) {
      direction(rand() * 360, 6 + Math.asin(rand()) * 57.3 * 0.95, v).multiplyScalar(SKY_RADIUS * 0.95);
      v.toArray(positions, i * 3);
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({
      color: 0xfff8e6, size: 2.8, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false,
    }));
    this.stars.renderOrder = -1;
    this.stars.frustumCulled = false;
    this.sky.add(this.stars);

    const glow = glowTexture();
    const halo = (size: number) => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glow, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
      }));
      sprite.scale.setScalar(size);
      sprite.renderOrder = -1;
      this.sky.add(sprite);
      return sprite;
    };
    this.sunHalo = halo(340);
    this.moonHalo = halo(150);
    this.sun = new THREE.Mesh(new THREE.SphereGeometry(26, 24, 12), new THREE.MeshBasicMaterial({ color: 0xfffbe8, fog: false }));
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(14, 24, 12), new THREE.MeshBasicMaterial({ map: moonTexture(), fog: false }));
    this.moon.rotation.y = Math.PI;
    this.sky.add(this.sun, this.moon);
  }

  get timeOfDay(): TimeOfDay {
    const p = this.phase;
    if (p >= 0.36 && p < 0.48) return 'sunset';
    if (p >= 0.48 && p < 0.85) return 'night';
    if (p >= 0.85 && p < 0.95) return 'dawn';
    return 'day';
  }

  /** Moves time towards the given distance, always forwards, so a restart runs through dawn. */
  update(distance: number, dt: number, camera: THREE.Camera) {
    const target = (distance / DAY_LENGTH) % 1;
    const ahead = (((target - this.phase) % 1) + 1) % 1;
    this.phase = (this.phase + ahead * (1 - Math.exp(-dt * 2.5))) % 1;
    this.apply();
    this.sky.position.copy(camera.position);
  }

  private apply() {
    const p = this.phase;
    let i = 0;
    while (KEYS[i + 1][0] < p) i++;
    const [p0, from] = KEYS[i];
    const [p1, to] = KEYS[i + 1];
    const t = smooth(0, 1, (p - p0) / (p1 - p0));
    const color = (key: 'top' | 'mid' | 'horizon' | 'glow' | 'hemiSky' | 'hemiGround' | 'light' | 'tint', out: THREE.Color) =>
      out.copy(this.a.setHex(from[key])).lerp(this.b.setHex(to[key]), t);
    const num = (key: 'hemi' | 'lightI' | 'fill' | 'night') => THREE.MathUtils.lerp(from[key], to[key], t);

    color('top', this.uniforms.uTop.value);
    color('mid', this.uniforms.uMid.value);
    color('horizon', this.uniforms.uHorizon.value);
    color('glow', this.uniforms.uGlow.value);
    color('hemiSky', this.lights.hemi.color);
    color('hemiGround', this.lights.hemi.groundColor);
    color('light', this.lights.sun.color);
    color('tint', this.tint);
    (this.scene.fog as THREE.Fog).color.copy(this.uniforms.uHorizon.value);
    this.lights.hemi.intensity = num('hemi');
    this.lights.sun.intensity = num('lightI');
    this.lights.fill.intensity = num('fill');
    this.night = num('night');

    // The sun sets straight down the track; the moon climbs on the left during the night.
    // Kept low enough to stay in the frame, since the camera looks slightly down the track.
    const sunElevation = p < 0.5
      ? THREE.MathUtils.lerp(13, -4, smooth(0.25, 0.49, p))
      : THREE.MathUtils.lerp(-4, 13, smooth(0.86, 1, p));
    const sunAzimuth = p < 0.5 ? THREE.MathUtils.lerp(26, 4, smooth(0.25, 0.49, p)) : THREE.MathUtils.lerp(50, 26, smooth(0.86, 1, p));
    direction(sunAzimuth, sunElevation, this.sunDir);
    const moonUp = smooth(0.46, 0.6, p) * (1 - smooth(0.82, 0.93, p));
    direction(-24 + moonUp * 4, THREE.MathUtils.lerp(-6, 16, moonUp), this.moonDir);

    // By day the sun sits in front of the clouds; as it sets it slips back behind the hills.
    const sunDistance = p < 0.5
      ? THREE.MathUtils.lerp(SUN_NEAR, BODY_DISTANCE, smooth(0.3, 0.45, p))
      : THREE.MathUtils.lerp(BODY_DISTANCE, SUN_NEAR, smooth(0.9, 1, p));
    this.sun.position.copy(this.sunDir).multiplyScalar(sunDistance);
    this.sun.scale.setScalar(sunDistance / BODY_DISTANCE);
    this.sunHalo.scale.setScalar(340 * sunDistance / BODY_DISTANCE);
    this.sunHalo.position.copy(this.sun.position);
    this.sun.material.color.setHex(0xfff0b0).lerp(this.b.setHex(0xff9a55), 1 - smooth(-2, 12, sunElevation));
    this.sunHalo.material.color.copy(this.uniforms.uGlow.value);
    this.moon.position.copy(this.moonDir).multiplyScalar(BODY_DISTANCE);
    this.moonHalo.position.copy(this.moon.position);
    this.moonHalo.material.color.setHex(0x6f80c0);
    this.moon.visible = this.moonHalo.visible = moonUp > 0.01;
    this.sun.visible = this.sunHalo.visible = sunElevation > -3.5;

    this.uniforms.uGlowDir.value.copy(sunElevation > -2 ? this.sunDir : this.moonDir);
    this.stars.material.opacity = smooth(0.5, 0.9, this.night);
  }
}
