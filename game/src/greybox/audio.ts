/** Tiny Web Audio synth: no files to download. Starts on the first touch. */
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

export class Sound {
  private ctx: AudioContext | null = null;
  private breath: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  muted = false;

  unlock() {
    if (this.ctx) { void this.ctx.resume(); return; }
    try {
      this.ctx = new AudioContext();
      this.startBreath();
    } catch { this.ctx = null; }
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, when = 0) {
    const c = this.ctx;
    if (!c || this.muted) return;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** Each catch in one breath climbs the pentatonic scale: a long breath plays a tune. */
  pop(combo: number, gold: boolean) {
    const step = PENTA[Math.min(PENTA.length - 1, combo - 1)];
    const f = 523.25 * Math.pow(2, step / 12);
    this.tone(f, 0.12, 'triangle', 0.18);
    if (gold) { this.tone(f * 1.5, 0.25, 'sine', 0.12, 0.03); this.tone(f * 2, 0.3, 'sine', 0.08, 0.06); }
  }
  bounce() { this.tone(180, 0.08, 'sine', 0.06); }
  wilt() { this.tone(140, 0.4, 'sawtooth', 0.08); this.tone(98, 0.5, 'sine', 0.12, 0.05); }
  dawn() { this.tone(659.25, 0.5, 'sine', 0.06); this.tone(987.77, 0.6, 'sine', 0.04, 0.12); }
  end() { [0, 4, 7, 12].forEach((s, i) => this.tone(392 * Math.pow(2, s / 12), 0.6, 'triangle', 0.1, i * 0.09)); }

  private startBreath() {
    const c = this.ctx!;
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    const gain = c.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(c.destination);
    src.start();
    this.breath = { src, gain };
  }

  /** Soft airy sound while the stomata are open. */
  setBreathing(open: boolean) {
    if (!this.ctx || !this.breath) return;
    const target = open && !this.muted ? 0.035 : 0;
    this.breath.gain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
  }
}
