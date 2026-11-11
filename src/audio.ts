// Short synthesized sound effects: no audio files to download.

const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51];
const STREAK_WINDOW = 1.2;

export class Sfx {
  muted = false;
  private ctx: AudioContext | null = null;
  private streak = 0;
  private lastCarrot = -Infinity;

  /** Browsers only allow audio after a user gesture. */
  unlock() {
    this.ctx ??= new AudioContext();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private tone(freq: number, duration: number, type: OscillatorType, volume: number, delay = 0, endFreq = freq) {
    if (this.muted || !this.ctx) return;
    const start = this.ctx.currentTime + delay;
    const oscillator = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, start);
    oscillator.frequency.exponentialRampToValueAtTime(endFreq, start + duration);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(this.ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + duration);
  }

  /** The pitch climbs while carrots keep coming, so a good streak can be heard. */
  carrot() {
    const now = performance.now() / 1000;
    this.streak = now - this.lastCarrot < STREAK_WINDOW ? this.streak + 1 : 0;
    this.lastCarrot = now;
    this.tone(SCALE[Math.min(this.streak, SCALE.length - 1)], 0.11, 'triangle', 0.14);
  }

  jump() { this.tone(300, 0.16, 'sine', 0.1, 0, 620); }
  slide() { this.tone(420, 0.2, 'sine', 0.08, 0, 180); }
  hit() { this.tone(170, 0.28, 'square', 0.09, 0, 70); }

  milestone() {
    [0, 2, 4, 5].forEach((note, i) => this.tone(SCALE[note], 0.2, 'triangle', 0.15, i * 0.08));
  }

  /** A bright rising arpeggio, distinct from the milestone fanfare. */
  power() {
    [0, 2, 4, 7].forEach((note, i) => this.tone(SCALE[note] * 1.5, 0.14, 'square', 0.06, i * 0.05));
    this.tone(SCALE[7], 0.4, 'triangle', 0.1, 0.2);
  }

  /** Soft and short: the effect is over, nothing went wrong. */
  powerEnd() { this.tone(SCALE[4], 0.22, 'sine', 0.08, 0, SCALE[0]); }

  smash() { this.tone(240, 0.14, 'triangle', 0.1, 0, 120); }

  gameOver() {
    [4, 3, 2, 0].forEach((note, i) => this.tone(SCALE[note] / 2, 0.24, 'triangle', 0.12, i * 0.12));
  }
}
