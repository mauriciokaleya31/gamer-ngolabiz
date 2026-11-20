/**
 * Paisagem sonora procedural (Web Audio, sem ficheiros): trânsito, vento, chuva,
 * pássaros de dia, grilos à noite, murmúrio de pessoas, motor do veículo e buzina.
 * Os níveis dependem da hora de Luanda, do clima e do que está perto do jogador.
 */
function hashSpeaker(str = '') {
  let h = 2166136261 >>> 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export class Soundscape {
  constructor() {
    this.ctx = null;
    this.volume = 0.75;
    this.voiceEnabled = true;
    this.voices = [];
    this.lastSpokenAt = new Map();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const loadVoices = () => {
        try { this.voices = window.speechSynthesis.getVoices() || []; } catch { this.voices = []; }
      };
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    if (typeof window !== 'undefined') {
      const unlock = () => { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); };
      window.addEventListener('pointerdown', unlock, { passive: true });
      window.addEventListener('touchstart', unlock, { passive: true });
      window.addEventListener('keydown', unlock, { passive: true });
    }
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

  /** Passo nítido (impacto de calcanhar + sola no pavimento, relva ou interior). */
  footstep(kind = 'walk', surface = 'rua') {
    if (!this.ctx) this.start();
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = surface === 'relva' ? 'bandpass' : 'lowpass';
    f.frequency.value = (surface === 'relva' ? 460 : surface === 'interior' ? 780 : 540) + Math.random() * 140;
    f.Q.value = surface === 'relva' ? 1.1 : 0.9;
    const g = ctx.createGain();
    const peak = (kind === 'run' ? 0.34 : 0.22) * (0.88 + Math.random() * 0.24);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'run' ? 0.095 : 0.12));
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.4);
    src.stop(t + 0.16);

    // Toque grave do passo para dar corpo em colunas e telemóveis
    const thud = ctx.createOscillator();
    const tg = ctx.createGain();
    thud.type = 'triangle';
    thud.frequency.setValueAtTime(surface === 'relva' ? 95 : 135, t);
    thud.frequency.exponentialRampToValueAtTime(48, t + 0.07);
    tg.gain.setValueAtTime(peak * 0.55, t);
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.075);
    thud.connect(tg).connect(this.master);
    thud.start(t);
    thud.stop(t + 0.08);
  }

  /**
   * Síntese de voz única por personagem, bot ou jogador (TTS + cadência vocal Web Audio).
   * Cada ID tem timbre, altura (pitch) e velocidade (rate) próprios e determinísticos.
   */
  speak(speakerId, text, { gender = 'm', priority = false } = {}) {
    if (!this.voiceEnabled || !text) return;
    const clean = String(text).replace(/https?:\/\/\S+/g, '').replace(/[*_#`~<>]/g, '').trim();
    if (!clean) return;
    const now = performance.now();
    const prev = this.lastSpokenAt.get(speakerId) ?? 0;
    if (!priority && now - prev < 2200) return;
    this.lastSpokenAt.set(speakerId, now);

    const h = hashSpeaker(`${speakerId}:${gender}`);
    const isFemale = gender === 'f';
    const malePitches = [0.66, 0.72, 0.78, 0.84, 0.90, 0.96, 1.02, 1.08];
    const femalePitches = [1.14, 1.20, 1.26, 1.32, 1.38, 1.44, 1.50];
    const rates = [0.92, 0.97, 1.02, 1.07, 1.12, 1.16];
    const pitch = isFemale ? femalePitches[h % femalePitches.length] : malePitches[h % malePitches.length];
    const rate = rates[(h >>> 4) % rates.length];

    // Cadência vocal formante subtil (garante timbre audível e distinto em qualquer dispositivo)
    this.speakCadence(clean, isFemale ? 215 + (h % 55) : 110 + (h % 48), rate);

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        const synth = window.speechSynthesis;
        if (priority && synth.speaking) synth.cancel();
        else if (!priority && synth.speaking) return;
        const u = new SpeechSynthesisUtterance(clean.slice(0, 220));
        u.lang = 'pt-PT';
        u.pitch = pitch;
        u.rate = rate;
        u.volume = Math.min(1, Math.max(0.2, this.volume));
        const all = this.voices.length ? this.voices : (synth.getVoices?.() || []);
        const ptVoices = all.filter((v) => /^pt/i.test(v.lang));
        const pool = ptVoices.length ? ptVoices : all;
        if (pool.length) {
          const femRe = /maria|joana|fernanda|luciana|francisca|heloisa|ines|raquel|female|femin/i;
          const maleRe = /cristiano|daniel|ricardo|antonio|jorge|male|mascul/i;
          const gendered = pool.filter((v) => (isFemale ? femRe.test(v.name) : maleRe.test(v.name)));
          const chosenPool = gendered.length ? gendered : pool;
          u.voice = chosenPool[(h >>> 8) % chosenPool.length];
          if (u.voice?.lang) u.lang = u.voice.lang;
        }
        synth.speak(u);
      } catch { /* fallback já assegurado por speakCadence */ }
    }
  }

  speakCadence(text, baseFreq = 140, rate = 1.0) {
    if (!this.ctx) this.start();
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const words = text.split(/\s+/).slice(0, 7);
    let offset = 0;
    words.forEach((w, idx) => {
      const dur = Math.min(0.11, Math.max(0.05, w.length * 0.014)) / rate;
      const t = ctx.currentTime + offset;
      const o = ctx.createOscillator();
      const f = ctx.createBiquadFilter();
      const g = ctx.createGain();
      o.type = 'sawtooth';
      const infl = ((w.charCodeAt(0) || 65) % 7 - 3) * 6;
      o.frequency.setValueAtTime(baseFreq + infl, t);
      o.frequency.linearRampToValueAtTime(baseFreq + infl + (idx === words.length - 1 ? -12 : 10), t + dur);
      f.type = 'bandpass';
      f.frequency.value = baseFreq * 4.2;
      f.Q.value = 2.2;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.035, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f).connect(g).connect(this.master);
      o.start(t);
      o.stop(t + dur + 0.01);
      offset += dur + 0.025;
    });
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
