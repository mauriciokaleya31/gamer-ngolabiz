/**
 * Actores replicados: outros jogadores, NPCs habitantes (IA), carros de trânsito,
 * bots de treino e veículos estacionados utilizáveis. Interpolação temporal sobre
 * os snapshots do servidor, LOD de modelos e etiquetas de identidade.
 */
import * as THREE from 'three';
import { HumanoidLOD } from './humanoid.js';
import { Humanoid3 } from './character/humanoid3.js';
import { emoteAnimation } from './character/emoteAnimations.js';
import { createVehicle, trafficVehicle } from './vehicles2.js';

const INTERP_DELAY = 150;

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

class Buffer {
  constructor() { this.s = []; }
  push(t, st) { this.s.push([t, st]); if (this.s.length > 30) this.s.shift(); }
  sample(t) {
    const s = this.s;
    if (!s.length) return null;
    if (t <= s[0][0]) return s[0][1];
    for (let i = s.length - 1; i >= 0; i--) {
      if (s[i][0] <= t) {
        const a = s[i];
        const b = s[i + 1];
        if (!b) return a[1];
        const k = (t - a[0]) / Math.max(1, b[0] - a[0]);
        return { ...b[1], x: a[1].x + (b[1].x - a[1].x) * k, z: a[1].z + (b[1].z - a[1].z) * k, y: (a[1].y ?? 0) + ((b[1].y ?? 0) - (a[1].y ?? 0)) * k, h: lerpAngle(a[1].h, b[1].h, k) };
      }
    }
    return s[0][1];
  }
}

export class Actors {
  constructor(scene, { quality, net, groundHeightAt, tagsEl }) {
    this.scene = scene;
    this.quality = quality;
    this.net = net;
    this.groundHeightAt = groundHeightAt;
    this.tagsEl = tagsEl;
    this.players = new Map();
    this.npcs = new Map();
    this.cars = new Map();
    this.bots = new Map();
    this.parked = new Map();
    this.npcProfiles = new Map();
    this.playerAppearances = new Map();
    this.pendingNpc = new Set();
    this.lightsSnapshot = null;
    this.localId = null;
    net.on('snap', (m) => this.onSnap(m));
    net.on('npc_appearance', (m) => { for (const p of m.npcs) { this.npcProfiles.set(p.id, p); this.pendingNpc.delete(p.id); const n = this.npcs.get(p.id); if (n) this.rebuildNpc(n); } });
    net.on('appearance_of', (m) => { this.playerAppearances.set(m.playerId, m); const p = this.players.get(m.playerId); if (p) this.rebuildPlayer(p); });
    net.on('vehicles', (m) => this.setParked(m.vehicles));
    net.on('emote', (m) => this.onEmote(m));
    net.on('emote_stop', (m) => { const a = this.players.get(m.playerId); if (a) { a.emote = null; a.human?.stopEmote(); } });
    net.on('emoji', (m) => this.showEmoji(m.playerId, m.e, m.durationMs));
  }

  makeTag(kind, name, role) {
    const el = document.createElement('div');
    el.className = `tag ${kind}`;
    el.innerHTML = `<div class="nm"></div>${role ? '<div class="rl"></div>' : ''}`;
    el.querySelector('.nm').textContent = name;
    if (role) el.querySelector('.rl').textContent = role;
    el.style.display = 'none';
    this.tagsEl.appendChild(el);
    return el;
  }

  makeBubble() {
    const el = document.createElement('div');
    el.className = 'bubble';
    el.style.display = 'none';
    this.tagsEl.appendChild(el);
    return el;
  }

  onSnap(m) {
    const t = m.st;
    const seen = new Set();
    for (const p of m.p) {
      seen.add(p.id);
      let a = this.players.get(p.id);
      if (!a) {
        a = { id: p.id, name: p.n, buf: new Buffer(), root: new THREE.Group(), vehicle: null, human: null, tag: this.makeTag(p.g ? 'player guest' : 'player', `🎮 ${p.n}`, p.g ? 'Visitante · Online' : 'Jogador Online'), bubble: this.makeBubble() };
        this.scene.add(a.root);
        this.players.set(p.id, a);
        if (!this.playerAppearances.has(p.id)) this.net.send({ t: 'appearance_of', playerId: p.id });
        this.rebuildPlayer(a);
      }
      a.buf.push(t, { x: p.x, y: p.y, z: p.z, h: p.h, a: p.a, s: p.s, v: p.v, vi: p.vi, vp: p.vp, vc: p.vc });
      a.lastSeen = t;
      // estado do emote vindo do servidor (sincroniza quem chegou depois)
      if (p.e && (!a.emote || a.emote.id !== p.e.id || a.emote.at !== p.e.at)) this.startEmote(a, p.e.id, p.e.at, p.e.d);
      else if (!p.e && a.emote) { a.emote = null; a.human?.stopEmote(); }
    }
    for (const [id, a] of this.players) if (!seen.has(id) && t - (a.lastSeen ?? 0) > 3000) this.removeActor(this.players, id);

    const missing = [];
    const seenN = new Set();
    for (const n of m.n) {
      seenN.add(n.id);
      let a = this.npcs.get(n.id);
      if (!a) {
        a = { id: n.id, buf: new Buffer(), root: new THREE.Group(), model: null, detail: null, tag: null, bubble: this.makeBubble() };
        this.scene.add(a.root);
        this.npcs.set(n.id, a);
        if (this.npcProfiles.has(n.id)) this.rebuildNpc(a);
        else if (!this.pendingNpc.has(n.id)) { missing.push(n.id); this.pendingNpc.add(n.id); }
      }
      a.buf.push(t, { x: n.x, z: n.z, h: n.h, a: n.a, s: n.s, b: n.b });
      a.lastSeen = t;
    }
    if (missing.length) this.net.send({ t: 'npc_appearance', ids: missing });
    for (const [id, a] of this.npcs) if (!seenN.has(id) && t - (a.lastSeen ?? 0) > 1500) this.removeActor(this.npcs, id);

    const seenC = new Set();
    for (const c of m.c) {
      seenC.add(c.id);
      let a = this.cars.get(c.id);
      if (!a) {
        const model = trafficVehicle(c.k, c.c);
        a = { id: c.id, buf: new Buffer(), model, root: model.root, driver: c.d, tag: null };
        this.scene.add(model.root);
        this.cars.set(c.id, a);
      }
      a.buf.push(t, { x: c.x, z: c.z, h: c.h, s: c.s, l: c.l, br: c.br });
      a.driver = c.d;
      a.lastSeen = t;
    }
    for (const [id, a] of this.cars) if (!seenC.has(id) && t - (a.lastSeen ?? 0) > 800) this.removeActor(this.cars, id);

    const seenB = new Set();
    for (const b of m.b ?? []) {
      seenB.add(b.id);
      let a = this.bots.get(b.id);
      if (!a) {
        const model = createVehicle(b.vehicle === 'moto' ? 'moto_kupapata' : 'hatch_muxima', { paint: '#f9a825' });
        a = { id: b.id, buf: new Buffer(), model, root: model.root, tag: this.makeTag('bot', `🏎️ ${b.name}`, 'Piloto da Arena') };
        this.scene.add(model.root);
        this.bots.set(b.id, a);
      }
      a.buf.push(t, { x: b.x, z: b.z, h: b.h, s: b.speed });
      a.lastSeen = t;
    }
    for (const [id] of this.bots) if (!seenB.has(id)) this.removeActor(this.bots, id);
    if (m.l) this.lightsSnapshot = m.l;
  }

  removeActor(map, id) {
    const a = map.get(id);
    if (!a) return;
    a.root.removeFromParent();
    a.tag?.remove();
    a.bubble?.remove();
    map.delete(id);
  }

  rebuildPlayer(a) {
    const info = this.playerAppearances.get(a.id);
    a.root.clear();
    a.human = new Humanoid3(info?.appearance ?? {}, { shadows: this.quality.shadows });
    a.root.add(a.human.root);
    a.vehicle = null;
    if (a.emote) this.startEmote(a, a.emote.id, a.emote.at, a.emote.dir);
  }

  startEmote(a, id, at, dir = null) {
    a.emote = { id, at, dir };
    const fn = emoteAnimation(id);
    if (!fn || !a.human) return;
    // converte o instante do servidor para o relógio local de animação
    const startedAtMs = performance.now() - Math.max(0, this.net.serverNow() - at);
    a.human.playEmote(id, fn, { startedAtMs, dir });
  }

  onEmote(m) {
    if (m.playerId === this.localId) { this.onLocalEmote?.(m); return; }
    const a = this.players.get(m.playerId);
    if (a) this.startEmote(a, m.id, m.at, m.dir);
  }

  /** Emoji flutuante sobre a personagem (sobe e desvanece). */
  showEmoji(playerId, e, durationMs = 2600) {
    const anchor = playerId === this.localId ? this.localAnchor?.() : this.players.get(playerId)?.root;
    if (!anchor) return;
    const el = document.createElement('div');
    el.className = 'emoji-float';
    el.textContent = e;
    this.tagsEl.appendChild(el);
    this.floating = this.floating ?? [];
    this.floating.push({ el, anchor, t0: performance.now(), dur: durationMs });
  }

  rebuildNpc(a, detail = a.detail ?? 'lod') {
    const prof = this.npcProfiles.get(a.id);
    if (!prof) return;
    a.root.clear();
    a.detail = detail;
    a.model = detail === 'full' ? new Humanoid3(prof.appearance, { shadows: this.quality.shadows && this.quality.name !== 'baixa' }) : new HumanoidLOD(prof.appearance);
    a.root.add(a.model.root);
    if (!a.tag) a.tag = this.makeTag('npc', prof.name, `${prof.role}`);
  }

  setParked(list) {
    const ids = new Set(list.map((v) => v.id));
    for (const [id] of this.parked) if (!ids.has(id)) this.removeActor(this.parked, id);
    for (const v of list) {
      let a = this.parked.get(v.id);
      if (!a) {
        const item = v.itemId ?? (v.kind === 'moto' ? 'moto_ngola' : ['sedan_kianda', 'hatch_muxima', 'suv_namibe', 'sedan_kianda'][v.id.length % 4]);
        const model = createVehicle(item, { paint: v.paint ?? (v.kind === 'moto' ? '#263238' : ['#0d47a1', '#b71c1c', '#f5f5f5', '#212121'][v.id.length % 4]), rims: v.rims });
        const tag = this.makeTag('veh', v.kind === 'moto' ? '🏍️ Mota · [F] Conduzir' : '🚗 Carro · [F] Conduzir', '');
        a = { id: v.id, model, root: model.root, kind: v.kind, item, owner: v.owner, tag };
        this.scene.add(model.root);
        this.parked.set(v.id, a);
      }
      a.data = v;
      a.root.position.set(v.x, 0, v.z);
      a.root.rotation.y = v.heading;
      a.root.visible = !v.occupant;
      if (a.tag && v.occupant) a.tag.style.display = 'none';
    }
  }

  /** Veículo estacionado livre mais próximo (para a acção "F — conduzir"). */
  nearestParked(x, z, max = 6.8) {
    // o veículo próprio tem prioridade sobre os públicos ao lado
    for (const a of this.parked.values()) {
      if (a.data.owner === this.localId && !a.data.occupant && Math.hypot(a.data.x - x, a.data.z - z) < max + 1) return a;
    }
    let best = null;
    let bd = max;
    for (const a of this.parked.values()) {
      if (a.data.occupant || (a.data.owner && a.data.owner !== this.localId)) continue;
      const d = Math.hypot(a.data.x - x, a.data.z - z);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  nearestNpc(x, z, max = 3.5) {
    let best = null;
    let bd = max;
    for (const a of this.npcs.values()) {
      const d = Math.hypot(a.root.position.x - x, a.root.position.z - z);
      if (d < bd && this.npcProfiles.has(a.id)) { bd = d; best = a; }
    }
    return best;
  }

  nearestPlayer(x, z, max = 6) {
    let best = null;
    let bd = max;
    for (const a of this.players.values()) {
      const d = Math.hypot(a.root.position.x - x, a.root.position.z - z);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  /** Obstáculos dinâmicos para a física do veículo do jogador. */
  dynamicObstacles() {
    const out = [];
    for (const a of this.cars.values()) out.push({ x: a.root.position.x, z: a.root.position.z, r: 1.3 });
    for (const a of this.bots.values()) out.push({ x: a.root.position.x, z: a.root.position.z, r: 1.2 });
    for (const a of this.parked.values()) if (a.root.visible) out.push({ x: a.root.position.x, z: a.root.position.z, r: 1.3 });
    return out;
  }

  update(dt, camera, lightsOn) {
    const renderT = this.net.serverNow() - INTERP_DELAY;
    const camPos = camera.position;
    const v = new THREE.Vector3();
    const w = window.innerWidth;
    const h = window.innerHeight;
    const placeTag = (el, pos, height, maxDist = 28) => {
      if (!el) return;
      const d = pos.distanceTo(camPos);
      if (d > maxDist) { el.style.display = 'none'; return; }
      v.set(pos.x, pos.y + height, pos.z).project(camera);
      if (v.z > 1 || v.z < -1) { el.style.display = 'none'; return; }
      el.style.display = '';
      el.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
      el.style.opacity = String(Math.max(0.25, 1 - d / maxDist));
    };

    for (const a of this.players.values()) {
      const s = a.buf.sample(renderT);
      if (!s) continue;
      a.root.position.set(s.x, s.y ?? this.groundHeightAt(s.x, s.z), s.z);
      a.root.rotation.y = s.h;
      const inVeh = !!s.v;
      const vehKey = `${s.v}:${s.vi}:${s.vp}`;
      if (inVeh && (!a.vehicle || a.vehicleKey !== vehKey)) {
        a.root.clear();
        a.vehicle = createVehicle(s.vi ?? (s.v === 'moto' ? 'moto_ngola' : 'sedan_kianda'), { paint: s.vp ?? s.vc ?? '#3949ab' });
        a.vehicleKey = vehKey;
        a.root.add(a.vehicle.root);
        a.human = null;
      } else if (!inVeh && !a.human) this.rebuildPlayer(a);
      if (a.vehicle) { a.vehicle.animate(dt, s.s ?? 0); a.vehicle.setLights(lightsOn, false); }
      if (a.human) { a.human.setAnim(s.a); a.human.update(dt, s.s ?? 0); }
      placeTag(a.tag, a.root.position, inVeh ? 2.2 : 2.15, 45);
      placeTag(a.bubble, a.root.position, 2.6, 30);
    }

    for (const a of this.npcs.values()) {
      const s = a.buf.sample(renderT);
      if (!s) continue;
      const d = Math.hypot(s.x - camPos.x, s.z - camPos.z);
      const wantFull = d < this.quality.npcDetailDistance;
      if (this.npcProfiles.has(a.id)) {
        if (wantFull && a.detail !== 'full' && d < this.quality.npcDetailDistance - 3) this.rebuildNpc(a, 'full');
        else if (!wantFull && a.detail === 'full' && d > this.quality.npcDetailDistance + 3) this.rebuildNpc(a, 'lod');
        else if (!a.model) this.rebuildNpc(a, wantFull ? 'full' : 'lod');
      }
      a.root.position.set(s.x, s.a === 'sit' ? 0.06 : this.groundHeightAt(s.x, s.z), s.z);
      a.root.rotation.y = s.h;
      a.root.visible = d < this.quality.npcVisibleDistance;
      if (a.model) { a.model.setAnim(s.a); if (a.root.visible) a.model.update(dt, s.s ?? 0); }
      placeTag(a.tag, a.root.position, 2.05, 22);
      if (s.b) {
        a.bubble.textContent = s.b;
        placeTag(a.bubble, a.root.position, 2.55, 26);
        if (a.lastSpokenBubble !== s.b && d < 18) {
          a.lastSpokenBubble = s.b;
          const prof = this.npcProfiles.get(a.id);
          this.onBubbleSpeak?.(a.id, s.b, prof?.appearance?.gender ?? 'm');
        }
      } else {
        a.bubble.style.display = 'none';
        a.lastSpokenBubble = null;
      }
    }

    for (const a of this.cars.values()) {
      const s = a.buf.sample(renderT);
      if (!s) continue;
      a.root.position.set(s.x, 0, s.z);
      a.root.rotation.y = s.h;
      a.model.animate(dt, s.s ?? 0);
      a.model.setLights(!!s.l, !!s.br);
    }
    for (const a of this.bots.values()) {
      const s = a.buf.sample(renderT);
      if (!s) continue;
      a.root.position.set(s.x, 0, s.z);
      a.root.rotation.y = s.h;
      a.model.animate(dt, s.s ?? 0);
      a.model.setLights(lightsOn, false);
      placeTag(a.tag, a.root.position, 2.0, 80);
    }
    for (const a of this.parked.values()) {
      a.model.setLights(false, false);
      a.model.animate?.(dt, 0, 0);
      if (a.tag) {
        if (a.root.visible) placeTag(a.tag, a.root.position, a.kind === 'moto' ? 1.5 : 1.9, 18);
        else a.tag.style.display = 'none';
      }
    }
    // emojis flutuantes
    if (this.floating?.length) {
      const now = performance.now();
      this.floating = this.floating.filter((f) => {
        const k = (now - f.t0) / f.dur;
        if (k >= 1) { f.el.remove(); return false; }
        const pos = f.anchor.position ?? f.anchor;
        v.set(pos.x, pos.y + 2.3 + k * 0.8, pos.z).project(camera);
        if (v.z > 1) { f.el.style.display = 'none'; return true; }
        f.el.style.display = '';
        f.el.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) scale(${0.8 + Math.min(1, k * 6) * 0.5})`;
        f.el.style.opacity = String(Math.min(1, (1 - k) * 3));
        return true;
      });
    }
  }
}
