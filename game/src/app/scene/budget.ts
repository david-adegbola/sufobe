/**
 * Keeps the game playable on slow tablets. The painted scenes are mostly
 * pixel filling, so the cost grows with canvas resolution. When frames stay
 * slow for four seconds (two windows in a row, so one busy moment such as
 * loading a forest does not count), the canvas drops one resolution step
 * (2 → 1.5 → 1 → 0.75 pixels per CSS pixel). It never steps back up in the same visit, so it
 * cannot flicker between sizes.
 */
const STEPS = [2, 1.5, 1, 0.75];
/** Slower than about 28 fps on average. Below iOS Low Power Mode's 30 fps cap, so that alone never triggers it. */
const SLOW_MS = 1000 / 28;

export class FrameBudget {
  private cap = STEPS[0];
  private last = 0;
  private sum = 0;
  private n = 0;
  private slow = 0;

  /** Canvas pixels per CSS pixel to use now. */
  dpr(): number {
    return Math.min(this.cap, window.devicePixelRatio || 1);
  }

  /** Call once per drawn frame. Returns true when the resolution has just been lowered: resize then. */
  tick(now = performance.now()): boolean {
    const d = now - this.last;
    this.last = now;
    if (d <= 0 || d > 1000) return false; // first frame, pauses, a hidden tab
    this.sum += d;
    this.n++;
    if (this.sum < 2000) return false;
    const avg = this.sum / this.n;
    this.sum = this.n = 0;
    if (avg <= SLOW_MS) { this.slow = 0; return false; }
    if (++this.slow < 2) return false;
    this.slow = 0;
    const cur = this.dpr();
    const next = STEPS.find((s) => s < cur - 0.01);
    if (next === undefined) return false;
    this.cap = next;
    return true;
  }

}
