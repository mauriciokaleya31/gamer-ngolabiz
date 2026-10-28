/**
 * Trânsito autónomo: carros e motas seguem circuitos de faixa (trânsito pela direita),
 * respeitam semáforos, mantêm distância ao veículo da frente e cedem a peões.
 * A densidade varia com a hora virtual de Luanda (horas de ponta, noite calma).
 */
import { TRAFFIC_LOOPS, THROUGH_LOOPS, TRAFFIC_LIGHTS, RACE_TRACK, trafficLightState } from '../../shared/zone.js';
import { makeRng } from '../../shared/rng.js';

const CAR_COLORS = ['#f5f5f5', '#212121', '#b71c1c', '#0d47a1', '#9e9e9e', '#1b5e20', '#f9a825', '#4e342e', '#cfd8dc', '#263238', '#e65100'];
const TAXI_COLORS = ['#1565c0']; // candongueiros azuis e brancos (ícone luandense)

export const DEFAULT_TRAFFIC_CONFIG = {
  enabled: true,
  maxCars: 16,
  densityScale: 1.0,
  avenidaSpeed: 13.9, // 50 km/h
  streetSpeed: 10.5,
  minGap: 6.5,
};

/** Curva de densidade por hora local (0..1). */
export function densityAt(hour) {
  const pts = [[0, 0.18], [5, 0.15], [6.5, 0.6], [7.5, 1.0], [9.5, 0.7], [12.5, 0.85], [14, 0.7], [17, 1.0], [19, 0.8], [21, 0.45], [23, 0.25], [24, 0.18]];
  for (let i = 1; i < pts.length; i++) {
    if (hour <= pts[i][0]) {
      const [h0, v0] = pts[i - 1];
      const [h1, v1] = pts[i];
      return v0 + (v1 - v0) * ((hour - h0) / (h1 - h0));
    }
  }
  return 0.2;
}

function loopSegments(points, closed) {
  const segs = [];
  const n = closed ? points.length : points.length - 1;
  for (let i = 0; i < n; i++) {
    const [ax, az] = points[i];
    const [bx, bz] = points[(i + 1) % points.length];
    const len = Math.hypot(bx - ax, bz - az);
    segs.push({ ax, az, bx, bz, len, dx: (bx - ax) / len, dz: (bz - az) / len });
  }
  return segs;
}

export class TrafficSystem {
  constructor(config = {}) {
    this.config = { ...DEFAULT_TRAFFIC_CONFIG, ...config };
    this.rng = makeRng('kianda-trafego');
    this.loops = {};
    for (const [id, pts] of Object.entries(TRAFFIC_LOOPS)) {
      const closed = !THROUGH_LOOPS.includes(id);
      this.loops[id] = { id, closed, segs: loopSegments(pts, closed), usesRing: !THROUGH_LOOPS.includes(id) };
    }
    this.cars = [];
    this.nextId = 1;
    this.closure = null; // { reason, until }
  }

  configure(cfg) { this.config = { ...this.config, ...cfg }; return this.config; }

  /** Fecho do anel durante corridas: retira carros do circuito e dá prioridade N-S. */
  closeRing(reason, untilMs) {
    this.closure = { reason, until: untilMs };
    this.cars = this.cars.filter((c) => !this.loops[c.loop].usesRing);
  }

  openRing() { this.closure = null; }

  lightOverride(lightId) {
    if (!this.closure || !TRAFFIC_LIGHTS.some((l) => l.id === lightId)) return null;
    return { phase: 'RACE', ew: 'red', ns: 'green', remaining: 0 };
  }

  lightState(lightId, realNow) {
    return trafficLightState(realNow, lightId, this.lightOverride(lightId));
  }

  spawnCar(loopId, players) {
    const loop = this.loops[loopId];
    // escolher um ponto inicial longe dos jogadores (sem "aparecer" à frente deles)
    for (let attempt = 0; attempt < 8; attempt++) {
      const segIdx = loop.closed ? Math.floor(this.rng.next() * loop.segs.length) : 0;
      const seg = loop.segs[segIdx];
      const t = loop.closed ? this.rng.next() * seg.len : 0;
      const x = seg.ax + seg.dx * t;
      const z = seg.az + seg.dz * t;
      if (players.some((p) => Math.hypot(p.x - x, p.z - z) < 45) && loop.closed) continue;
      if (this.cars.some((c) => Math.hypot(c.x - x, c.z - z) < 12)) continue;
      const taxi = this.rng.chance(0.2);
      const kind = taxi ? 'taxi' : this.rng.chance(0.15) ? 'moto' : this.rng.chance(0.12) ? 'carrinha' : 'car';
      const car = {
        id: `trf_${this.nextId++}`,
        loop: loopId, segIdx, t, x, z,
        heading: Math.atan2(seg.dx, seg.dz),
        speed: 0,
        kind,
        color: taxi ? TAXI_COLORS[0] : this.rng.pick(CAR_COLORS),
        driverId: null,
        braking: false,
        waitSince: 0,
        ghostUntil: 0,
      };
      this.cars.push(car);
      return car;
    }
    return null;
  }

  assignDriver(npc) {
    const car = this.cars.find((c) => !c.driverId);
    if (!car) return null;
    car.driverId = npc.id;
    car.driverName = npc.def.name;
    return car.id;
  }

  releaseDriver(npcId) {
    const car = this.cars.find((c) => c.driverId === npcId);
    if (car) { car.driverId = null; car.driverName = null; }
    return null;
  }

  anyCarNear(x, z, r) {
    return this.cars.some((c) => c.speed > 0.5 && Math.hypot(c.x - x, c.z - z) < r);
  }

  tick(dt, realNow, hour, { players = [], pedestrians = [] } = {}) {
    if (this.closure && realNow > this.closure.until) this.openRing();
    if (!this.config.enabled) { this.cars = []; return; }
    const target = Math.round(this.config.maxCars * densityAt(hour) * this.config.densityScale);
    const loopIds = Object.keys(this.loops).filter((id) => !(this.closure && this.loops[id].usesRing));
    if (this.cars.length < target && this.rng.chance(0.3)) this.spawnCar(this.rng.pick(loopIds), players);
    if (this.cars.length > target && this.rng.chance(0.05)) {
      // remover o carro mais afastado dos jogadores e sem condutor nomeado
      let worst = -1;
      let worstD = -1;
      this.cars.forEach((c, i) => {
        const d = players.length ? Math.min(...players.map((p) => Math.hypot(p.x - c.x, p.z - c.z))) : 1e9;
        if (d > worstD && d > 60 && !c.driverId) { worstD = d; worst = i; }
      });
      if (worst >= 0) this.cars.splice(worst, 1);
    }

    const obstacles = [
      ...this.cars.map((c) => ({ x: c.x, z: c.z, id: c.id, vehicle: true })),
      ...players.filter((p) => p.inVehicle).map((p) => ({ x: p.x, z: p.z, id: p.id, vehicle: true })),
    ];
    const walkers = [...pedestrians, ...players.filter((p) => !p.inVehicle)];

    for (const car of this.cars) this.stepCar(car, dt, realNow, obstacles, walkers);
    // carros de atravessamento que saíram da zona reentram na ponta oposta
    this.cars = this.cars.filter((c) => !c.done);
  }

  stepCar(car, dt, realNow, obstacles, walkers) {
    const loop = this.loops[car.loop];
    const seg = loop.segs[car.segIdx];
    const onAvenida = Math.abs(seg.dz) < 0.1 && Math.abs(seg.az) < 10;
    let vMax = (onAvenida ? this.config.avenidaSpeed : this.config.streetSpeed) * (car.kind === 'moto' ? 1.1 : car.kind === 'carrinha' ? 0.9 : 1);

    // abrandar antes de curvas
    const remainingSeg = seg.len - car.t;
    const next = loop.segs[(car.segIdx + 1) % loop.segs.length];
    if (loop.closed || car.segIdx + 1 < loop.segs.length) {
      const turn = 1 - (seg.dx * next.dx + seg.dz * next.dz);
      if (turn > 0.2 && remainingSeg < 18) vMax = Math.min(vMax, 5 + remainingSeg * 0.3);
    }

    const dirX = Math.sin(car.heading);
    const dirZ = Math.cos(car.heading);
    let stopAt = Infinity; // distância até onde tem de parar
    const ghost = realNow < car.ghostUntil;

    // semáforos
    for (const tl of TRAFFIC_LIGHTS) {
      const rx = tl.x - car.x;
      const rz = tl.z - car.z;
      const along = rx * dirX + rz * dirZ;
      const lateral = Math.abs(rx * dirZ - rz * dirX);
      if (along <= 0 || along > 45 || lateral > 14) continue;
      const ewApproach = Math.abs(dirX) > Math.abs(dirZ);
      const half = ewApproach ? tl.halfNS : tl.halfEW;
      const stopLine = along - half - 2.5;
      if (stopLine < -0.5) continue; // já dentro do cruzamento
      const s = this.lightState(tl.id, realNow);
      const light = ewApproach ? s.ew : s.ns;
      if (light === 'red' || (light === 'yellow' && stopLine > 9)) stopAt = Math.min(stopAt, Math.max(0, stopLine));
    }
    // veículo à frente
    if (!ghost) {
      for (const o of obstacles) {
        if (o.id === car.id) continue;
        const rx = o.x - car.x;
        const rz = o.z - car.z;
        const along = rx * dirX + rz * dirZ;
        const lateral = Math.abs(rx * dirZ - rz * dirX);
        if (along > 0 && along < 30 && lateral < 1.8) stopAt = Math.min(stopAt, Math.max(0, along - this.config.minGap));
      }
      // peões na faixa de rodagem à frente (passadeiras ou não)
      for (const w of walkers) {
        const rx = w.x - car.x;
        const rz = w.z - car.z;
        const along = rx * dirX + rz * dirZ;
        const lateral = Math.abs(rx * dirZ - rz * dirX);
        if (along > 0 && along < 14 && lateral < 2.6) stopAt = Math.min(stopAt, Math.max(0, along - 3.5));
      }
    }
    // velocidade alvo para parar a tempo (desaceleração confortável ~4 m/s²)
    let vTarget = vMax;
    if (stopAt < Infinity) vTarget = Math.min(vMax, Math.sqrt(2 * 4 * Math.max(0, stopAt - 0.5)));
    const accel = vTarget > car.speed ? 2.6 : -6.5;
    car.speed = Math.max(0, Math.min(vTarget, car.speed + accel * dt));
    if (vTarget < car.speed) car.speed = Math.max(vTarget, car.speed - 6.5 * dt);
    car.braking = vTarget < car.speed + 0.2 && car.speed < vMax - 0.5;

    // anti-bloqueio: parado muito tempo sem semáforo → passa (raro em cruzamentos)
    if (car.speed < 0.2) {
      if (!car.waitSince) car.waitSince = realNow;
      if (realNow - car.waitSince > 9000 && stopAt > 0.5) { car.ghostUntil = realNow + 2000; car.waitSince = 0; }
    } else car.waitSince = 0;

    // avançar ao longo do circuito
    let move = car.speed * dt;
    while (move > 0) {
      const s = loop.segs[car.segIdx];
      const left = s.len - car.t;
      if (move < left) { car.t += move; move = 0; break; }
      move -= left;
      car.t = 0;
      car.segIdx++;
      if (car.segIdx >= loop.segs.length) {
        if (loop.closed) car.segIdx = 0;
        else { car.segIdx = 0; car.t = 0; if (this.rng.chance(0.35)) { car.done = true; return; } }
      }
    }
    const s = loop.segs[car.segIdx];
    car.x = s.ax + s.dx * car.t;
    car.z = s.az + s.dz * car.t;
    // rumo suavizado (curvas mais naturais)
    const targetH = Math.atan2(s.dx, s.dz);
    let dh = targetH - car.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    car.heading += dh * Math.min(1, dt * 6);
  }

  snapshotFor(x, z, radius, lightsOn) {
    const out = [];
    for (const c of this.cars) {
      if (Math.hypot(c.x - x, c.z - z) > radius) continue;
      out.push({ id: c.id, x: Math.round(c.x * 100) / 100, z: Math.round(c.z * 100) / 100, h: Math.round(c.heading * 100) / 100, s: Math.round(c.speed * 10) / 10, k: c.kind, c: c.color, l: lightsOn ? 1 : 0, br: c.braking ? 1 : 0, d: c.driverName ?? null });
    }
    return out;
  }

  lightsSnapshot(realNow) {
    return TRAFFIC_LIGHTS.map((l) => {
      const s = this.lightState(l.id, realNow);
      return { id: l.id, ew: s.ew, ns: s.ns };
    });
  }

  publicState() {
    return { cars: this.cars.length, closure: this.closure, config: this.config, raceTrack: RACE_TRACK.id };
  }
}
