/**
 * Veículos (MODELOS PROVISÓRIOS low-poly): carro, táxi azul-e-branco, carrinha e mota.
 * Rodas animadas, faróis e luzes traseiras (com travagem), física arcade de
 * "modelo de bicicleta" para o veículo do jogador. Partilhado pelo trânsito,
 * veículos estacionados, corridas e bots de treino.
 */
import * as THREE from 'three';

const G = new Map();
const g = (k, f) => { if (!G.has(k)) G.set(k, f()); return G.get(k); };
const M = new Map();
const m = (k, f) => { if (!M.has(k)) M.set(k, f()); return M.get(k); };

const glass = () => m('glass', () => new THREE.MeshStandardMaterial({ color: 0x1b2633, roughness: 0.08, metalness: 0.6, transparent: true, opacity: 0.82 }));
const tyre = () => m('tyre', () => new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 }));
const rim = () => m('rim', () => new THREE.MeshStandardMaterial({ color: 0xb0b6bc, roughness: 0.3, metalness: 0.9 }));
const trim = () => m('trim', () => new THREE.MeshStandardMaterial({ color: 0x1e1e1e, roughness: 0.6 }));
const paint = (c) => m(`paint:${c}`, () => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.32, metalness: 0.55, clearcoat: 0.8, clearcoatRoughness: 0.15 }));

function lampMat(color) {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0, roughness: 0.3 });
}

function wheel(radius, width) {
  const w = new THREE.Group();
  const t = new THREE.Mesh(g(`tyre:${radius}:${width}`, () => new THREE.CylinderGeometry(radius, radius, width, 18)), tyre());
  t.rotation.z = Math.PI / 2;
  const r = new THREE.Mesh(g(`rim:${radius}:${width}`, () => new THREE.CylinderGeometry(radius * 0.6, radius * 0.6, width + 0.01, 10)), rim());
  r.rotation.z = Math.PI / 2;
  w.add(t, r);
  t.castShadow = true;
  return w;
}

export const VEHICLE_SPECS = {
  car: { maxSpeed: 38, accel: 7.5, brake: 14, reverse: 8, wheelbase: 2.6, maxSteer: 0.55, length: 4.3, width: 1.8, radius: 1.05, mass: 1 },
  taxi: { maxSpeed: 32, accel: 6.5, brake: 13, reverse: 7, wheelbase: 2.9, maxSteer: 0.5, length: 4.8, width: 1.9, radius: 1.1, mass: 1.2 },
  carrinha: { maxSpeed: 30, accel: 5.5, brake: 12, reverse: 6, wheelbase: 3.0, maxSteer: 0.48, length: 5.0, width: 2.0, radius: 1.2, mass: 1.4 },
  moto: { maxSpeed: 42, accel: 9.5, brake: 15, reverse: 3, wheelbase: 1.45, maxSteer: 0.6, length: 2.1, width: 0.8, radius: 0.6, mass: 0.5 },
};

export class VehicleModel {
  constructor(kind = 'car', color = '#b71c1c') {
    this.kind = kind;
    this.root = new THREE.Group();
    this.wheels = [];
    this.frontWheels = [];
    this.head = lampMat(0xfff4d6);
    this.tail = lampMat(0xff1a1a);
    this.lightsOn = false;
    this.braking = false;
    if (kind === 'moto') this.buildMoto(color);
    else this.buildCar(kind, color);
    this.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }

  buildCar(kind, color) {
    const spec = VEHICLE_SPECS[kind] ?? VEHICLE_SPECS.car;
    const L = spec.length;
    const W = spec.width;
    const body = new THREE.Group();
    this.root.add(body);
    this.body = body;
    const isTaxi = kind === 'taxi';
    const isVan = kind === 'carrinha';
    const paintM = paint(isTaxi ? '#1565c0' : color);
    // carroçaria inferior
    const lower = new THREE.Mesh(g(`lower:${kind}`, () => { const geo = new THREE.BoxGeometry(W, 0.55, L); geo.translate(0, 0.62, 0); return geo; }), paintM);
    body.add(lower);
    // cabine
    const cabL = isVan ? L * 0.78 : L * 0.5;
    const cabH = isVan ? 1.05 : 0.6;
    const cab = new THREE.Mesh(g(`cab:${kind}`, () => {
      const geo = new THREE.BoxGeometry(W * 0.9, cabH, cabL, 1, 1, 1);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) > 0) { pos.setX(i, pos.getX(i) * 0.9); pos.setZ(i, pos.getZ(i) * (isVan ? 0.95 : 0.78)); }
      }
      geo.computeVertexNormals();
      geo.translate(0, 0.9 + cabH / 2, isVan ? -L * 0.06 : -L * 0.05);
      return geo;
    }), isTaxi ? paint('#f5f5f5') : paintM);
    body.add(cab);
    // vidros (faixa escura à volta da cabine)
    const glassM = new THREE.Mesh(g(`glass:${kind}`, () => { const geo = new THREE.BoxGeometry(W * 0.86, cabH * 0.62, cabL * (isVan ? 0.9 : 0.74)); geo.translate(0, 0.9 + cabH * 0.55, isVan ? -L * 0.06 : -L * 0.05); return geo; }), glass());
    body.add(glassM);
    // pára-choques
    for (const sz of [-1, 1]) {
      const b = new THREE.Mesh(g(`bumper:${kind}`, () => new THREE.BoxGeometry(W * 1.02, 0.22, 0.18)), trim());
      b.position.set(0, 0.45, sz * (L / 2 + 0.02));
      body.add(b);
    }
    // faróis (frente = +Z) e farolins traseiros
    for (const sx of [-1, 1]) {
      const h = new THREE.Mesh(g('headlamp', () => new THREE.BoxGeometry(0.32, 0.14, 0.05)), this.head);
      h.position.set(sx * (W / 2 - 0.25), 0.72, L / 2 + 0.01);
      const t = new THREE.Mesh(g('taillamp', () => new THREE.BoxGeometry(0.3, 0.12, 0.05)), this.tail);
      t.position.set(sx * (W / 2 - 0.22), 0.74, -L / 2 - 0.01);
      body.add(h, t);
    }
    if (isTaxi) {
      const sign = new THREE.Mesh(g('taxisign', () => new THREE.BoxGeometry(0.5, 0.16, 0.25)), lampMat(0xfff176));
      sign.material.emissiveIntensity = 0.6;
      sign.position.set(0, 1.58, -0.2);
      body.add(sign);
      // faixa branca lateral típica dos candongueiros
      for (const sx of [-1, 1]) {
        const stripe = new THREE.Mesh(g('stripe', () => new THREE.BoxGeometry(0.02, 0.18, L * 0.9)), paint('#f5f5f5'));
        stripe.position.set(sx * (W / 2 + 0.005), 0.62, 0);
        body.add(stripe);
      }
    }
    const r = 0.36;
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const w = wheel(r, 0.26);
      w.position.set(sx * (W / 2 - 0.08), r, sz * (spec.wheelbase / 2));
      this.root.add(w);
      this.wheels.push(w);
      if (sz > 0) this.frontWheels.push(w);
    }
    this.wheelRadius = r;
  }

  buildMoto(color) {
    const body = new THREE.Group();
    this.root.add(body);
    this.body = body;
    const paintM = paint(color);
    const tank = new THREE.Mesh(g('mtank', () => { const geo = new THREE.CapsuleGeometry(0.17, 0.45, 4, 8); geo.rotateX(Math.PI / 2); geo.translate(0, 0.85, 0.15); return geo; }), paintM);
    const seat = new THREE.Mesh(g('mseat', () => { const geo = new THREE.BoxGeometry(0.26, 0.1, 0.6); geo.translate(0, 0.86, -0.35); return geo; }), trim());
    const frame = new THREE.Mesh(g('mframe', () => { const geo = new THREE.BoxGeometry(0.12, 0.35, 1.1); geo.translate(0, 0.55, 0); return geo; }), trim());
    const fork = new THREE.Mesh(g('mfork', () => { const geo = new THREE.CylinderGeometry(0.035, 0.035, 0.8, 6); geo.rotateX(-0.35); geo.translate(0, 0.68, 0.62); return geo; }), rim());
    const bar = new THREE.Mesh(g('mbar', () => { const geo = new THREE.CylinderGeometry(0.02, 0.02, 0.7, 6); geo.rotateZ(Math.PI / 2); geo.translate(0, 1.08, 0.5); return geo; }), trim());
    const head = new THREE.Mesh(g('mhead', () => { const geo = new THREE.SphereGeometry(0.09, 10, 8); geo.translate(0, 0.98, 0.72); return geo; }), this.head);
    const tail = new THREE.Mesh(g('mtail', () => { const geo = new THREE.BoxGeometry(0.14, 0.06, 0.04); geo.translate(0, 0.86, -0.7); return geo; }), this.tail);
    body.add(tank, seat, frame, fork, bar, head, tail);
    const r = 0.32;
    for (const sz of [1, -1]) {
      const w = wheel(r, 0.12);
      w.position.set(0, r, sz * 0.72);
      this.root.add(w);
      this.wheels.push(w);
      if (sz > 0) this.frontWheels.push(w);
    }
    this.wheelRadius = r;
  }

  setLights(on, braking = false) {
    this.lightsOn = on;
    this.braking = braking;
    this.head.emissiveIntensity = on ? 2.2 : 0;
    this.tail.emissiveIntensity = braking ? 2.5 : on ? 0.9 : 0;
  }

  /** Animação visual: rotação das rodas, direcção e inclinação da mota. */
  animate(dt, speed, steer = 0) {
    const rot = (speed * dt) / this.wheelRadius;
    for (const w of this.wheels) w.children.forEach((c) => { c.rotation.x += rot; });
    for (const w of this.frontWheels) w.rotation.y = steer;
    if (this.kind === 'moto') this.root.rotation.z = THREE.MathUtils.lerp(this.root.rotation.z, -steer * Math.min(1, Math.abs(speed) / 12) * 0.9, Math.min(1, dt * 6));
  }
}

/**
 * Física arcade (modelo de bicicleta) para o veículo controlado pelo jogador.
 * Colisões com caixas estáticas (edifícios, postes) e com outros veículos (círculos).
 */
export class VehiclePhysics {
  constructor(kind, x, z, heading) {
    this.kind = kind;
    this.spec = VEHICLE_SPECS[kind] ?? VEHICLE_SPECS.car;
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.lastImpact = 0;
  }

  step(dt, input, boxes, others = []) {
    const s = this.spec;
    const throttle = input.forward ? 1 : 0;
    const brake = input.back ? 1 : 0;
    if (throttle) this.speed += (this.speed < 0 ? s.brake : s.accel * (1 - Math.max(0, this.speed) / s.maxSpeed * 0.7)) * dt;
    if (brake) this.speed -= (this.speed > 0.5 ? s.brake : s.accel * 0.6) * dt;
    if (input.handbrake) this.speed *= Math.pow(0.15, dt);
    if (!throttle && !brake) this.speed *= Math.pow(0.6, dt); // atrito/rolamento
    this.speed = Math.max(-s.reverse, Math.min(s.maxSpeed, this.speed));
    if (Math.abs(this.speed) < 0.05 && !throttle && !brake) this.speed = 0;

    const steerTarget = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    const speedFactor = 1 / (1 + Math.abs(this.speed) / 14);
    this.steer += (steerTarget * s.maxSteer * speedFactor - this.steer) * Math.min(1, dt * 7);
    const yawRate = (this.speed / s.wheelbase) * Math.tan(this.steer);
    this.heading += yawRate * dt * (input.handbrake ? 1.5 : 1);

    const nx = this.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.z + Math.cos(this.heading) * this.speed * dt;
    const hit = this.resolve(nx, nz, boxes, others);
    this.x = hit.x;
    this.z = hit.z;
    if (hit.impact) {
      const now = performance.now();
      this.impact = Math.abs(this.speed);
      this.speed *= -0.25;
      this.lastImpact = now;
    }
  }

  /** Dois círculos (frente/trás) contra caixas AABB. */
  resolve(x, z, boxes, others) {
    const s = this.spec;
    const off = this.kind === 'moto' ? 0.5 : (s.length / 2 - s.radius * 0.8);
    let impact = false;
    for (let iter = 0; iter < 2; iter++) {
      for (const sign of [1, -1]) {
        const cx = x + Math.sin(this.heading) * off * sign;
        const cz = z + Math.cos(this.heading) * off * sign;
        for (const b of boxes) {
          if (cx < b.minX - s.radius || cx > b.maxX + s.radius || cz < b.minZ - s.radius || cz > b.maxZ + s.radius) continue;
          const px = Math.max(b.minX, Math.min(cx, b.maxX));
          const pz = Math.max(b.minZ, Math.min(cz, b.maxZ));
          const dx = cx - px;
          const dz = cz - pz;
          const d = Math.hypot(dx, dz);
          if (d < s.radius) {
            const push = s.radius - d + 0.01;
            const ux = d > 1e-6 ? dx / d : 0;
            const uz = d > 1e-6 ? dz / d : 1;
            x += ux * push;
            z += uz * push;
            impact = true;
          }
        }
        for (const o of others) {
          const dx = cx - o.x;
          const dz = cz - o.z;
          const d = Math.hypot(dx, dz);
          const min = s.radius + (o.r ?? 1.1);
          if (d < min && d > 1e-6) {
            x += (dx / d) * (min - d);
            z += (dz / d) * (min - d);
            impact = true;
          }
        }
      }
    }
    return { x, z, impact };
  }
}
