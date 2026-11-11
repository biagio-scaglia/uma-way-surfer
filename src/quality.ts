import type * as THREE from 'three';

const STEP = 0.25;
const MIN_RATIO = 0.75;
const SLOW_MS = 1000 / 52;
const SMOOTH_MS = 1000 / 58;
const SLOW_SECONDS_TO_DROP = 2;
const SMOOTH_SECONDS_TO_RAISE = 6;
/** After this long without trouble, a level that once struggled gets another chance. */
const SMOOTH_SECONDS_TO_FORGIVE = 30;
const SETTLE_MS = 3000;
const AFTER_CHANGE_MS = 1500;
/** Far too slow: take two steps at once rather than stutter through each. */
const VERY_SLOW_MS = 1000 / 30;

/**
 * Keeps the frame rate up by trading resolution for speed: the render scale drops a step
 * when frames run long and climbs back when there is room, never above a level that
 * already struggled. Phones are usually limited by how many pixels they fill, so this
 * is the change that helps most and costs the least to look at.
 */
export class Quality {
  ratio: number;
  private max: number;
  private ceiling: number;
  private windowStart = 0;
  private frames = 0;
  private total = 0;
  private slowSeconds = 0;
  private smoothSeconds = 0;
  private settleUntil = 0;

  private renderer: THREE.WebGLRenderer;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.max = Math.min(devicePixelRatio, 2);
    this.ratio = this.ceiling = this.max;
    renderer.setPixelRatio(this.ratio);
    this.settle();
  }

  /** Ignore the next few seconds: loading, resizing and panel animations cause one-off hitches. */
  settle(ms = SETTLE_MS) {
    this.settleUntil = performance.now() + ms;
    this.slowSeconds = this.smoothSeconds = 0;
  }

  /** Call once per rendered frame with the time since the previous one. */
  frame(now: number, ms: number) {
    if (now < this.settleUntil || ms > 100) { this.windowStart = now; this.frames = this.total = 0; return; }
    this.frames++;
    this.total += ms;
    if (now - this.windowStart < 1000) return;
    const average = this.total / this.frames;
    this.windowStart = now;
    this.frames = this.total = 0;

    if (average > SLOW_MS) {
      this.smoothSeconds = 0;
      const floor = Math.min(MIN_RATIO, this.max);
      if (++this.slowSeconds >= SLOW_SECONDS_TO_DROP && this.ratio > floor) {
        this.ceiling = this.ratio - STEP;
        this.set(Math.max(floor, this.ratio - (average > VERY_SLOW_MS ? 2 * STEP : STEP)));
      }
    } else if (average < SMOOTH_MS) {
      this.slowSeconds = 0;
      this.smoothSeconds++;
      if (this.smoothSeconds >= SMOOTH_SECONDS_TO_RAISE && this.ratio < this.ceiling) {
        this.set(Math.min(this.ceiling, this.ratio + STEP));
      } else if (this.smoothSeconds >= SMOOTH_SECONDS_TO_FORGIVE && this.ceiling < this.max) {
        this.ceiling = Math.min(this.max, this.ceiling + STEP);
        this.smoothSeconds = 0;
      }
    }
  }

  private set(ratio: number) {
    this.ratio = ratio;
    this.renderer.setPixelRatio(ratio);
    this.settle(AFTER_CHANGE_MS);
  }
}
