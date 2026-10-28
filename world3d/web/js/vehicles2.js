/**
 * Veículos v2.
 *  - Procedurais (status "provisório" no catálogo): carroçaria a partir de um perfil
 *    lateral extrudido com arestas arredondadas e cavas das rodas, vidros, pilares,
 *    interior (bancos, volante), faróis/DRL, farolins, grelha, espelhos, puxadores,
 *    linhas de portas, matrícula angolana, jantes por estilo (clássica, desportiva,
 *    cromada), discos de travão e suspensão (inclinação da carroçaria).
 *  - Kianda GT (status "pronto"): modelo glTF licenciado (CC-BY 4.0) optimizado com
 *    meshopt/WebP, com portas e capô animáveis, rodas e direcção, luzes e variantes
 *    de pintura (KHR_materials_variants). Carregado só quando é necessário.
 *
 * Interface comum: { root, kind, itemId, animate(dt, speed, steer, accel), setLights(on, braking), setDoor(side, 0..1) }
 */
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '../vendor/three/libs/meshopt_decoder.module.js';
import { CATALOG_BY_ID, PAINT_PALETTE } from '../../shared/catalog.js';
import { signTexture } from './textures.js';

const G = new Map();
const cg = (k, f) => { if (!G.has(k)) G.set(k, f()); return G.get(k); };
const M = new Map();
const cm = (k, f) => { if (!M.has(k)) M.set(k, f()); return M.get(k); };

const paintMat = (c) => cm(`paint:${c}`, () => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.28, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.08 }));
const glassMat = () => cm('glass', () => new THREE.MeshPhysicalMaterial({ color: 0x0f1820, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.82, envMapIntensity: 1.5 }));
const trimMat = () => cm('trim', () => new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.55 }));
const chromeMat = () => cm('chrome', () => new THREE.MeshStandardMaterial({ color: 0xdfe3e6, roughness: 0.12, metalness: 1 }));
const tyreMat = () => cm('tyre', () => new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.92 }));
const seatMat = () => cm('seat', () => new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.8 }));
const lamp = (c, base = 0) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: base, roughness: 0.2 });

/** Perfis laterais (z = frente, y = altura) por tipo de carroçaria. */
const BODIES = {
  sedan: { L: 4.5, W: 1.8, wb: 2.7, r: 0.34, body: [[-2.25, 0.32], [-2.3, 0.62], [-2.2, 0.95], [-1.55, 1.0], [-0.95, 1.42], [0.25, 1.44], [0.95, 0.98], [2.15, 0.78], [2.3, 0.6], [2.25, 0.32]], belt: 0.98, cabin: [-0.95, 0.95] },
  hatch: { L: 4.0, W: 1.75, wb: 2.5, r: 0.33, body: [[-2.0, 0.32], [-2.05, 0.65], [-1.95, 1.05], [-1.75, 1.42], [0.2, 1.45], [0.85, 0.98], [1.9, 0.78], [2.05, 0.6], [2.0, 0.32]], belt: 0.98, cabin: [-1.75, 0.85] },
  suv: { L: 4.7, W: 1.95, wb: 2.85, r: 0.4, body: [[-2.35, 0.42], [-2.4, 0.8], [-2.3, 1.2], [-2.15, 1.78], [0.45, 1.82], [1.15, 1.15], [2.25, 1.02], [2.4, 0.78], [2.35, 0.42]], belt: 1.15, cabin: [-2.15, 1.15] },
  van: { L: 4.9, W: 1.9, wb: 2.9, r: 0.36, body: [[-2.45, 0.36], [-2.5, 0.7], [-2.45, 2.0], [1.55, 2.02], [2.3, 1.2], [2.48, 0.92], [2.45, 0.36]], belt: 1.15, cabin: [-2.45, 2.25] },
  pickup: { L: 5.0, W: 1.85, wb: 3.0, r: 0.38, body: [[-2.5, 0.42], [-2.52, 1.08], [-0.55, 1.08], [-0.55, 1.75], [0.55, 1.78], [1.15, 1.18], [2.35, 1.02], [2.5, 0.78], [2.45, 0.42]], belt: 1.12, cabin: [-0.55, 1.15] },
};

function bodyShape(def) {
  const s = new THREE.Shape();
  const pts = def.body;
  const ax = def.wb / 2;
  const ar = def.r + 0.08;
  const y0 = pts[0][1];
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  // fundo com cavas das rodas (da frente para trás)
  for (const cz of [ax, -ax]) {
    s.lineTo(cz + ar, y0);
    s.absarc(cz, def.r, ar, 0, Math.PI, false);
    s.lineTo(cz - ar, y0);
  }
  s.closePath();
  return s;
}

/** Converte geometria extrudida (x=frente, z=largura) para o referencial do carro. */
function toCar(geo, width) {
  geo.rotateY(-Math.PI / 2);
  geo.translate(width / 2, 0, 0);
  return geo;
}

function sideWindowShape(def) {
  const [z0, z1] = def.cabin;
  const top = def.body.reduce((m, [, y]) => Math.max(m, y), 0) - 0.08;
  const s = new THREE.Shape();
  const b = def.belt + 0.04;
  s.moveTo(z0 + 0.12, b);
  s.lineTo(z1 - 0.1, b);
  s.lineTo(z1 - 0.55 * (top - b) - 0.1, top);
  s.lineTo(z0 + 0.3, top);
  s.closePath();
  return s;
}

function plateTexture() {
  return signTexture('LD-24-62-KZ', { bg: '#f4f4f4', fg: '#111', w: 256, h: 64 });
}

function rimGeometry(style, r) {
  return cg(`rim:${style}:${r}`, () => {
    const parts = [];
    const dish = new THREE.CylinderGeometry(r * 0.62, r * 0.62, 0.05, 28);
    dish.rotateZ(Math.PI / 2);
    parts.push(dish);
    const spokes = style === 'desportiva' ? 10 : style === 'cromada' ? 0 : 5;
    for (let i = 0; i < spokes; i++) {
      const sp = new THREE.BoxGeometry(0.03, r * 0.55, style === 'desportiva' ? 0.025 : 0.06);
      sp.translate(0, r * 0.3, 0);
      sp.rotateX((i / spokes) * Math.PI * 2);
      sp.translate(0.03, 0, 0);
      parts.push(sp);
    }
    const hub = new THREE.CylinderGeometry(r * 0.13, r * 0.13, 0.08, 12);
    hub.rotateZ(Math.PI / 2);
    parts.push(hub);
    return parts.map((p) => (p.index ? p.toNonIndexed() : p)).reduce((acc, p) => { acc.push(p); return acc; }, []);
  });
}

function wheel(r, width, style) {
  const w = new THREE.Group();
  const tyre = new THREE.Mesh(cg(`tyre:${r}:${width}`, () => {
    const pts = [];
    for (let i = 0; i <= 12; i++) { const a = (i / 12) * Math.PI; pts.push(new THREE.Vector2(r - 0.08 + Math.sin(a) * 0.08, -width / 2 + (1 - Math.cos(a)) * width / 2)); }
    const g = new THREE.LatheGeometry(pts, 32);
    g.rotateZ(Math.PI / 2);
    return g;
  }), tyreMat());
  tyre.castShadow = true;
  const spin = new THREE.Group();
  spin.add(tyre);
  for (const g of rimGeometry(style, r)) spin.add(new THREE.Mesh(g, style === 'cromada' ? chromeMat() : cm('alloy', () => new THREE.MeshStandardMaterial({ color: 0xb5bbc2, roughness: 0.25, metalness: 0.9 }))));
  const disc = new THREE.Mesh(cg(`disc:${r}`, () => { const g = new THREE.CylinderGeometry(r * 0.5, r * 0.5, 0.02, 20); g.rotateZ(Math.PI / 2); return g; }), cm('disc', () => new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.4, metalness: 0.8 })));
  disc.position.x = -0.04;
  w.add(spin, disc);
  w.userData.spin = spin;
  return w;
}

class ProceduralCar {
  constructor(itemId, bodyType, { paint, rims = 'classica', livery = null }) {
    const def = BODIES[bodyType] ?? BODIES.sedan;
    this.kind = 'car';
    this.itemId = itemId;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.wheels = [];
    this.front = [];
    this.head = lamp(0xfff4d6);
    this.drl = lamp(0xeaf6ff, 0.6);
    this.tail = lamp(0xff1a1a, 0.15);
    const color = livery === 'candongueiro' ? '#1565c0' : paint ?? '#b71c1c';
    const W = def.W;
    const shell = new THREE.Mesh(cg(`shell:${bodyType}`, () => toCar(new THREE.ExtrudeGeometry(bodyShape(def), { depth: W - 0.16, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.07, bevelSegments: 4, curveSegments: 18 }), W - 0.16)), paintMat(color));
    shell.castShadow = true;
    this.body.add(shell);
    // vidros laterais
    for (const sx of [-1, 1]) {
      const sw = new THREE.Mesh(cg(`sidewin:${bodyType}`, () => toCar(new THREE.ExtrudeGeometry(sideWindowShape(def), { depth: 0.02, bevelEnabled: false }), 0.02)), glassMat());
      sw.position.x = sx * (W / 2 + 0.005);
      this.body.add(sw);
      // linha de porta e puxador
      const [cz0, cz1] = def.cabin;
      for (const z of [cz1 - 0.15, (cz0 + cz1) / 2 + 0.1]) {
        const seam = new THREE.Mesh(cg(`seam:${bodyType}`, () => new THREE.BoxGeometry(0.004, def.belt - 0.38, 0.012)), trimMat());
        seam.position.set(sx * (W / 2 + 0.012), (def.belt + 0.38) / 2, z);
        this.body.add(seam);
        const handle = new THREE.Mesh(cg('handle', () => new THREE.BoxGeometry(0.02, 0.03, 0.16)), chromeMat());
        handle.position.set(sx * (W / 2 + 0.018), def.belt - 0.1, z - 0.22);
        this.body.add(handle);
      }
      const mirror = new THREE.Mesh(cg('mirror', () => new THREE.BoxGeometry(0.12, 0.1, 0.16)), paintMat(color));
      mirror.position.set(sx * (W / 2 + 0.08), def.belt + 0.08, def.cabin[1] - 0.2);
      this.body.add(mirror);
      if (livery === 'candongueiro') {
        const stripe = new THREE.Mesh(cg(`stripe:${bodyType}`, () => new THREE.BoxGeometry(0.01, 0.22, def.L * 0.92)), paintMat('#f5f5f5'));
        stripe.position.set(sx * (W / 2 + 0.01), def.belt - 0.25, 0);
        this.body.add(stripe);
      }
    }
    // pára-brisas e vidro traseiro (planos inclinados)
    const top = def.body.reduce((m, [, y]) => Math.max(m, y), 0);
    const ws = def.body.find(([z, y]) => z > 0 && y >= top - 0.05) ?? [0.2, top];
    const hoodPt = def.body.find(([z, y]) => z > ws[0] && Math.abs(y - def.belt) < 0.06) ?? [ws[0] + 0.7, def.belt];
    const len = Math.hypot(hoodPt[0] - ws[0], hoodPt[1] - ws[1]);
    const windshield = new THREE.Mesh(cg(`ws:${bodyType}`, () => new THREE.PlaneGeometry(W - 0.3, len - 0.08)), glassMat());
    windshield.position.set(0, (hoodPt[1] + ws[1]) / 2 + 0.035, (hoodPt[0] + ws[0]) / 2 + 0.035);
    windshield.rotation.x = -Math.atan2(hoodPt[0] - ws[0], ws[1] - hoodPt[1]);
    this.body.add(windshield);
    // interior: bancos e volante
    for (const sx of [-1, 1]) {
      const seat = new THREE.Mesh(cg('seat', () => { const g = new THREE.BoxGeometry(0.5, 0.55, 0.12); g.translate(0, 0.27, 0); return g; }), seatMat());
      seat.position.set(sx * 0.38, def.belt - 0.45, (def.cabin[0] + def.cabin[1]) / 2 - 0.1);
      seat.rotation.x = -0.15;
      this.body.add(seat);
    }
    const sw = new THREE.Mesh(cg('steer', () => new THREE.TorusGeometry(0.18, 0.025, 8, 20)), trimMat());
    sw.position.set(0.38, def.belt + 0.05, def.cabin[1] - 0.45);
    sw.rotation.x = -0.4;
    this.body.add(sw);
    // ópticas, grelha, matrícula
    const frontZ = Math.max(...def.body.map(([z]) => z)) + 0.07;
    const rearZ = Math.min(...def.body.map(([z]) => z)) - 0.07;
    const lightY = def.body.find(([z]) => z > frontZ - 0.25)?.[1] ?? 0.7;
    for (const sx of [-1, 1]) {
      const h = new THREE.Mesh(cg('headl', () => new THREE.BoxGeometry(0.36, 0.12, 0.05)), this.head);
      h.position.set(sx * (W / 2 - 0.3), Math.min(lightY, 0.85) - 0.02, frontZ - 0.02);
      const strip = new THREE.Mesh(cg('drl', () => new THREE.BoxGeometry(0.3, 0.025, 0.05)), this.drl);
      strip.position.set(sx * (W / 2 - 0.3), Math.min(lightY, 0.85) - 0.1, frontZ - 0.015);
      const t = new THREE.Mesh(cg('taill', () => new THREE.BoxGeometry(0.42, 0.1, 0.05)), this.tail);
      t.position.set(sx * (W / 2 - 0.28), def.belt - 0.08, rearZ + 0.02);
      this.body.add(h, strip, t);
    }
    const grille = new THREE.Mesh(cg(`grille:${bodyType}`, () => new THREE.BoxGeometry(W * 0.45, 0.16, 0.04)), trimMat());
    grille.position.set(0, 0.58, frontZ - 0.01);
    const grilleFrame = new THREE.Mesh(cg(`gframe:${bodyType}`, () => new THREE.BoxGeometry(W * 0.47, 0.02, 0.045)), chromeMat());
    grilleFrame.position.set(0, 0.67, frontZ - 0.008);
    const bumperF = new THREE.Mesh(cg(`bump:${bodyType}`, () => new THREE.BoxGeometry(W - 0.05, 0.14, 0.12)), trimMat());
    bumperF.position.set(0, 0.36, frontZ - 0.04);
    const bumperR = bumperF.clone();
    bumperR.position.z = rearZ + 0.04;
    for (const z of [frontZ + 0.012, rearZ - 0.012]) {
      const plate = new THREE.Mesh(cg('plate', () => new THREE.PlaneGeometry(0.52, 0.12)), cm('platem', () => new THREE.MeshStandardMaterial({ map: plateTexture(), roughness: 0.4 })));
      plate.position.set(0, 0.47, z);
      if (z < 0) plate.rotation.y = Math.PI;
      this.body.add(plate);
    }
    this.body.add(grille, grilleFrame, bumperF, bumperR);
    if (livery === 'candongueiro') {
      const sign = new THREE.Mesh(cg('roofsign', () => new THREE.BoxGeometry(0.6, 0.16, 0.3)), lamp(0xfff176, 0.6));
      sign.position.set(0, top + 0.12, 0.3);
      this.body.add(sign);
    }
    if (bodyType === 'pickup') {
      const bed = new THREE.Mesh(cg('bed', () => new THREE.BoxGeometry(W - 0.25, 0.05, 1.8)), trimMat());
      bed.position.set(0, 1.0, -1.5);
      this.body.add(bed);
    }
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const w = wheel(def.r, 0.24, rims);
      w.position.set(sx * (W / 2 - 0.12), def.r, sz * def.wb / 2);
      if (sx > 0) w.rotation.y = Math.PI;
      this.root.add(w);
      this.wheels.push(w);
      if (sz > 0) this.front.push(w);
    }
    this.r = def.r;
    this.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }

  setLights(on, braking = false) {
    this.head.emissiveIntensity = on ? 2.4 : 0;
    this.drl.emissiveIntensity = 0.8;
    this.tail.emissiveIntensity = braking ? 2.6 : on ? 0.9 : 0.12;
  }

  animate(dt, speed, steer = 0, accel = 0) {
    const rot = (speed * dt) / this.r;
    for (const w of this.wheels) w.userData.spin.rotation.x += w.rotation.y ? -rot : rot;
    for (const w of this.front) w.rotation.y = (w.position.x > 0 ? Math.PI : 0) + steer;
    // suspensão: inclinação longitudinal (aceleração/travagem) e lateral (curva)
    const pitch = THREE.MathUtils.clamp(-accel * 0.006, -0.05, 0.05);
    const roll = THREE.MathUtils.clamp(steer * speed * 0.004, -0.06, 0.06);
    this.body.rotation.x += (pitch - this.body.rotation.x) * Math.min(1, dt * 5);
    this.body.rotation.z += (roll - this.body.rotation.z) * Math.min(1, dt * 5);
    this.body.position.y = Math.sin(performance.now() / 90) * Math.min(0.006, Math.abs(speed) * 0.0003);
  }

  setDoor() { /* portas animadas apenas no modelo glTF (Kianda GT) */ }
}

class ProceduralMoto {
  constructor(itemId, { paint, livery }) {
    this.kind = 'moto';
    this.itemId = itemId;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    const color = livery === 'kupapata' ? '#f9a825' : paint ?? '#263238';
    const pm = paintMat(color);
    this.head = lamp(0xfff4d6);
    this.tail = lamp(0xff1a1a, 0.15);
    const add = (g, m, p, r = [0, 0, 0]) => { const mesh = new THREE.Mesh(g, m); mesh.position.set(...p); mesh.rotation.set(...r); mesh.castShadow = true; this.body.add(mesh); return mesh; };
    add(cg('mtank', () => { const g = new THREE.SphereGeometry(0.2, 16, 12); g.scale(0.8, 0.6, 1.4); return g; }), pm, [0, 0.95, 0.18]);
    add(cg('mseat', () => { const g = new THREE.CapsuleGeometry(0.12, 0.5, 4, 10); g.rotateX(Math.PI / 2); g.scale(1, 0.5, 1); return g; }), seatMat(), [0, 0.92, -0.32]);
    add(cg('mtail', () => { const g = new THREE.BoxGeometry(0.2, 0.12, 0.5); return g; }), pm, [0, 0.9, -0.62], [0.25, 0, 0]);
    add(cg('mengine', () => new THREE.BoxGeometry(0.28, 0.3, 0.42)), cm('engine', () => new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.4, metalness: 0.7 })), [0, 0.52, 0.05]);
    add(cg('mframe', () => { const g = new THREE.CylinderGeometry(0.03, 0.03, 1.2, 8); g.rotateX(Math.PI / 2 - 0.3); return g; }), trimMat(), [0, 0.72, 0.0]);
    add(cg('mfork', () => new THREE.CylinderGeometry(0.03, 0.03, 0.8, 8)), chromeMat(), [0, 0.72, 0.62], [-0.35, 0, 0]);
    add(cg('mbar', () => { const g = new THREE.CylinderGeometry(0.018, 0.018, 0.72, 8); g.rotateZ(Math.PI / 2); return g; }), trimMat(), [0, 1.12, 0.52]);
    add(cg('mfair', () => { const g = new THREE.SphereGeometry(0.17, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1, 1.2, 0.7); return g; }), pm, [0, 1.0, 0.7], [Math.PI / 2 + 0.3, 0, 0]);
    add(cg('mhead', () => new THREE.CircleGeometry(0.075, 16)), this.head, [0, 1.0, 0.82]);
    add(cg('mtl', () => new THREE.BoxGeometry(0.12, 0.05, 0.03)), this.tail, [0, 0.95, -0.88]);
    add(cg('mexh', () => { const g = new THREE.CylinderGeometry(0.04, 0.05, 0.6, 10); g.rotateX(Math.PI / 2); return g; }), chromeMat(), [0.17, 0.42, -0.35]);
    if (livery === 'kupapata') add(cg('mbox', () => new THREE.BoxGeometry(0.32, 0.28, 0.3)), pm, [0, 1.12, -0.72]);
    this.wheels = [];
    for (const sz of [0.72, -0.72]) {
      const w = wheel(0.32, 0.12, 'desportiva');
      w.position.set(0, 0.32, sz);
      this.root.add(w);
      this.wheels.push(w);
    }
    this.front = [this.wheels[0]];
    this.r = 0.32;
  }

  setLights(on, braking = false) {
    this.head.emissiveIntensity = on ? 2.4 : 0.3;
    this.tail.emissiveIntensity = braking ? 2.6 : on ? 0.9 : 0.12;
  }

  animate(dt, speed, steer = 0) {
    const rot = (speed * dt) / this.r;
    for (const w of this.wheels) w.userData.spin.rotation.x += rot;
    this.front[0].rotation.y = steer * 0.6;
    this.root.rotation.z = THREE.MathUtils.lerp(this.root.rotation.z, -steer * Math.min(1, Math.abs(speed) / 12) * 0.9, Math.min(1, dt * 6));
  }

  setDoor() {}
}

// ------------------------------------------------------------ Kianda GT (glTF)
let gtPromise = null;
function loadGT(url) {
  if (!gtPromise) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    gtPromise = loader.loadAsync(new URL(`../${url}`, import.meta.url).href).then((gltf) => {
      const scene = gltf.scene;
      // normalizar: rodas no chão, centro entre eixos, frente para +Z
      scene.updateMatrixWorld(true);
      const fl = scene.getObjectByName('WheelFrontL');
      const rr = scene.getObjectByName('WheelRearR');
      const box = new THREE.Box3().setFromObject(scene);
      const pf = fl.getWorldPosition(new THREE.Vector3());
      const pr = rr.getWorldPosition(new THREE.Vector3());
      const wrap = new THREE.Group();
      wrap.add(scene);
      const forward = pf.clone().sub(pr).setY(0).normalize();
      wrap.rotation.y = Math.atan2(forward.x, forward.z) * -1;
      wrap.updateMatrixWorld(true);
      const box2 = new THREE.Box3().setFromObject(wrap);
      const mid = wrap.worldToLocal(fl.getWorldPosition(new THREE.Vector3()).add(rr.getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5));
      scene.position.x -= mid.x;
      scene.position.z -= mid.z;
      scene.position.y -= box2.min.y;
      void box;
      return { gltf, template: wrap };
    });
  }
  return gtPromise;
}

async function selectVariant(object, parser, variantIndex) {
  const tasks = [];
  object.traverse((o) => {
    if (!o.isMesh) return;
    const ext = o.userData.gltfExtensions?.KHR_materials_variants;
    if (!ext) return;
    o.userData.originalMaterial ??= o.material;
    const mapping = ext.mappings.find((m) => m.variants.includes(variantIndex));
    if (mapping) tasks.push(parser.getDependency('material', mapping.material).then((mat) => { o.material = mat; parser.assignFinalMaterial(o); }));
    else o.material = o.userData.originalMaterial;
  });
  await Promise.all(tasks);
}

class GTCar {
  constructor(itemId, item, { paint }) {
    this.kind = 'car';
    this.itemId = itemId;
    this.root = new THREE.Group();
    this.loaded = false;
    // substituto enquanto o modelo carrega (carregamento progressivo)
    this.placeholder = new ProceduralCar(itemId, 'sedan', { paint: '#7a0f0f' });
    this.root.add(this.placeholder.root);
    this.doors = { L: 0, R: 0 };
    this.doorTarget = { L: 0, R: 0 };
    loadGT(item.asset).then(async ({ gltf, template }) => {
      const inst = template.clone(true);
      const variants = gltf.parser.json.extensions?.KHR_materials_variants?.variants ?? [];
      const vi = Math.max(0, variants.findIndex((v) => v.name === paint));
      await selectVariant(inst, gltf.parser, vi);
      // materiais de luzes próprios desta instância
      this.lightMats = { head: [], brake: [] };
      inst.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        const n = o.material?.name ?? '';
        if (n === 'Headlight' || n === 'Brakelight' || n === 'Signallight') {
          o.material = o.material.clone();
          (n === 'Brakelight' ? this.lightMats.brake : this.lightMats.head).push(o.material);
          o.material.userData.baseEmissive = o.material.emissiveIntensity;
        }
      });
      const get = (n) => inst.getObjectByName(n);
      this.wheelNodes = ['WheelFrontL', 'WheelFrontR', 'WheelRearL', 'WheelRearR'].map((n) => { const w = get(n); return { w, q0: w.quaternion.clone(), front: n.includes('Front'), spin: 0 }; });
      this.doorNodes = { L: get('BodyDoorLColor1'), R: get('BodyDoorRColor1') };
      this.doorQ0 = { L: this.doorNodes.L.quaternion.clone(), R: this.doorNodes.R.quaternion.clone() };
      this.steerNode = get('InteriorSteeringWheel01')?.parent ?? null;
      this.root.remove(this.placeholder.root);
      this.root.add(inst);
      this.model = inst;
      this.loaded = true;
      this.setLights(this.lightsOn ?? false, this.braking ?? false);
    }).catch((e) => console.warn('Kianda GT indisponível, a usar substituto', e));
  }

  setLights(on, braking = false) {
    this.lightsOn = on;
    this.braking = braking;
    if (!this.loaded) { this.placeholder.setLights(on, braking); return; }
    for (const m of this.lightMats.head) m.emissiveIntensity = on ? Math.max(4, m.userData.baseEmissive ?? 1) : 0.05;
    for (const m of this.lightMats.brake) m.emissiveIntensity = braking ? 8 : on ? 2 : 0.05;
  }

  /** Abre/fecha a porta (0 fechada → 1 aberta) — usado nas animações de entrada/saída. */
  setDoor(side, open) { this.doorTarget[side] = THREE.MathUtils.clamp(open, 0, 1); }

  animate(dt, speed, steer = 0) {
    if (!this.loaded) { this.placeholder.animate(dt, speed, steer); return; }
    const axisX = new THREE.Vector3(1, 0, 0);
    const axisUp = new THREE.Vector3(0, 0, 1); // modelo original com Z para cima
    for (const wn of this.wheelNodes) {
      wn.spin -= (speed * dt) / 0.34;
      const q = wn.q0.clone();
      if (wn.front) q.multiply(new THREE.Quaternion().setFromAxisAngle(axisUp, steer));
      q.multiply(new THREE.Quaternion().setFromAxisAngle(axisX, wn.spin));
      wn.w.quaternion.copy(q);
    }
    for (const side of ['L', 'R']) {
      this.doors[side] += (this.doorTarget[side] - this.doors[side]) * Math.min(1, dt * 5);
      const ang = this.doors[side] * 1.1 * (side === 'L' ? -1 : 1);
      this.doorNodes[side].quaternion.copy(this.doorQ0[side]).multiply(new THREE.Quaternion().setFromAxisAngle(axisUp, ang));
    }
  }
}

/** Cria o modelo visual de um item do catálogo (ou de um tipo genérico de trânsito). */
export function createVehicle(itemId, { paint = null, rims = null } = {}) {
  const item = CATALOG_BY_ID.get(itemId);
  if (!item) return new ProceduralCar(itemId, 'sedan', { paint: paint ?? PAINT_PALETTE[0] });
  if (item.model === 'glb') return new GTCar(itemId, item, { paint: paint ?? item.paints[0] });
  if (item.vehicleClass === 'moto') return new ProceduralMoto(itemId, { paint, livery: item.livery });
  return new ProceduralCar(itemId, item.body, { paint: paint ?? PAINT_PALETTE[0], rims: rims ?? 'classica', livery: item.livery });
}

/** Mapeamento dos tipos de trânsito do servidor para modelos v2. */
export function trafficVehicle(kind, color) {
  const map = { car: 'sedan_kianda', taxi: 'candongueiro', carrinha: 'carrinha_lobito', moto: 'moto_ngola' };
  return createVehicle(map[kind] ?? 'sedan_kianda', { paint: color });
}
