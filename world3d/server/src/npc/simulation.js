/**
 * Simulação autónoma dos NPCs habitantes com níveis de detalhe (LOD de IA).
 *
 *  near    (< nearRadius de um jogador, ou em interacção): todos os ticks; reacções,
 *          espera em passadeiras, conversas entre NPCs, olhar/acenar ao jogador.
 *  mid     (< midRadius): 1 em cada `midEvery` ticks; segue rotinas e caminhos.
 *  far     (resto): 1 em cada `farEvery` ticks; avanço grosseiro ao longo do caminho.
 *  dormant (a dormir/em casa/a conduzir): só reavalia a rotina de minuto a minuto.
 *
 * Nenhum modelo de linguagem é usado aqui: rotinas, navegação e decisões são
 * determinísticas e locais. O diálogo IA é um serviço à parte (dialogue/gateway.js).
 */
import { makeRng, hashString } from '../../../shared/rng.js';
import { POIS, PATROL_ROUTES, trafficLightState, RACE_TRACK } from '../../../shared/zone.js';
import { localParts } from '../../../shared/time.js';
import { ARCHETYPES } from './archetypes.js';

const POI_BY_ID = new Map(POIS.map((p) => [p.id, p]));
const POIS_BY_TYPE = POIS.reduce((m, p) => { (m[p.type] ||= []).push(p); return m; }, {});
const OUTDOOR_TYPES = new Set(['plaza', 'park', 'bench', 'arena', 'challenge_board', 'event_stage']);
const SHELTER_TYPES = ['cafe', 'restaurant', 'shop_floor', 'bus_stop', 'shop', 'hotel'];
const HIDDEN_MODES = new Set(['sleep', 'home', 'drive']);

export const DEFAULT_SIM_CONFIG = {
  tickHz: 10,
  nearRadius: 45,
  midRadius: 140,
  midEvery: 5,
  farEvery: 50,
  interestRadius: 170,
  maxActivePerZone: 120,
  reactionRadius: 3.2,
  autonomy: 'full', // 'full' | 'routine_only' | 'static'
  minDwellRealSec: 20,
  maxDwellRealSec: 360,
  ambientChatter: true,
};

export function isOpen(poi, hour) {
  if (!poi?.openHours) return true;
  const [a, b] = poi.openHours;
  if (a === 0 && b === 24) return true;
  return b > a ? hour >= a && hour < b : hour >= a || hour < b;
}

export function routineSlot(def, hour) {
  const h = ((hour + def.scheduleJitterH) % 24 + 24) % 24;
  for (const s of def.routine) if (h >= s.from && h < s.to) return s;
  return def.routine[def.routine.length - 1];
}

export class NpcSimulation {
  constructor({ graph, population, config = {}, clock, weather = null, traffic = null, hooks = {} }) {
    this.graph = graph;
    this.clock = clock;
    this.weather = weather;
    this.traffic = traffic;
    this.hooks = hooks; // { onPlayerApproach(npc, player) -> string|null, ambientLine(npc, partner) -> string }
    this.config = { ...DEFAULT_SIM_CONFIG, ...config };
    this.tickCount = 0;
    this.events = [];
    this.metrics = { lastTickMs: 0, avgTickMs: 0, tiers: { near: 0, mid: 0, far: 0, dormant: 0 }, updatesLastTick: 0, pathFailures: 0 };
    this.npcs = new Map();
    this.setPopulation(population);
  }

  setPopulation(population) {
    const next = new Map();
    for (const def of population) {
      const prev = this.npcs.get(def.id);
      next.set(def.id, prev ? Object.assign(prev, { def }) : this.spawn(def));
    }
    this.npcs = next;
  }

  spawn(def) {
    const home = POI_BY_ID.get(def.homePoiId);
    const rng = makeRng(hashString(def.id));
    return {
      def,
      id: def.id,
      x: home.x + rng.range(-1, 1),
      z: home.z + rng.range(-1, 1),
      heading: 0,
      speed: 0,
      anim: 'idle',
      mode: null,
      slotKey: null,
      visible: false,
      tier: 'dormant',
      path: null,
      pathIdx: 0,
      targetPoiId: null,
      dwellUntil: 0,
      laneOffset: rng.range(-0.9, 0.9),
      rng,
      attention: null,
      attentionUntil: 0,
      greeted: new Map(),
      chatPartner: null,
      chatUntil: 0,
      bubble: null,
      waitingCrosswalk: false,
      patrolIdx: 0,
      lastSpectateEvent: null,
      status: def.status,
      vehicleId: null,
    };
  }

  /** Evento de mundo (ex.: corrida a começar) a que NPCs curiosos podem reagir. */
  pushEvent(evt) {
    this.events.push({ ...evt, at: Date.now() });
    if (this.events.length > 20) this.events.shift();
  }

  tierFor(npc, players) {
    if (!npc.visible) return 'dormant';
    if (npc.attention || npc.chatPartner) return 'near';
    let best = Infinity;
    for (const p of players) {
      const d = Math.hypot(p.x - npc.x, p.z - npc.z);
      if (d < best) best = d;
    }
    if (best < this.config.nearRadius) return 'near';
    if (best < this.config.midRadius) return 'mid';
    return 'far';
  }

  tick(realNow, players = []) {
    const t0 = performance.now();
    this.tickCount++;
    const dtTick = 1 / this.config.tickHz;
    const vNow = this.clock.virtualNow(realNow);
    const hour = localParts(vNow).hourFloat;
    const tiers = { near: 0, mid: 0, far: 0, dormant: 0 };
    let updates = 0;
    let visibleActive = 0;

    for (const npc of this.npcs.values()) {
      if (npc.def.status !== 'active') { npc.visible = false; npc.mode = 'inactive'; continue; }
      const tier = this.tierFor(npc, players);
      npc.tier = tier;
      tiers[tier]++;
      if (tier === 'dormant') {
        // dormentes: verificação barata da rotina (1 Hz); só acordam quando o bloco horário muda
        if (npc.mode !== null && (this.tickCount + npc.def.index) % this.config.tickHz !== 0) continue;
        const slot = routineSlot(npc.def, hour);
        if (npc.mode !== null && `${slot.from}-${slot.mode}` === npc.slotKey && !(npc.mode === 'drive' && !npc.vehicleId)) continue;
      } else {
        const every = tier === 'near' ? 1 : tier === 'mid' ? this.config.midEvery : this.config.farEvery;
        if ((this.tickCount + npc.def.index) % every !== 0) continue;
      }
      const every = tier === 'near' ? 1 : tier === 'mid' ? this.config.midEvery : tier === 'far' ? this.config.farEvery : this.config.tickHz;
      const dt = Math.min(every * dtTick, 8);
      this.update(npc, dt, { realNow, hour, players, tier });
      updates++;
      if (npc.visible) visibleActive++;
      // limite de NPCs visíveis por zona (orçamento de desempenho)
      if (visibleActive > this.config.maxActivePerZone && tier !== 'near') npc.visible = false;
    }
    const ms = performance.now() - t0;
    this.metrics.lastTickMs = ms;
    this.metrics.avgTickMs = this.metrics.avgTickMs * 0.95 + ms * 0.05;
    this.metrics.tiers = tiers;
    this.metrics.updatesLastTick = updates;
  }

  update(npc, dt, ctx) {
    const { realNow, hour, players, tier } = ctx;
    const autonomy = this.config.autonomy;
    if (autonomy === 'static') { npc.visible = true; npc.anim = 'idle'; return; }

    const slot = routineSlot(npc.def, hour);
    const slotKey = `${slot.from}-${slot.mode}`;
    if (slotKey !== npc.slotKey) {
      npc.slotKey = slotKey;
      this.enterMode(npc, slot, hour);
    }

    // reacções a eventos e ao clima (só com autonomia completa)
    if (autonomy === 'full') {
      this.reactToWeather(npc, hour);
      this.reactToEvents(npc);
    }

    // atenção a um jogador próximo (pausa o movimento, vira-se, acena)
    if (tier === 'near' && autonomy === 'full' && !HIDDEN_MODES.has(npc.mode)) {
      this.handlePlayerAttention(npc, players, realNow);
    }
    if (npc.attention) {
      npc.speed = 0;
      if (npc.anim !== 'wave' || realNow > npc.attentionUntil - 1500) npc.anim = npc.anim === 'sit' ? 'sit' : 'talk_idle';
      return;
    }

    if (npc.path) {
      this.followPath(npc, dt, realNow, tier);
      return;
    }

    // chegou ao destino
    switch (npc.mode) {
      case 'sleep':
      case 'home':
        npc.visible = false;
        npc.anim = 'idle';
        break;
      case 'drive':
        if (!npc.vehicleId && this.traffic) npc.vehicleId = this.traffic.assignDriver(npc);
        npc.visible = !npc.vehicleId;
        if (!npc.vehicleId) this.planRoam(npc, hour, realNow);
        break;
      case 'work':
        this.doWork(npc, realNow, hour);
        break;
      case 'patrol':
        this.nextPatrolPoint(npc);
        break;
      default:
        if (realNow >= npc.dwellUntil) this.planRoam(npc, hour, realNow);
        else this.maybeChat(npc, realNow, tier);
    }
  }

  enterMode(npc, slot, hour) {
    const prevMode = npc.mode;
    npc.mode = slot.mode;
    npc.slot = slot;
    npc.dwellUntil = 0;
    this.endChat(npc);
    if (prevMode === 'drive' && npc.vehicleId && this.traffic) {
      const pos = this.traffic.releaseDriver(npc.id);
      if (pos) { npc.x = pos.x; npc.z = pos.z; }
      npc.vehicleId = null;
    }
    if (HIDDEN_MODES.has(prevMode) || prevMode === null) {
      // sai de casa: aparece à porta
      const home = POI_BY_ID.get(npc.def.homePoiId);
      if (!npc.visible && home && prevMode !== 'drive') { npc.x = home.x; npc.z = home.z; }
    }
    switch (slot.mode) {
      case 'sleep':
      case 'home':
        npc.visible = npc.visible && prevMode !== null; // no arranque já está em casa
        if (prevMode === null) { npc.visible = false; npc.path = null; return; }
        this.goTo(npc, npc.def.homePoiId);
        return;
      case 'drive':
        npc.visible = true;
        this.goTo(npc, POIS_BY_TYPE.parking?.[0]?.id ?? npc.def.homePoiId);
        return;
      case 'work': {
        npc.visible = true;
        const wp = POI_BY_ID.get(npc.def.workplacePoiId);
        if (wp && isOpen(wp, hour + 0.5)) this.goTo(npc, wp.id);
        else this.planRoam(npc, hour, Date.now());
        return;
      }
      case 'patrol': {
        npc.visible = true;
        const wp = npc.def.workplacePoiId ?? '';
        npc.patrolRoute = wp.includes('arena') ? 'arena' : npc.def.index % 2 ? 'avenida' : 'largo';
        npc.patrolIdx = 0;
        this.nextPatrolPoint(npc);
        return;
      }
      default:
        npc.visible = true;
        npc.path = null;
    }
  }

  goTo(npc, poiId) {
    const poi = POI_BY_ID.get(poiId);
    if (!poi) return false;
    return this.goToPoint(npc, poi.x, poi.z, poi);
  }

  goToPoint(npc, x, z, poi = null) {
    const g = this.graph;
    const from = g.nearestNode(npc.x, npc.z, (n) => !n.indoor || (poi && n.buildingId === poi.buildingId) || n.buildingId === npc.insideBuildingId);
    const toId = poi ? g.poiNodes.get(poi.id) : g.nearestNode(x, z)?.id;
    if (!from || toId == null) { this.metrics.pathFailures++; return false; }
    const path = g.findPath(from.id, toId);
    if (!path) { this.metrics.pathFailures++; return false; }
    npc.path = path;
    npc.pathIdx = 0;
    npc.targetPoiId = poi?.id ?? null;
    npc.visible = true;
    return true;
  }

  followPath(npc, dt, realNow, tier) {
    const g = this.graph;
    let remaining = dt;
    const raining = (this.weather?.state?.rain ?? 0) > 0.35;
    const outdoorsRun = raining && npc.def.appearance.ageGroup !== 'senior' && npc.def.personality.traits.energy > 0.5;
    const speed = npc.def.appearance.walkSpeed * (outdoorsRun ? 2.1 : 1) * (npc.mode === 'patrol' ? 0.8 : 1);
    npc.anim = outdoorsRun ? 'run' : 'walk';
    while (remaining > 0 && npc.path) {
      const nodeId = npc.path[npc.pathIdx];
      const node = g.nodes[nodeId];
      const prevNode = npc.pathIdx > 0 ? g.nodes[npc.path[npc.pathIdx - 1]] : null;
      // deslocamento lateral para os peões não andarem todos na mesma linha
      let tx = node.x;
      let tz = node.z;
      if (prevNode && node.kind !== 'poi' && node.kind !== 'indoor' && node.kind !== 'door') {
        const ex = node.x - prevNode.x;
        const ez = node.z - prevNode.z;
        const len = Math.hypot(ex, ez) || 1;
        tx += (-ez / len) * npc.laneOffset;
        tz += (ex / len) * npc.laneOffset;
      }
      // passadeira: esperar pelo semáforo / por carros (só no nível "near")
      if (tier === 'near' && prevNode && npc.pathIdx > 0) {
        const edge = g.edge(prevNode.id, node.id);
        if (edge?.crosswalk && Math.hypot(npc.x - prevNode.x, npc.z - prevNode.z) < 1.2 && !this.canCross(edge, prevNode, node, realNow)) {
          npc.speed = 0;
          npc.anim = 'idle';
          npc.waitingCrosswalk = true;
          return;
        }
      }
      npc.waitingCrosswalk = false;
      const dx = tx - npc.x;
      const dz = tz - npc.z;
      const dist = Math.hypot(dx, dz);
      const step = speed * remaining;
      if (dist > 1e-3) npc.heading = Math.atan2(dx, dz);
      if (step >= dist) {
        npc.x = tx;
        npc.z = tz;
        remaining -= dist / speed;
        npc.pathIdx++;
        if (node.kind === 'indoor') npc.insideBuildingId = node.buildingId;
        else if (node.kind === 'door' || node.kind === 'sidewalk' || node.kind === 'ground') npc.insideBuildingId = null;
        if (npc.pathIdx >= npc.path.length) {
          npc.path = null;
          npc.speed = 0;
          npc.anim = 'idle';
          this.onArrive(npc, realNow);
          return;
        }
      } else {
        npc.x += (dx / dist) * step;
        npc.z += (dz / dist) * step;
        remaining = 0;
      }
    }
    npc.speed = speed;
  }

  canCross(edge, a, b, realNow) {
    if (edge.lightId) {
      const s = trafficLightState(realNow, edge.lightId, this.traffic?.lightOverride?.(edge.lightId));
      return edge.crossesAxis === 'NS' ? s.ns === 'red' : s.ew === 'red';
    }
    if (!this.traffic) return true;
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    return !this.traffic.anyCarNear(mx, mz, 11);
  }

  onArrive(npc, realNow) {
    const poi = POI_BY_ID.get(npc.targetPoiId);
    if (poi?.type === 'bench') {
      npc.anim = 'sit';
      npc.heading = poi.angle ?? npc.heading;
    } else if (npc.mode === 'work') {
      npc.anim = 'work';
      if (poi?.type === 'shop_counter') npc.heading = 0; // virado para a entrada (Sul)
    } else if (poi?.type === 'plaza' || poi?.type === 'park') {
      npc.anim = 'idle';
    }
    if (npc.mode === 'roam' || npc.mode === 'spectate') {
      const vRate = Math.max(1, this.clock.rate);
      const dwellVirtualMin = 10 + npc.rng.next() * 35;
      const real = Math.min(this.config.maxDwellRealSec, Math.max(this.config.minDwellRealSec, (dwellVirtualMin * 60) / vRate));
      npc.dwellUntil = realNow + real * 1000;
    }
    if (poi?.indoor || poi?.type === 'home') {
      // dentro de casa deixa de ser replicado; nas lojas continua visível (interior acessível)
      if (poi.type === 'home') npc.visible = false;
    }
  }

  doWork(npc, realNow, hour) {
    const wp = POI_BY_ID.get(npc.def.workplacePoiId);
    if (wp && !isOpen(wp, hour)) { this.planRoam(npc, hour, realNow); return; }
    if (['plaza', 'park', 'arena'].includes(wp?.type) && realNow >= npc.dwellUntil) {
      // animadores circulam dentro da sua área de trabalho
      const ang = npc.rng.next() * Math.PI * 2;
      const r = 4 + npc.rng.next() * 8;
      npc.dwellUntil = realNow + (25 + npc.rng.next() * 40) * 1000;
      this.goToPoint(npc, wp.x + Math.cos(ang) * r, wp.z + Math.sin(ang) * r);
      npc.targetPoiId = null;
      return;
    }
    npc.anim = npc.anim === 'sit' ? 'sit' : 'work';
    this.maybeChat(npc, realNow, npc.tier);
  }

  nextPatrolPoint(npc) {
    const route = PATROL_ROUTES[npc.patrolRoute ?? 'largo'];
    const [x, z] = route[npc.patrolIdx % route.length];
    npc.patrolIdx++;
    this.goToPoint(npc, x, z);
  }

  /** Escolha de destino de lazer: pesos da rotina × preferências × clima × horários. */
  planRoam(npc, hour, realNow) {
    const slot = npc.slot ?? routineSlot(npc.def, hour);
    let options = (slot.options ?? [['plaza', 1], ['park', 1]]).map(([t, w]) => [t, w]);
    const fav = npc.def.personality.preferences.favouritePlace;
    options = options.map(([t, w]) => [t, t === fav ? w * 2 : w]);
    // passeio: NPCs com energia caminham mais
    options.push(['stroll', 1 + npc.def.personality.traits.energy * 2]);
    const rain = this.weather?.state?.rain ?? 0;
    if (rain > 0.35) {
      options = options.filter(([t]) => !OUTDOOR_TYPES.has(t) && t !== 'stroll');
      if (!options.length) options = SHELTER_TYPES.map((t) => [t, 1]);
    }
    for (let attempt = 0; attempt < 6; attempt++) {
      const type = npc.rng.weighted(options);
      if (type === 'stroll') {
        const n = this.graph.nodes[Math.floor(npc.rng.next() * this.graph.nodes.length)];
        if (n.kind === 'sidewalk' || n.kind === 'path') {
          if (this.goToPoint(npc, n.x, n.z)) { npc.targetPoiId = null; npc.dwellUntil = realNow + 5000; return; }
        }
        continue;
      }
      if (type === 'home') { if (this.goTo(npc, npc.def.homePoiId)) return; continue; }
      const cands = (POIS_BY_TYPE[type] || []).filter((p) => isOpen(p, hour) && !p.private);
      if (!cands.length) continue;
      const poi = cands[Math.floor(npc.rng.next() * cands.length)];
      if (this.goTo(npc, poi.id)) return;
    }
    npc.dwellUntil = realNow + 15000;
  }

  reactToWeather(npc, hour) {
    const rain = this.weather?.state?.rain ?? 0;
    const poi = POI_BY_ID.get(npc.targetPoiId);
    if (rain > 0.45 && npc.mode === 'roam' && !npc.shelterSought && (OUTDOOR_TYPES.has(poi?.type) || !npc.targetPoiId)) {
      npc.shelterSought = true;
      this.endChat(npc);
      npc.dwellUntil = 0;
      npc.path = null;
      this.planRoam(npc, hour, Date.now());
    } else if (rain < 0.2) {
      npc.shelterSought = false;
    }
  }

  reactToEvents(npc) {
    const evt = this.events.at(-1);
    if (!evt || evt.type !== 'race_start' || npc.lastSpectateEvent === evt.id) return;
    if (npc.mode !== 'roam' || npc.def.personality.traits.curiosity < 0.45) return;
    if (Date.now() - evt.at > 60000) return;
    npc.lastSpectateEvent = evt.id;
    const [sx, sz] = RACE_TRACK.checkpoints[npc.def.index % RACE_TRACK.checkpoints.length];
    if (Math.hypot(sx - npc.x, sz - npc.z) > 130) return;
    // ver a corrida do passeio junto ao circuito
    const side = sz < -80 || sz > 80 ? [0, sz < 0 ? -7 : 7] : [sx < 0 ? -7 : 7, 0];
    if (this.goToPoint(npc, sx + side[0], sz + side[1])) {
      npc.mode = 'spectate';
      npc.targetPoiId = null;
    }
  }

  handlePlayerAttention(npc, players, realNow) {
    if (npc.attention) {
      const p = players.find((pp) => pp.id === npc.attention);
      if (!p || Math.hypot(p.x - npc.x, p.z - npc.z) > this.config.reactionRadius * 2 || (realNow > npc.attentionUntil && !p.talkingTo)) {
        npc.attention = null;
        npc.bubble = null;
        if (npc.anim === 'talk_idle' || npc.anim === 'wave') npc.anim = 'idle';
      } else {
        npc.heading = Math.atan2(p.x - npc.x, p.z - npc.z);
        if (p.talkingTo === npc.id) npc.attentionUntil = realNow + 4000;
      }
      return;
    }
    for (const p of players) {
      if (p.inVehicle) continue;
      const d = Math.hypot(p.x - npc.x, p.z - npc.z);
      if (d > this.config.reactionRadius && p.talkingTo !== npc.id) continue;
      npc.attention = p.id;
      npc.attentionUntil = realNow + 3500;
      npc.heading = Math.atan2(p.x - npc.x, p.z - npc.z);
      const last = npc.greeted.get(p.id) ?? 0;
      if (realNow - last > 120000) {
        npc.greeted.set(p.id, realNow);
        if (npc.anim !== 'sit') npc.anim = 'wave';
        const line = this.hooks.onPlayerApproach?.(npc, p) ?? null;
        if (line) npc.bubble = { text: line, until: realNow + 4000, toPlayer: p.id };
      }
      return;
    }
  }

  maybeChat(npc, realNow, tier) {
    if (npc.chatPartner) {
      if (realNow > npc.chatUntil) { this.endChat(npc); return; }
      if (tier === 'near' && this.config.ambientChatter && (!npc.bubble || realNow > npc.bubble.until + 3000) && npc.rng.chance(0.25)) {
        const partner = this.npcs.get(npc.chatPartner);
        const line = this.hooks.ambientLine?.(npc, partner);
        if (line) npc.bubble = { text: line, until: realNow + 3500 };
      }
      return;
    }
    if (!npc.def.personality.preferences.likesTalking || npc.rng.next() > 0.08) return;
    for (const other of this.npcs.values()) {
      if (other === npc || other.chatPartner || other.path || !other.visible || other.attention) continue;
      if (Math.hypot(other.x - npc.x, other.z - npc.z) > 3.2) continue;
      if (!other.def.personality.preferences.likesTalking && npc.rng.next() > 0.3) continue;
      const until = realNow + (20 + npc.rng.next() * 70) * 1000;
      npc.chatPartner = other.id; npc.chatUntil = until;
      other.chatPartner = npc.id; other.chatUntil = until;
      npc.heading = Math.atan2(other.x - npc.x, other.z - npc.z);
      other.heading = Math.atan2(npc.x - other.x, npc.z - other.z);
      if (npc.anim !== 'sit') npc.anim = 'talk';
      if (other.anim !== 'sit') other.anim = 'talk';
      return;
    }
  }

  endChat(npc) {
    if (!npc.chatPartner) return;
    const other = this.npcs.get(npc.chatPartner);
    npc.chatPartner = null;
    if (npc.anim === 'talk') npc.anim = 'idle';
    if (other && other.chatPartner === npc.id) {
      other.chatPartner = null;
      if (other.anim === 'talk') other.anim = 'idle';
    }
  }

  /** NPCs visíveis num raio (interest management) — estado compacto para a rede. */
  snapshotFor(x, z, radius = this.config.interestRadius, realNow = Date.now(), viewerId = null) {
    const out = [];
    for (const npc of this.npcs.values()) {
      if (!npc.visible || npc.def.status !== 'active') continue;
      if (Math.hypot(npc.x - x, npc.z - z) > radius) continue;
      const s = {
        id: npc.id,
        x: Math.round(npc.x * 100) / 100,
        z: Math.round(npc.z * 100) / 100,
        h: Math.round(npc.heading * 100) / 100,
        a: npc.anim,
        s: Math.round(npc.speed * 100) / 100,
      };
      // falas dirigidas a um jogador (que podem conter o nome que ele indicou) só lhe são enviadas a ele
      if (npc.bubble && realNow < npc.bubble.until) s.b = !npc.bubble.toPlayer || npc.bubble.toPlayer === viewerId ? npc.bubble.text : '…';
      out.push(s);
    }
    return out;
  }

  /** Identidade pública de um NPC (sem dados internos de rotina nem memória). */
  publicProfile(id) {
    const npc = this.npcs.get(id);
    if (!npc) return null;
    const d = npc.def;
    return {
      id: d.id,
      name: d.name,
      isAI: true,
      label: 'Personagem controlada por IA',
      role: d.role,
      archetype: d.archetype,
      appearance: d.appearance,
      bio: d.personality.bio,
      speechRegister: d.personality.preferences.speechRegister,
    };
  }

  /** Estado detalhado para o painel administrativo. */
  adminState() {
    return [...this.npcs.values()].map((n) => ({
      id: n.id, name: n.def.name, archetype: n.def.archetype, status: n.def.status, mode: n.mode, anim: n.anim,
      tier: n.tier, visible: n.visible, x: Math.round(n.x), z: Math.round(n.z), target: n.targetPoiId,
      workplace: n.def.workplacePoiId, home: n.def.homePoiId, vehicle: n.vehicleId,
    }));
  }

  setNpcStatus(id, status) {
    const npc = this.npcs.get(id);
    if (!npc || !['active', 'inactive', 'maintenance'].includes(status)) return false;
    npc.def.status = status;
    if (status !== 'active') {
      npc.visible = false;
      if (npc.vehicleId && this.traffic) { this.traffic.releaseDriver(npc.id); npc.vehicleId = null; }
    } else {
      npc.slotKey = null;
    }
    return true;
  }
}

export { ARCHETYPES };
