/**
 * Bot de treino para corridas GRATUITAS. É sempre identificado como bot
 * ("Bot de treino (IA)"), nunca entra em competições com saldo e não tem
 * percentagem de vitória programada: conduz segundo a linha de corrida com
 * velocidade fixa por dificuldade, e o resultado é decidido pela mesma validação
 * de pontos de controlo usada para os humanos.
 */
import { RACE_TRACK } from '../../../shared/zone.js';

export const BOT_SPEEDS = { facil: 15, medio: 20, dificil: 25 };

export const DEFAULT_TRAINING_BOTS = [
  { id: 'bot_treino_kiluanji', name: 'Kiluanji', difficulty: 'facil', vehicle: 'car', source: 'world3d' },
  { id: 'bot_treino_nzinga', name: 'Nzinga', difficulty: 'medio', vehicle: 'moto', source: 'world3d' },
  { id: 'bot_treino_mpanzu', name: 'Mpanzu', difficulty: 'dificil', vehicle: 'car', source: 'world3d' },
];

export class TrainingBotDriver {
  constructor(def, grid) {
    this.def = def;
    this.id = def.id;
    this.vmax = BOT_SPEEDS[def.difficulty] ?? BOT_SPEEDS.medio;
    this.line = [[grid[0], grid[1]], ...RACE_TRACK.racingLine.slice(1)];
    this.seg = 0;
    this.t = 0;
    this.x = grid[0];
    this.z = grid[1];
    this.heading = RACE_TRACK.start.heading;
    this.speed = 0;
    this.done = false;
  }

  step(dt) {
    if (this.done) return;
    const [ax, az] = this.line[this.seg];
    const [bx, bz] = this.line[this.seg + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const remaining = len - this.t;
    // abrandar antes das curvas
    const cornerLimit = this.seg + 2 < this.line.length && remaining < 20 ? 8 + remaining * 0.6 : Infinity;
    const target = Math.min(this.vmax, cornerLimit);
    this.speed += Math.sign(target - this.speed) * Math.min(Math.abs(target - this.speed), (target > this.speed ? 4.5 : 9) * dt);
    let move = this.speed * dt;
    while (move > 0 && !this.done) {
      const [sx, sz] = this.line[this.seg];
      const [ex, ez] = this.line[this.seg + 1];
      const l = Math.hypot(ex - sx, ez - sz);
      if (this.t + move < l) { this.t += move; move = 0; } else {
        move -= l - this.t;
        this.t = 0;
        this.seg++;
        if (this.seg >= this.line.length - 1) { this.done = true; this.seg = this.line.length - 2; this.t = l; }
      }
    }
    const [sx, sz] = this.line[this.seg];
    const [ex, ez] = this.line[this.seg + 1];
    const l = Math.hypot(ex - sx, ez - sz) || 1;
    this.x = sx + ((ex - sx) / l) * this.t;
    this.z = sz + ((ez - sz) / l) * this.t;
    this.heading = Math.atan2(ex - sx, ez - sz);
    if (this.done) { this.x = ex + (ex - sx) / l * 2; this.z = ez + (ez - sz) / l * 2; }
  }
}
