// Sound, all synthesised: wind that rises with speed, the hiss and crunch of the skis (carve,
// skid, powder), landings, and a slow generative ambient score with a long reverb.
export class Audio {
  constructor() {
    this.ctx = null;
    this.musicOn = true;
    this.sfxOn = true;
  }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.mus = ctx.createGain(); this.mus.gain.value = 0; this.mus.connect(this.master);
    this.mus.gain.setTargetAtTime(this.musicOn ? 0.5 : 0, ctx.currentTime, 3);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(6.5, 2.6);
    const rvGain = ctx.createGain(); rvGain.gain.value = 0.85;
    this.reverb.connect(rvGain).connect(this.mus);
    this.dry = ctx.createGain(); this.dry.gain.value = 0.35; this.dry.connect(this.mus);
    // delay for the bells
    this.delay = ctx.createDelay(2); this.delay.delayTime.value = 0.62;
    const fb = ctx.createGain(); fb.gain.value = 0.42;
    const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 2400;
    this.delay.connect(dl).connect(fb).connect(this.delay);
    dl.connect(this.reverb);

    const noise = this.noiseBuffer(4);
    const loop = (filterType, f, q) => {
      const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
      src.playbackRate.value = 0.8 + Math.random() * 0.4;
      const bq = ctx.createBiquadFilter(); bq.type = filterType; bq.frequency.value = f; bq.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      src.connect(bq).connect(g).connect(this.sfx);
      src.start();
      return { bq, g };
    };
    this.wind = loop('lowpass', 500, 0.7);
    this.windHi = loop('bandpass', 1800, 0.6);
    this.carve = loop('bandpass', 2600, 1.2);
    this.skid = loop('bandpass', 900, 0.8);
    this.powder = loop('lowpass', 700, 0.5);
    this.ambient = loop('lowpass', 300, 0.5);
    this.ambient.g.gain.value = 0.05;
    this.music();
  }

  noiseBuffer(sec) {
    const ctx = this.ctx;
    const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate);
    const d = b.getChannelData(0);
    // pinkish
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18;
    }
    return b;
  }

  impulse(sec, decay) {
    const ctx = this.ctx;
    const len = ctx.sampleRate * sec;
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  // per frame: s = { speed, carve, skid, powder, air, wipe }
  update(s) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const on = this.sfxOn ? 1 : 0;
    const sp = Math.min(1, s.speed / 28);
    const set = (node, v, k = 0.08) => node.setTargetAtTime(v * on, t, k);
    set(this.wind.g.gain, 0.04 + sp * sp * 0.55);
    this.wind.bq.frequency.setTargetAtTime(300 + sp * 900, t, 0.2);
    set(this.windHi.g.gain, sp * sp * sp * 0.12);
    const ground = s.air || s.wipe ? 0 : 1;
    set(this.carve.g.gain, ground * Math.min(1, s.carve * 1.4) * (0.08 + sp * 0.35) * (1 - s.powder * 0.6), 0.05);
    this.carve.bq.frequency.setTargetAtTime(1800 + sp * 2200, t, 0.1);
    set(this.skid.g.gain, ground * Math.min(1, s.skid / 6) * 0.5, 0.04);
    set(this.powder.g.gain, ground * s.powder * (0.05 + sp * 0.45), 0.08);
    this.powder.bq.frequency.setTargetAtTime(400 + sp * 700, t, 0.2);
    // a base hiss of skis on snow
    set(this.ambient.g.gain, 0.03 + ground * sp * 0.1, 0.2);
  }

  thump(k = 1) {
    if (!this.ctx || !this.sfxOn) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuffer(0.5);
    const bq = ctx.createBiquadFilter(); bq.type = 'lowpass'; bq.frequency.value = 300 + 500 * k;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4 * Math.min(1.5, k), t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    src.connect(bq).connect(g).connect(this.sfx);
    src.start(t); src.stop(t + 0.5);
  }

  setMusic(on) {
    this.musicOn = on;
    if (this.ctx) this.mus.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 1.5);
  }

  // slow chords on soft pads, and every so often a bell from the scale
  music() {
    const ctx = this.ctx;
    const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
    // D major-ish, gentle: Dmaj9, Bm9, Gmaj7#11, Aadd9 / Em9
    const CHORDS = [
      [50, 57, 62, 66, 69, 76], [47, 54, 61, 62, 66, 73], [43, 50, 57, 61, 66, 69], [45, 52, 59, 64, 66, 71],
      [50, 57, 64, 66, 69, 73], [40, 47, 55, 62, 66, 71], [43, 55, 59, 62, 66, 74], [45, 57, 61, 64, 69, 71],
    ];
    const SCALE = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83];
    let ci = 0;
    const BAR = 9.5;
    let next = ctx.currentTime + 1.0;
    const pad = (m, t0, dur, vel) => {
      const f = mtof(m);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(vel, t0 + dur * 0.35);
      g.gain.linearRampToValueAtTime(vel * 0.8, t0 + dur * 0.75);
      g.gain.linearRampToValueAtTime(0.0001, t0 + dur + 2.5);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900 + Math.random() * 500; lp.Q.value = 0.3;
      g.connect(lp); lp.connect(this.reverb); lp.connect(this.dry);
      for (const det of [-6, 0, 7]) {
        const o = ctx.createOscillator();
        o.type = det === 0 ? 'triangle' : 'sawtooth';
        o.frequency.value = f; o.detune.value = det;
        const og = ctx.createGain(); og.gain.value = det === 0 ? 0.6 : 0.12;
        o.connect(og).connect(g);
        o.start(t0); o.stop(t0 + dur + 3);
      }
    };
    const bell = (m, t0, vel) => {
      const f = mtof(m);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vel, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.2);
      const car = ctx.createOscillator(); car.frequency.value = f;
      const mod = ctx.createOscillator(); mod.frequency.value = f * 3.5;
      const mg = ctx.createGain(); mg.gain.setValueAtTime(f * 1.2, t0); mg.gain.exponentialRampToValueAtTime(f * 0.05, t0 + 1.5);
      mod.connect(mg).connect(car.frequency);
      car.connect(g);
      g.connect(this.reverb); g.connect(this.delay); g.connect(this.dry);
      car.start(t0); mod.start(t0); car.stop(t0 + 3.5); mod.stop(t0 + 3.5);
    };
    const sub = (m, t0, dur) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = mtof(m - 12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.13, t0 + 2.5); g.gain.linearRampToValueAtTime(0.0001, t0 + dur + 1.5);
      o.connect(g); g.connect(this.dry);
      o.start(t0); o.stop(t0 + dur + 2);
    };
    const schedule = () => {
      const now = ctx.currentTime;
      while (next < now + 4) {
        const ch = CHORDS[ci % CHORDS.length];
        sub(ch[0], next, BAR);
        ch.slice(1).forEach((m, i) => pad(m, next + i * 0.06, BAR, 0.035 - i * 0.003));
        // a few bells, sparse, never on the beat exactly
        const nb = Math.random() < 0.25 ? 0 : 1 + Math.floor(Math.random() * 3);
        for (let b = 0; b < nb; b++) {
          const m = SCALE[Math.floor(Math.random() * SCALE.length)];
          bell(m, next + 1.2 + Math.random() * (BAR - 2), 0.05 + Math.random() * 0.04);
        }
        next += BAR;
        ci++;
      }
    };
    schedule();
    this.musicTimer = setInterval(schedule, 1000);
  }
}
