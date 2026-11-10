import '@fontsource/dela-gothic-one/400.css';
import '@fontsource/zen-maru-gothic/500.css';
import '@fontsource/zen-maru-gothic/900.css';
import './style.css';
import * as THREE from 'three';
import modelUrl from '../models/tokai_teio_-_uma_musume.glb?url';
import { Animator } from './animation';
import { Sfx } from './audio';
import { loadCharacter } from './character';
import { DayNight, type TimeOfDay } from './daynight';
import { Effects } from './effects';
import { bindInput } from './input';
import { loadProps } from './props';
import { LANE_X, MILESTONE, Sim, type Kind } from './sim';
import { World } from './world';

const STEP = 1 / 120;
const BEST_KEY = 'uma-way-surfer-best';
const SETTINGS_KEY = 'uma-way-surfer-settings';
const CALM_PACE = 0.8;
const RESTART_LOCK_MS = 500;
const COUNT_UP_MS = 650;
const TIME_LABELS: Record<TimeOfDay, string> = { day: 'Giorno', sunset: 'Tramonto', night: 'Notte', dawn: 'Alba' };
const TIME_ICONS: Record<TimeOfDay, string> = { day: 'sun', sunset: 'sunset', night: 'moon', dawn: 'sunset' };
const PANEL_LEAVE_MS = 220;
const CUE_SECONDS = 1.15;
const CUES_UNTIL_BEST = 600;
const CARROT_COLORS = [0xff8412, 0xffc53d, 0xffffff];
const CONFETTI = [0xc8173d, 0xffc53d, 0x1f62e0, 0xffffff, 0x5cb86b];
const DUST = [0xe6d5ae, 0xf3eee3];
const CUES: Record<Kind, [string, string]> = {
  hurdle: ['↑', 'Salta'],
  gate: ['↓', 'Scivola'],
  block: ['← →', 'Cambia corsia'],
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const ui = {
  score: $('score'), carrots: $('carrots'), hud: $('hud'), lives: $('lives'),
  goal: $('goal'), goalMeters: $('goal-meters'), daytime: $('daytime'),
  cue: $('cue'), cueKey: $('cue-key'), cueWord: $('cue-word'), toast: $('toast'),
  title: $('title'), start: $('start'), status: $('status'), titleBest: $('title-best'),
  over: $('over'), overScore: $('over-score'), overMeters: $('over-meters'), overCarrots: $('over-carrots'), overCarrotWord: $('over-carrot-word'), overBest: $('over-best'), rosette: $('rosette'), restart: $('restart'),
  paused: $('paused'), resume: $('resume'), pause: $('pause'),
  settings: $('settings'), sound: $('toggle-sound'), calm: $('toggle-calm'),
};

function readBest() {
  try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; }
}
function saveBest(value: number) {
  try { localStorage.setItem(BEST_KEY, String(value)); } catch { /* best score is optional */ }
}

interface Settings { sound: boolean; calm: boolean }

function readSettings(): Settings {
  const fallback = { sound: true, calm: matchMedia('(prefers-reduced-motion: reduce)').matches };
  try { return { ...fallback, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') }; } catch { return fallback; }
}
function saveSettings(settings: Settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* settings are optional */ }
}

const retrigger = (element: HTMLElement, className: string) => {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
};

async function main() {
  const canvas = $<HTMLCanvasElement>('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xfdeee6, 70, 195);
  const hemi = new THREE.HemisphereLight(0xfff5ee, 0xa8cf98, 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.75);
  sun.position.set(-4, 9, 7);
  scene.add(sun);
  const faceFill = new THREE.DirectionalLight(0xffffff, 1);
  faceFill.position.set(0, 0.6, -8);
  scene.add(faceFill);
  const dayNight = new DayNight(scene, { hemi, sun, fill: faceFill });

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 900);
  const look = new THREE.Vector3();

  const sim = new Sim();
  const sfx = new Sfx();
  const effects = new Effects(scene);
  const loadFill = $('load-fill');
  const [character, props] = await Promise.all([
    loadCharacter(modelUrl, ratio => { loadFill.style.transform = `scaleX(${ratio})`; }),
    loadProps(),
  ]);
  const world = new World(scene, props);
  scene.add(character.root);
  const animator = new Animator(character);

  const settings = readSettings();
  function applySettings() {
    sfx.muted = !settings.sound;
    effects.calm = settings.calm;
    document.documentElement.classList.toggle('calm', settings.calm);
    ui.sound.setAttribute('aria-pressed', String(settings.sound));
    ui.calm.setAttribute('aria-pressed', String(settings.calm));
    saveSettings(settings);
  }
  applySettings();
  ui.sound.addEventListener('click', () => { settings.sound = !settings.sound; applySettings(); });
  ui.calm.addEventListener('click', () => { settings.calm = !settings.calm; applySettings(); });
  addEventListener('pointerdown', () => sfx.unlock());
  addEventListener('keydown', () => sfx.unlock());

  let best = readBest();
  let showCues = true;
  let overAt = 0;

  const start = () => {
    if (sim.phase === 'over' && performance.now() - overAt < RESTART_LOCK_MS) return;
    if (sim.phase !== 'ready' && sim.phase !== 'over') return;
    sim.pace = settings.calm ? CALM_PACE : 1;
    showCues = settings.calm || best < CUES_UNTIL_BEST;
    sim.start();
  };
  bindInput(sim, start);
  ui.start.addEventListener('click', start);
  ui.restart.addEventListener('click', start);
  ui.resume.addEventListener('click', () => sim.togglePause());
  ui.pause.addEventListener('click', () => sim.togglePause());

  let titleBottom = 0;
  function measureTitle() {
    if (!ui.title.hidden) titleBottom = ui.title.offsetTop + ui.title.offsetHeight;
  }

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < h ? 76 : 60;
    camera.updateProjectionMatrix();
    measureTitle();
  }
  addEventListener('resize', resize);
  resize();

  ui.titleBest.hidden = best === 0;
  ui.titleBest.textContent = `Il tuo record: ${best.toLocaleString('it-IT')}`;

  let intro = 1;
  let overShift = 0;
  let shake = 0;
  let shownPhase = '';
  let shownScore = -1;
  let shownCarrots = -1;
  let shownLives = -1;
  let shownGoal = -1;
  let shownCue: Kind | null = null;
  let accumulator = 0;
  let last = performance.now();
  let time = 0;

  /** Shows a panel at once, or lets it lift off the screen before hiding it. */
  function setPanel(panel: HTMLElement, visible: boolean) {
    if (visible) {
      panel.classList.remove('leaving');
      panel.hidden = false;
    } else if (!panel.hidden && !panel.classList.contains('leaving')) {
      panel.classList.add('leaving');
      setTimeout(() => {
        if (!panel.classList.contains('leaving')) return;
        panel.classList.remove('leaving');
        panel.hidden = true;
      }, settings.calm ? 0 : PANEL_LEAVE_MS);
    }
  }

  function countUp(element: HTMLElement, to: number) {
    const show = (value: number) => { element.textContent = value.toLocaleString('it-IT'); };
    if (settings.calm || to === 0) { show(to); return; }
    const started = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / COUNT_UP_MS);
      show(Math.round(to * (1 - (1 - t) ** 3)));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function syncScreens() {
    if (sim.phase === shownPhase) return;
    const previous = shownPhase;
    shownPhase = sim.phase;
    setPanel(ui.title, sim.phase === 'ready');
    setPanel(ui.over, sim.phase === 'over');
    setPanel(ui.paused, sim.phase === 'paused');
    ui.hud.hidden = sim.phase !== 'running';
    ui.settings.hidden = sim.phase === 'running';
    if (sim.phase === 'over' && previous === 'running') {
      overAt = performance.now();
      const isRecord = sim.score > best;
      const missing = best - sim.score + 1;
      best = Math.max(best, sim.score);
      saveBest(best);
      countUp(ui.overScore, sim.score);
      ui.overMeters.textContent = Math.floor(sim.distance).toLocaleString('it-IT');
      ui.overCarrots.textContent = String(sim.carrotsTaken);
      ui.overCarrotWord.textContent = sim.carrotsTaken === 1 ? 'carota' : 'carote';
      ui.rosette.hidden = !isRecord;
      ui.overBest.hidden = isRecord;
      ui.overBest.textContent = `Al record mancano ${missing.toLocaleString('it-IT')} ${missing === 1 ? 'punto' : 'punti'}.`;
      if (isRecord) effects.burst(sim.x, 1.6, -1, 50, CONFETTI, { speed: 6, size: 0.065, life: 1.3, scroll: 0 });
      ui.restart.focus({ preventScroll: true });
    }
    if (sim.phase === 'paused') ui.resume.focus({ preventScroll: true });
  }

  function syncHud() {
    if (sim.score !== shownScore) ui.score.textContent = (shownScore = sim.score).toLocaleString('it-IT');
    if (sim.carrotsTaken !== shownCarrots) {
      ui.carrots.textContent = String(shownCarrots = sim.carrotsTaken);
      if (shownCarrots > 0) retrigger(ui.carrots.parentElement!, 'bump');
    }
    if (sim.lives !== shownLives) {
      shownLives = sim.lives;
      [...ui.lives.children].forEach((icon, i) => icon.classList.toggle('lost', i >= sim.lives));
      ui.lives.setAttribute('aria-label', `Ferri di cavallo rimasti: ${sim.lives}`);
    }
    if (sim.nextMilestone !== shownGoal) {
      shownGoal = sim.nextMilestone;
      ui.goalMeters.textContent = `${shownGoal.toLocaleString('it-IT')} m`;
    }
    const progress = 1 - (sim.nextMilestone - sim.distance) / MILESTONE;
    ui.goal.style.setProperty('--p', Math.max(0, Math.min(1, progress)).toFixed(4));
  }

  let shownTime: TimeOfDay | null = null;
  function syncTime() {
    const now = dayNight.timeOfDay;
    if (now === shownTime) return;
    const first = shownTime === null;
    shownTime = now;
    ui.daytime.dataset.time = now;
    ui.daytime.setAttribute('aria-label', TIME_LABELS[now]);
    ui.daytime.title = TIME_LABELS[now];
    ui.daytime.querySelector('use')!.setAttribute('href', `#i-${TIME_ICONS[now]}`);
    if (!first) retrigger(ui.daytime, 'turn');
  }

  /** While learning, shows the move for the obstacle straight ahead, at the moment it matters. */
  function syncCue() {
    let cue: Kind | null = null;
    if (sim.phase === 'running' && showCues) {
      let soonest = CUE_SECONDS;
      for (const o of sim.obstacles) {
        const eta = (o.s - sim.distance) / sim.speed;
        if (o.lane === sim.lane && eta > 0 && eta < soonest) { soonest = eta; cue = o.kind; }
      }
      if ((cue === 'hurdle' && sim.airborne) || (cue === 'gate' && sim.sliding)) cue = null;
    }
    if (cue === shownCue) return;
    shownCue = cue;
    ui.cue.hidden = !cue;
    if (!cue) return;
    ui.cue.dataset.kind = cue;
    [ui.cueKey.textContent, ui.cueWord.textContent] = CUES[cue];
  }

  function drainEvents() {
    for (const event of sim.events) {
      switch (event.type) {
        case 'carrot':
          sfx.carrot();
          effects.burst(LANE_X[event.lane], event.y, 0, 9, CARROT_COLORS);
          break;
        case 'jump':
          sfx.jump();
          break;
        case 'slide':
          sfx.slide();
          effects.burst(sim.x, 0.08, 0.3, 10, DUST, { speed: 2, size: 0.11, scroll: 0.7 });
          break;
        case 'land':
          effects.burst(sim.x, 0.08, 0.1, 7, DUST, { speed: 2, size: 0.1, scroll: 0.7 });
          break;
        case 'hit':
          shake = 1;
          if (sim.lives > 0) sfx.hit(); else sfx.gameOver();
          retrigger(ui.lives, 'hurt');
          break;
        case 'milestone':
          sfx.milestone();
          ui.toast.textContent = `${event.meters.toLocaleString('it-IT')} m!`;
          retrigger(ui.toast, 'show');
          effects.burst(sim.x, 2, -3, 46, CONFETTI, { speed: 6, size: 0.065, life: 1.1, scroll: 0.5 });
          break;
      }
    }
    sim.events.length = 0;
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
    // Portrait: slide the picture down so the character sits below the panel.
    const viewShift = portrait ? intro * titleBottom / 2 : 0;
    if (viewShift > 0.5) camera.setViewOffset(innerWidth, innerHeight, 0, -viewShift, innerWidth, innerHeight);
    else if (camera.view?.enabled) camera.clearViewOffset();
    const quake = settings.calm ? 0 : shake * shake * 0.25;
    camera.position.set(
      sim.x * 0.7 + Math.sin(angle) * radius + Math.sin(time * 61) * quake,
      height + sim.y * 0.35 + Math.sin(time * 73) * quake,
      Math.cos(angle) * radius,
    );
    look.set(sim.x * 0.8 + sideOffset, 1 + sim.y * 0.3, THREE.MathUtils.lerp(-5, 0, intro));
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
    character.root.visible = settings.calm || sim.invincibleT === 0 || Math.floor(time * 10) % 2 === 0;
    world.sync(sim, time);
    drainEvents();
    effects.update(dt, sim.phase === 'running' ? sim.speed : 0, time);
    placeCamera(dt);
    dayNight.update(sim.distance, dt, camera);
    world.setLight(dayNight.night, dayNight.tint);
    syncTime();
    syncScreens();
    syncHud();
    syncCue();
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  if (import.meta.env.DEV) Object.assign(window, { __game: { sim, camera, scene } });

  ui.status.hidden = true;
  ui.start.hidden = false;
  measureTitle();
  ui.start.focus({ preventScroll: true });
  requestAnimationFrame(frame);
}

main().catch(error => {
  console.error(error);
  ui.status.textContent = 'Il gioco non si è avviato. Verifica che il browser supporti WebGL, poi ricarica la pagina.';
});
