import '@fontsource/dela-gothic-one/400.css';
import '@fontsource/zen-maru-gothic/500.css';
import '@fontsource/zen-maru-gothic/900.css';
import './style.css';
import * as THREE from 'three';
import { Sfx } from './audio';
import { CAST, isCastId, portrait, summon, type CastId, type Runner } from './cast';
import { DayNight, type TimeOfDay } from './daynight';
import { Effects } from './effects';
import { bindInput } from './input';
import { loadProps } from './props';
import { LANE_X, MILESTONE, POWER_TIME, Sim, type Kind, type Power, type Timed } from './sim';
import { World } from './world';

const STEP = 1 / 120;
const BEST_KEY = 'uma-way-surfer-best';
const SETTINGS_KEY = 'uma-way-surfer-settings';
const CAST_KEY = 'uma-way-surfer-character';
const SPARKLE = [0xffc53d, 0xffffff, 0xf7a8c0];
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
const CALM_POWER_SCALE = 1.3;
const POWER_ENDING = 2;
const SPURT_FOV = 10;
// The kicker says what the power-up does; the big word stays short enough for a phone.
const POWERS: Record<Power, { kicker: string; word: string; icon: string; label: string; colors: number[] }> = {
  double: { kicker: 'Punti doppi', word: 'x2!', icon: 'double', label: 'Punti x2', colors: [0xffd23f, 0xffffff, 0xffe27a] },
  magnet: { kicker: 'Attira le carote', word: 'Calamita!', icon: 'magnet', label: 'Calamita', colors: [0xe8364a, 0xff7f9a, 0xffffff] },
  spurt: { kicker: 'Invincibile', word: 'Scatto!', icon: 'bolt', label: 'Scatto finale', colors: [0x3ee0ff, 0x7befff, 0xffffff] },
  shoe: { kicker: 'Ferro di cavallo', word: '+1 vita!', icon: 'shoe', label: 'Vita in più', colors: [0x7ee8a8, 0xffc53d, 0xffffff] },
};
const SMASH_COLORS: Record<Kind, number[]> = { hurdle: [0xff5a1f, 0xffffff, 0x1f7a3f], gate: [0x1f62e0, 0xffffff], block: [0xffc21f, 0x1c3250] };
const CUES: Record<Kind, [string, string]> = {
  hurdle: ['↑', 'Salta'],
  gate: ['↓', 'Scivola'],
  block: ['← →', 'Cambia corsia'],
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const ui = {
  score: $('score'), scoreTab: document.querySelector<HTMLElement>('.hud-tab')!, carrots: $('carrots'), hud: $('hud'), lives: $('lives'),
  goal: $('goal'), goalMeters: $('goal-meters'), powers: $('powers'), pop: document.querySelector<HTMLElement>('.pop')!, daytime: $('daytime'),
  cue: $('cue'), cueKey: $('cue-key'), cueWord: $('cue-word'), toast: $('toast'),
  title: $('title'), start: $('start'), status: $('status'), titleBest: $('title-best'), titleBestValue: $('title-best-value'),
  over: $('over'), overScore: $('over-score'), overMeters: $('over-meters'), overCarrots: $('over-carrots'), overCarrotWord: $('over-carrot-word'), overBest: $('over-best'), rosette: $('rosette'), restart: $('restart'),
  paused: $('paused'), resume: $('resume'), pause: $('pause'),
  pauseScore: $('pause-score'), pauseMeters: $('pause-meters'), pauseCarrots: $('pause-carrots'), toastMeters: $('toast-meters'), toastKicker: $('toast-kicker'),
  settings: $('settings'), sound: $('toggle-sound'), calm: $('toggle-calm'),
};

function readCast(): CastId {
  try {
    const saved = localStorage.getItem(CAST_KEY);
    return isCastId(saved) ? saved : 'teio';
  } catch { return 'teio'; }
}
function saveCast(id: CastId) {
  try { localStorage.setItem(CAST_KEY, id); } catch { /* the choice is optional */ }
}

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
  let chosen = readCast();
  const [first, props] = await Promise.all([
    summon(chosen, ratio => { loadFill.style.transform = `scaleX(${ratio})`; }).catch(() => {
      // A broken saved choice should not lock the player out: fall back to Teio.
      chosen = 'teio';
      return summon(chosen);
    }),
    loadProps(),
  ]);
  const world = new World(scene, props);
  let runner: Runner = first;
  scene.add(runner.character.root);

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
  let recordCheered = false;
  let overAt = 0;

  const start = () => {
    if (sim.phase === 'over' && performance.now() - overAt < RESTART_LOCK_MS) return;
    if (sim.phase !== 'ready' && sim.phase !== 'over') return;
    sim.pace = settings.calm ? CALM_PACE : 1;
    sim.powerScale = settings.calm ? CALM_POWER_SCALE : 1;
    showCues = settings.calm || best < CUES_UNTIL_BEST;
    recordCheered = best === 0;
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

  let baseFov = 60;
  let rush = 0;
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    baseFov = w < h ? 76 : 60;
    camera.fov = baseFov + rush * SPURT_FOV;
    camera.updateProjectionMatrix();
    measureTitle();
  }
  addEventListener('resize', resize);
  resize();

  // One card per runner in CAST, on both the start and the results screen.
  for (const group of document.querySelectorAll('.picker')) {
    for (const [id, { name }] of Object.entries(CAST)) {
      const button = document.createElement('button');
      button.className = 'pick';
      button.setAttribute('role', 'radio');
      button.dataset.cast = id;
      button.innerHTML = '<span class="pick-face"><img alt="" hidden></span><span class="pick-name"></span>';
      button.querySelector('.pick-name')!.textContent = name;
      group.append(button);
    }
  }
  const pickers = [...document.querySelectorAll<HTMLButtonElement>('.pick')];

  function showCast() {
    const { title, page } = CAST[runner.id];
    for (const link of document.querySelectorAll<HTMLAnchorElement>('.model-link')) {
      link.href = page;
      link.textContent = title;
    }
    for (const button of pickers) {
      const id = button.dataset.cast as CastId;
      button.setAttribute('aria-checked', String(id === chosen));
      button.tabIndex = id === chosen ? 0 : -1;
      button.classList.toggle('waiting', id === chosen && id !== runner.id);
    }
  }

  function setPortrait(id: CastId) {
    summon(id).then(r => {
      const url = portrait(r, sim);
      for (const img of document.querySelectorAll<HTMLImageElement>(`.pick[data-cast='${id}'] img`)) {
        img.src = url;
        img.hidden = false;
      }
    }).catch(() => { /* the card keeps its placeholder */ });
  }

  /** Swaps the runner on the start or results screen; the 3D model itself is the preview. */
  async function choose(id: CastId) {
    if (sim.phase !== 'ready' && sim.phase !== 'over') return;
    if (id === chosen && id === runner.id) return;
    chosen = id;
    saveCast(id);
    showCast();
    let next: Runner;
    try { next = await summon(id); } catch { chosen = runner.id; showCast(); return; }
    if (chosen !== id || (sim.phase !== 'ready' && sim.phase !== 'over')) return;
    scene.remove(runner.character.root);
    runner = next;
    scene.add(runner.character.root);
    showCast();
    sfx.carrot();
    effects.burst(sim.x, 1.2, 0, 28, SPARKLE, { speed: 4, size: 0.06, life: 0.9, scroll: 0 });
  }
  for (const button of pickers) button.addEventListener('click', () => choose(button.dataset.cast as CastId));
  // Arrow keys move between the cards, as in any radio group.
  for (const group of document.querySelectorAll<HTMLElement>('.picker')) {
    group.addEventListener('keydown', e => {
      const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
      if (!step) return;
      e.preventDefault();
      e.stopPropagation();
      const cards = [...group.querySelectorAll<HTMLButtonElement>('.pick')];
      const next = cards[(cards.indexOf(document.activeElement as HTMLButtonElement) + step + cards.length) % cards.length];
      next.focus();
      next.click();
    });
  }
  showCast();

  ui.titleBest.hidden = best === 0;
  ui.titleBestValue.textContent = `Record: ${best.toLocaleString('it-IT')}`;

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
    if (sim.phase === 'paused') {
      ui.pauseScore.textContent = sim.score.toLocaleString('it-IT');
      ui.pauseMeters.textContent = Math.floor(sim.distance).toLocaleString('it-IT');
      ui.pauseCarrots.textContent = String(sim.carrotsTaken);
      ui.resume.focus({ preventScroll: true });
    }
  }

  function cheer(kicker: string, text: string) {
    ui.toastKicker.textContent = kicker;
    ui.toastMeters.textContent = text;
    retrigger(ui.toast, 'show');
  }

  /** One badge per active power-up, with a ring that empties as time runs out. */
  const powerBadges = new Map<Timed, HTMLLIElement>();
  function syncPowers() {
    for (const kind of Object.keys(POWER_TIME) as Timed[]) {
      const left = sim.phase === 'over' ? 0 : sim.powers[kind];
      let badge = powerBadges.get(kind);
      if (left <= 0) {
        if (badge) { badge.remove(); powerBadges.delete(kind); }
        continue;
      }
      if (!badge) {
        badge = document.createElement('li');
        badge.className = 'power';
        badge.dataset.kind = kind;
        badge.innerHTML = `<svg aria-hidden="true"><use href="#i-${POWERS[kind].icon}"/></svg>`;
        badge.setAttribute('aria-label', POWERS[kind].label);
        ui.powers.append(badge);
        powerBadges.set(kind, badge);
      }
      badge.style.setProperty('--t', (left / (POWER_TIME[kind] * sim.powerScale)).toFixed(3));
      badge.classList.toggle('ending', left < POWER_ENDING);
    }
    ui.scoreTab.classList.toggle('double', sim.powers.double > 0);
  }

  function syncHud() {
    syncPowers();
    if (sim.score !== shownScore) {
      const text = (shownScore = sim.score).toLocaleString('it-IT');
      ui.score.textContent = text;
      // Long scores shrink a little so the plaque never grows into the rest of the HUD.
      ui.score.style.setProperty('--len', String(Math.max(5, text.length)));
    }
    if (!recordCheered && sim.phase === 'running' && sim.score > best) {
      // Beating the record mid-run deserves a cheer right away, not only at the end.
      recordCheered = true;
      cheer('Nuovo', 'Record!');
      sfx.milestone();
      retrigger(ui.scoreTab, 'record');
    }
    if (sim.carrotsTaken !== shownCarrots) {
      ui.carrots.textContent = (shownCarrots = sim.carrotsTaken).toLocaleString('it-IT');
      ui.carrots.parentElement!.style.setProperty('--len', String(Math.max(4, ui.carrots.textContent.length)));
      ui.pop.textContent = `+${10 * sim.multiplier}`;
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
    // No instructions while the final spurt makes the runner invincible.
    if (sim.phase === 'running' && showCues && sim.powers.spurt === 0) {
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
        case 'power': {
          const info = POWERS[event.kind];
          sfx.power();
          cheer(info.kicker, info.word);
          effects.burst(LANE_X[event.lane], event.y, 0, 30, info.colors, { speed: 5, size: 0.07, life: 0.9, scroll: 0.4 });
          if (event.kind === 'shoe') retrigger(ui.lives, 'heal');
          break;
        }
        case 'powerEnd':
          sfx.powerEnd();
          break;
        case 'smash':
          sfx.smash();
          if (!settings.calm) shake = Math.max(shake, 0.35);
          effects.burst(LANE_X[event.lane], 0.8, -0.5, 18, SMASH_COLORS[event.kind], { speed: 7, size: 0.09, life: 0.7, scroll: 0.8 });
          break;
        case 'milestone':
          sfx.milestone();
          cheer('Traguardo', `${event.meters.toLocaleString('it-IT')} m!`);
          retrigger(ui.goal, 'reached');
          effects.burst(sim.x, 2, -3, 46, CONFETTI, { speed: 6, size: 0.065, life: 1.1, scroll: 0.5 });
          break;
      }
    }
    sim.events.length = 0;
  }

  function placeCamera(dt: number) {
    intro += ((sim.phase === 'ready' ? 1 : 0) - intro) * (1 - Math.exp(-dt * 3.2));
    shake = Math.max(0, shake - dt * 2.6);
    // The final spurt widens the view a little, for a sense of speed (not in calm mode).
    const rushTarget = sim.powers.spurt > 0 && sim.phase === 'running' && !settings.calm ? 1 : 0;
    if (Math.abs(rushTarget - rush) > 0.001) {
      rush += (rushTarget - rush) * (1 - Math.exp(-dt * 4));
      camera.fov = baseFov + rush * SPURT_FOV;
      camera.updateProjectionMatrix();
    }
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

    runner.animator.update(dt, sim);
    runner.character.root.visible = settings.calm || sim.invincibleT === 0 || Math.floor(time * 10) % 2 === 0;
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

  setPortrait(runner.id);
  // The other runner downloads quietly once the game is ready, so switching is instant.
  setTimeout(() => { for (const id of Object.keys(CAST) as CastId[]) if (id !== runner.id) setPortrait(id); }, 1200);

  ui.status.hidden = true;
  ui.start.hidden = false;
  measureTitle();
  ui.start.focus({ preventScroll: true });
  requestAnimationFrame(frame);
}

// After the first visit the game loads from the browser's cache (see public/sw.js).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* the game still works without it */ });
    navigator.serviceWorker.ready.then(registration => {
      const loaded = performance.getEntriesByType('resource').map(entry => entry.name);
      registration.active?.postMessage({ loaded });
    });
  });
}

main().catch(error => {
  console.error(error);
  ui.status.textContent = 'Il gioco non si è avviato. Verifica che il browser supporti WebGL, poi ricarica la pagina.';
});
