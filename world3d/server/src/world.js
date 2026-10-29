/**
 * Orquestrador do mundo "Kianda Centro": junta relógio, clima, trânsito, NPCs,
 * diálogo, competições, economia demo e jogadores; corre o ciclo de simulação
 * (10 Hz) e envia snapshots com gestão de interesse a cada cliente.
 */
import { buildNavGraph } from '../../shared/nav.js';
import { POIS, PARKED_VEHICLES, ZONE_BOUNDS, PLAYER_SPAWNS } from '../../shared/zone.js';
import { formatClock, localParts } from '../../shared/time.js';
import { WorldClock } from './clock.js';
import { WeatherSystem } from './weather.js';
import { TrafficSystem } from './traffic.js';
import { generatePopulation } from './npc/population.js';
import { NpcSimulation } from './npc/simulation.js';
import { NpcMemory } from './dialogue/memory.js';
import { DialogueGateway } from './dialogue/gateway.js';
import { greetingFor, ambientLine } from './dialogue/local.js';
import { DemoLedger } from './economy/ledger.js';
import { RaceManager, RaceError } from './competition/race.js';
import { defaultAdminConfig, mergeAdminConfig } from './config.js';
import { ExpressionService } from './expressions.js';
import { ShopService, GARAGE_SPAWN, RENTAL_SPAWN, SHOP_LOCATIONS, ShopError } from './shop.js';
import { ArenaModesManager, ArenaError, COMPETITION_CENTERS } from './competition/arenaModes.js';
import { EMOTE_LIMITS } from '../../shared/emotes.js';
import { PROPERTIES_CATALOG } from '../../shared/catalog.js';

const POI_NAME = new Map(POIS.map((p) => [p.id, p.name]));
const MAX_SPEED = { foot: 9.5, car: 62, moto: 66 };
const APPEARANCE_KEYS = ['gender', 'skinTone', 'hairStyle', 'hairColor', 'top', 'topColor', 'topPattern', 'bottom', 'bottomColor', 'shoes', 'shoesColor', 'accessory', 'accessories', 'height', 'bodyType', 'face'];

export function sanitizeAppearance(a = {}) {
  const out = {};
  for (const k of APPEARANCE_KEYS) {
    const v = a[k];
    if (v === undefined || v === null) continue;
    if (k === 'height') out[k] = Math.max(1.5, Math.min(2.0, Number(v) || 1.75));
    else if (k === 'face') out[k] = { shape: (Number(v.shape) | 0) % 4, eyes: (Number(v.eyes) | 0) % 4, beard: String(v.beard ?? 'nenhuma').replace(/[^\w-]/g, '').slice(0, 16), brows: (Number(v.brows) | 0) % 3 };
    else if (k === 'accessories') out[k] = Object.fromEntries(Object.entries(typeof v === 'object' ? v : {}).slice(0, 8).map(([sk, sv]) => [String(sk).replace(/[^\w]/g, '').slice(0, 10), String(sv).replace(/[^\w-]/g, '').slice(0, 24)]));
    else out[k] = String(v).replace(/[^#\w-]/g, '').slice(0, 24);
  }
  out.gender = out.gender === 'f' ? 'f' : 'm';
  return out;
}

export class World {
  constructor({ env, store, provider, now = () => Date.now() }) {
    this.env = env;
    this.store = store;
    this.now = now;
    this.adminConfig = mergeAdminConfig(defaultAdminConfig(), store.getJSON('admin_config', {}));
    const cfg = this.adminConfig;

    this.clock = new WorldClock({ ...cfg.clock, allowDiagnostics: env.development, now });
    this.weather = new WeatherSystem(cfg.weather, now);
    this.traffic = new TrafficSystem(cfg.traffic);
    this.graph = buildNavGraph();
    this.memory = new NpcMemory(store);
    this.npcSim = new NpcSimulation({
      graph: this.graph,
      population: this.buildPopulation(),
      config: cfg.simulation,
      clock: this.clock,
      weather: this.weather,
      traffic: this.traffic,
      hooks: {
        onPlayerApproach: (npc, p) => greetingFor(npc, this.memory.get(npc.id, p.id), this.hour()),
        ambientLine: (npc, partner) => ambientLine(npc, partner, { hour: this.hour(), rain: this.weather.state.rain }),
      },
    });
    this.ledger = new DemoLedger(store, { feePct: cfg.competitions.feePct });
    this.dialogue = new DialogueGateway({ provider, memory: this.memory, config: cfg.dialogue, now, audit: (e) => store.audit(e.type, e) });
    this.races = new RaceManager({
      store, ledger: this.ledger, traffic: this.traffic, npcSim: this.npcSim, now,
      send: (pid, msg) => this.sendTo(pid, msg),
      isOnline: (pid) => this.players.has(pid),
      onTeleport: (pid, x, z) => this.teleport(pid, x, z),
      config: { feePct: cfg.competitions.feePct },
    });
    this.expressions = new ExpressionService({ now, overrides: cfg.emotes.overrides });
    this.shop = new ShopService({ store, ledger: this.ledger, overrides: cfg.catalog.overrides });
    this.arena = new ArenaModesManager({
      store, ledger: this.ledger, now,
      send: (pid, msg) => this.sendTo(pid, msg),
      onTeleport: (pid, x, z, h) => { this.teleport(pid, x, z); const pl = this.players.get(pid); if (pl) { pl.h = h ?? pl.h; this.sendTo(pid, { t: 'correct', x, z, h: pl.h, diag: true }); } },
      config: { feePct: cfg.competitions.feePct },
    });
    this.players = new Map();
    this.parties = new Map();
    this.vehicles = new Map(PARKED_VEHICLES.filter((v) => v.usable).map((v) => [v.id, { ...v, occupant: null, color: null }]));
    this.simCompetitors = this.env.dbPath !== ':memory:' ? this.initSimCompetitors() : [];
    this.metrics = { tickMs: 0, maxTickMs: 0, ticks: 0, bytesOut: 0, msgsIn: 0, startedAt: now(), lastCpu: process.cpuUsage(), cpuPct: 0, lastCpuAt: now() };
    this.tickCount = 0;
    this.lastTick = now();
  }

  initSimCompetitors() {
    const presets = [
      { id: 'u:kamba_1', displayName: 'Mauro_Luanda', gender: 'm', skinTone: '#5c3824', top: 'camisola_desportiva', topColor: '#e53935', bottom: 'calca_ganga', bottomColor: '#1c2a48', vehicle: null, route: [[-6, -34], [14, -15], [18, 22], [0, -45]] },
      { id: 'u:kamba_2', displayName: 'KiandaQueen', gender: 'f', skinTone: '#6f462c', top: 'blusa', topColor: '#fdd835', bottom: 'calca_ganga', bottomColor: '#263238', vehicle: null, route: [[12, -16], [0, -42], [-17, 36], [16, -15]] },
      { id: 'u:kamba_3', displayName: 'BetoTurbo_AO', gender: 'm', skinTone: '#4a2c1d', top: 'casaco', topColor: '#1e88e5', bottom: 'calca_cargo', bottomColor: '#263238', vehicle: 'car', vi: 'desportivo_gt', vp: '#e53935', loop: [[-50, -88], [50, -88], [53, 85], [-50, 88]] },
      { id: 'u:kamba_4', displayName: 'Nandinho_Moto', gender: 'm', skinTone: '#7b4f35', top: 'hoodie', topColor: '#43a047', bottom: 'calca_ganga', bottomColor: '#1a1a1a', vehicle: 'moto', vi: 'moto_desportiva', vp: '#fdd835', loop: [[50, -5.25], [-50, -5.25], [-53, -85], [53, -85]] },
      { id: 'u:kamba_5', displayName: 'Yola_Muxima', gender: 'f', skinTone: '#5c3824', top: 'camisa_capulana', topColor: '#8e24aa', bottom: 'saia', bottomColor: '#1a1a1a', vehicle: null, route: [[26, 28], [18, 20], [0, -32], [15, -16]] },
      { id: 'u:kamba_6', displayName: 'DjiTafinha_99', gender: 'm', skinTone: '#3d2314', top: 't-shirt', topColor: '#fb8c00', bottom: 'calcoes', bottomColor: '#263238', vehicle: null, route: [[78, -16], [104, -32], [28, 24], [-28, -16]] },
    ];
    for (const c of presets) {
      const app = { gender: c.gender, skinTone: c.skinTone, top: c.top, topColor: c.topColor, bottom: c.bottom, bottomColor: c.bottomColor, shoes: 'tenis' };
      this.store.upsertProfile({ playerId: c.id, displayName: c.displayName, appearance: app, isGuest: false });
    }
    return presets.map((c, idx) => {
      const pts = c.loop ?? c.route;
      return {
        ...c,
        appearance: { gender: c.gender, skinTone: c.skinTone, top: c.top, topColor: c.topColor, bottom: c.bottom, bottomColor: c.bottomColor, shoes: 'tenis' },
        x: pts[0][0], y: 0, z: pts[0][1], h: 0, wp: 1,
        speed: c.vehicle ? 14 + idx * 1.5 : 1.75,
        anim: c.vehicle ? 'drive' : 'walk',
        nextChatAt: this.now() + (18000 + idx * 14000),
      };
    });
  }

  tickSimCompetitors(dt, now) {
    if (!this.simCompetitors?.length) return;
    const lines = [
      'Quem vem correr no Circuito da Kianda? Estou na Arena!',
      'Passei agora pela Moda Muxima, as roupas novas estão top!',
      'Bora um desafio de corrida de mota no anel?',
      'Alguém na Casa de Apostas da Arena para um duelo?',
      'Acabei de levantar o carro na Oficina Kalunga Motors!',
      'Boa sorte a todos aqui em Kianda Centro!',
    ];
    for (let i = 0; i < this.simCompetitors.length; i++) {
      const c = this.simCompetitors[i];
      const pts = c.loop ?? c.route;
      const target = pts[c.wp % pts.length];
      const dx = target[0] - c.x;
      const dz = target[1] - c.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 2.2) {
        c.wp = (c.wp + 1) % pts.length;
      } else {
        c.h = Math.atan2(dx, dz);
        const step = Math.min(dist, c.speed * dt);
        c.x += (dx / dist) * step;
        c.z += (dz / dist) * step;
      }
      if (now > c.nextChatAt && this.players.size > 0) {
        c.nextChatAt = now + 42000 + (i * 19000);
        const text = lines[(this.tickCount + i) % lines.length];
        for (const o of this.players.values()) {
          if (Math.hypot(o.x - c.x, o.z - c.z) <= 85) {
            this.sendTo(o.id, { t: 'chat', from: c.id, name: c.displayName, text, scope: 'local', at: now });
          }
        }
      }
    }
  }

  hour(realMs = this.now()) { return localParts(this.clock.virtualNow(realMs)).hourFloat; }

  buildPopulation() {
    const p = this.adminConfig.population;
    const pop = generatePopulation({ count: Math.max(0, Math.min(400, p.count)), seed: p.seed, weights: p.weights, minimums: p.minimums });
    for (const npc of pop) npc.status = p.archetypeStatus[npc.archetype] ?? 'active';
    return pop;
  }

  // ------------------------------------------------------------------ ciclo
  start() {
    const hz = this.adminConfig.simulation.tickHz;
    this.timer = setInterval(() => this.tick(), 1000 / hz);
    this.memoryPurge = setInterval(() => this.store.purgeOldMemories(30 * 86400000), 3600000);
  }

  stop() {
    clearInterval(this.timer);
    clearInterval(this.memoryPurge);
  }

  tick() {
    const t0 = performance.now();
    const now = this.now();
    const dt = Math.min(0.5, (now - this.lastTick) / 1000);
    this.lastTick = now;
    this.tickCount++;
    if (this.tickCount % 10 === 0) this.weather.tick();
    const hour = this.hour(now);
    const players = [...this.players.values()];
    const pedestrians = [];
    for (const n of this.npcSim.npcs.values()) if (n.visible && n.tier !== 'far') pedestrians.push(n);
    this.traffic.tick(dt, now, hour, { players, pedestrians });
    this.npcSim.tick(now, players);
    this.races.tick(dt);
    this.arena.tick();
    this.tickSimCompetitors(dt, now);

    const lightsOn = this.clock.publicState(now).light.streetLights > 0.4 || this.weather.state.rain > 0.3 || this.weather.state.fog > 0.4;
    const sendLights = this.tickCount % 5 === 0;
    const sendEnv = this.tickCount % 20 === 0;
    const env = sendEnv ? this.envMessage(now) : null;
    const bots = this.races.botStates();
    const lights = sendLights ? this.traffic.lightsSnapshot(now) : null;
    for (const p of players) {
      if (!p.ready) continue;
      const others = [];
      for (const o of players) {
        if (o === p || !o.ready) continue;
        const e = o.emote ? { id: o.emote.id, at: o.emote.startedAt, d: o.emote.dir } : null;
        others.push({ id: o.id, n: o.displayName, x: o.x, y: o.y, z: o.z, h: o.h, a: o.anim, s: o.speed, v: o.vehicle, vi: o.vehicleItem, vp: o.vehiclePaint, vc: o.vehicleColor, g: o.isGuest ? 1 : 0, e });
      }
      for (const sc of this.simCompetitors) {
        others.push({ id: sc.id, n: sc.displayName, x: sc.x, y: sc.y, z: sc.z, h: sc.h, a: sc.anim, s: sc.speed, v: sc.vehicle, vi: sc.vi ?? null, vp: sc.vp ?? null, vc: sc.vp ?? null, g: 0, e: null });
      }
      const snap = {
        t: 'snap', st: now,
        p: others,
        n: this.npcSim.snapshotFor(p.x, p.z, undefined, now, p.id),
        c: this.traffic.snapshotFor(p.x, p.z, 220, lightsOn),
        b: bots,
      };
      if (lights) snap.l = lights;
      this.sendTo(p.id, snap);
      if (env) this.sendTo(p.id, env);
    }
    const ms = performance.now() - t0;
    this.metrics.tickMs = this.metrics.tickMs * 0.9 + ms * 0.1;
    this.metrics.maxTickMs = Math.max(this.metrics.maxTickMs * 0.999, ms);
    this.metrics.ticks++;
    if (now - this.metrics.lastCpuAt > 5000) {
      const cpu = process.cpuUsage(this.metrics.lastCpu);
      this.metrics.cpuPct = Math.round(((cpu.user + cpu.system) / 1000 / (now - this.metrics.lastCpuAt)) * 1000) / 10;
      this.metrics.lastCpu = process.cpuUsage();
      this.metrics.lastCpuAt = now;
    }
  }

  envMessage(now = this.now()) {
    return { t: 'env', time: this.clock.publicState(now), weather: this.weather.publicState() };
  }

  sendTo(playerId, msg) {
    const p = this.players.get(playerId);
    if (!p?.socket || p.socket.readyState !== 1) return;
    const data = JSON.stringify(msg);
    this.metrics.bytesOut += data.length;
    p.socket.send(data);
  }

  // ------------------------------------------------------------- jogadores
  canJoin() {
    if (this.adminConfig.zone.status !== 'active') return { ok: false, reason: this.adminConfig.zone.maintenanceMessage || 'Zona em manutenção.' };
    if (this.players.size >= this.env.maxPlayers) return { ok: false, reason: 'Zona cheia. Tenta daqui a pouco.' };
    return { ok: true };
  }

  join(identity, socket, { appearance } = {}) {
    const existing = this.players.get(identity.playerId);
    if (existing) { try { existing.socket.close(4000, 'nova sessão'); } catch { /* ignorar */ } this.leave(identity.playerId); }
    const stored = this.store.getProfile(identity.playerId);
    // a aparência guardada na conta prevalece; a enviada pelo cliente é validada contra o inventário
    const app = this.shop.validateAppearance(identity.playerId, sanitizeAppearance(appearance ?? stored?.appearance ?? {}));
    const profile = this.store.upsertProfile({ playerId: identity.playerId, displayName: identity.displayName, appearance: app, isGuest: identity.isGuest });
    const spawn = PLAYER_SPAWNS[this.players.size % PLAYER_SPAWNS.length];
    const p = {
      id: identity.playerId, displayName: identity.displayName, isGuest: identity.isGuest, role: identity.role,
      appearance: app, socket, x: spawn[0], y: 0, z: spawn[1], h: Math.PI, anim: 'idle', speed: 0,
      vehicle: null, vehicleId: null, vehicleColor: null, inVehicle: false, talkingTo: null,
      lastStateAt: this.now(), chatTimes: [], msgWindow: [], partyId: null, ready: true,
    };
    this.players.set(p.id, p);
    const wallet = this.ledger.ensurePlayer(p.id);
    this.sendTo(p.id, {
      t: 'welcome',
      you: { id: p.id, displayName: p.displayName, isGuest: p.isGuest, appearance: app, x: p.x, z: p.z, h: p.h, stats: { races: profile.races, wins: profile.wins } },
      env: this.envMessage(),
      vehicles: this.vehicleList(),
      wallet,
      catalog: this.shop.publicCatalog(),
      owned: this.shop.owned(p.id),
      emotes: this.expressions.publicList(),
      prefs: this.store.getPrefs(p.id),
      shops: Object.fromEntries(Object.entries(SHOP_LOCATIONS).map(([k, v]) => [k, { name: v.name, poi: v.poi }])),
      rentals: this.shop.publicRentals(),
      properties: this.shop.publicProperties(),
      myRentals: this.store.activeRentalsOf(p.id),
      myProperties: this.store.propertiesOf(p.id),
      consumables: this.store.consumablesOf(p.id),
      feePct: this.adminConfig.competitions.feePct,
      trainingBots: this.adminConfig.competitions.trainingBots.map((b) => ({ id: b.id, name: b.name, difficulty: b.difficulty, vehicle: b.vehicle })),
      features: { raceEnabled: this.adminConfig.competitions.raceEnabled, stakesEnabled: this.adminConfig.competitions.stakesEnabled, diagnostics: this.env.development, aiDialogue: this.dialogue.config.aiEnabled && this.dialogue.provider.available() },
      serverNowMs: this.now(),
    });
    this.broadcastSystem(`${p.displayName} entrou em Kianda Centro.`, p.id);
    this.store.audit('player_join', { playerId: p.id, guest: p.isGuest });
    return p;
  }

  leave(playerId) {
    const p = this.players.get(playerId);
    if (!p) return;
    this.races.onDisconnect(playerId);
    this.arena.onDisconnect(playerId);
    if (p.vehicleId) this.releaseVehicle(p);
    if (p.partyId) this.leaveParty(p);
    if (this.vehicles.delete(`pv_${playerId}`)) this.broadcastVehicles();
    if (this.vehicles.delete(`rv_${playerId}`)) this.broadcastVehicles();
    this.players.delete(playerId);
    this.broadcastSystem(`${p.displayName} saiu.`, playerId);
  }

  broadcastSystem(text, exceptId = null) {
    for (const o of this.players.values()) if (o.id !== exceptId) this.sendTo(o.id, { t: 'system', text });
  }

  vehicleList() {
    return [...this.vehicles.values()].map((v) => ({ id: v.id, kind: v.kind, x: v.x, z: v.z, heading: v.heading, occupant: v.occupant, itemId: v.itemId ?? null, paint: v.paint ?? null, rims: v.rims ?? null, owner: v.owner ?? null }));
  }

  releaseVehicle(p) {
    const v = this.vehicles.get(p.vehicleId);
    if (v) { v.occupant = null; v.x = p.x; v.z = p.z; v.heading = p.h; }
    p.vehicleId = null;
    p.vehicle = null;
    p.vehicleItem = null;
    p.vehiclePaint = null;
    p.inVehicle = false;
    this.broadcastVehicles();
  }

  broadcastVehicles() {
    const list = this.vehicleList();
    for (const o of this.players.values()) this.sendTo(o.id, { t: 'vehicles', vehicles: list });
  }

  /** Teletransporte autoritativo (ex.: grelha de partida). O cliente segue a ordem. */
  teleport(playerId, x, z) {
    const p = this.players.get(playerId);
    if (!p) return;
    if (p.vehicleId) this.releaseVehicle(p);
    p.x = x;
    p.z = z;
    p.lastStateAt = this.now();
    p.pendingTeleport = { x, z, until: this.now() + 5000 };
  }

  /** Estado enviado pelo cliente (movimento previsto localmente, validado aqui). */
  onState(p, m) {
    const now = this.now();
    const x = Number(m.x);
    const z = Number(m.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    if (p.pendingTeleport) {
      // ignorar amostras antigas até o cliente aplicar o teletransporte
      if (now < p.pendingTeleport.until && Math.hypot(x - p.pendingTeleport.x, z - p.pendingTeleport.z) > 8) return;
      p.pendingTeleport = null;
      p.lastStateAt = now;
    }
    const dt = Math.max(0.05, (now - p.lastStateAt) / 1000);
    const mode = p.inVehicle || m.veh ? (p.vehicle ?? m.veh ?? 'car') : 'foot';
    const limit = (MAX_SPEED[mode] ?? MAX_SPEED.car) * dt * 1.4 + 2.5;
    const inBounds = x >= ZONE_BOUNDS.minX - 2 && x <= ZONE_BOUNDS.maxX + 2 && z >= ZONE_BOUNDS.minZ - 2 && z <= ZONE_BOUNDS.maxZ + 2;
    if (!inBounds || Math.hypot(x - p.x, z - p.z) > limit) {
      p.corrections = (p.corrections ?? 0) + 1;
      this.sendTo(p.id, { t: 'correct', x: p.x, z: p.z });
      p.lastStateAt = now;
      return;
    }
    p.x = x;
    p.z = z;
    p.y = Math.max(-1, Math.min(60, Number(m.y) || 0));
    p.h = Number(m.h) || 0;
    p.anim = String(m.a ?? 'idle').slice(0, 12);
    p.speed = Math.min(80, Math.abs(Number(m.s) || 0));
    if (m.veh && ['car', 'moto'].includes(m.veh) && (p.vehicleId || this.races.inCompetition(p.id))) {
      p.vehicle = m.veh;
      p.inVehicle = true;
      p.vehicleColor = String(m.vc ?? '').replace(/[^#\w]/g, '').slice(0, 9) || null;
    } else if (!p.vehicleId) {
      p.vehicle = null;
      p.inVehicle = false;
    }
    p.lastStateAt = now;
    p.inRace = this.races.inCompetition(p.id);
    const stop = this.expressions.maintain(p);
    if (stop) this.broadcastNear(p, stop);
    this.races.onPlayerState(p.id, x, z, now);
  }

  // ------------------------------------------------------------ mensagens
  async onMessage(p, m) {
    this.metrics.msgsIn++;
    const now = this.now();
    p.msgWindow = p.msgWindow.filter((t) => now - t < 1000);
    if (p.msgWindow.length > 40) return; // inundação: descartar
    p.msgWindow.push(now);
    try {
      switch (m.t) {
        case 'state': return this.onState(p, m);
        case 'ping': return this.sendTo(p.id, { t: 'pong', c: m.c, s: this.now() });
        case 'chat': return this.onChat(p, m);
        case 'talk': return await this.onTalk(p, m);
        case 'talk_end': p.talkingTo = null; return;
        case 'npc_profile': return this.sendTo(p.id, { t: 'npc_profile', profile: this.npcSim.publicProfile(String(m.npcId)) });
        case 'player_profile': return this.sendTo(p.id, { t: 'player_profile', profile: this.playerProfile(String(m.playerId), p.id) });
        case 'friend_request': return this.onFriendRequest(p, String(m.to));
        case 'friend_accept': return this.onFriendAccept(p, String(m.from));
        case 'friends': return this.sendFriends(p);
        case 'party_invite': return this.onPartyInvite(p, String(m.to));
        case 'party_accept': return this.onPartyAccept(p, String(m.from));
        case 'party_leave': return this.leaveParty(p);
        case 'challenge': return this.onChallenge(p, m);
        case 'challenge_respond': return this.races.respond(String(m.id), p.id, !!m.accept);
        case 'train_race': return this.onTrainRace(p, m);
        case 'vehicle_enter': return this.onVehicleEnter(p, String(m.id));
        case 'vehicle_exit': if (p.vehicleId) this.releaseVehicle(p); return;
        case 'wallet': return this.sendTo(p.id, { t: 'wallet', wallet: this.ledger.wallet(p.id), history: this.ledger.history(p.id, 15) });
        case 'leaderboard': return this.sendTo(p.id, { t: 'leaderboard', rows: this.store.leaderboard(20) });
        case 'appearance': {
          p.appearance = this.shop.validateAppearance(p.id, sanitizeAppearance(m.appearance));
          this.store.upsertProfile({ playerId: p.id, displayName: p.displayName, appearance: p.appearance, isGuest: p.isGuest });
          for (const o of this.players.values()) if (o.id !== p.id) this.sendTo(o.id, { t: 'appearance_of', playerId: p.id, appearance: p.appearance, displayName: p.displayName, isGuest: p.isGuest });
          return this.sendTo(p.id, { t: 'appearance_saved', appearance: p.appearance });
        }
        case 'emote': return this.broadcastNear(p, this.expressions.startEmote(p, m.id, { dir: m.dir, inRace: this.races.inCompetition(p.id) }));
        case 'emote_stop': { const ev = this.expressions.stopEmote(p); return ev && this.broadcastNear(p, ev); }
        case 'emoji': return this.broadcastNear(p, this.expressions.emoji(p, m.e));
        case 'emote_favorites': {
          const prefs = this.store.setPrefs(p.id, { emoteFavorites: this.expressions.sanitizeFavorites(m.ids) });
          return this.sendTo(p.id, { t: 'prefs', prefs });
        }
        case 'shop_buy': {
          if (m.autoTravel) {
            const it = this.shop.byId.get(String(m.itemId));
            const targetShop = it?.kind === 'vehicle' ? 'dealership' : 'wardrobe';
            if (!this.shop.nearShop(p, targetShop)) this.travelToPlace(p, targetShop);
          }
          const r = this.shop.buy(p, m.itemId, { reqId: m.reqId });
          return this.sendTo(p.id, { t: 'shop_result', ok: true, itemId: r.item.id, owned: this.shop.owned(p.id), wallet: this.ledger.wallet(p.id), consumables: r.consumables ?? undefined });
        }
        case 'consume': {
          const id = String(m.itemId);
          const have = this.store.consumablesOf(p.id)[id] ?? 0;
          if (have <= 0) throw new ShopError('Não tens este artigo no inventário.', 'none');
          const consumables = this.store.addConsumable(p.id, id, -1);
          this.store.audit('consume', { playerId: p.id, itemId: id });
          return this.sendTo(p.id, { t: 'inventory', consumables, used: id });
        }
        case 'vehicle_rent': {
          if (m.autoTravel && !this.shop.nearShop(p, 'rental')) this.travelToPlace(p, 'rental');
          const r = this.shop.rentVehicle(p, m.rentalId, this.now());
          const id = `rv_${p.id}`;
          const old = this.vehicles.get(id);
          if (old?.occupant && old.occupant !== p.id) throw new ShopError('O teu veículo alugado está em uso.', 'occupied');
          if (p.vehicleId === id) this.releaseVehicle(p);
          this.vehicles.set(id, { id, kind: r.def.vehicleClass, itemId: r.def.vehicleItemId, paint: null, rims: null, owner: p.id, rentalContract: r.contractId, x: RENTAL_SPAWN.x, z: RENTAL_SPAWN.z, heading: RENTAL_SPAWN.heading, occupant: null, usable: true });
          this.broadcastVehicles();
          return this.sendTo(p.id, { t: 'rental_result', ok: true, contractId: r.contractId, rentals: r.rentals, wallet: this.ledger.wallet(p.id), message: `${r.def.name} pronto à porta do Rent-a-Car (${r.def.durationMinutes} min).` });
        }
        case 'vehicle_return': {
          const r = this.shop.returnVehicle(p, m.contractId);
          const id = `rv_${p.id}`;
          if (p.vehicleId === id) this.releaseVehicle(p);
          if (this.vehicles.delete(id)) this.broadcastVehicles();
          return this.sendTo(p.id, { t: 'rental_result', ok: true, rentals: r.rentals, wallet: this.ledger.wallet(p.id), message: 'Veículo devolvido. Contrato encerrado.' });
        }
        case 'property_acquire': {
          if (m.autoTravel && !this.shop.nearShop(p, 'realestate')) this.travelToPlace(p, 'realestate');
          const r = this.shop.acquireProperty(p, m.propertyId, m.mode === 'rent' ? 'rent' : 'buy', this.now());
          return this.sendTo(p.id, { t: 'property_result', ok: true, properties: r.properties, wallet: this.ledger.wallet(p.id), message: `${r.mode === 'buy' ? 'Compraste' : 'Arrendaste'} ${r.prop.name}. As chaves são tuas!` });
        }
        case 'property_visit': {
          const prop = PROPERTIES_CATALOG.find((x) => x.id === String(m.propertyId));
          if (!prop) throw new ShopError('Imóvel inexistente.', 'unavailable');
          const mine = this.store.propertiesOf(p.id, this.now()).some((x) => x.propertyId === prop.id);
          if (!mine && !m.preview) throw new ShopError('Só podes entrar em imóveis que compraste ou arrendaste (ou pede uma visita na Imobiliária).', 'not_owner');
          this.teleport(p.id, prop.spawn[0], prop.spawn[1]);
          return this.sendTo(p.id, { t: 'correct', x: prop.spawn[0], z: prop.spawn[1], h: Math.PI / 2, diag: true });
        }
        case 'arena_state': return this.sendTo(p.id, { t: 'arena_overview', state: this.arena.publicState() });
        case 'arena_create': {
          this.assertArenaMode(m.mode, Number(m.stakeKz) || 0);
          const lobby = this.arena.createLobby(p, { mode: m.mode, centerId: m.centerId, stakeKz: m.stakeKz });
          this.broadcastArenaOverview();
          return this.sendTo(p.id, { t: 'system', text: `Desafio ${lobby.mode} criado (${lobby.stakeKz ? `${lobby.stakeKz} Kz demo` : 'gratuito'}). À espera de adversário…` });
        }
        case 'arena_join': {
          this.arena.joinLobby(p, m.lobbyId);
          return this.broadcastArenaOverview();
        }
        case 'arena_cancel': {
          for (const [id, l] of this.arena.lobbies) if (l.host.id === p.id) this.arena.lobbies.delete(id);
          return this.broadcastArenaOverview();
        }
        case 'arena_train': {
          this.assertArenaMode(m.mode, 0);
          if (p.vehicleId) this.releaseVehicle(p);
          this.arena.startInstantMatch(p, { mode: m.mode, botId: m.botId });
          return this.broadcastArenaOverview();
        }
        case 'arena_spectate': return void this.arena.spectate(p, m.matchId);
        case 'arena_action': return void this.arena.onAction(p.id, { action: String(m.action ?? 'strike') });
        case 'garage_spawn': {
          if (m.autoTravel && !this.shop.nearShop(p, 'garage')) this.travelToPlace(p, 'garage');
          return this.onGarageSpawn(p, m);
        }
        case 'travel': {
          this.travelToPlace(p, String(m.to));
          return;
        }
        case 'garage_prefs': {
          const cfg = this.shop.vehicleConfig(p.id, m.itemId, { paint: m.paint, rims: m.rims });
          const garage = { ...(this.store.getPrefs(p.id).garage ?? {}), [cfg.itemId]: { paint: cfg.paint, rims: cfg.rims } };
          return this.sendTo(p.id, { t: 'prefs', prefs: this.store.setPrefs(p.id, { garage }) });
        }
        case 'appearance_of': {
          const o = this.players.get(String(m.playerId)) ?? this.simCompetitors.find((sc) => sc.id === String(m.playerId));
          return o && this.sendTo(p.id, { t: 'appearance_of', playerId: o.id, appearance: o.appearance, displayName: o.displayName, isGuest: !!o.isGuest });
        }
        case 'npc_appearance': {
          const ids = Array.isArray(m.ids) ? m.ids.slice(0, 80) : [];
          const list = ids.map((id) => this.npcSim.publicProfile(String(id))).filter(Boolean);
          return this.sendTo(p.id, { t: 'npc_appearance', npcs: list });
        }
        case 'diag_time': {
          this.clock.diagnose({ hour: m.hour, speed: m.speed, reset: m.reset });
          const env = this.envMessage();
          for (const o of this.players.values()) this.sendTo(o.id, env);
          return;
        }
        case 'diag_teleport': {
          if (!this.env.development) throw new RaceError('Diagnóstico desactivado.', 'forbidden');
          const x = Math.max(ZONE_BOUNDS.minX + 1, Math.min(ZONE_BOUNDS.maxX - 1, Number(m.x) || 0));
          const z = Math.max(ZONE_BOUNDS.minZ + 1, Math.min(ZONE_BOUNDS.maxZ - 1, Number(m.z) || 0));
          this.teleport(p.id, x, z);
          return this.sendTo(p.id, { t: 'correct', x, z, h: Number(m.h) || 0, diag: true });
        }
        case 'diag_weather': {
          if (!this.env.development) throw new RaceError('Diagnóstico desactivado.', 'forbidden');
          this.weather.setTarget(String(m.preset), 20);
          if (m.instant) { this.weather.transitionStart = 0; this.weather.tick(); }
          return;
        }
        default:
      }
    } catch (e) {
      this.sendTo(p.id, { t: 'error', code: e.code ?? 'erro', message: e.message });
    }
  }

  onChat(p, m) {
    const text = String(m.text ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200);
    if (!text) return;
    const now = this.now();
    p.chatTimes = p.chatTimes.filter((t) => now - t < 10000);
    if (p.chatTimes.length >= 5) { this.sendTo(p.id, { t: 'error', code: 'chat_rate', message: 'Estás a enviar mensagens depressa demais.' }); return; }
    p.chatTimes.push(now);
    const scope = m.scope === 'party' && p.partyId ? 'party' : 'local';
    const msg = { t: 'chat', from: p.id, name: p.displayName, text, scope, at: now };
    for (const o of this.players.values()) {
      if (scope === 'party' ? o.partyId === p.partyId : Math.hypot(o.x - p.x, o.z - p.z) <= 45) this.sendTo(o.id, msg);
    }
  }

  async onTalk(p, m) {
    const npc = this.npcSim.npcs.get(String(m.npcId));
    if (!npc || !npc.visible) return this.sendTo(p.id, { t: 'npc_reply', npcId: m.npcId, text: null, error: 'Personagem indisponível.' });
    p.talkingTo = npc.id;
    npc.attention = p.id;
    npc.attentionUntil = this.now() + 8000;
    const v = this.clock.virtualNow();
    const w = this.weather.state;
    const res = await this.dialogue.talk({
      npc,
      player: { id: p.id, x: p.x, z: p.z, displayName: p.displayName },
      text: m.text,
      world: {
        virtualNow: v,
        clockText: formatClock(v),
        weather: w,
        weatherText: w.rain > 0.3 ? 'chuva' : w.fog > 0.4 ? 'neblina' : w.cloud > 0.6 ? 'nublado' : 'céu limpo',
        poiName: (id) => POI_NAME.get(id) ?? 'Kianda Centro',
      },
    });
    if (res.text) npc.bubble = { text: res.text, until: this.now() + 6000, toPlayer: p.id };
    this.sendTo(p.id, { t: 'npc_reply', npcId: npc.id, name: npc.def.name, text: res.text, source: res.source, error: res.error ?? null });
  }

  playerProfile(playerId, viewerId) {
    const prof = this.store.getProfile(playerId);
    if (!prof) return null;
    const friends = this.store.friendsOf(viewerId).find((f) => f.playerId === playerId);
    return {
      playerId, displayName: prof.displayName, isAI: false,
      label: prof.isGuest ? 'Visitante Online' : 'Jogador Online',
      online: this.players.has(playerId) || this.simCompetitors.some((sc) => sc.id === playerId),
      races: prof.races, wins: prof.wins, bestLapMs: prof.bestLapMs,
      history: this.store.racesOf(playerId, 10), friendship: friends?.status ?? null,
      appearance: prof.appearance,
    };
  }

  onFriendRequest(p, to) {
    if (to === p.id || !this.store.getProfile(to)) throw new RaceError('Jogador inválido.', 'bad_player');
    if (p.isGuest) throw new RaceError('Visitantes não podem adicionar amigos. Entra com a tua conta NgolaBiz.', 'guest');
    const st = this.store.requestFriend(p.id, to);
    this.sendTo(to, { t: 'friend_request', from: p.id, name: p.displayName });
    this.sendTo(p.id, { t: 'system', text: st === 'accepted' ? 'Já são amigos.' : 'Pedido de amizade enviado.' });
  }

  onFriendAccept(p, from) {
    if (!this.store.acceptFriend(p.id, from)) throw new RaceError('Pedido inexistente.', 'no_request');
    this.sendFriends(p);
    const o = this.players.get(from);
    if (o) { this.sendFriends(o); this.sendTo(from, { t: 'system', text: `${p.displayName} aceitou o teu pedido de amizade.` }); }
  }

  sendFriends(p) {
    const list = this.store.friendsOf(p.id).map((f) => ({ ...f, displayName: this.store.getProfile(f.playerId)?.displayName ?? f.playerId, online: this.players.has(f.playerId) }));
    this.sendTo(p.id, { t: 'friends', friends: list });
  }

  onPartyInvite(p, to) {
    const o = this.players.get(to);
    if (!o) throw new RaceError('Jogador offline.', 'offline');
    if (!p.partyId) {
      p.partyId = `party_${p.id}`;
      this.parties.set(p.partyId, { id: p.partyId, leader: p.id, members: new Set([p.id]), invites: new Set() });
    }
    const party = this.parties.get(p.partyId);
    if (party.members.size >= 6) throw new RaceError('Grupo cheio (máx. 6).', 'party_full');
    party.invites.add(to);
    this.sendTo(to, { t: 'party_invite', from: p.id, name: p.displayName });
  }

  onPartyAccept(p, from) {
    const leader = this.players.get(from);
    const party = leader?.partyId && this.parties.get(leader.partyId);
    if (!party || !party.invites.has(p.id)) throw new RaceError('Convite inexistente.', 'no_invite');
    if (p.partyId) this.leaveParty(p);
    party.invites.delete(p.id);
    party.members.add(p.id);
    p.partyId = party.id;
    this.sendParty(party);
  }

  leaveParty(p) {
    const party = this.parties.get(p.partyId);
    p.partyId = null;
    if (!party) return;
    party.members.delete(p.id);
    if (party.members.size <= 1) {
      for (const id of party.members) { const m = this.players.get(id); if (m) { m.partyId = null; this.sendTo(id, { t: 'party', party: null }); } }
      this.parties.delete(party.id);
    } else {
      if (party.leader === p.id) party.leader = [...party.members][0];
      this.sendParty(party);
    }
    this.sendTo(p.id, { t: 'party', party: null });
  }

  sendParty(party) {
    const view = { id: party.id, leader: party.leader, members: [...party.members].map((id) => ({ id, name: this.players.get(id)?.displayName ?? id })) };
    for (const id of party.members) this.sendTo(id, { t: 'party', party: view });
  }

  onChallenge(p, m) {
    if (!this.adminConfig.competitions.raceEnabled) throw new RaceError('Corridas desactivadas pelo administrador.', 'disabled');
    const stake = Number(m.stake) || 0;
    if (stake > 0 && !this.adminConfig.competitions.stakesEnabled) throw new RaceError('Entradas com saldo demo desactivadas.', 'disabled');
    const sim = this.simCompetitors.find((sc) => sc.id === String(m.to));
    if (sim) {
      if (p.vehicleId) this.releaseVehicle(p);
      const veh = ['car', 'moto'].includes(m.vehicle) ? m.vehicle : 'car';
      this.races.startTraining(p, { id: sim.id, name: sim.displayName, difficulty: 'media', vehicle: veh }, veh);
      return;
    }
    const to = this.players.get(String(m.to));
    if (!to) throw new RaceError('Jogador offline.', 'offline');
    if (Math.hypot(to.x - p.x, to.z - p.z) > 60) throw new RaceError('Aproxima-te do jogador para o desafiar (60 m).', 'far');
    this.races.challenge(p, to, { vehicle: m.vehicle, stake, trackId: String(m.trackId ?? 'circuito_anel_kianda') });
  }

  onTrainRace(p, m) {
    if (!this.adminConfig.competitions.raceEnabled) throw new RaceError('Corridas desactivadas pelo administrador.', 'disabled');
    const bot = this.adminConfig.competitions.trainingBots.find((b) => b.id === m.botId && b.enabled !== false);
    if (p.vehicleId) this.releaseVehicle(p);
    this.races.startTraining(p, bot, ['car', 'moto'].includes(m.vehicle) ? m.vehicle : 'car', String(m.trackId ?? 'circuito_anel_kianda'));
  }

  /** Difunde um evento aos jogadores próximos (incluindo o próprio). */
  broadcastNear(p, msg, radius = EMOTE_LIMITS.broadcastRadius) {
    for (const o of this.players.values()) if (Math.hypot(o.x - p.x, o.z - p.z) <= radius) this.sendTo(o.id, msg);
  }

  assertArenaMode(mode, stake) {
    const c = this.adminConfig.competitions;
    const flag = { combate_1v1: 'combatEnabled', tiro_1v1: 'shootingEnabled', sobrevivencia: 'survivalEnabled' }[mode];
    if (!flag) throw new ArenaError('Modo de competição inválido.', 'bad_mode');
    if (c[flag] === false) throw new ArenaError('Este modo está desactivado pelo administrador.', 'disabled');
    if (stake > 0 && !c.stakesEnabled) throw new ArenaError('Entradas com saldo demo desactivadas.', 'disabled');
  }

  broadcastArenaOverview() {
    const state = this.arena.publicState();
    for (const o of this.players.values()) this.sendTo(o.id, { t: 'arena_overview', state });
  }

  /** Deslocação rápida para lojas, casa, arena ou largo. */
  travelToPlace(p, place) {
    const DESTS = {
      wardrobe: { x: 16, z: -15, h: 0 },
      dealership: { x: 110, z: -34, h: 0 },
      garage: { x: 78, z: -17, h: 0 },
      market: { x: -34, z: -22, h: 0 },
      arena: { x: 18, z: 22, h: 0 },
      betting: { x: 30, z: 62, h: 0 },
      home: { x: -86, z: -15, h: 0 },
      plaza: { x: 0, z: -28, h: Math.PI },
      supermarket: { x: -100, z: -147, h: 0 },
      rental: { x: 160, z: -30, h: -Math.PI / 2 },
      realestate: { x: -4, z: -147, h: 0 },
      dealership2: { x: 160, z: -83, h: -Math.PI / 2 },
      combat: { x: -23, z: 147, h: Math.PI },
      shooting: { x: 26, z: 147, h: Math.PI },
      race_center: { x: 135, z: 147, h: Math.PI },
      maianga: { x: -170, z: 0, h: 0 },
      talatona: { x: 0, z: 160, h: Math.PI },
      industrial: { x: 170, z: 0, h: 0 },
      marginal: { x: 0, z: -160, h: 0 },
    };
    const d = DESTS[place];
    if (!d) return;
    this.teleport(p.id, d.x, d.z);
    p.h = d.h;
    this.sendTo(p.id, { t: 'correct', x: d.x, z: d.z, h: d.h, diag: true });
  }

  /** Levantar um veículo próprio na garagem (um veículo pessoal por jogador). */
  onGarageSpawn(p, m) {
    if (!this.shop.nearShop(p, 'garage')) throw new RaceError(`Vai a ${SHOP_LOCATIONS.garage.name} para levantar o veículo.`, 'far');
    const prefs = this.store.getPrefs(p.id).garage?.[m.itemId] ?? {};
    const cfg = this.shop.vehicleConfig(p.id, m.itemId, { paint: m.paint ?? prefs.paint, rims: m.rims ?? prefs.rims });
    const id = `pv_${p.id}`;
    const old = this.vehicles.get(id);
    if (old?.occupant && old.occupant !== p.id) throw new RaceError('O teu veículo está em uso.', 'occupied');
    if (p.vehicleId === id) this.releaseVehicle(p);
    this.vehicles.set(id, { id, kind: cfg.kind, itemId: cfg.itemId, paint: cfg.paint, rims: cfg.rims, owner: p.id, x: GARAGE_SPAWN.x, z: GARAGE_SPAWN.z, heading: GARAGE_SPAWN.heading, occupant: null, usable: true });
    this.broadcastVehicles();
    this.sendTo(p.id, { t: 'system', text: 'O teu veículo está à porta da Garagem Kalunga Motors.' });
  }

  onVehicleEnter(p, id) {
    const v = this.vehicles.get(id);
    if (!v) throw new RaceError('Veículo inexistente.', 'no_vehicle');
    if (v.owner && v.owner !== p.id) throw new RaceError('Este veículo pertence a outro jogador.', 'not_owner');
    if (v.occupant && v.occupant !== p.id) throw new RaceError('Veículo ocupado.', 'occupied');
    if (Math.hypot(v.x - p.x, v.z - p.z) > 7.5) throw new RaceError('Aproxima-te do veículo.', 'far');
    if (p.vehicleId && p.vehicleId !== id) this.releaseVehicle(p);
    v.occupant = p.id;
    p.vehicleId = id;
    p.vehicle = v.kind;
    p.vehicleItem = v.itemId ?? null;
    p.vehiclePaint = v.paint ?? null;
    p.inVehicle = true;
    const ev = this.expressions.stopEmote(p);
    if (ev) this.broadcastNear(p, ev);
    this.sendTo(p.id, { t: 'vehicle_ok', id, kind: v.kind, x: v.x, z: v.z, heading: v.heading, itemId: v.itemId ?? null, paint: v.paint ?? null, rims: v.rims ?? null });
    this.broadcastVehicles();
  }

  // ------------------------------------------------------------- admin
  getAdminConfig() { return this.adminConfig; }

  updateAdminConfig(patch) {
    const before = this.adminConfig;
    const next = mergeAdminConfig(before, patch);
    // validações
    next.population.count = Math.max(0, Math.min(400, Number(next.population.count) || 0));
    next.simulation.maxActivePerZone = Math.max(0, Math.min(400, Number(next.simulation.maxActivePerZone) || 0));
    if (!['full', 'routine_only', 'static'].includes(next.simulation.autonomy)) next.simulation.autonomy = 'full';
    next.competitions.feePct = Math.max(0, Math.min(30, Number(next.competitions.feePct) || 0));
    if (!['active', 'maintenance', 'inactive'].includes(next.zone.status)) next.zone.status = 'active';
    if (next.clock.mode === 'fixed') next.clock.mode = before.clock.mode;
    this.adminConfig = next;
    this.store.setJSON('admin_config', next);

    if (JSON.stringify(before.population) !== JSON.stringify(next.population)) this.npcSim.setPopulation(this.buildPopulation());
    Object.assign(this.npcSim.config, next.simulation);
    this.dialogue.configure(next.dialogue);
    this.expressions.setOverrides(next.emotes.overrides);
    this.shop.setOverrides(next.catalog.overrides);
    this.traffic.configure(next.traffic);
    this.weather.configure(next.weather);
    if (JSON.stringify(before.clock) !== JSON.stringify(next.clock)) this.clock.configure(next.clock);
    this.ledger.feePct = next.competitions.feePct;
    this.races.config.feePct = next.competitions.feePct;
    this.arena.config.feePct = next.competitions.feePct;
    this.store.audit('admin_config', { sections: Object.keys(patch ?? {}) });
    return next;
  }

  adminMetrics() {
    const mem = process.memoryUsage();
    return {
      uptimeSec: Math.round((this.now() - this.metrics.startedAt) / 1000),
      players: this.players.size,
      tick: { avgMs: Math.round(this.metrics.tickMs * 100) / 100, maxMs: Math.round(this.metrics.maxTickMs * 100) / 100, count: this.metrics.ticks },
      npc: { total: this.npcSim.npcs.size, ...this.npcSim.metrics },
      traffic: { cars: this.traffic.cars.length, closure: this.traffic.closure },
      dialogue: this.dialogue.publicMetrics(),
      races: this.races.publicState(),
      arena: (() => { const s = this.arena.publicState(); return { openLobbies: s.openLobbies.length, activeMatches: s.activeMatches.length, feePct: s.feePct, recent: s.recentResults.slice(0, 5) }; })(),
      centers: Object.keys(COMPETITION_CENTERS),
      process: { rssMb: Math.round(mem.rss / 1048576), heapMb: Math.round(mem.heapUsed / 1048576), cpuPct: this.metrics.cpuPct },
      network: { bytesOut: this.metrics.bytesOut, msgsIn: this.metrics.msgsIn },
      clock: this.clock.publicState(),
      weather: this.weather.publicState(),
    };
  }
}
