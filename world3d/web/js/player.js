/**
 * Jogador local: movimento a pé (andar, correr, saltar) com colisões, condução de
 * carros e motas, câmara em terceira pessoa suave que respeita obstáculos.
 * O movimento é previsto localmente e validado pelo servidor (correcções).
 */
import * as THREE from 'three';
import { collisionBoxes, ZONE_BOUNDS } from '../../shared/zone.js';
import { Humanoid } from './humanoid.js';
import { VehicleModel, VehiclePhysics, VEHICLE_SPECS } from './vehicles.js';

const WALK = 1.7;
const RUN = 5.2;
const GRAVITY = 14;

export class LocalPlayer {
  constructor(scene, camera, dom, { appearance, groundHeightAt, quality }) {
    this.scene = scene;
    this.camera = camera;
    this.dom = dom;
    this.groundHeightAt = groundHeightAt;
    this.quality = quality;
    this.boxes = collisionBoxes();
    this.root = new THREE.Group();
    scene.add(this.root);
    this.setAppearance(appearance);
    this.pos = new THREE.Vector3(0, 0.1, -28);
    this.vy = 0;
    this.heading = Math.PI;
    this.speed = 0;
    this.grounded = true;
    this.mode = 'foot';
    this.vehicle = null;
    this.keys = new Set();
    this.yaw = 0; // câmara atrás do jogador (yaw = rumo + π)
    this.pitch = 0.28;
    this.camDist = 4.6;
    this.camTarget = new THREE.Vector3();
    this.camPos = new THREE.Vector3();
    this.inputEnabled = true;
    this.bindInput();
  }

  setAppearance(appearance) {
    this.appearance = appearance;
    this.root.clear();
    this.human = new Humanoid(appearance, { shadows: this.quality.shadows });
    this.root.add(this.human.root);
  }

  bindInput() {
    addEventListener('keydown', (e) => {
      if (!this.inputEnabled || e.target.tagName === 'INPUT') return;
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    let dragging = false;
    let lx = 0;
    let ly = 0;
    this.dom.addEventListener('mousedown', (e) => {
      if (e.button === 0 && this.inputEnabled && document.pointerLockElement !== this.dom) this.dom.requestPointerLock?.();
      dragging = true; lx = e.clientX; ly = e.clientY;
    });
    addEventListener('mouseup', () => { dragging = false; });
    addEventListener('mousemove', (e) => {
      const locked = document.pointerLockElement === this.dom;
      if (!locked && !dragging) return;
      const dx = locked ? e.movementX : e.clientX - lx;
      const dy = locked ? e.movementY : e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      this.yaw -= dx * 0.0032;
      this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.0028, -0.25, 1.2);
    });
    this.dom.addEventListener('wheel', (e) => { this.camDist = THREE.MathUtils.clamp(this.camDist + e.deltaY * 0.004, 2.2, this.mode === 'vehicle' ? 14 : 9); }, { passive: true });
    // toque (telemóvel): arrastar para rodar a câmara
    let tx = 0;
    let ty = 0;
    this.dom.addEventListener('touchstart', (e) => { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
    this.dom.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      this.yaw -= (t.clientX - tx) * 0.005;
      this.pitch = THREE.MathUtils.clamp(this.pitch + (t.clientY - ty) * 0.004, -0.25, 1.2);
      tx = t.clientX; ty = t.clientY;
    }, { passive: true });
  }

  input() {
    const k = this.keys;
    return {
      forward: k.has('KeyW') || k.has('ArrowUp'),
      back: k.has('KeyS') || k.has('ArrowDown'),
      left: k.has('KeyA') || k.has('ArrowLeft'),
      right: k.has('KeyD') || k.has('ArrowRight'),
      run: k.has('ShiftLeft') || k.has('ShiftRight'),
      jump: k.has('Space'),
      handbrake: k.has('Space'),
    };
  }

  teleport(x, z, heading = this.heading) {
    this.pos.set(x, this.groundHeightAt(x, z), z);
    this.heading = heading;
    this.yaw = heading + Math.PI;
    if (this.vehicle) { this.vehicle.phys.x = x; this.vehicle.phys.z = z; this.vehicle.phys.heading = heading; this.vehicle.phys.speed = 0; }
  }

  enterVehicle(kind, x, z, heading, color, { id = null, race = false } = {}) {
    const model = new VehicleModel(kind, color);
    this.scene.add(model.root);
    this.vehicle = { kind, id, race, color, model, phys: new VehiclePhysics(kind, x, z, heading) };
    this.mode = 'vehicle';
    this.root.visible = kind === 'moto';
    this.camDist = 7.5;
    this.yaw = heading + Math.PI;
  }

  exitVehicle() {
    if (!this.vehicle) return null;
    const v = this.vehicle;
    v.model.root.removeFromParent();
    const side = v.kind === 'moto' ? 1.0 : 1.6;
    // sair pelo lado esquerdo (condutor à esquerda, trânsito pela direita)
    const ex = v.phys.x + Math.cos(v.phys.heading) * side;
    const ez = v.phys.z - Math.sin(v.phys.heading) * side;
    this.vehicle = null;
    this.mode = 'foot';
    this.root.visible = true;
    this.root.rotation.z = 0;
    this.pos.set(ex, this.groundHeightAt(ex, ez), ez);
    this.heading = v.phys.heading;
    this.camDist = 4.6;
    return { x: v.phys.x, z: v.phys.z, heading: v.phys.heading };
  }

  resolveFoot(x, z, y, dynamic) {
    const r = 0.35;
    for (let iter = 0; iter < 2; iter++) {
      for (const b of this.boxes) {
        if (b.h !== undefined && y > b.h - 0.3) continue; // por cima de obstáculos baixos
        if (x < b.minX - r || x > b.maxX + r || z < b.minZ - r || z > b.maxZ + r) continue;
        const px = Math.max(b.minX, Math.min(x, b.maxX));
        const pz = Math.max(b.minZ, Math.min(z, b.maxZ));
        const dx = x - px;
        const dz = z - pz;
        const d = Math.hypot(dx, dz);
        if (d < r) {
          if (d < 1e-6) { // dentro da caixa: empurrar pelo lado mais próximo
            const opts = [[b.minX - r - x, 0], [b.maxX + r - x, 0], [0, b.minZ - r - z], [0, b.maxZ + r - z]];
            opts.sort((a1, a2) => Math.hypot(...a1) - Math.hypot(...a2));
            x += opts[0][0];
            z += opts[0][1];
          } else {
            x += (dx / d) * (r - d);
            z += (dz / d) * (r - d);
          }
        }
      }
      for (const o of dynamic) {
        const dx = x - o.x;
        const dz = z - o.z;
        const d = Math.hypot(dx, dz);
        const min = r + 1.2;
        if (d < min && d > 1e-6) { x += (dx / d) * (min - d); z += (dz / d) * (min - d); }
      }
    }
    x = THREE.MathUtils.clamp(x, ZONE_BOUNDS.minX + 1, ZONE_BOUNDS.maxX - 1);
    z = THREE.MathUtils.clamp(z, ZONE_BOUNDS.minZ + 1, ZONE_BOUNDS.maxZ - 1);
    return [x, z];
  }

  update(dt, dynamic = []) {
    const inp = this.inputEnabled ? this.input() : {};
    if (this.mode === 'vehicle') {
      const v = this.vehicle;
      v.phys.step(dt, this.frozen ? {} : inp, this.boxes, dynamic);
      v.phys.x = THREE.MathUtils.clamp(v.phys.x, ZONE_BOUNDS.minX + 2, ZONE_BOUNDS.maxX - 2);
      v.phys.z = THREE.MathUtils.clamp(v.phys.z, ZONE_BOUNDS.minZ + 2, ZONE_BOUNDS.maxZ - 2);
      v.model.root.position.set(v.phys.x, 0, v.phys.z);
      v.model.root.rotation.y = v.phys.heading;
      v.model.animate(dt, v.phys.speed, v.phys.steer);
      this.pos.set(v.phys.x, 0, v.phys.z);
      this.heading = v.phys.heading;
      this.speed = v.phys.speed;
      if (v.kind === 'moto') {
        this.root.position.set(v.phys.x, 0.35, v.phys.z);
        this.root.rotation.y = v.phys.heading;
        this.root.rotation.z = v.model.root.rotation.z;
        this.human.setAnim('drive');
        this.human.update(dt, 0);
      }
      this.anim = 'drive';
    } else {
      // movimento relativo à câmara
      const fwd = (inp.forward ? 1 : 0) - (inp.back ? 1 : 0);
      const side = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      const moving = !this.frozen && (fwd !== 0 || side !== 0);
      const target = moving ? (inp.run ? RUN : WALK) : 0;
      this.speed += (target - this.speed) * Math.min(1, dt * (moving ? 6 : 10));
      if (moving) {
        const camYaw = this.yaw + Math.PI;
        const dir = Math.atan2(side, fwd);
        const want = camYaw - dir;
        let dh = want - this.heading;
        while (dh > Math.PI) dh -= Math.PI * 2;
        while (dh < -Math.PI) dh += Math.PI * 2;
        this.heading += dh * Math.min(1, dt * 10);
      }
      let x = this.pos.x + Math.sin(this.heading) * this.speed * dt;
      let z = this.pos.z + Math.cos(this.heading) * this.speed * dt;
      [x, z] = this.resolveFoot(x, z, this.pos.y, dynamic);
      const ground = this.groundHeightAt(x, z);
      if (inp.jump && this.grounded && !this.frozen) { this.vy = 4.8; this.grounded = false; }
      this.vy -= GRAVITY * dt;
      let y = this.pos.y + this.vy * dt;
      if (y <= ground) { y = ground; this.vy = 0; this.grounded = true; }
      else if (y - ground < 0.18 && this.vy <= 0) { y = THREE.MathUtils.lerp(y, ground, Math.min(1, dt * 20)); this.grounded = true; }
      this.pos.set(x, y, z);
      this.anim = !this.grounded ? 'jump' : this.speed > 3.2 ? 'run' : this.speed > 0.25 ? 'walk' : (this.talking ? 'talk_idle' : 'idle');
      this.root.position.copy(this.pos);
      this.root.rotation.y = this.heading;
      this.human.setAnim(this.anim);
      this.human.update(dt, this.speed);
    }
    this.updateCamera(dt);
  }

  updateCamera(dt) {
    const inVeh = this.mode === 'vehicle';
    const height = inVeh ? 1.6 : 1.55;
    this.camTarget.lerp(new THREE.Vector3(this.pos.x, this.pos.y + height, this.pos.z), 1 - Math.exp(-dt * (inVeh ? 8 : 14)));
    if (inVeh) {
      // câmara de perseguição: volta suavemente para trás do veículo quando não é rodada
      let d = this.vehicle.phys.heading + Math.PI - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(this.vehicle.phys.speed) > 2) this.yaw += d * Math.min(1, dt * 2.5);
    }
    const dist = this.camDist;
    const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    let allowed = dist;
    // colisão da câmara com edifícios (raio contra AABB 3D)
    for (const b of this.boxes) {
      if ((b.h ?? 0) < 2) continue;
      const t = rayBox(this.camTarget, dir, b);
      if (t !== null && t < allowed) allowed = Math.max(0.6, t - 0.3);
    }
    const desired = this.camTarget.clone().addScaledVector(dir, allowed);
    desired.y = Math.max(desired.y, this.groundHeightAt(desired.x, desired.z) + 0.3);
    this.camPos.lerp(desired, 1 - Math.exp(-dt * 18));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);
  }

  stateMessage() {
    const v = this.vehicle;
    return {
      t: 'state',
      x: Math.round(this.pos.x * 100) / 100,
      y: Math.round(this.pos.y * 100) / 100,
      z: Math.round(this.pos.z * 100) / 100,
      h: Math.round(this.heading * 100) / 100,
      a: this.anim,
      s: Math.round(Math.abs(this.speed) * 100) / 100,
      veh: v ? v.kind : null,
      vc: v ? v.color : null,
    };
  }

  speedKmh() { return Math.round(Math.abs(this.speed) * 3.6); }
  maxSpeedKmh() { return this.vehicle ? Math.round(VEHICLE_SPECS[this.vehicle.kind].maxSpeed * 3.6) : 0; }
}

/** Intersecção raio–caixa (método das lajes). Devolve distância ou null. */
function rayBox(o, d, b) {
  let tmin = 0;
  let tmax = Infinity;
  const bounds = [[o.x, d.x, b.minX, b.maxX], [o.y, d.y, 0, b.h ?? 10], [o.z, d.z, b.minZ, b.maxZ]];
  for (const [p, dir, lo, hi] of bounds) {
    if (Math.abs(dir) < 1e-8) { if (p < lo || p > hi) return null; continue; }
    let t1 = (lo - p) / dir;
    let t2 = (hi - p) / dir;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}
