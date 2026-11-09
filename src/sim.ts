// Pure game logic: no Three.js here, so it can be tested headless.

export const LANE_X = [-2, 0, 2];
export const JUMP_V = 9.6;
const GRAVITY = 26;
const FAST_FALL = -20;
const SLIDE_TIME = 0.62;
const BUFFER_TIME = 0.16;
const SPAWN_AHEAD = 170;
const BLOCK_LEN = 6;
const INVINCIBLE_TIME = 1.6;
const MAX_QUEUED_EVENTS = 64;
export const LIVES = 3;
export const MILESTONE = 250;

export type Kind = 'hurdle' | 'gate' | 'block';
export type Phase = 'ready' | 'running' | 'paused' | 'over';

export interface Obstacle { kind: Kind; lane: number; s: number; len: number }
export interface Carrot { lane: number; s: number; y: number }
export type GameEvent =
  | { type: 'carrot'; lane: number; y: number }
  | { type: 'hit'; kind: Kind }
  | { type: 'jump' }
  | { type: 'slide' }
  | { type: 'land' }
  | { type: 'milestone'; meters: number };

const CELL: Record<string, Kind> = { H: 'hurdle', G: 'gate', B: 'block' };

// Rows of [left, centre, right]. H = jump, G = slide, B = change lane.
// Every row leaves a way through; ordered from easy to hard.
const PATTERNS: string[][] = [
  ['.B.'], ['B..'], ['..B'], ['H..'], ['.G.'], ['..H'],
  ['B.B'], ['BB.'], ['.BB'], ['HHH'], ['GGG'],
  ['BHB'], ['BGB'], ['H.G'], ['GBH'], ['HBG'],
  ['.B.', 'B.B'], ['BB.', '.BB'], ['.BB', 'BB.'],
  ['HHH', 'GGG'], ['GGG', 'HHH'], ['B.B', 'BHB', 'BGB'], ['BHB', 'HBG'],
];

export const speedAt = (d: number) => 14 + 20 * (1 - Math.exp(-d / 2500));
const rowGap = (s: number) => Math.max(13, speedAt(s) * 0.85);

export class Sim {
  phase: Phase = 'ready';
  distance = 0;
  lane = 1;
  x = 0;
  y = 0;
  vy = 0;
  slideT = 0;
  carrotsTaken = 0;
  hit: Kind | null = null;
  obstacles: Obstacle[] = [];
  carrots: Carrot[] = [];
  lives = LIVES;
  invincibleT = 0;
  nextMilestone = MILESTONE;
  pace = 1;
  events: GameEvent[] = [];

  private rand: () => number;
  private nextS = 60;
  private carrotLane = 1;
  private buffered: 'jump' | 'slide' | null = null;
  private bufferT = 0;

  constructor(rand: () => number = Math.random) {
    this.rand = rand;
    this.fill();
  }

  get speed() { return speedAt(this.distance) * this.pace; }
  get sliding() { return this.slideT > 0; }
  get airborne() { return this.y > 0; }
  get score() { return Math.floor(this.distance) + this.carrotsTaken * 10; }

  start() {
    if (this.phase === 'running' || this.phase === 'paused') return;
    if (this.phase === 'over') this.reset();
    this.phase = 'running';
  }

  togglePause() {
    if (this.phase === 'running') this.phase = 'paused';
    else if (this.phase === 'paused') this.phase = 'running';
  }

  private reset() {
    this.distance = 0;
    this.lane = 1;
    this.x = this.y = this.vy = this.slideT = 0;
    this.carrotsTaken = 0;
    this.hit = null;
    this.lives = LIVES;
    this.invincibleT = 0;
    this.nextMilestone = MILESTONE;
    this.events = [];
    this.obstacles = [];
    this.carrots = [];
    this.nextS = 60;
    this.carrotLane = 1;
    this.buffered = null;
    this.fill();
  }

  move(dir: -1 | 1) {
    if (this.phase === 'running') this.lane = Math.min(2, Math.max(0, this.lane + dir));
  }

  jump() {
    if (this.phase !== 'running') return;
    if (this.airborne) this.buffer('jump', BUFFER_TIME);
    else this.doJump();
  }

  slide() {
    if (this.phase !== 'running') return;
    if (this.airborne) {
      this.vy = Math.min(this.vy, FAST_FALL);
      this.buffer('slide', 0.4);
    } else {
      this.slideT = SLIDE_TIME;
      this.emit({ type: 'slide' });
    }
  }

  private emit(event: GameEvent) {
    if (this.events.length < MAX_QUEUED_EVENTS) this.events.push(event);
  }

  private buffer(action: 'jump' | 'slide', time: number) {
    this.buffered = action;
    this.bufferT = time;
  }

  private doJump() {
    this.slideT = 0;
    this.vy = JUMP_V;
    this.y = 1e-4;
    this.emit({ type: 'jump' });
  }

  step(dt: number) {
    if (this.phase !== 'running') return;

    this.distance += this.speed * dt;
    this.x = LANE_X[this.lane] + (this.x - LANE_X[this.lane]) * Math.exp(-dt * 18);
    this.slideT = Math.max(0, this.slideT - dt);
    this.bufferT -= dt;
    this.invincibleT = Math.max(0, this.invincibleT - dt);
    if (this.distance >= this.nextMilestone) {
      this.emit({ type: 'milestone', meters: this.nextMilestone });
      this.nextMilestone += MILESTONE;
    }

    if (this.airborne) {
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = this.vy = 0;
        this.emit({ type: 'land' });
        if (this.bufferT > 0 && this.buffered === 'jump') this.doJump();
        if (this.bufferT > 0 && this.buffered === 'slide') {
          this.slideT = SLIDE_TIME;
          this.emit({ type: 'slide' });
        }
        this.buffered = null;
      }
    }

    this.fill();
    this.collectCarrots();
    this.checkHits();
    this.obstacles = this.obstacles.filter(o => o.s + o.len > this.distance - 12);
  }

  private collectCarrots() {
    const top = this.y + (this.sliding ? 0.9 : 1.7);
    for (let i = this.carrots.length - 1; i >= 0; i--) {
      const c = this.carrots[i];
      if (c.s < this.distance - 4) { this.carrots.splice(i, 1); continue; }
      const near = Math.abs(c.s - this.distance) < 1.2 && Math.abs(LANE_X[c.lane] - this.x) < 0.9;
      if (near && c.y > this.y - 0.4 && c.y < top + 0.4) {
        this.carrots.splice(i, 1);
        this.carrotsTaken++;
        this.emit({ type: 'carrot', lane: c.lane, y: c.y });
      }
    }
  }

  private checkHits() {
    if (this.invincibleT > 0) return;
    for (const o of this.obstacles) {
      if (this.distance + 0.35 < o.s || this.distance - 0.35 > o.s + o.len) continue;
      if (Math.abs(LANE_X[o.lane] - this.x) >= 1) continue;
      const clear = o.kind === 'hurdle' ? this.y >= 0.85 : o.kind === 'gate' ? this.sliding : false;
      if (!clear) {
        this.hit = o.kind;
        this.lives--;
        this.emit({ type: 'hit', kind: o.kind });
        if (this.lives <= 0) this.phase = 'over';
        else this.invincibleT = INVINCIBLE_TIME;
        return;
      }
    }
  }

  private fill() {
    while (this.nextS < this.distance + SPAWN_AHEAD) this.placePattern();
  }

  private placePattern() {
    const unlocked = Math.min(PATTERNS.length, 6 + Math.floor(this.distance / 120));
    const rows = PATTERNS[Math.floor(this.rand() * unlocked)];
    for (const row of rows) {
      for (let lane = 0; lane < 3; lane++) {
        const kind = CELL[row[lane]];
        if (!kind) continue;
        const len = kind === 'block' ? BLOCK_LEN : 0.4;
        this.obstacles.push({ kind, lane, s: this.nextS, len });
      }
      if (this.rand() < 0.6) this.placeCarrots(row);
      this.nextS += rowGap(this.nextS);
    }
    this.nextS += rowGap(this.nextS) * 0.35;
  }

  // Carrots follow the free lane closest to the previous trail.
  private placeCarrots(row: string) {
    const free = [0, 1, 2].filter(l => row[l] !== 'B');
    free.sort((a, b) => Math.abs(a - this.carrotLane) - Math.abs(b - this.carrotLane));
    const lane = this.carrotLane = free[0];
    for (let i = -2; i <= 2; i++) {
      const offset = i * 2.2;
      const arc = row[lane] === 'H' ? 1.3 * (1 - (offset / 5.2) ** 2) : 0;
      this.carrots.push({ lane, s: this.nextS + offset, y: 0.65 + arc });
    }
  }
}
