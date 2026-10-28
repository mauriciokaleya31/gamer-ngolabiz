/**
 * Competição: corrida no anel (servidor autoritativo do resultado).
 *
 * O servidor recebe as posições dos participantes, valida a plausibilidade
 * (velocidade máxima por veículo, ordem dos pontos de controlo, tempo mínimo da
 * volta), regista os instantes de passagem com o SEU relógio e decide o vencedor.
 * O registo final é guardado com hash SHA-256 verificável (GET /api/races/:id).
 *
 * Entradas com saldo demo usam a garantia (escrow) do DemoLedger. Bots de treino só
 * participam em corridas gratuitas (stake = 0).
 */
import { createHash, randomUUID } from 'node:crypto';
import { RACE_TRACK, trackLength } from '../../../shared/zone.js';
import { ALLOWED_STAKES_KZ } from '../economy/ledger.js';
import { TrainingBotDriver } from './trainingBot.js';

export const DEFAULT_RACE_CONFIG = {
  countdownSec: 5,
  timeoutSec: 300,
  afterFirstFinishSec: 45,
  challengeTtlSec: 60,
  maxSpeed: { car: 58, moto: 62 }, // m/s (≈ 210/225 km/h) — acima disto é batota/teletransporte
  maxViolations: 3,
  falseStartMeters: 15,
  feePct: 10,
};

export class RaceError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

function canonical(obj) {
  if (Array.isArray(obj)) return `[${obj.map(canonical).join(',')}]`;
  if (obj && typeof obj === 'object') return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`;
  return JSON.stringify(obj);
}

export function hashRaceRecord(record) {
  return createHash('sha256').update(canonical(record)).digest('hex');
}

function segPointDist(ax, az, bx, bz, px, pz) {
  const vx = bx - ax;
  const vz = bz - az;
  const l2 = vx * vx + vz * vz;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / l2)) : 0;
  return Math.hypot(ax + vx * t - px, az + vz * t - pz);
}

export class RaceManager {
  constructor({ store, ledger, traffic = null, npcSim = null, send = () => {}, now = () => Date.now(), config = {}, isOnline = () => true, onTeleport = () => {} }) {
    this.onTeleport = onTeleport;
    this.store = store;
    this.ledger = ledger;
    this.traffic = traffic;
    this.npcSim = npcSim;
    this.send = send;
    this.now = now;
    this.isOnline = isOnline;
    this.config = { ...DEFAULT_RACE_CONFIG, ...config };
    this.challenges = new Map();
    this.races = new Map();
    this.playerRace = new Map();
    this.minPlausibleMs = (trackLength() / Math.max(...Object.values(this.config.maxSpeed))) * 1000;
  }

  inCompetition(playerId) { return this.playerRace.has(playerId); }

  challenge(from, to, { vehicle = 'car', stake = 0 } = {}) {
    if (from.id === to.id) throw new RaceError('Não te podes desafiar a ti próprio.', 'self');
    if (!['car', 'moto'].includes(vehicle)) throw new RaceError('Veículo inválido.', 'vehicle');
    stake = Number(stake) || 0;
    if (!ALLOWED_STAKES_KZ.includes(stake)) throw new RaceError('Valor de entrada não permitido.', 'stake');
    if (this.inCompetition(from.id) || this.inCompetition(to.id)) throw new RaceError('Um dos jogadores já está numa competição.', 'busy');
    if (!this.isOnline(to.id)) throw new RaceError('O jogador já não está no mundo.', 'offline');
    if (stake > 0) {
      for (const p of [from, to]) {
        if (this.ledger.wallet(p.id).balanceKz < stake) throw new RaceError(`${p.displayName} não tem saldo demo suficiente.`, 'insufficient');
      }
    }
    for (const c of this.challenges.values()) {
      if (c.status === 'pending' && c.from.id === from.id && c.to.id === to.id) throw new RaceError('Já enviaste um desafio a este jogador.', 'duplicate');
    }
    const c = { id: `chl_${randomUUID().slice(0, 8)}`, from: { id: from.id, name: from.displayName }, to: { id: to.id, name: to.displayName }, vehicle, stake, status: 'pending', createdAt: this.now(), expiresAt: this.now() + this.config.challengeTtlSec * 1000 };
    this.challenges.set(c.id, c);
    this.send(to.id, { t: 'challenge_in', challenge: c });
    this.send(from.id, { t: 'challenge_update', challenge: c });
    return c;
  }

  respond(challengeId, byPlayerId, accept) {
    const c = this.challenges.get(challengeId);
    if (!c || c.status !== 'pending') throw new RaceError('Desafio inexistente ou expirado.', 'no_challenge');
    if (c.to.id !== byPlayerId) throw new RaceError('Este desafio não é para ti.', 'forbidden');
    c.status = accept ? 'accepted' : 'declined';
    this.send(c.from.id, { t: 'challenge_update', challenge: c });
    this.send(c.to.id, { t: 'challenge_update', challenge: c });
    if (!accept) return null;
    return this.startRace([
      { id: c.from.id, name: c.from.name, isBot: false, vehicle: c.vehicle },
      { id: c.to.id, name: c.to.name, isBot: false, vehicle: c.vehicle },
    ], { stake: c.stake, origin: c.id });
  }

  startTraining(player, botDef, vehicle = 'car') {
    if (this.inCompetition(player.id)) throw new RaceError('Já estás numa competição.', 'busy');
    if (!botDef) throw new RaceError('Bot de treino inexistente.', 'no_bot');
    if ([...this.races.values()].some((r) => r.participants.some((p) => p.id === botDef.id))) throw new RaceError('Esse bot de treino está ocupado.', 'busy');
    return this.startRace([
      { id: player.id, name: player.displayName, isBot: false, vehicle },
      { id: botDef.id, name: `${botDef.name} (Bot de treino)`, isBot: true, vehicle: botDef.vehicle, botDef },
    ], { stake: 0, origin: 'treino' });
  }

  startRace(entrants, { stake, origin }) {
    if (stake > 0 && entrants.some((e) => e.isBot)) throw new RaceError('Bots não podem participar em competições com saldo.', 'bot_paid');
    const id = `race_${randomUUID()}`;
    const now = this.now();
    const humans = entrants.filter((e) => !e.isBot).map((e) => e.id);
    if (stake > 0) {
      this.ledger.openEscrow(id, humans, stake);
      try {
        for (const pid of humans) this.ledger.hold(id, pid);
      } catch (e) {
        this.ledger.refund(id, 'falha na reserva');
        throw new RaceError('Não foi possível reservar as entradas demo.', 'hold_failed');
      }
    }
    const race = {
      id, origin, stake, track: RACE_TRACK.id, phase: 'countdown', createdAt: now,
      goAt: now + this.config.countdownSec * 1000,
      participants: entrants.map((e, i) => ({
        id: e.id, name: e.name, isBot: e.isBot, vehicle: e.vehicle, grid: RACE_TRACK.grid[i],
        nextCp: 0, cpTimes: [], last: null, violations: 0, status: 'racing', finishMs: null,
        bot: e.isBot ? new TrainingBotDriver(e.botDef, RACE_TRACK.grid[i]) : null,
      })),
      firstFinishAt: null,
    };
    this.races.set(id, race);
    for (const p of race.participants) this.playerRace.set(p.id, id);
    this.traffic?.closeRing('corrida', race.goAt + this.config.timeoutSec * 1000);
    this.npcSim?.pushEvent({ type: 'race_start', id });
    const setup = {
      t: 'race_setup', raceId: id, goAt: race.goAt, stake,
      track: { id: RACE_TRACK.id, name: RACE_TRACK.name, checkpoints: RACE_TRACK.checkpoints, radius: RACE_TRACK.checkpointRadius, heading: RACE_TRACK.start.heading },
      participants: race.participants.map((p) => ({ id: p.id, name: p.name, isBot: p.isBot, vehicle: p.vehicle, grid: p.grid })),
    };
    for (const p of race.participants) {
      if (p.isBot) continue;
      this.onTeleport(p.id, p.grid[0], p.grid[1]);
      this.send(p.id, { ...setup, you: { grid: p.grid, vehicle: p.vehicle } });
    }
    return race;
  }

  /** Amostra de posição de um participante (humano via rede, bot via simulação). */
  onPlayerState(playerId, x, z, t = this.now()) {
    const raceId = this.playerRace.get(playerId);
    if (!raceId) return;
    const race = this.races.get(raceId);
    const p = race?.participants.find((pp) => pp.id === playerId);
    if (!p || p.status !== 'racing') return;
    if (race.phase === 'countdown') {
      if (Math.hypot(x - p.grid[0], z - p.grid[1]) > this.config.falseStartMeters) this.disqualify(race, p, 'partida falsa');
      return;
    }
    if (race.phase !== 'running') return;
    const sample = { x, z, t };
    if (!p.last) { p.last = sample; return; }
    const dt = (t - p.last.t) / 1000;
    const dist = Math.hypot(x - p.last.x, z - p.last.z);
    if (dt <= 0) return;
    const vmax = this.config.maxSpeed[p.vehicle] ?? 58;
    if (dist / dt > vmax * 1.15 + 3 && dist > 4) {
      p.violations++;
      p.last = sample; // não conta pontos de controlo neste salto
      if (p.violations >= this.config.maxViolations) this.disqualify(race, p, 'velocidade impossível / teletransporte');
      return;
    }
    const cps = RACE_TRACK.checkpoints;
    while (p.nextCp < cps.length) {
      const [cx, cz] = cps[p.nextCp];
      if (segPointDist(p.last.x, p.last.z, x, z, cx, cz) > RACE_TRACK.checkpointRadius) break;
      p.cpTimes.push(t - race.goAt);
      p.nextCp++;
      if (!p.isBot) this.send(p.id, { t: 'race_progress', raceId, checkpoint: p.nextCp, total: cps.length, ms: t - race.goAt });
    }
    p.last = sample;
    if (p.nextCp >= cps.length) {
      const finishMs = t - race.goAt;
      if (finishMs < this.minPlausibleMs) { this.disqualify(race, p, 'tempo impossível'); return; }
      p.status = 'finished';
      p.finishMs = finishMs;
      race.firstFinishAt ??= t;
      this.broadcast(race, { t: 'race_progress', raceId, finished: p.id, name: p.name, ms: finishMs });
    }
  }

  disqualify(race, p, reason) {
    p.status = 'dq';
    p.reason = reason;
    this.broadcast(race, { t: 'race_progress', raceId: race.id, disqualified: p.id, name: p.name, reason });
  }

  onDisconnect(playerId) {
    const raceId = this.playerRace.get(playerId);
    if (raceId) {
      const race = this.races.get(raceId);
      const p = race?.participants.find((pp) => pp.id === playerId);
      if (p && p.status === 'racing') { p.status = 'dnf'; p.reason = 'desligou-se'; }
    }
    for (const c of this.challenges.values()) if (c.status === 'pending' && (c.from.id === playerId || c.to.id === playerId)) c.status = 'cancelled';
  }

  broadcast(race, msg) {
    for (const p of race.participants) if (!p.isBot) this.send(p.id, msg);
  }

  tick(dtSec) {
    const now = this.now();
    for (const c of this.challenges.values()) {
      if (c.status === 'pending' && now > c.expiresAt) {
        c.status = 'expired';
        this.send(c.from.id, { t: 'challenge_update', challenge: c });
        this.send(c.to.id, { t: 'challenge_update', challenge: c });
      }
      if (c.status !== 'pending' && now - c.createdAt > 600000) this.challenges.delete(c.id);
    }
    for (const race of this.races.values()) {
      if (race.phase === 'countdown' && now >= race.goAt) {
        race.phase = 'running';
        this.broadcast(race, { t: 'race_go', raceId: race.id, goAt: race.goAt });
        for (const p of race.participants) p.last = { x: p.grid[0], z: p.grid[1], t: race.goAt };
      }
      if (race.phase !== 'running') continue;
      for (const p of race.participants) {
        if (!p.bot || p.status !== 'racing') continue;
        p.bot.step(dtSec);
        this.onPlayerState(p.id, p.bot.x, p.bot.z, now);
      }
      const active = race.participants.filter((p) => p.status === 'racing');
      const timeout = now > race.goAt + this.config.timeoutSec * 1000;
      const afterFirst = race.firstFinishAt && now > race.firstFinishAt + this.config.afterFirstFinishSec * 1000;
      if (!active.length || timeout || afterFirst) this.finish(race, now);
    }
  }

  finish(race, now) {
    race.phase = 'finished';
    for (const p of race.participants) if (p.status === 'racing') { p.status = 'dnf'; p.reason = 'não terminou a tempo'; }
    const finishers = race.participants.filter((p) => p.status === 'finished').sort((a, b) => a.finishMs - b.finishMs);
    // empate exacto (mesmo milissegundo) → sem vencedor, reembolso
    const tie = finishers.length > 1 && finishers[0].finishMs === finishers[1].finishMs;
    const winner = tie ? null : finishers[0] ?? null;
    let settlement = null;
    if (race.stake > 0) {
      settlement = winner && !winner.isBot
        ? this.ledger.settle(race.id, winner.id, { decidedBy: 'competition_server' })
        : this.ledger.refund(race.id, tie ? 'empate' : 'sem vencedor');
    }
    const record = {
      raceId: race.id,
      track: race.track,
      trackChecksum: createHash('sha256').update(JSON.stringify(RACE_TRACK.checkpoints)).digest('hex').slice(0, 16),
      origin: race.origin,
      stake: race.stake,
      currency: 'KZD',
      isDemo: true,
      startedAt: race.goAt,
      endedAt: now,
      winnerId: winner?.id ?? null,
      participants: race.participants.map((p) => ({ id: p.id, name: p.name, isBot: p.isBot, vehicle: p.vehicle, status: p.status, reason: p.reason ?? null, finishMs: p.finishMs, checkpoints: p.cpTimes, violations: p.violations })),
      settlement: settlement ? { prizeKz: settlement.prizeKz ?? 0, feeKz: settlement.feeKz ?? 0, potKz: settlement.potKz ?? 0, refunded: settlement.refunded ?? 0, txnId: settlement.txnId ?? null } : null,
      decidedBy: 'world3d-competition-server',
    };
    const hash = hashRaceRecord(record);
    this.store.saveRace(record, hash);
    for (const p of race.participants) {
      if (!p.isBot) this.store.recordRaceStats(p.id, winner?.id === p.id, p.status === 'finished' ? p.finishMs : null);
      this.playerRace.delete(p.id);
    }
    this.traffic?.openRing();
    this.store.audit('race_result', { raceId: race.id, hash, winnerId: record.winnerId });
    this.broadcast(race, { t: 'race_result', record, hash });
    this.races.delete(race.id);
    return { record, hash };
  }

  /** Estado de corridas para snapshots (posições dos bots de treino). */
  botStates() {
    const out = [];
    for (const race of this.races.values()) {
      for (const p of race.participants) {
        if (!p.bot) continue;
        out.push({ id: p.id, name: p.name, isBot: true, x: p.bot.x, z: p.bot.z, h: p.bot.heading, speed: p.bot.speed, vehicle: p.vehicle });
      }
    }
    return out;
  }

  publicState() {
    return {
      races: [...this.races.values()].map((r) => ({ id: r.id, phase: r.phase, stake: r.stake, participants: r.participants.map((p) => ({ id: p.id, name: p.name, isBot: p.isBot, status: p.status, cp: p.nextCp })) })),
      pendingChallenges: [...this.challenges.values()].filter((c) => c.status === 'pending').length,
    };
  }
}

export function verifyRace(stored) {
  if (!stored) return { ok: false, reason: 'não encontrada' };
  const recomputed = hashRaceRecord(stored.record);
  return { ok: recomputed === stored.hash, hash: stored.hash, recomputed };
}
