/**
 * Paisagem sonora procedural (Web Audio, sem ficheiros): trânsito, vento, chuva,
 * pássaros de dia, grilos à noite, murmúrio de pessoas, motor do veículo e buzina.
 * Os níveis dependem da hora de Luanda, do clima e do que está perto do jogador.
 */
export class Soundscape {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
  }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } // ruído castanho
    const whiteBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const wd = whiteBuf.getChannelData(0);
    for (let i = 0; i < wd.length; i++) wd[i] = Math.random() * 2 - 1;
    const loop = (buf, filterType, freq, q = 0.7) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = filterType;
      f.frequency.value = freq;
      f.Q.value = q;
      const gnode = ctx.createGain();
      gnode.gain.value = 0;
      src.connect(f).connect(gnode).connect(this.master);
      src.start();
      return { gain: gnode, filter: f };
    };
    this.noiseBuf = noiseBuf;
    this.traffic = loop(noiseBuf, 'lowpass', 380);
    this.wind = loop(whiteBuf, 'bandpass', 500, 0.4);
    this.rain = loop(whiteBuf, 'highpass', 1400);
    this.crowd = loop(noiseBuf, 'bandpass', 900, 1.2);
    // motor
    this.engine = ctx.createOscillator();
    this.engine.type = 'sawtooth';
    this.engineF = ctx.createBiquadFilter();
    this.engineF.type = 'lowpass';
    this.engineF.frequency.value = 600;
    this.engineG = ctx.createGain();
    this.engineG.gain.value = 0;
    this.engine.connect(this.engineF).connect(this.engineG).connect(this.master);
    this.engine.start();
    this.nextBird = 0;
    this.nextCricket = 0;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  chirp(base, dur, gain) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const gnode = ctx.createGain();
    o.type = 'sine';
    const t = ctx.currentTime;
    o.frequency.setValueAtTime(base, t);
    o.frequency.exponentialRampToValueAtTime(base * 1.6, t + dur * 0.5);
    o.frequency.exponentialRampToValueAtTime(base * 0.9, t + dur);
    gnode.gain.setValueAtTime(0, t);
    gnode.gain.linearRampToValueAtTime(gain, t + 0.02);
    gnode.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gnode).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  horn() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    for (const f of [392, 494]) {
      const o = ctx.createOscillator();
      const gnode = ctx.createGain();
      o.type = 'square';
      o.frequency.value = f;
      gnode.gain.setValueAtTime(0.06, t);
      gnode.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      o.connect(gnode).connect(this.master);
      o.start(t);
      o.stop(t + 0.5);
    }
  }

  /** Passo (pé a bater no chão): rajada curta de ruído filtrado, sem ficheiro. */
  footstep(kind = 'walk', surface = 'rua') {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = (surface === 'relva' ? 320 : 170) + Math.random() * 90;
    const g = ctx.createGain();
    const peak = (kind === 'run' ? 0.17 : 0.09) * (0.85 + Math.random() * 0.3);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'run' ? 0.1 : 0.13));
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + 0.2);
  }

  /**
   * @param {{day:number, night:number}} light
   * @param {{rain:number, wind:number}} weather
   * @param {{carsNear:number, npcsNear:number, inPark:boolean, vehicleSpeed:number|null, maxSpeed:number}} ctx
   */
  update(dt, light, weather, c) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const k = Math.min(1, dt * 3);
    const set = (node, v) => { node.gain.gain.value += (v - node.gain.gain.value) * k; };
    set(this.traffic, Math.min(0.5, 0.05 + c.carsNear * 0.05) * (0.6 + 0.4 * light.day));
    set(this.wind, 0.03 + weather.wind * 0.12);
    set(this.rain, weather.rain * 0.35);
    set(this.crowd, Math.min(0.12, c.npcsNear * 0.012));
    if (c.vehicleSpeed !== null) {
      const r = Math.abs(c.vehicleSpeed) / Math.max(1, c.maxSpeed);
      this.engine.frequency.value = 45 + r * 140;
      this.engineF.frequency.value = 400 + r * 1600;
      this.engineG.gain.value += (0.08 + r * 0.06 - this.engineG.gain.value) * k;
    } else {
      this.engineG.gain.value += (0 - this.engineG.gain.value) * k;
    }
    const now = this.ctx.currentTime;
    if (light.day > 0.5 && weather.rain < 0.2 && now > this.nextBird) {
      this.nextBird = now + (c.inPark ? 0.8 : 3) + Math.random() * 4;
      const base = 2200 + Math.random() * 1800;
      for (let i = 0; i < 1 + Math.floor(Math.random() * 3); i++) setTimeout(() => this.ctx && this.chirp(base, 0.12, c.inPark ? 0.05 : 0.025), i * 140);
    }
    if (light.night > 0.6 && weather.rain < 0.2 && now > this.nextCricket) {
      this.nextCricket = now + 0.35 + Math.random() * 0.6;
      this.chirp(4300 + Math.random() * 300, 0.05, 0.012);
    }
  }
}
