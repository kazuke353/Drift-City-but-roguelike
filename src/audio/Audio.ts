import { Save } from '../core/Save';
import { Music } from './Music';

export interface PlayOpts {
  x?: number;
  z?: number;
  vol?: number;
  pitch?: number;
}

type LoopName = 'engine' | 'drift' | 'laser' | 'flamer' | 'boost' | 'minigun' | 'charge' | 'lava';

interface LoopVoice {
  gain: GainNode;
  nodes: AudioNode[];
  params: Record<string, AudioParam>;
  target: number;
}

/**
 * Fully procedural audio: every sound effect is synthesized with WebAudio at runtime,
 * so the game ships without any audio assets.
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  sfxBus!: GainNode;
  musicBus!: GainNode;
  reverb!: ConvolverNode;
  reverbSend!: GainNode;
  noise!: AudioBuffer;
  music: Music | null = null;
  private lastPlay = new Map<string, number>();
  private active = new Map<string, number>();
  private loops = new Map<LoopName, LoopVoice>();
  listenerX = 0;
  listenerZ = 0;
  listenerYaw = 0;
  muted = false;

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
    } catch {
      this.ctx = null;
      return;
    }
    const ctx = this.ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    this.master = ctx.createGain();
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);

    // Dungeon reverb from a generated impulse response
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(2.4, 2.6);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.22;
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(this.master);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.applyVolumes();
    this.music = new Music(this);
  }

  private makeImpulse(seconds: number, decay: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (i < 400 ? i / 400 : 1);
      }
    }
    return buf;
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = Save.settings;
    const m = this.muted ? 0 : s.masterVol;
    this.master.gain.setTargetAtTime(m, this.ctx.currentTime, 0.05);
    this.sfxBus.gain.setTargetAtTime(s.sfxVol, this.ctx.currentTime, 0.05);
    this.musicBus.gain.setTargetAtTime(s.musicVol * 0.55, this.ctx.currentTime, 0.05);
  }

  setListener(x: number, z: number, yaw: number) {
    this.listenerX = x;
    this.listenerZ = z;
    this.listenerYaw = yaw;
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /** Output chain for a one-shot, with distance attenuation and stereo pan. */
  private out(opts: PlayOpts | undefined, baseVol: number, reverbAmt = 0.3): GainNode | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    let vol = baseVol * (opts?.vol ?? 1);
    let pan = 0;
    if (opts && opts.x !== undefined && opts.z !== undefined) {
      const dx = opts.x - this.listenerX, dz = opts.z - this.listenerZ;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > 140) return null;
      vol *= 1 / (1 + d / 22);
      const ang = Math.atan2(dx, dz) - this.listenerYaw;
      pan = -Math.sin(ang) * Math.min(1, d / 10) * 0.8;
    }
    if (vol < 0.005) return null;
    const g = ctx.createGain();
    g.gain.value = vol;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    p.connect(this.sfxBus);
    if (reverbAmt > 0) {
      const r = ctx.createGain();
      r.gain.value = reverbAmt;
      p.connect(r);
      r.connect(this.reverbSend);
    }
    return g;
  }

  private gate(name: string, minInterval: number, maxActive = 99, duration = 0.2) {
    const t = performance.now();
    const last = this.lastPlay.get(name) ?? -1e9;
    if (t - last < minInterval * 1000) return false;
    const act = this.active.get(name) ?? 0;
    if (act >= maxActive) return false;
    this.lastPlay.set(name, t);
    this.active.set(name, act + 1);
    setTimeout(() => this.active.set(name, Math.max(0, (this.active.get(name) ?? 1) - 1)), duration * 1000);
    return true;
  }

  private noiseSrc(t: number, dur: number, rate = 1) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = rate;
    src.loop = true;
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
    return src;
  }

  private env(g: GainNode, t: number, a: number, peak: number, d: number, curve: 'exp' | 'lin' = 'exp') {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    else g.gain.linearRampToValueAtTime(0.0001, t + a + d);
  }

  private tone(dest: AudioNode, type: OscillatorType, f0: number, f1: number, t: number, dur: number, peak: number, attack = 0.005) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain();
    this.env(g, t, attack, peak, dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
    return o;
  }

  private noiseBurst(dest: AudioNode, t: number, dur: number, peak: number, filter: BiquadFilterType, freq: number, q = 1, freqEnd?: number, attack = 0.002) {
    const ctx = this.ctx!;
    const src = this.noiseSrc(t, attack + dur);
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, attack, peak, dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
  }

  play(name: string, opts?: PlayOpts) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.005;
    const p = opts?.pitch ?? 1;
    const r = () => 0.92 + Math.random() * 0.16;
    switch (name) {
      case 'mg': {
        if (!this.gate(name, 0.035, 6, 0.12)) return;
        const o = this.out(opts, 0.32, 0.15);
        if (!o) return;
        this.noiseBurst(o, t, 0.07, 1, 'bandpass', 2400 * r() * p, 0.9, 700);
        this.tone(o, 'square', 180 * r() * p, 60, t, 0.05, 0.5);
        break;
      }
      case 'minigun': {
        if (!this.gate(name, 0.03, 6, 0.1)) return;
        const o = this.out(opts, 0.26, 0.1);
        if (!o) return;
        this.noiseBurst(o, t, 0.05, 1, 'bandpass', 3000 * r() * p, 1.2, 900);
        this.tone(o, 'square', 140 * r(), 70, t, 0.04, 0.4);
        break;
      }
      case 'cannon': {
        if (!this.gate(name, 0.06, 4, 0.5)) return;
        const o = this.out(opts, 0.6, 0.4);
        if (!o) return;
        this.noiseBurst(o, t, 0.35, 1, 'lowpass', 1800 * p, 0.7, 200);
        this.tone(o, 'sine', 110 * p, 38, t, 0.35, 1.1);
        this.tone(o, 'triangle', 240 * p, 80, t, 0.12, 0.4);
        break;
      }
      case 'shotgun': {
        if (!this.gate(name, 0.06, 4, 0.4)) return;
        const o = this.out(opts, 0.55, 0.35);
        if (!o) return;
        this.noiseBurst(o, t, 0.28, 1, 'lowpass', 4200 * p, 0.5, 400);
        this.tone(o, 'sine', 140 * p, 45, t, 0.2, 0.9);
        break;
      }
      case 'tesla': {
        if (!this.gate(name, 0.05, 4, 0.3)) return;
        const o = this.out(opts, 0.35, 0.3);
        if (!o) return;
        const src = this.noiseSrc(t, 0.25);
        const f = ctx.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = 1800;
        const am = ctx.createGain();
        const lfo = ctx.createOscillator();
        lfo.type = 'square';
        lfo.frequency.value = 55 + Math.random() * 30;
        const lg = ctx.createGain();
        lg.gain.value = 0.5;
        lfo.connect(lg);
        lg.connect(am.gain);
        am.gain.value = 0.5;
        src.connect(f);
        f.connect(am);
        const g = ctx.createGain();
        this.env(g, t, 0.003, 1, 0.22);
        am.connect(g);
        g.connect(o);
        lfo.start(t);
        lfo.stop(t + 0.3);
        this.tone(o, 'sawtooth', 900 * p, 300, t, 0.15, 0.2);
        break;
      }
      case 'rail': {
        const o = this.out(opts, 0.7, 0.5);
        if (!o) return;
        this.noiseBurst(o, t, 0.5, 0.8, 'bandpass', 6000, 0.8, 500);
        this.tone(o, 'sawtooth', 1600 * p, 60, t, 0.5, 0.5);
        this.tone(o, 'sine', 80, 30, t, 0.4, 1);
        break;
      }
      case 'rocket': {
        if (!this.gate(name, 0.05, 6, 0.6)) return;
        const o = this.out(opts, 0.4, 0.3);
        if (!o) return;
        this.noiseBurst(o, t, 0.5, 1, 'bandpass', 600 * p, 1.5, 2600, 0.03);
        this.tone(o, 'sine', 90, 50, t, 0.12, 0.6);
        break;
      }
      case 'mortar': {
        if (!this.gate(name, 0.06, 4, 0.5)) return;
        const o = this.out(opts, 0.5, 0.35);
        if (!o) return;
        this.tone(o, 'sine', 160 * p, 50, t, 0.25, 1.2);
        this.noiseBurst(o, t, 0.15, 0.6, 'lowpass', 900, 1);
        break;
      }
      case 'saw': {
        if (!this.gate(name, 0.05, 4, 0.5)) return;
        const o = this.out(opts, 0.3, 0.3);
        if (!o) return;
        this.tone(o, 'triangle', 2200 * p, 1800, t, 0.4, 0.4);
        this.tone(o, 'sine', 3300 * p, 3000, t, 0.35, 0.25);
        this.noiseBurst(o, t, 0.08, 0.6, 'highpass', 3000, 1);
        break;
      }
      case 'sawHit': {
        if (!this.gate(name, 0.04, 5, 0.2)) return;
        const o = this.out(opts, 0.25, 0.15);
        if (!o) return;
        this.noiseBurst(o, t, 0.12, 1, 'bandpass', 3500 * r(), 3);
        break;
      }
      case 'explosion':
      case 'explosionBig':
      case 'explosionSmall': {
        const big = name === 'explosionBig', small = name === 'explosionSmall';
        if (!this.gate(name, small ? 0.04 : 0.07, small ? 5 : 4, 0.8)) return;
        const o = this.out(opts, big ? 1.1 : small ? 0.45 : 0.8, big ? 0.7 : 0.45);
        if (!o) return;
        const dur = big ? 1.6 : small ? 0.45 : 0.9;
        this.noiseBurst(o, t, dur, 1, 'lowpass', (big ? 2600 : 3200) * r(), 0.6, 120, 0.004);
        this.tone(o, 'sine', (big ? 90 : 120) * r(), 25, t, dur * 0.8, big ? 1.5 : 1.1);
        this.noiseBurst(o, t, 0.06, 0.8, 'highpass', 2500, 0.5);
        break;
      }
      case 'hit': {
        if (!this.gate(name, 0.03, 6, 0.1)) return;
        const o = this.out(opts, 0.22, 0.05);
        if (!o) return;
        this.tone(o, 'square', 420 * r() * p, 180, t, 0.05, 0.4);
        this.noiseBurst(o, t, 0.04, 0.5, 'bandpass', 1500, 2);
        break;
      }
      case 'crit': {
        if (!this.gate(name, 0.05, 4, 0.2)) return;
        const o = this.out(opts, 0.32, 0.2);
        if (!o) return;
        this.tone(o, 'square', 1300 * r(), 1800, t, 0.09, 0.35);
        this.tone(o, 'sine', 2600 * r(), 2600, t + 0.03, 0.14, 0.3);
        break;
      }
      case 'armorHit': {
        if (!this.gate(name, 0.04, 5, 0.1)) return;
        const o = this.out(opts, 0.25, 0.1);
        if (!o) return;
        this.tone(o, 'triangle', 1900 * r(), 1500, t, 0.08, 0.4);
        this.tone(o, 'triangle', 2710 * r(), 2300, t, 0.06, 0.3);
        break;
      }
      case 'bone': {
        if (!this.gate(name, 0.05, 5, 0.3)) return;
        const o = this.out(opts, 0.45, 0.3);
        if (!o) return;
        for (let i = 0; i < 5; i++) {
          const tt = t + i * 0.025 + Math.random() * 0.02;
          this.noiseBurst(o, tt, 0.03, 0.8, 'bandpass', 1200 + Math.random() * 2400, 6);
        }
        this.tone(o, 'triangle', 300, 120, t, 0.12, 0.4);
        break;
      }
      case 'splat': {
        if (!this.gate(name, 0.05, 5, 0.3)) return;
        const o = this.out(opts, 0.45, 0.25);
        if (!o) return;
        this.noiseBurst(o, t, 0.2, 1, 'lowpass', 1400 * r(), 1.5, 300);
        this.tone(o, 'sine', 180 * r(), 60, t, 0.18, 0.7);
        break;
      }
      case 'growl': {
        if (!this.gate(name, 0.4, 3, 0.8)) return;
        const o = this.out(opts, 0.35, 0.4);
        if (!o) return;
        const s = this.tone(o, 'sawtooth', 90 * r() * p, 60 * p, t, 0.6, 0.5, 0.05);
        void s;
        this.noiseBurst(o, t, 0.6, 0.4, 'bandpass', 500 * p, 3, 300, 0.05);
        break;
      }
      case 'roar': {
        const o = this.out(opts, 1.0, 0.8);
        if (!o) return;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 900;
        f.connect(o);
        for (const [fr, v] of [[55, 1], [58, 0.8], [110, 0.5], [82, 0.6]] as const) {
          const osc = ctx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(fr * p, t);
          osc.frequency.linearRampToValueAtTime(fr * p * 1.3, t + 0.5);
          osc.frequency.linearRampToValueAtTime(fr * p * 0.8, t + 2);
          const g = ctx.createGain();
          this.env(g, t, 0.15, v * 0.6, 1.9);
          const lfo = ctx.createOscillator();
          lfo.frequency.value = 18 + Math.random() * 8;
          const lg = ctx.createGain();
          lg.gain.value = 0.25;
          lfo.connect(lg);
          lg.connect(g.gain);
          osc.connect(g);
          g.connect(f);
          osc.start(t);
          lfo.start(t);
          osc.stop(t + 2.2);
          lfo.stop(t + 2.2);
        }
        this.noiseBurst(o, t, 1.8, 0.6, 'bandpass', 700, 2, 250, 0.2);
        break;
      }
      case 'playerHit': {
        if (!this.gate(name, 0.07, 3, 0.2)) return;
        const o = this.out(undefined, 0.45, 0.2);
        if (!o) return;
        this.tone(o, 'triangle', 520 * r(), 380, t, 0.14, 0.6);
        this.tone(o, 'triangle', 787 * r(), 600, t, 0.12, 0.4);
        this.noiseBurst(o, t, 0.1, 0.7, 'bandpass', 900, 1.5);
        break;
      }
      case 'shieldHit': {
        if (!this.gate(name, 0.07, 3, 0.2)) return;
        const o = this.out(undefined, 0.35, 0.3);
        if (!o) return;
        this.tone(o, 'sine', 1400 * r(), 700, t, 0.15, 0.5);
        this.tone(o, 'sawtooth', 700 * r(), 350, t, 0.1, 0.12);
        break;
      }
      case 'shieldBreak': {
        const o = this.out(undefined, 0.6, 0.5);
        if (!o) return;
        this.noiseBurst(o, t, 0.5, 1, 'highpass', 3000, 0.7, 800);
        this.tone(o, 'square', 1500, 120, t, 0.5, 0.35);
        break;
      }
      case 'shieldUp': {
        const o = this.out(undefined, 0.3, 0.3);
        if (!o) return;
        this.tone(o, 'sine', 300, 1400, t, 0.4, 0.5, 0.05);
        this.tone(o, 'triangle', 600, 2400, t + 0.05, 0.35, 0.2, 0.05);
        break;
      }
      case 'coin': {
        if (!this.gate(name, 0.035, 6, 0.2)) return;
        const o = this.out(opts, 0.2, 0.2);
        if (!o) return;
        const f = 1760 * (0.9 + Math.random() * 0.3);
        this.tone(o, 'square', f, f, t, 0.05, 0.25);
        this.tone(o, 'square', f * 1.335, f * 1.335, t + 0.05, 0.12, 0.25);
        break;
      }
      case 'pickup': {
        const o = this.out(undefined, 0.35, 0.3);
        if (!o) return;
        [660, 880, 1320].forEach((f, i) => this.tone(o, 'triangle', f, f, t + i * 0.05, 0.15, 0.5));
        break;
      }
      case 'heal': {
        const o = this.out(undefined, 0.3, 0.3);
        if (!o) return;
        [523, 659, 784, 1046].forEach((f, i) => this.tone(o, 'sine', f, f, t + i * 0.06, 0.25, 0.5));
        break;
      }
      case 'lootDrop': {
        const rar = Math.round(p);
        const o = this.out(opts, 0.3 + rar * 0.12, 0.5);
        if (!o) return;
        this.tone(o, 'sine', 200, 90, t, 0.18, 0.8);
        if (rar >= 2) {
          const chord = rar >= 4 ? [523, 659, 784, 1046, 1318] : rar >= 3 ? [440, 554, 659, 880] : [392, 494, 587];
          chord.forEach((f, i) => this.tone(o, rar >= 4 ? 'sawtooth' : 'triangle', f, f, t + 0.08 + i * 0.07, rar >= 4 ? 1.2 : 0.5, rar >= 4 ? 0.18 : 0.3, 0.01));
        }
        if (rar >= 4) {
          this.noiseBurst(o, t + 0.1, 1.5, 0.3, 'highpass', 6000, 0.5, 9000, 0.3);
          this.tone(o, 'sine', 2093, 2093, t + 0.5, 1.2, 0.2, 0.2);
        }
        break;
      }
      case 'levelUp': {
        const o = this.out(undefined, 0.5, 0.6);
        if (!o) return;
        [392, 523, 659, 784, 1046].forEach((f, i) => {
          this.tone(o, 'square', f, f, t + i * 0.07, 0.3, 0.2);
          this.tone(o, 'sine', f * 2, f * 2, t + i * 0.07, 0.4, 0.15);
        });
        break;
      }
      case 'uiHover': {
        if (!this.gate(name, 0.03, 3, 0.1)) return;
        const o = this.out(undefined, 0.12, 0);
        if (!o) return;
        this.tone(o, 'square', 1200, 1200, t, 0.025, 0.4);
        break;
      }
      case 'uiClick': {
        const o = this.out(undefined, 0.25, 0.1);
        if (!o) return;
        this.tone(o, 'square', 700, 1400, t, 0.06, 0.4);
        this.noiseBurst(o, t, 0.05, 0.4, 'highpass', 4000, 1);
        break;
      }
      case 'uiOpen': {
        const o = this.out(undefined, 0.3, 0.2);
        if (!o) return;
        this.noiseBurst(o, t, 0.25, 0.7, 'bandpass', 400, 1.2, 4000, 0.02);
        break;
      }
      case 'uiClose': {
        const o = this.out(undefined, 0.25, 0.2);
        if (!o) return;
        this.noiseBurst(o, t, 0.2, 0.6, 'bandpass', 3500, 1.2, 400, 0.02);
        break;
      }
      case 'uiError': {
        const o = this.out(undefined, 0.3, 0.1);
        if (!o) return;
        this.tone(o, 'square', 180, 150, t, 0.12, 0.4);
        this.tone(o, 'square', 150, 120, t + 0.12, 0.15, 0.4);
        break;
      }
      case 'purchase': {
        const o = this.out(undefined, 0.35, 0.3);
        if (!o) return;
        [1318, 1760, 2093].forEach((f, i) => this.tone(o, 'square', f, f, t + i * 0.06, 0.1, 0.25));
        this.noiseBurst(o, t, 0.15, 0.3, 'highpass', 7000, 1);
        break;
      }
      case 'horn': {
        const o = this.out(undefined, 0.5, 0.5);
        if (!o) return;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 2200;
        f.connect(o);
        for (const fr of [349 * p, 440 * p]) {
          const osc = ctx.createOscillator();
          osc.type = 'square';
          osc.frequency.value = fr;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.35, t + 0.02);
          g.gain.setValueAtTime(0.35, t + 0.42);
          g.gain.linearRampToValueAtTime(0.0001, t + 0.5);
          osc.connect(g);
          g.connect(f);
          osc.start(t);
          osc.stop(t + 0.55);
        }
        break;
      }
      case 'wallHit': {
        if (!this.gate(name, 0.12, 2, 0.3)) return;
        const o = this.out(undefined, 0.5 * (opts?.vol ?? 1), 0.3);
        if (!o) return;
        this.noiseBurst(o, t, 0.2, 1, 'lowpass', 900, 1, 200);
        this.tone(o, 'triangle', 330, 200, t, 0.15, 0.4);
        this.tone(o, 'triangle', 517, 410, t, 0.12, 0.3);
        break;
      }
      case 'ram': {
        if (!this.gate(name, 0.06, 4, 0.3)) return;
        const o = this.out(opts, 0.6, 0.3);
        if (!o) return;
        this.tone(o, 'sine', 120, 40, t, 0.2, 1.2);
        this.noiseBurst(o, t, 0.15, 0.9, 'lowpass', 2000, 1, 300);
        break;
      }
      case 'gate': {
        const o = this.out(opts, 0.6, 0.6);
        if (!o) return;
        this.noiseBurst(o, t, 0.9, 1, 'lowpass', 300, 1, 120, 0.05);
        for (let i = 0; i < 6; i++) this.tone(o, 'triangle', 700 + Math.random() * 500, 500, t + i * 0.09, 0.07, 0.2);
        break;
      }
      case 'portal': {
        const o = this.out(opts, 0.5, 0.7);
        if (!o) return;
        this.tone(o, 'sine', 200, 1200, t, 1, 0.4, 0.1);
        this.tone(o, 'triangle', 300, 1800, t + 0.1, 0.9, 0.2, 0.1);
        this.noiseBurst(o, t, 1.2, 0.3, 'bandpass', 500, 2, 5000, 0.2);
        break;
      }
      case 'arrow': {
        if (!this.gate(name, 0.05, 4, 0.2)) return;
        const o = this.out(opts, 0.25, 0.2);
        if (!o) return;
        this.noiseBurst(o, t, 0.18, 0.8, 'bandpass', 3000, 5, 1500);
        break;
      }
      case 'orb': {
        if (!this.gate(name, 0.05, 4, 0.3)) return;
        const o = this.out(opts, 0.25, 0.4);
        if (!o) return;
        this.tone(o, 'sine', 900 * p, 300 * p, t, 0.25, 0.6);
        this.tone(o, 'triangle', 450 * p, 200 * p, t, 0.2, 0.3);
        break;
      }
      case 'fireball': {
        if (!this.gate(name, 0.08, 3, 0.4)) return;
        const o = this.out(opts, 0.35, 0.4);
        if (!o) return;
        this.noiseBurst(o, t, 0.5, 1, 'lowpass', 700, 1, 2400, 0.05);
        break;
      }
      case 'swing': {
        if (!this.gate(name, 0.06, 4, 0.2)) return;
        const o = this.out(opts, 0.3, 0.2);
        if (!o) return;
        this.noiseBurst(o, t, 0.16, 0.8, 'bandpass', 800, 2, 2600, 0.03);
        break;
      }
      case 'slam': {
        const o = this.out(opts, 0.9, 0.6);
        if (!o) return;
        this.tone(o, 'sine', 70, 25, t, 0.8, 1.5);
        this.noiseBurst(o, t, 0.6, 1, 'lowpass', 600, 1, 80);
        break;
      }
      case 'spawn': {
        if (!this.gate(name, 0.08, 3, 0.8)) return;
        const o = this.out(opts, 0.25, 0.6);
        if (!o) return;
        this.noiseBurst(o, t, 0.6, 0.6, 'bandpass', 300, 3, 3000, 0.4);
        this.tone(o, 'sine', 120, 480, t, 0.6, 0.3, 0.3);
        break;
      }
      case 'chest': {
        const o = this.out(opts, 0.5, 0.5);
        if (!o) return;
        this.tone(o, 'sawtooth', 110, 70, t, 0.3, 0.2, 0.05);
        [784, 988, 1175, 1568].forEach((f, i) => this.tone(o, 'triangle', f, f, t + 0.2 + i * 0.06, 0.3, 0.3));
        break;
      }
      case 'chomp': {
        if (!this.gate(name, 0.1, 3, 0.3)) return;
        const o = this.out(opts, 0.55, 0.3);
        if (!o) return;
        this.noiseBurst(o, t, 0.08, 1, 'lowpass', 1600, 2);
        this.tone(o, 'square', 140, 60, t, 0.12, 0.6);
        break;
      }
      case 'keystone': {
        const o = this.out(undefined, 0.5, 0.9);
        if (!o) return;
        [293, 440, 587, 880, 1174].forEach((f, i) => this.tone(o, 'sine', f, f, t + i * 0.1, 1.4, 0.25, 0.08));
        break;
      }
      case 'reload': {
        const o = this.out(undefined, 0.22, 0.05);
        if (!o) return;
        this.noiseBurst(o, t, 0.03, 1, 'bandpass', 2500, 4);
        this.noiseBurst(o, t + 0.09, 0.04, 1, 'bandpass', 1800, 4);
        break;
      }
      case 'reloadDone': {
        const o = this.out(undefined, 0.22, 0.05);
        if (!o) return;
        this.noiseBurst(o, t, 0.04, 1, 'bandpass', 3200, 5);
        this.tone(o, 'square', 900, 900, t, 0.03, 0.2);
        break;
      }
      case 'empty': {
        if (!this.gate(name, 0.2, 1, 0.1)) return;
        const o = this.out(undefined, 0.2, 0);
        if (!o) return;
        this.noiseBurst(o, t, 0.02, 1, 'bandpass', 4000, 6);
        break;
      }
      case 'jump': {
        const o = this.out(undefined, 0.45, 0.3);
        if (!o) return;
        this.noiseBurst(o, t, 0.3, 1, 'highpass', 2500, 0.7, 6000);
        this.tone(o, 'sine', 90, 200, t, 0.2, 0.6);
        break;
      }
      case 'land': {
        if (!this.gate(name, 0.15, 1, 0.3)) return;
        const o = this.out(undefined, 0.5 * (opts?.vol ?? 1), 0.3);
        if (!o) return;
        this.tone(o, 'sine', 100, 40, t, 0.25, 1);
        this.noiseBurst(o, t, 0.12, 0.6, 'lowpass', 700, 1);
        break;
      }
      case 'boostStart': {
        const o = this.out(undefined, 0.5, 0.4);
        if (!o) return;
        this.noiseBurst(o, t, 0.6, 1, 'bandpass', 300, 1, 2500, 0.02);
        this.tone(o, 'sawtooth', 80, 160, t, 0.4, 0.25);
        break;
      }
      case 'driftBoost': {
        const o = this.out(undefined, 0.45 + p * 0.1, 0.3);
        if (!o) return;
        this.noiseBurst(o, t, 0.45, 1, 'bandpass', 500, 1, 3500, 0.01);
        [600, 900, 1200].slice(0, Math.max(1, Math.round(p))).forEach((f, i) => this.tone(o, 'square', f, f * 1.5, t + i * 0.04, 0.12, 0.18));
        break;
      }
      case 'driftTier': {
        const o = this.out(undefined, 0.2, 0.2);
        if (!o) return;
        this.tone(o, 'square', 800 * p, 1200 * p, t, 0.08, 0.3);
        break;
      }
      case 'gadget': {
        const o = this.out(undefined, 0.45, 0.5);
        if (!o) return;
        this.tone(o, 'square', 400, 800, t, 0.12, 0.25);
        this.noiseBurst(o, t, 0.3, 0.6, 'bandpass', 1500, 1, 500);
        break;
      }
      case 'shock': {
        const o = this.out(opts, 0.6, 0.6);
        if (!o) return;
        this.tone(o, 'sawtooth', 120, 2400, t, 0.3, 0.3);
        this.noiseBurst(o, t, 0.5, 0.9, 'highpass', 2000, 0.8, 600);
        this.tone(o, 'sine', 60, 30, t, 0.5, 1);
        break;
      }
      case 'mineBeep': {
        if (!this.gate(name, 0.1, 3, 0.1)) return;
        const o = this.out(opts, 0.15, 0);
        if (!o) return;
        this.tone(o, 'square', 1800, 1800, t, 0.04, 0.3);
        break;
      }
      case 'freeze': {
        if (!this.gate(name, 0.06, 3, 0.3)) return;
        const o = this.out(opts, 0.3, 0.4);
        if (!o) return;
        this.noiseBurst(o, t, 0.3, 1, 'highpass', 5000, 3, 9000);
        this.tone(o, 'sine', 2400, 3600, t, 0.2, 0.2);
        break;
      }
      case 'shatter': {
        if (!this.gate(name, 0.06, 3, 0.4)) return;
        const o = this.out(opts, 0.45, 0.4);
        if (!o) return;
        for (let i = 0; i < 6; i++) this.tone(o, 'sine', 2000 + Math.random() * 3000, 1800, t + i * 0.02, 0.2, 0.2);
        this.noiseBurst(o, t, 0.3, 0.8, 'highpass', 4000, 1);
        break;
      }
      case 'ignite': {
        if (!this.gate(name, 0.1, 3, 0.3)) return;
        const o = this.out(opts, 0.25, 0.2);
        if (!o) return;
        this.noiseBurst(o, t, 0.35, 1, 'bandpass', 500, 1, 1800, 0.03);
        break;
      }
      case 'secondWind': {
        const o = this.out(undefined, 0.6, 0.6);
        if (!o) return;
        [262, 330, 392, 523, 659, 784].forEach((f, i) => this.tone(o, 'sawtooth', f, f, t + i * 0.05, 0.6, 0.14));
        this.noiseBurst(o, t, 0.8, 0.5, 'bandpass', 400, 1, 5000, 0.05);
        break;
      }
      case 'downed': {
        const o = this.out(undefined, 0.6, 0.6);
        if (!o) return;
        this.tone(o, 'sawtooth', 400, 60, t, 1.2, 0.3);
        this.tone(o, 'sine', 200, 40, t, 1.2, 0.5);
        break;
      }
      case 'wrecked': {
        const o = this.out(undefined, 0.8, 0.8);
        if (!o) return;
        this.noiseBurst(o, t, 2, 1, 'lowpass', 2500, 0.6, 60);
        this.tone(o, 'sine', 70, 20, t, 1.8, 1.4);
        [392, 370, 349, 330].forEach((f, i) => this.tone(o, 'sawtooth', f, f * 0.97, t + 0.4 + i * 0.3, 0.35, 0.12));
        break;
      }
      case 'victory': {
        const o = this.out(undefined, 0.6, 0.6);
        if (!o) return;
        [[523, 0], [659, 0.15], [784, 0.3], [1046, 0.45], [784, 0.7], [1046, 0.85]].forEach(([f, d]) => {
          this.tone(o, 'square', f, f, t + d, 0.3, 0.2);
          this.tone(o, 'sawtooth', f / 2, f / 2, t + d, 0.3, 0.1);
        });
        break;
      }
      case 'bossDie': {
        const o = this.out(undefined, 1, 0.9);
        if (!o) return;
        this.noiseBurst(o, t, 3, 1, 'lowpass', 1800, 0.6, 50, 0.01);
        this.tone(o, 'sine', 60, 18, t, 3, 1.5);
        break;
      }
      case 'telegraph': {
        if (!this.gate(name, 0.12, 3, 0.3)) return;
        const o = this.out(opts, 0.25, 0.3);
        if (!o) return;
        this.tone(o, 'square', 880, 880, t, 0.06, 0.25);
        this.tone(o, 'square', 660, 660, t + 0.08, 0.06, 0.25);
        break;
      }
      case 'laserZap': {
        if (!this.gate(name, 0.05, 4, 0.2)) return;
        const o = this.out(opts, 0.25, 0.3);
        if (!o) return;
        this.tone(o, 'sawtooth', 1800 * p, 400 * p, t, 0.15, 0.3);
        break;
      }
      default:
        break;
    }
  }

  // ------------------------------------------------------------------ loops

  private makeLoop(name: LoopName): LoopVoice | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.sfxBus);
    const params: Record<string, AudioParam> = {};
    const nodes: AudioNode[] = [];
    const noiseLoop = () => {
      const s = ctx.createBufferSource();
      s.buffer = this.noise;
      s.loop = true;
      s.start();
      nodes.push(s);
      return s;
    };
    switch (name) {
      case 'engine': {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 600;
        lp.Q.value = 3;
        const o1 = ctx.createOscillator();
        o1.type = 'sawtooth';
        const o2 = ctx.createOscillator();
        o2.type = 'square';
        const o3 = ctx.createOscillator();
        o3.type = 'sine';
        const g1 = ctx.createGain(), g2 = ctx.createGain(), g3 = ctx.createGain();
        g1.gain.value = 0.35;
        g2.gain.value = 0.18;
        g3.gain.value = 0.6;
        o1.connect(g1).connect(lp);
        o2.connect(g2).connect(lp);
        o3.connect(g3).connect(gain);
        // chug: amplitude modulation for a muscle-car burble
        const am = ctx.createGain();
        am.gain.value = 0.75;
        const lfo = ctx.createOscillator();
        lfo.type = 'triangle';
        const lg = ctx.createGain();
        lg.gain.value = 0.25;
        lfo.connect(lg).connect(am.gain);
        lp.connect(am).connect(gain);
        const n = noiseLoop();
        const nf = ctx.createBiquadFilter();
        nf.type = 'lowpass';
        nf.frequency.value = 200;
        const ng = ctx.createGain();
        ng.gain.value = 0.25;
        n.connect(nf).connect(ng).connect(gain);
        [o1, o2, o3, lfo].forEach((o) => o.start());
        nodes.push(o1, o2, o3, lfo);
        params.f1 = o1.frequency;
        params.f2 = o2.frequency;
        params.f3 = o3.frequency;
        params.lfo = lfo.frequency;
        params.cut = lp.frequency;
        break;
      }
      case 'drift': {
        const n = noiseLoop();
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1300;
        bp.Q.value = 8;
        const bp2 = ctx.createBiquadFilter();
        bp2.type = 'bandpass';
        bp2.frequency.value = 2100;
        bp2.Q.value = 10;
        const g2 = ctx.createGain();
        g2.gain.value = 0.6;
        n.connect(bp).connect(gain);
        n.connect(bp2).connect(g2).connect(gain);
        params.f = bp.frequency;
        break;
      }
      case 'laser': {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = 220;
        const o2 = ctx.createOscillator();
        o2.type = 'sine';
        o2.frequency.value = 880;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 9;
        const lg = ctx.createGain();
        lg.gain.value = 30;
        lfo.connect(lg).connect(o2.frequency);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1800;
        const og = ctx.createGain();
        og.gain.value = 0.3;
        o.connect(og).connect(lp).connect(gain);
        o2.connect(gain);
        [o, o2, lfo].forEach((x) => x.start());
        nodes.push(o, o2, lfo);
        params.f = o2.frequency;
        break;
      }
      case 'flamer': {
        const n = noiseLoop();
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 900;
        const n2 = noiseLoop();
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 3000;
        bp.Q.value = 2;
        const cg = ctx.createGain();
        cg.gain.value = 0.25;
        n.connect(lp).connect(gain);
        n2.connect(bp).connect(cg).connect(gain);
        break;
      }
      case 'boost': {
        const n = noiseLoop();
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 700;
        bp.Q.value = 0.8;
        n.connect(bp).connect(gain);
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = 55;
        const og = ctx.createGain();
        og.gain.value = 0.2;
        o.connect(og).connect(gain);
        o.start();
        nodes.push(o);
        break;
      }
      case 'minigun': {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = 60;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 500;
        o.connect(lp).connect(gain);
        o.start();
        nodes.push(o);
        params.f = o.frequency;
        break;
      }
      case 'charge': {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = 200;
        const o2 = ctx.createOscillator();
        o2.type = 'square';
        o2.frequency.value = 400;
        const g2 = ctx.createGain();
        g2.gain.value = 0.15;
        o.connect(gain);
        o2.connect(g2).connect(gain);
        o.start();
        o2.start();
        nodes.push(o, o2);
        params.f = o.frequency;
        params.f2 = o2.frequency;
        break;
      }
      case 'lava': {
        const n = noiseLoop();
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 180;
        n.connect(lp).connect(gain);
        break;
      }
    }
    const v: LoopVoice = { gain, nodes, params, target: 0 };
    this.loops.set(name, v);
    return v;
  }

  /** Set loop volume (0 = silent) and optional parameters. */
  loop(name: LoopName, vol: number, set?: Record<string, number>) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    let v = this.loops.get(name);
    if (!v) {
      if (vol <= 0.001) return;
      v = this.makeLoop(name) ?? undefined;
      if (!v) return;
    }
    const t = this.ctx.currentTime;
    if (Math.abs(v.target - vol) > 0.005) {
      v.gain.gain.setTargetAtTime(vol, t, 0.04);
      v.target = vol;
    }
    if (set) {
      for (const k in set) {
        const prm = v.params[k];
        if (prm) prm.setTargetAtTime(set[k], t, 0.03);
      }
    }
  }

  stopAllLoops() {
    for (const [, v] of this.loops) {
      if (this.ctx) v.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
      v.target = 0;
    }
  }
}

export const audio = new AudioEngine();
