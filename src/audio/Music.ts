import type { AudioEngine } from './Audio';

export type MusicMode = 'none' | 'menu' | 'explore' | 'combat' | 'boss' | 'shop';

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface ModeDef {
  bpm: number;
  prog: number[]; // chord roots relative to D, one per bar
  minor: boolean[];
}

const MODES: Record<Exclude<MusicMode, 'none'>, ModeDef> = {
  menu: { bpm: 84, prog: [0, 3, -4, -5], minor: [true, false, false, false] },
  explore: { bpm: 104, prog: [0, -4, -2, -5, 0, -4, 3, -2], minor: [true, false, false, true, true, false, false, false] },
  combat: { bpm: 144, prog: [0, 0, -4, -2, 0, 0, 3, -2], minor: [true, true, false, false, true, true, false, false] },
  boss: { bpm: 156, prog: [0, 1, 0, -2, 0, 1, 3, 1], minor: [true, false, true, false, true, false, false, false] },
  shop: { bpm: 96, prog: [0, 5, -2, 3], minor: [true, false, false, false] },
};

function makeDistortion(ctx: AudioContext, amount: number) {
  const ws = ctx.createWaveShaper();
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x));
  }
  ws.curve = curve;
  ws.oversample = '2x';
  return ws;
}

/**
 * A small adaptive music sequencer: drums, distorted bass, power-chord "guitar",
 * arps, pads and a lead line, all synthesized. Switches intensity at bar lines.
 */
export class Music {
  mode: MusicMode = 'none';
  private pending: MusicMode | null = null;
  private step = 0;
  private bar = 0;
  private nextTime = 0;
  private timer: number | null = null;
  private drums: GainNode;
  private bass: GainNode;
  private guitar: GainNode;
  private lead: GainNode;
  private pad: GainNode;
  private arp: GainNode;
  private out: GainNode;
  private melodies: Record<string, number[]> = {};
  intensity = 1;

  constructor(private engine: AudioEngine) {
    const ctx = engine.ctx!;
    this.out = ctx.createGain();
    this.out.gain.value = 1;
    this.out.connect(engine.musicBus);
    const rev = ctx.createGain();
    rev.gain.value = 0.35;
    rev.connect(engine.reverbSend);

    this.drums = ctx.createGain();
    this.drums.gain.value = 0.9;
    this.drums.connect(this.out);

    this.bass = ctx.createGain();
    const bd = makeDistortion(ctx, 6);
    const blp = ctx.createBiquadFilter();
    blp.type = 'lowpass';
    blp.frequency.value = 900;
    this.bass.connect(bd).connect(blp).connect(this.out);
    this.bass.gain.value = 0.5;

    this.guitar = ctx.createGain();
    const gd = makeDistortion(ctx, 40);
    const glp = ctx.createBiquadFilter();
    glp.type = 'lowpass';
    glp.frequency.value = 3200;
    const ghp = ctx.createBiquadFilter();
    ghp.type = 'highpass';
    ghp.frequency.value = 90;
    const gpk = ctx.createBiquadFilter();
    gpk.type = 'peaking';
    gpk.frequency.value = 800;
    gpk.gain.value = -6;
    const gOut = ctx.createGain();
    gOut.gain.value = 0.12;
    this.guitar.connect(gd).connect(ghp).connect(gpk).connect(glp).connect(gOut).connect(this.out);
    gOut.connect(rev);

    this.lead = ctx.createGain();
    this.lead.gain.value = 0.16;
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.28;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const dl = ctx.createBiquadFilter();
    dl.type = 'lowpass';
    dl.frequency.value = 2400;
    this.lead.connect(this.out);
    this.lead.connect(delay);
    delay.connect(dl).connect(fb).connect(delay);
    dl.connect(this.out);
    this.lead.connect(rev);

    this.pad = ctx.createGain();
    this.pad.gain.value = 0.09;
    const plp = ctx.createBiquadFilter();
    plp.type = 'lowpass';
    plp.frequency.value = 1400;
    this.pad.connect(plp).connect(this.out);
    plp.connect(rev);

    this.arp = ctx.createGain();
    this.arp.gain.value = 0.1;
    this.arp.connect(this.out);
    this.arp.connect(rev);

    this.buildMelodies();
  }

  private buildMelodies() {
    // Hand-tuned phrygian/minor motifs (scale degrees in semitones relative to D5); -99 = rest
    this.melodies.combat = [
      0, -99, 3, 5, 7, -99, 5, 3, 1, -99, 0, -99, -2, 0, -99, -99,
      0, -99, 3, 5, 8, 7, 5, 3, 5, -99, 7, -99, 10, -99, 7, -99,
      12, -99, 10, 8, 7, -99, 5, 3, 5, -99, 3, 1, 0, -99, -99, -99,
      -2, 0, 3, -99, 5, 3, 0, -99, 1, -99, 0, -99, -2, -99, 0, -99,
    ];
    this.melodies.boss = [
      0, 1, 0, -99, 7, -99, 6, -99, 5, 3, 1, -99, 0, -99, -99, -99,
      12, 13, 12, -99, 10, -99, 8, 7, 8, -99, 7, 5, 7, -99, -99, -99,
      0, 1, 3, 5, 7, 8, 10, 12, 13, -99, 12, -99, 10, -99, 7, -99,
      8, -99, 7, -99, 5, -99, 3, -99, 1, -99, 0, -99, 1, 0, -99, -99,
    ];
  }

  setMode(m: MusicMode) {
    if (m === this.mode && !this.pending) return;
    if (m === this.pending) return;
    const ctx = this.engine.ctx;
    if (!ctx) return;
    if (this.mode === 'none' || m === 'none') {
      this.mode = m;
      this.pending = null;
      this.step = 0;
      this.bar = 0;
      this.nextTime = ctx.currentTime + 0.1;
      if (m !== 'none') this.start();
      else this.stop();
      return;
    }
    this.pending = m;
  }

  private start() {
    if (this.timer !== null) return;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }
  private stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  private schedule() {
    const ctx = this.engine.ctx;
    if (!ctx || this.mode === 'none') return;
    if (ctx.state !== 'running') return;
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.12) {
      if (this.step === 0 && this.pending) {
        this.mode = this.pending;
        this.pending = null;
        this.bar = 0;
      }
      if (this.mode === 'none') return;
      const def = MODES[this.mode];
      const stepDur = 60 / def.bpm / 4;
      this.playStep(this.mode, def, this.step, this.bar, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step++;
      if (this.step >= 16) {
        this.step = 0;
        this.bar++;
      }
    }
  }

  private playStep(mode: MusicMode, def: ModeDef, s: number, bar: number, t: number, sd: number) {
    const pi = bar % def.prog.length;
    const root = def.prog[pi];
    const minor = def.minor[pi];
    const third = minor ? 3 : 4;
    const D2 = 38;
    switch (mode) {
      case 'menu': {
        if (s === 0 || s === 10) this.kick(t, 0.5);
        if (s === 8) this.snare(t, 0.25, true);
        if (s % 4 === 2) this.hat(t, 0.08);
        if (s === 0) this.padChord(t, [D2 + 24 + root, D2 + 24 + root + third, D2 + 24 + root + 7, D2 + 36 + root], sd * 16);
        if (s === 0 || s === 8) this.bassNote(t, D2 + root, sd * 7, 0.6, 400);
        const arpSeq = [0, 7, 12, third + 12, 7, 12, 19, 12];
        if (s % 2 === 0) this.arpNote(t, D2 + 36 + root + arpSeq[(s / 2) % 8], sd * 1.5, 0.5);
        break;
      }
      case 'shop': {
        if (s === 0 || s === 7 || s === 10) this.kick(t, 0.35);
        if (s === 4 || s === 12) this.snare(t, 0.15, true);
        if (s % 2 === 1) this.hat(t, 0.06);
        if (s === 0) this.padChord(t, [D2 + 24 + root, D2 + 24 + root + third, D2 + 24 + root + 7, D2 + 24 + root + 10], sd * 16);
        if (s === 0 || s === 6 || s === 10) this.bassNote(t, D2 + root + (s === 6 ? 7 : 0), sd * 3, 0.5, 500);
        const arpSeq = [0, third, 7, 10, 12, 10, 7, third];
        if (s % 2 === 0) this.arpNote(t, D2 + 36 + root + arpSeq[(s / 2) % 8], sd * 1.2, 0.45);
        break;
      }
      case 'explore': {
        const k = [0, 10];
        if (k.includes(s)) this.kick(t, 0.65);
        if (s === 8) this.snare(t, 0.45, false);
        if (s % 2 === 0) this.hat(t, s % 4 === 2 ? 0.1 : 0.05);
        if (s === 0) this.padChord(t, [D2 + 24 + root, D2 + 24 + root + third, D2 + 24 + root + 7], sd * 16);
        if (s === 0 || s === 3 || s === 8 || s === 11 || s === 14) this.bassNote(t, D2 + root + (s === 14 ? 12 : 0), sd * 2, 0.75, 600);
        const arpSeq = [0, 7, 12, 7, third + 12, 7, 12, 7, 0, 7, 12, 7, third + 12, 7, 15, 12];
        if (bar % 8 >= 2) this.arpNote(t, D2 + 36 + root + arpSeq[s], sd * 0.9, s % 4 === 0 ? 0.55 : 0.32);
        if (bar % 8 >= 4 && (s === 4 || s === 12)) this.guitarChord(t, D2 + 12 + root, sd * 3, 0.35, false);
        break;
      }
      case 'combat': {
        const kicks = [0, 3, 6, 8, 11, 14];
        if (kicks.includes(s)) this.kick(t, 0.9);
        if (s === 4 || s === 12) this.snare(t, 0.8, false);
        if (bar % 4 === 3 && s >= 12) this.snare(t, 0.4 + (s - 12) * 0.1, false);
        if (s % 2 === 0) this.hat(t, s % 4 === 0 ? 0.14 : 0.08);
        if (s % 8 === 0 && bar % 2 === 0) this.crash(t, s === 0 && bar % 4 === 0 ? 0.25 : 0);
        // chugging palm-muted power chords with accents
        const accents = [0, 3, 6, 10, 14];
        const muted = !accents.includes(s);
        if (s % 1 === 0 && !(s === 7 || s === 15)) this.guitarChord(t, D2 + 12 + root, muted ? sd * 0.8 : sd * 2.5, muted ? 0.5 : 0.95, muted);
        if (s % 2 === 0) this.bassNote(t, D2 + root, sd * 1.6, 0.9, 900);
        const mel = this.melodies.combat;
        if (bar % 8 >= 4) {
          const n = mel[((bar % 4) * 16 + s) % mel.length];
          if (n > -99) this.leadNote(t, 74 + n + (root === 3 ? 0 : 0), sd * 1.8, 0.8);
        }
        break;
      }
      case 'boss': {
        // double-kick gallop
        const gal = s % 4 !== 1;
        if (bar % 4 >= 2 ? true : gal) this.kick(t, s % 4 === 0 ? 1 : 0.6);
        if (s === 4 || s === 12) this.snare(t, 0.95, false);
        if (s % 2 === 0) this.hat(t, 0.12);
        if (s === 0) this.crash(t, 0.28);
        if (s === 0) this.padChord(t, [D2 + 24 + root, D2 + 24 + root + 3, D2 + 24 + root + 7, D2 + 36 + root], sd * 16, 0.6);
        const gpat = [1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1];
        if (gpat[s]) this.guitarChord(t, D2 + 12 + root, sd * 0.9, s % 4 === 0 ? 1 : 0.6, s % 4 !== 0);
        if (s % 2 === 0) this.bassNote(t, D2 + root, sd * 1.5, 1, 1100);
        const mel = this.melodies.boss;
        if (bar % 8 >= 2) {
          const n = mel[((bar % 4) * 16 + s) % mel.length];
          if (n > -99) this.leadNote(t, 74 + n, sd * 1.8, 0.9);
        }
        break;
      }
    }
  }

  // ------------------------------------------------------------ instruments
  private kick(t: number, v: number) {
    const ctx = this.engine.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g).connect(this.drums);
    o.start(t);
    o.stop(t + 0.4);
    // click
    const c = ctx.createOscillator();
    c.type = 'square';
    c.frequency.value = 1200;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(v * 0.08, t);
    cg.gain.exponentialRampToValueAtTime(0.001, t + 0.012);
    c.connect(cg).connect(this.drums);
    c.start(t);
    c.stop(t + 0.02);
  }
  private snare(t: number, v: number, rim: boolean) {
    const ctx = this.engine.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.engine.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = rim ? 'bandpass' : 'highpass';
    hp.frequency.value = rim ? 2500 : 1200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(v * 0.7, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (rim ? 0.06 : 0.2));
    src.connect(hp).connect(g).connect(this.drums);
    src.start(t, Math.random());
    src.stop(t + 0.25);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
    const og = ctx.createGain();
    og.gain.setValueAtTime(v * 0.5, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(og).connect(this.drums);
    o.start(t);
    o.stop(t + 0.12);
  }
  private hat(t: number, v: number) {
    const ctx = this.engine.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.engine.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    src.connect(hp).connect(g).connect(this.drums);
    src.start(t, Math.random());
    src.stop(t + 0.06);
  }
  private crash(t: number, v: number) {
    if (v <= 0) return;
    const ctx = this.engine.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.engine.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 5000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    src.connect(hp).connect(g).connect(this.drums);
    src.start(t, Math.random());
    src.stop(t + 1.3);
  }
  private bassNote(t: number, midi: number, dur: number, v: number, cutoff: number) {
    const ctx = this.engine.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = mtof(midi);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(cutoff * 1.8, t);
    lp.frequency.exponentialRampToValueAtTime(cutoff * 0.5, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v * 0.5, t + 0.005);
    g.gain.setValueAtTime(v * 0.45, t + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = mtof(midi);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(v * 0.4, t);
    sg.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(lp).connect(g).connect(this.bass);
    sub.connect(sg).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.02);
    sub.start(t);
    sub.stop(t + dur + 0.02);
  }
  private guitarChord(t: number, midi: number, dur: number, v: number, muted: boolean) {
    const ctx = this.engine.ctx!;
    const notes = [midi, midi + 7, midi + 12];
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(muted ? 0.02 : 0.2, t + (muted ? dur : dur * 0.7));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.03);
    let lp: BiquadFilterNode | null = null;
    if (muted) {
      lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      g.connect(lp).connect(this.guitar);
    } else g.connect(this.guitar);
    for (const n of notes) {
      for (const det of [-6, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(n);
        o.detune.value = det;
        o.connect(g);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    }
  }
  private leadNote(t: number, midi: number, dur: number, v: number) {
    const ctx = this.engine.ctx!;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = mtof(midi);
    const o2 = ctx.createOscillator();
    o2.type = 'sawtooth';
    o2.frequency.value = mtof(midi);
    o2.detune.value = 8;
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.5;
    const vg = ctx.createGain();
    vg.gain.setValueAtTime(0, t);
    vg.gain.linearRampToValueAtTime(8, t + dur);
    vib.connect(vg);
    vg.connect(o.frequency);
    vg.connect(o2.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v * 0.5, t + 0.01);
    g.gain.setValueAtTime(v * 0.4, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(lp);
    o2.connect(lp);
    lp.connect(g).connect(this.lead);
    [o, o2, vib].forEach((x) => {
      x.start(t);
      x.stop(t + dur + 0.02);
    });
  }
  private arpNote(t: number, midi: number, dur: number, v: number) {
    const ctx = this.engine.ctx!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = mtof(midi);
    const g = ctx.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.arp);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  private padChord(t: number, midis: number[], dur: number, v = 1) {
    const ctx = this.engine.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v * 0.5, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(v * 0.4, t + dur * 0.8);
    g.gain.linearRampToValueAtTime(0.0001, t + dur * 1.05);
    g.connect(this.pad);
    for (const m of midis) {
      for (const det of [-10, 10]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(m);
        o.detune.value = det;
        o.connect(g);
        o.start(t);
        o.stop(t + dur * 1.1);
      }
    }
  }
}
