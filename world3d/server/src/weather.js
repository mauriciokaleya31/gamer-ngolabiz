/**
 * Sistema de clima com transições graduais. O servidor decide o estado-alvo
 * (cadeia de Markov com probabilidades/durações configuráveis) e interpola
 * os parâmetros físicos; os clientes só aplicam o resultado.
 *
 * Consequências reais: chuva → humidade das superfícies (wetness) que seca devagar,
 * visibilidade/neblina, NPCs procuram abrigo, áudio de chuva no cliente.
 */
import { makeRng } from '../../shared/rng.js';

export const WEATHER_PRESETS = {
  limpo: { cloud: 0.1, fog: 0.0, rain: 0.0, wind: 0.2 },
  nublado: { cloud: 0.7, fog: 0.05, rain: 0.0, wind: 0.35 },
  neblina: { cloud: 0.5, fog: 0.55, rain: 0.0, wind: 0.1 },
  chuva: { cloud: 0.95, fog: 0.2, rain: 0.75, wind: 0.6 },
  trovoada: { cloud: 1.0, fog: 0.25, rain: 1.0, wind: 0.9 },
};

export const DEFAULT_WEATHER_CONFIG = {
  enabled: true,
  seed: 'kianda-clima',
  // probabilidades relativas do próximo estado
  weights: { limpo: 55, nublado: 25, neblina: 6, chuva: 11, trovoada: 3 },
  minDurationMin: 25, // minutos reais
  maxDurationMin: 70,
  transitionMin: 4, // minutos reais para transição completa
  intensity: 1.0, // escala da chuva/neblina
  dryingPerMin: 0.06, // secagem das superfícies por minuto real sem chuva
};

export class WeatherSystem {
  constructor(config = {}, now = () => Date.now()) {
    this.now = now;
    this.config = { ...DEFAULT_WEATHER_CONFIG, ...config };
    this.rng = makeRng(this.config.seed);
    const t = now();
    this.current = 'limpo';
    this.state = { ...WEATHER_PRESETS.limpo, wetness: 0, preset: 'limpo', target: 'limpo' };
    this.from = { ...this.state };
    this.transitionStart = t;
    this.nextChange = t + this.duration();
    this.lastTick = t;
    this.forced = null;
  }

  duration() {
    const { minDurationMin: a, maxDurationMin: b } = this.config;
    return (a + (b - a) * this.rng.next()) * 60000;
  }

  configure(cfg) {
    this.config = { ...this.config, ...cfg, weights: { ...this.config.weights, ...(cfg.weights || {}) } };
    return this.config;
  }

  /** Forçar um estado (admin/diagnóstico), sempre com transição gradual. */
  setTarget(preset, holdMinutes = 30) {
    if (!WEATHER_PRESETS[preset]) throw new Error(`clima desconhecido: ${preset}`);
    const t = this.now();
    this.from = { ...this.state };
    this.current = preset;
    this.transitionStart = t;
    this.nextChange = t + holdMinutes * 60000;
    this.forced = preset;
  }

  tick() {
    const t = this.now();
    const dtMin = Math.min(5, (t - this.lastTick) / 60000);
    this.lastTick = t;
    if (!this.config.enabled) {
      this.current = 'limpo';
    } else if (t >= this.nextChange) {
      this.forced = null;
      const entries = Object.entries(this.config.weights);
      this.from = { ...this.state };
      this.current = this.rng.weighted(entries);
      this.transitionStart = t;
      this.nextChange = t + this.duration();
    }
    const target = WEATHER_PRESETS[this.current];
    const k = Math.min(1, (t - this.transitionStart) / (this.config.transitionMin * 60000));
    const e = k * k * (3 - 2 * k);
    const lerp = (a, b) => a + (b - a) * e;
    const intensity = this.config.intensity;
    this.state.cloud = lerp(this.from.cloud, target.cloud);
    this.state.fog = lerp(this.from.fog, target.fog * intensity);
    this.state.rain = lerp(this.from.rain, target.rain * intensity);
    this.state.wind = lerp(this.from.wind, target.wind);
    this.state.preset = k >= 1 ? this.current : `${this.from.preset ?? 'limpo'}→${this.current}`;
    this.state.target = this.current;
    // humidade das superfícies: molha rápido com chuva, seca devagar
    if (this.state.rain > 0.05) this.state.wetness = Math.min(1, this.state.wetness + this.state.rain * 0.5 * dtMin);
    else this.state.wetness = Math.max(0, this.state.wetness - this.config.dryingPerMin * dtMin);
    return this.state;
  }

  publicState() {
    const r = (v) => Math.round(v * 1000) / 1000;
    return { preset: this.state.preset, target: this.current, cloud: r(this.state.cloud), fog: r(this.state.fog), rain: r(this.state.rain), wind: r(this.state.wind), wetness: r(this.state.wetness), forced: this.forced };
  }
}
