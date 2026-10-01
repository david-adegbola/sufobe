/**
 * All sound is synthesised in the browser: nothing to download or license.
 *
 *  - catches pluck a kantele (Karplus–Strong string synthesis) in the
 *    traditional 5-string tuning D–E–F–G–A, climbing with the combo
 *  - the forest: willow warbler (pajulintu) by day, song thrush (laulurastas)
 *    at dusk, a tawny owl (lehtopöllö) at night, wind, rain
 *  - Tikka drums on the trunk before speaking
 */
import type { Weather } from '../core/weather';

const KANTELE = [293.66, 329.63, 349.23, 392.0, 440.0]; // D4 E4 F4 G4 A4

export interface SoundEnv { playing: boolean; isNight: boolean; midsummer: boolean; dusk: boolean; weather: Weather }

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private plucks: AudioBuffer[] = [];
  private breath?: GainNode;
  private wind?: GainNode;
  private rain?: GainNode;
  private noise?: AudioBuffer;
  private nextBird = 0;
  private env: SoundEnv = { playing: false, isNight: false, midsummer: false, dusk: false, weather: 'sun' };
  muted = false;

  unlock() {
    if (this.ctx) { void this.ctx.resume(); return; }
    try {
      const c = new AudioContext();
      this.ctx = c;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -18;
      this.master = c.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(comp).connect(c.destination);
      this.noise = this.makeNoise(2);
      this.plucks = this.makePlucks();
      this.breath = this.loop(this.noise, 'lowpass', 650, 0);
      this.wind = this.loop(this.makeNoise(4, true), 'lowpass', 380, 0.05);
      this.rain = this.loop(this.noise, 'highpass', 2600, 0);
    } catch { this.ctx = null; }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  // ---------- building blocks ----------

  private makeNoise(secs: number, brown = false): AudioBuffer {
    const c = this.ctx!;
    const b = c.createBuffer(1, c.sampleRate * secs, c.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return b;
  }

  /** Karplus–Strong: a burst of noise fed through a short delay line sounds like a plucked string. */
  private makePlucks(): AudioBuffer[] {
    const c = this.ctx!;
    const notes: number[] = [];
    for (const oct of [1, 2, 4]) for (const f of KANTELE) notes.push(f * oct); // three octaves of the five strings
    return notes.map((f) => {
      const sr = c.sampleRate, len = Math.floor(sr * 1.6);
      const buf = c.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      const N = Math.round(sr / f);
      for (let i = 0; i < N; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
      for (let i = N; i < len; i++) d[i] = 0.4985 * (d[i - N] + d[i - N + 1]);
      // soften the attack slightly
      for (let i = 0; i < 64; i++) d[i] *= i / 64;
      return buf;
    });
  }

  private loop(buf: AudioBuffer, type: BiquadFilterType, freq: number, gain: number): GainNode {
    const c = this.ctx!;
    const src = c.createBufferSource();
    src.buffer = buf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = c.createGain(); g.gain.value = gain;
    src.connect(f).connect(g).connect(this.master);
    src.start();
    return g;
  }

  private play(buf: AudioBuffer, vol: number, when = 0, pan = 0, rate = 1) {
    const c = this.ctx;
    if (!c) return;
    const s = c.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = rate;
    const g = c.createGain(); g.gain.value = vol;
    const p = c.createStereoPanner(); p.pan.value = pan;
    s.connect(g).connect(p).connect(this.master);
    s.start(c.currentTime + when);
  }

  private chirp(f0: number, f1: number, dur: number, vol: number, when: number, pan: number) {
    const c = this.ctx!;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = c.createStereoPanner(); p.pan.value = pan;
    o.connect(g).connect(p).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // ---------- game sounds ----------

  /** Each catch in one breath climbs the kantele's strings: a long breath plays a tune. */
  pop(combo: number, gold: boolean) {
    if (!this.ctx || !this.plucks.length) return;
    const i = Math.min(this.plucks.length - 1, combo - 1);
    this.play(this.plucks[i], 0.55, 0, (Math.random() - 0.5) * 0.4);
    if (gold) { this.play(this.plucks[Math.min(this.plucks.length - 1, i + 2)], 0.35, 0.06); this.play(this.plucks[Math.min(this.plucks.length - 1, i + 4)], 0.25, 0.12); }
  }

  bounce() {
    if (!this.ctx || !this.noise) return;
    this.play(this.plucks[0], 0.12, 0, 0, 0.5);
  }

  wilt() {
    if (!this.ctx) return;
    this.play(this.plucks[4], 0.45, 0, 0, 0.5);
    this.play(this.plucks[2], 0.4, 0.18, 0, 0.5);
    this.play(this.noise!, 0.05, 0, 0, 0.3);
  }

  /** Black woodpecker drumming: a fast, slightly slowing roll of knocks. */
  drum() {
    const c = this.ctx;
    if (!c || !this.noise) return;
    let t = 0;
    for (let i = 0; i < 14; i++) {
      const s = c.createBufferSource(); s.buffer = this.noise;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 3;
      const g = c.createGain();
      const at = c.currentTime + t;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.5 * (1 - i / 20), at + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.03);
      s.connect(f).connect(g).connect(this.master);
      s.start(at, Math.random()); s.stop(at + 0.04);
      t += 0.055 + i * 0.002;
    }
  }

  dawn() { this.warbler(0.3); }

  end() {
    if (!this.ctx) return;
    [0, 2, 4, 5, 7].forEach((n, i) => this.play(this.plucks[n], 0.45, i * 0.12));
  }

  setBreathing(open: boolean, heat = false) {
    if (!this.ctx || !this.breath) return;
    this.breath.gain.setTargetAtTime(open ? (heat ? 0.05 : 0.032) : 0, this.ctx.currentTime, 0.08);
  }

  // ---------- the forest around you ----------

  /** Willow warbler (pajulintu), Finland's most common bird: a soft descending cascade. */
  private warbler(when: number) {
    const pan = (Math.random() - 0.5) * 1.4;
    let t = when;
    const notes = 9 + Math.floor(Math.random() * 4);
    for (let i = 0; i < notes; i++) {
      const f = 5200 - i * (2200 / notes) + (Math.random() - 0.5) * 200;
      this.chirp(f, f * 0.9, 0.07, 0.035, t, pan);
      t += 0.1;
    }
  }

  /** Song thrush (laulurastas) at dusk: a short phrase, repeated. */
  private thrush() {
    const pan = (Math.random() - 0.5) * 1.4;
    const phrase = Array.from({ length: 3 }, () => 1800 + Math.random() * 2200);
    let t = 0;
    for (let rep = 0; rep < 3; rep++) {
      for (const f of phrase) { this.chirp(f, f * 1.2, 0.08, 0.04, t, pan); t += 0.11; }
      t += 0.25;
    }
  }

  /** Tawny owl (lehtopöllö) hoot, soft, from far away. */
  private owl() {
    const c = this.ctx!;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.frequency.setValueAtTime(390, t);
    o.frequency.linearRampToValueAtTime(360, t + 0.6);
    const lfo = c.createOscillator(); lfo.frequency.value = 7;
    const lg = c.createGain(); lg.gain.value = 8;
    lfo.connect(lg).connect(o.frequency);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(g).connect(this.master);
    o.start(t); lfo.start(t); o.stop(t + 0.75); lfo.stop(t + 0.75);
  }

  /** Called every frame with what is happening, to fade the soundscape. */
  update(env: SoundEnv) {
    const c = this.ctx;
    if (!c) return;
    this.env = env;
    const now = c.currentTime;
    const raining = env.weather === 'rain' && !env.isNight;
    this.rain!.gain.setTargetAtTime(raining ? 0.06 : 0, now, 0.5);
    this.wind!.gain.setTargetAtTime(env.weather === 'heat' ? 0.025 : env.isNight ? 0.03 : 0.05, now, 0.8);
    if (now >= this.nextBird) {
      const e = this.env;
      if (e.isNight && !e.midsummer) { if (Math.random() < 0.5) this.owl(); this.nextBird = now + 6 + Math.random() * 6; }
      else if (e.dusk || e.midsummer && e.isNight) { this.thrush(); this.nextBird = now + 4 + Math.random() * 4; }
      else if (!raining && e.weather !== 'heat') { this.warbler(0); this.nextBird = now + 3 + Math.random() * 5; }
      else this.nextBird = now + 5;
    }
  }
}
