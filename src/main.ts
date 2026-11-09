import '@fontsource/dela-gothic-one/400.css';
import '@fontsource/zen-maru-gothic/500.css';
import '@fontsource/zen-maru-gothic/900.css';
import './style.css';
import * as THREE from 'three';
import modelUrl from '../models/tokai_teio_-_uma_musume.glb?url';
import { Animator } from './animation';
import { loadCharacter } from './character';
import { bindInput } from './input';
import { Sim, type Kind } from './sim';
import { World } from './world';

const STEP = 1 / 120;
const BEST_KEY = 'uma-way-surfer-best';
const HIT_TEXT: Record<Kind, string> = {
  hurdle: 'Hai urtato una staccionata.',
  gate: 'Hai preso in pieno uno striscione.',
  block: 'Hai sbattuto contro un box di partenza.',
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const ui = {
  score: $('score'), carrots: $('carrots'), hud: $('hud'),
  title: $('title'), start: $('start'), status: $('status'), titleBest: $('title-best'),
  over: $('over'), overReason: $('over-reason'), overScore: $('over-score'), overBest: $('over-best'), restart: $('restart'),
  paused: $('paused'), resume: $('resume'), pause: $('pause'),
};

function readBest() {
  try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; }
}
function saveBest(value: number) {
  try { localStorage.setItem(BEST_KEY, String(value)); } catch { /* best score is optional */ }
}

function skyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, '#4f9fe0');
  gradient.addColorStop(0.42, '#a9dcf2');
  gradient.addColorStop(0.62, '#ffe9df');
  gradient.addColorStop(1, '#ffe9df');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 2, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

async function main() {
  const canvas = $<HTMLCanvasElement>('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(0xffe9df, 70, 195);
  scene.add(new THREE.HemisphereLight(0xfff5ee, 0x9fc58a, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 2.1);
  sun.position.set(-4, 9, 7);
  scene.add(sun);
  const faceFill = new THREE.DirectionalLight(0xffffff, 1.2);
  faceFill.position.set(1, 4, -8);
  scene.add(faceFill);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
  const look = new THREE.Vector3();

  const sim = new Sim();
  const world = new World(scene);
  const character = await loadCharacter(modelUrl);
  scene.add(character.root);
  const animator = new Animator(character);

  const start = () => { sim.start(); };
  bindInput(sim, start);
  ui.start.addEventListener('click', start);
  ui.restart.addEventListener('click', start);
  ui.resume.addEventListener('click', () => sim.togglePause());
  ui.pause.addEventListener('click', () => sim.togglePause());

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < h ? 76 : 60;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  let best = readBest();
  ui.titleBest.hidden = best === 0;
  ui.titleBest.textContent = `Il tuo record: ${best.toLocaleString('it-IT')}`;
  let intro = 1;
  let overShift = 0;
  let shake = 0;
  let shownPhase = '';
  let shownScore = -1;
  let shownCarrots = -1;
  let accumulator = 0;
  let last = performance.now();
  let time = 0;

  function syncScreens() {
    if (sim.phase === shownPhase) return;
    const previous = shownPhase;
    shownPhase = sim.phase;
    ui.title.hidden = sim.phase !== 'ready';
    ui.over.hidden = sim.phase !== 'over';
    ui.paused.hidden = sim.phase !== 'paused';
    ui.hud.hidden = sim.phase === 'ready' || sim.phase === 'over';
    if (sim.phase === 'over' && previous === 'running') {
      shake = 1;
      const isRecord = sim.score > best;
      best = Math.max(best, sim.score);
      saveBest(best);
      ui.overReason.textContent = sim.hit ? HIT_TEXT[sim.hit] : '';
      ui.overScore.textContent = sim.score.toLocaleString('it-IT');
      ui.overBest.textContent = isRecord ? 'Nuovo record!' : `Record: ${best.toLocaleString('it-IT')}`;
      ui.restart.focus();
    }
    if (sim.phase === 'paused') ui.resume.focus();
  }

  function syncHud() {
    if (sim.score !== shownScore) ui.score.textContent = (shownScore = sim.score).toLocaleString('it-IT');
    if (sim.carrotsTaken !== shownCarrots) {
      ui.carrots.textContent = String(shownCarrots = sim.carrotsTaken);
      if (shownCarrots > 0) {
        ui.carrots.parentElement!.classList.remove('bump');
        void ui.carrots.parentElement!.offsetWidth;
        ui.carrots.parentElement!.classList.add('bump');
      }
    }
  }

  function placeCamera(dt: number) {
    intro += ((sim.phase === 'ready' ? 1 : 0) - intro) * (1 - Math.exp(-dt * 3.2));
    shake = Math.max(0, shake - dt * 2.6);
    const angle = intro * Math.PI * 0.86;
    const portrait = camera.aspect < 1;
    overShift += ((sim.phase === 'over' && !portrait ? 1 : 0) - overShift) * (1 - Math.exp(-dt * 3));
    const radius = THREE.MathUtils.lerp(5.4, 3.3, intro);
    const height = THREE.MathUtils.lerp(2.9, 1.45, intro);
    const sideOffset = portrait ? 0 : intro - overShift * 1.8;
    const liftView = portrait ? intro * 0.95 : 0;
    const quake = shake * shake * 0.25;
    camera.position.set(
      sim.x * 0.7 + Math.sin(angle) * radius + Math.sin(time * 61) * quake,
      height + sim.y * 0.35 + Math.sin(time * 73) * quake,
      Math.cos(angle) * radius,
    );
    look.set(sim.x * 0.8 + sideOffset, 1 + sim.y * 0.3 + liftView, THREE.MathUtils.lerp(-5, 0, intro));
    camera.lookAt(look);
  }

  function frame(now: number) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    time += dt;

    accumulator += dt;
    while (accumulator >= STEP) {
      sim.step(STEP);
      accumulator -= STEP;
    }

    animator.update(dt, sim);
    world.sync(sim, time);
    placeCamera(dt);
    syncScreens();
    syncHud();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  if (import.meta.env.DEV) Object.assign(window, { __game: { sim, camera } });

  ui.status.hidden = true;
  ui.start.hidden = false;
  ui.start.focus();
  requestAnimationFrame(frame);
}

main().catch(error => {
  console.error(error);
  ui.status.textContent = 'Il gioco non si è avviato. Verifica che il browser supporti WebGL, poi ricarica la pagina.';
});
