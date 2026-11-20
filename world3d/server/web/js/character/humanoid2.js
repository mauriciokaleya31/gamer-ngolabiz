/**
 * Personagem v2 — malha esquelética (SkinnedMesh) gerada por código.
 *
 * - Esqueleto de 19 ossos; corpo contínuo (tronco, pescoço, braços, pernas) com
 *   pesos de pele calculados por proximidade aos segmentos dos ossos, para dobrar
 *   suavemente nas articulações (sem "bonecos de cápsulas").
 * - Proporções por género, altura e tipo de corpo; peito/anca/glúteos modelados.
 * - Cabeça esculpida (maxilar, maçãs do rosto, órbitas), nariz, orelhas, olhos com
 *   íris e pupila, pálpebras (piscar), sobrancelhas e lábios com morph targets
 *   (sorriso, tristeza, boca aberta, "O") para expressões faciais.
 * - Mãos com poses (aberta, punho, apontar, polegar para cima).
 * - Roupa em camadas skinned (malha de algodão, ganga, capulana, acolchoado…),
 *   calçado, cabelos (incl. tranças com missangas, locs, afro), barbas e acessórios.
 *
 * Continua a ser um MODELO PROCEDURAL (provisório face a arte final de artista /
 * MetaHuman no UE5), mas com topologia contínua, esqueleto e expressões reais.
 */
import * as THREE from 'three';
import { mergeGeometries } from '../../vendor/three/utils/BufferGeometryUtils.js';
import * as F from './fabric.js';

const GEO = new Map();
const cached = (k, f) => { if (!GEO.has(k)) GEO.set(k, f()); return GEO.get(k); };
const MATS = new Map();
const cachedMat = (k, f) => { if (!MATS.has(k)) MATS.set(k, f()); return MATS.get(k); };

export const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'upperArmL', 'foreArmL', 'handL', 'upperArmR', 'foreArmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];

/** Posições de ligação (bind) em metros, personagem virada para +Z, esquerda = +X. */
export function rigLayout(a) {
  const s = (a.height ?? 1.75) / 1.75;
  const f = a.gender === 'f';
  const w = a.bodyType === 'robusto' ? 1.14 : a.bodyType === 'magro' ? 0.91 : 1;
  const shX = (f ? 0.168 : 0.19) * s * (0.93 + 0.07 * w);
  const hipX = (f ? 0.092 : 0.088) * s * w;
  const P = {
    hips: [0, 0.95, 0], spine: [0, 1.05, 0], chest: [0, 1.27, 0], neck: [0, 1.48, 0], head: [0, 1.57, 0],
    upperArmL: [shX, 1.42, 0], foreArmL: [shX + 0.012, 1.135, -0.01], handL: [shX + 0.02, 0.875, 0.005],
    upperArmR: [-shX, 1.42, 0], foreArmR: [-shX - 0.012, 1.135, -0.01], handR: [-shX - 0.02, 0.875, 0.005],
    thighL: [hipX, 0.925, 0], shinL: [hipX, 0.505, 0.008], footL: [hipX, 0.085, -0.01],
    thighR: [-hipX, 0.925, 0], shinR: [-hipX, 0.505, 0.008], footR: [-hipX, 0.085, -0.01],
  };
  for (const k of Object.keys(P)) P[k] = [P[k][0], P[k][1] * s, P[k][2] * s];
  const parent = { spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck', upperArmL: 'chest', foreArmL: 'upperArmL', handL: 'foreArmL', upperArmR: 'chest', foreArmR: 'upperArmR', handR: 'foreArmR', thighL: 'hips', shinL: 'thighL', footL: 'shinL', thighR: 'hips', shinR: 'thighR', footR: 'shinR' };
  // segmentos para pesos (osso → ponto final)
  const end = {
    hips: [0, 1.05 * s, 0], spine: P.chest, chest: P.neck, neck: P.head, head: [0, 1.75 * s, 0],
    upperArmL: P.foreArmL, foreArmL: P.handL, handL: [P.handL[0], P.handL[1] - 0.17 * s, P.handL[2]],
    upperArmR: P.foreArmR, foreArmR: P.handR, handR: [P.handR[0], P.handR[1] - 0.17 * s, P.handR[2]],
    thighL: P.shinL, shinL: P.footL, footL: [P.footL[0], 0.02, P.footL[2] + 0.16 * s],
    thighR: P.shinR, shinR: P.footR, footR: [P.footR[0], 0.02, P.footR[2] + 0.16 * s],
  };
  return { s, f, w, P, parent, end };
}

function segDist(p, a, b) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
  const t = l2 ? Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / l2)) : 0;
  return Math.hypot(a[0] + ab[0] * t - p[0], a[1] + ab[1] * t - p[1], a[2] + ab[2] * t - p[2]);
}

/** Pesos de pele por proximidade aos segmentos dos ossos candidatos (2 maiores). */
function applySkin(geo, rig, candidates, sharpness = 5) {
  const pos = geo.attributes.position;
  const idx = new Uint16Array(pos.count * 4);
  const wts = new Float32Array(pos.count * 4);
  const ids = candidates.map((b) => BONES.indexOf(b));
  for (let i = 0; i < pos.count; i++) {
    const p = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const ws = candidates.map((b) => 1 / Math.pow(segDist(p, rig.P[b], rig.end[b]) + 0.012, sharpness));
    const order = ws.map((w, k) => [w, k]).sort((x, y) => y[0] - x[0]).slice(0, 2);
    const sum = order.reduce((s, [w]) => s + w, 0);
    order.forEach(([w, k], j) => { idx[i * 4 + j] = ids[k]; wts[i * 4 + j] = w / sum; });
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wts, 4));
  return geo;
}

/**
 * Tubo ao longo de uma polilinha com secção elíptica/superelíptica variável.
 * profile(u) → { rx, rz, front, back } em metros; u ∈ [0,1] ao longo do comprimento.
 */
function tube(points, profile, { radial = 18, step = 0.022, capStart = false, capEnd = false, exponent = 2, hem = null, uvScale = 0.35 } = {}) {
  const segLen = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) { const d = points[i].distanceTo(points[i - 1]); segLen.push(d); total += d; }
  const rings = Math.max(2, Math.ceil(total / step) + 1);
  const pos = [];
  const nor = [];
  const uv = [];
  const col = [];
  const idx = [];
  const at = (u) => {
    let d = u * total;
    for (let i = 0; i < segLen.length; i++) {
      if (d <= segLen[i] || i === segLen.length - 1) {
        const t = segLen[i] ? Math.min(1, d / segLen[i]) : 0;
        const p = points[i].clone().lerp(points[i + 1], t);
        const dir = points[i + 1].clone().sub(points[i]).normalize();
        return { p, dir };
      }
      d -= segLen[i];
    }
    return { p: points.at(-1).clone(), dir: new THREE.Vector3(0, -1, 0) };
  };
  for (let r = 0; r < rings; r++) {
    const u = r / (rings - 1);
    const { p, dir } = at(u);
    // referencial: eixo X mundial projectado perpendicularmente à direcção
    const X = new THREE.Vector3(1, 0, 0).addScaledVector(dir, -dir.x).normalize();
    const Z = new THREE.Vector3().crossVectors(X, dir).normalize().multiplyScalar(Math.sign(dir.y) <= 0 ? 1 : -1);
    const pr = profile(u);
    const darken = hem && (u < hem[0] || u > hem[1]) ? 0.72 : 1;
    for (let k = 0; k <= radial; k++) {
      const th = (k / radial) * Math.PI * 2;
      const c = Math.cos(th);
      const sn = Math.sin(th);
      const e = 2 / exponent;
      const cx = Math.sign(c) * Math.pow(Math.abs(c), e);
      const sz = Math.sign(sn) * Math.pow(Math.abs(sn), e);
      // bossas frontais/traseiras (peito, glúteos, barriga da perna)
      const bump = sn > 0 ? (pr.front ?? 0) * Math.pow(sn, 3) * Math.max(0, 1 - Math.abs(c) * 1.3) : -(pr.back ?? 0) * Math.pow(-sn, 3) * Math.max(0, 1 - Math.abs(c) * 1.3);
      const v = p.clone().addScaledVector(X, cx * pr.rx).addScaledVector(Z, sz * pr.rz + bump);
      pos.push(v.x, v.y, v.z);
      const n = X.clone().multiplyScalar(cx / Math.max(1e-4, pr.rx)).addScaledVector(Z, sz / Math.max(1e-4, pr.rz)).normalize();
      nor.push(n.x, n.y, n.z);
      uv.push(k / radial, (u * total) / uvScale);
      col.push(darken, darken, darken);
    }
  }
  for (let r = 0; r < rings - 1; r++) {
    for (let k = 0; k < radial; k++) {
      const a = r * (radial + 1) + k;
      const b = a + radial + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const addCap = (ring, flip) => {
    const { p, dir } = at(ring === 0 ? 0 : 1);
    const ci = pos.length / 3;
    pos.push(p.x, p.y, p.z);
    const n = dir.clone().multiplyScalar(flip ? -1 : 1);
    nor.push(n.x, n.y, n.z);
    uv.push(0.5, 0.5);
    col.push(1, 1, 1);
    const base = ring * (radial + 1);
    for (let k = 0; k < radial; k++) flip ? idx.push(ci, base + k + 1, base + k) : idx.push(ci, base + k, base + k + 1);
  };
  if (capStart) addCap(0, true);
  if (capEnd) addCap(rings - 1, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const lerpK = (pts, u) => {
  // interpolação linear por pontos [[u, valor], ...]
  for (let i = 1; i < pts.length; i++) if (u <= pts[i][0]) { const [u0, v0] = pts[i - 1]; const [u1, v1] = pts[i]; const t = (u - u0) / (u1 - u0); return v0 + (v1 - v0) * (t * t * (3 - 2 * t)); }
  return pts.at(-1)[1];
};

// ------------------------------------------------------------------- corpo
const TORSO_Y = { m: { rx: [[0.86, 0.12], [0.94, 0.158], [1.05, 0.148], [1.2, 0.163], [1.32, 0.178], [1.41, 0.198], [1.45, 0.186], [1.49, 0.125], [1.53, 0.058]], rz: [[0.86, 0.092], [0.94, 0.108], [1.05, 0.1], [1.2, 0.108], [1.32, 0.112], [1.41, 0.096], [1.45, 0.086], [1.49, 0.07], [1.53, 0.054]] },
  f: { rx: [[0.86, 0.115], [0.94, 0.172], [1.05, 0.134], [1.2, 0.146], [1.3, 0.152], [1.41, 0.174], [1.45, 0.162], [1.49, 0.108], [1.53, 0.053]], rz: [[0.86, 0.09], [0.94, 0.112], [1.05, 0.092], [1.2, 0.096], [1.3, 0.098], [1.41, 0.088], [1.45, 0.08], [1.49, 0.066], [1.53, 0.05]] } };

/** Perfil do tronco em função da altura (m, à escala 1.75 m). */
function torsoAtY(rig, inflate = 0) {
  const { s, f, w } = rig;
  const T = TORSO_Y[f ? 'f' : 'm'];
  return (y) => ({
    rx: lerpK(T.rx, y) * s * w + inflate,
    rz: lerpK(T.rz, y) * s * (0.94 + 0.06 * w) + inflate,
    front: ((f ? 0.046 : 0.012) * Math.exp(-((y - (f ? 1.29 : 1.31)) ** 2) / 0.0025) + (w > 1.05 ? 0.03 * Math.exp(-((y - 1.08) ** 2) / 0.006) : 0)) * s,
    back: (f ? 0.036 : 0.022) * Math.exp(-((y - 0.92) ** 2) / 0.0025) * s,
  });
}

/** Tubo do tronco entre as alturas y0 e y1 (perfil amostrado por altura). */
function torsoTube(rig, y0, y1, inflate, opts) {
  const pr = torsoAtY(rig, inflate);
  return tube(torsoPoints(rig, y0, y1), (u) => pr(y0 + u * (y1 - y0)), opts);
}

function torsoPoints(rig, y0 = 0.86, y1 = 1.53) {
  return [V([0, y0 * rig.s, -0.005]), V([0, ((y0 + y1) / 2) * rig.s, -0.01]), V([0, y1 * rig.s, -0.015])];
}

function legPoints(rig, side) {
  const P = rig.P;
  const t = side === 'L' ? 'thighL' : 'thighR';
  const sh = side === 'L' ? 'shinL' : 'shinR';
  const ft = side === 'L' ? 'footL' : 'footR';
  return [V([P[t][0], P[t][1] + 0.04 * rig.s, P[t][2]]), V(P[sh]), V(P[ft])];
}

function legProfile(rig, inflate = 0, female = rig.f) {
  const { s, w } = rig;
  return (u) => {
    const r = lerpK([[0, 0.088], [0.18, 0.08], [0.45, 0.056], [0.52, 0.05], [0.66, 0.055], [0.92, 0.036], [1, 0.034]], u) * s * w * (female ? 1.04 : 1);
    return { rx: r * 0.95 + inflate, rz: r * 1.02 + inflate, back: (u > 0.55 && u < 0.85 ? 0.01 : 0) * s };
  };
}

function armPoints(rig, side) {
  const P = rig.P;
  const ua = `upperArm${side}`;
  const fa = `foreArm${side}`;
  const h = `hand${side}`;
  return [V([P[ua][0] * 0.94, P[ua][1] + 0.03 * rig.s, P[ua][2]]), V(P[fa]), V(P[h])];
}

function armProfile(rig, inflate = 0) {
  const { s, w, f } = rig;
  return (u) => {
    const r = lerpK([[0, 0.052], [0.12, 0.05], [0.47, 0.037], [0.52, 0.036], [0.62, 0.04], [0.95, 0.028], [1, 0.027]], u) * s * w * (f ? 0.9 : 1);
    return { rx: r + inflate, rz: r * 1.05 + inflate };
  };
}

// ------------------------------------------------------------------ cabeça
function headGeometry(rig, face) {
  const { s, f } = rig;
  const shape = face?.shape ?? 0;
  return cached(`head:${s.toFixed(3)}:${f}:${shape}`, () => {
    const jaw = [1, 0.82, 1.22, 0.95][shape];
    const len = [1, 1.05, 0.98, 1.09][shape];
    const g = new THREE.SphereGeometry(1, 40, 30);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i);
      let y = p.getY(i);
      let z = p.getZ(i);
      // maxilar e queixo
      if (y < 0) {
        const k = Math.pow(-y, 1.6);
        x *= 1 - 0.3 * k / jaw;
        z *= 1 - 0.12 * k;
        if (z > 0) z += 0.12 * k * z;
      }
      // crânio posterior mais volumoso, testa ligeiramente plana
      if (z < 0 && y > -0.2) z *= 1.08;
      if (z > 0.55 && y > 0.25) z -= 0.05 * (y - 0.25);
      // maçãs do rosto
      x += Math.sign(x) * 0.06 * Math.exp(-(((y + 0.05) ** 2) / 0.02 + ((z - 0.6) ** 2) / 0.05));
      // órbitas
      for (const sx of [-1, 1]) {
        const d2 = (x - sx * 0.38) ** 2 + ((y - 0.08) ** 2) * 1.5;
        if (z > 0.5) z -= 0.07 * Math.exp(-d2 / 0.018);
      }
      p.setXYZ(i, x * (f ? 0.073 : 0.077) * s, (y * 0.112 * len + 0.098) * s, z * (f ? 0.094 : 0.097) * s);
    }
    g.computeVertexNormals();
    // nariz (largo, natural) e orelhas
    const noseW = [1.0, 0.9, 1.08, 0.95][shape] * (f ? 0.92 : 1);
    const bridge = new THREE.CylinderGeometry(0.008 * s, 0.013 * s * noseW, 0.045 * s, 10);
    bridge.rotateX(-0.25);
    bridge.translate(0, 0.098 * s, 0.093 * s);
    const tip = new THREE.SphereGeometry(0.016 * s, 14, 10);
    tip.scale(noseW * 1.1, 0.85, 0.85);
    tip.translate(0, 0.075 * s, 0.1 * s);
    const parts = [g.toNonIndexed(), bridge.toNonIndexed(), tip.toNonIndexed()];
    for (const sx of [-1, 1]) {
      const wing = new THREE.SphereGeometry(0.011 * s, 10, 8);
      wing.translate(sx * 0.016 * s * noseW, 0.072 * s, 0.092 * s);
      parts.push(wing.toNonIndexed());
      const ear = new THREE.TorusGeometry(0.019 * s, 0.006 * s, 6, 14, Math.PI * 1.3);
      ear.scale(1, 1.35, 0.6);
      ear.rotateZ(-Math.PI * 0.65);
      ear.rotateY(sx * Math.PI / 2);
      ear.translate(sx * 0.074 * s, 0.1 * s, -0.005 * s);
      parts.push(ear.toNonIndexed());
    }
    for (const q of parts) q.deleteAttribute('uv');
    const merged = mergeGeometries(parts);
    const pos = merged.attributes.position;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) { uv[i * 2] = pos.getX(i) * 6; uv[i * 2 + 1] = pos.getY(i) * 6; }
    merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return merged;
  });
}

function eyeGeometry(s, irisColor) {
  return cached(`eye:${s.toFixed(3)}:${irisColor}`, () => {
    const g = new THREE.SphereGeometry(0.0125 * s, 16, 12);
    const p = g.attributes.position;
    const c = [];
    const iris = new THREE.Color(irisColor);
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i) / (0.0125 * s);
      if (z > 0.95) c.push(0.02, 0.02, 0.02);
      else if (z > 0.72) c.push(iris.r, iris.g, iris.b);
      else c.push(0.82, 0.79, 0.74);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    return g;
  });
}

/** Lábios com morph targets: 0 sorriso, 1 tristeza, 2 aberta, 3 "O". */
function lipGeometry(s, upper) {
  return cached(`lip:${s.toFixed(3)}:${upper}`, () => {
    const make = (smile, open, round) => {
      const w = 0.022 * s * (1 - round * 0.35);
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8 - 0.5;
        const x = t * 2 * w;
        const curve = (upper ? 0.0025 : -0.0025) * s * (1 - Math.abs(t * 2) ** 2);
        const corner = (Math.abs(t * 2) ** 2) * smile * 0.006 * s;
        const o = (upper ? 1 : -1) * open * 0.006 * s * (1 - Math.abs(t * 2) ** 2) * (1 + round);
        pts.push(new THREE.Vector3(x, curve + corner + o, -Math.abs(t) * 0.01 * s));
      }
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, (upper ? 0.0042 : 0.0052) * s, 6, false);
    };
    const base = make(0, 0, 0);
    base.morphAttributes.position = [make(1, 0, 0), make(-1, 0, 0), make(0.2, 1, 0), make(0, 0.9, 1)].map((g) => g.attributes.position);
    return base;
  });
}

// ------------------------------------------------------------------- mãos
function handGeometry(s, pose, female) {
  return cached(`hand:${s.toFixed(3)}:${pose}:${female}`, () => {
    const k = s * (female ? 0.92 : 1);
    const parts = [];
    const palm = new THREE.BoxGeometry(0.026 * k, 0.085 * k, 0.075 * k, 2, 2, 2);
    palm.translate(0, -0.045 * k, 0.004 * k);
    parts.push(palm);
    const curl = { open: [0, 0, 0, 0], fist: [1.5, 1.5, 1.5, 1.5], point: [0, 1.5, 1.5, 1.5], thumb: [1.5, 1.5, 1.5, 1.5], clap: [0.15, 0.15, 0.15, 0.15] }[pose] ?? [0.2, 0.25, 0.3, 0.35];
    [0.026, 0.009, -0.009, -0.026].forEach((zz, i) => {
      const len = [0.07, 0.078, 0.072, 0.058][i] * k;
      const a = curl[i];
      const seg1 = new THREE.CapsuleGeometry(0.0085 * k, len * 0.45, 3, 6);
      seg1.translate(0, -len * 0.25, 0);
      seg1.rotateX(a * 0.6);
      const seg2 = new THREE.CapsuleGeometry(0.0078 * k, len * 0.4, 3, 6);
      seg2.translate(0, -len * 0.22, 0);
      seg2.rotateX(a);
      const base = new THREE.Vector3(0, -0.088 * k, zz * k / s * (female ? 1 : 1));
      const mid = new THREE.Vector3(0, -len * 0.5 * Math.cos(a * 0.6), len * 0.5 * Math.sin(a * 0.6));
      seg1.translate(base.x, base.y, base.z);
      seg2.translate(base.x + mid.x, base.y + mid.y, base.z + mid.z);
      parts.push(seg1, seg2);
    });
    const th = new THREE.CapsuleGeometry(0.01 * k, 0.04 * k, 3, 6);
    th.translate(0, -0.025 * k, 0);
    if (pose === 'thumb') { th.rotateX(Math.PI); th.translate(0.0, -0.035 * k, 0.04 * k); } else { th.rotateX(pose === 'fist' || pose === 'point' ? 1.2 : 0.7); th.rotateZ(-0.3); th.translate(0.008 * k, -0.03 * k, 0.04 * k); }
    parts.push(th);
    return mergeGeometries(parts.map((p) => { p.deleteAttribute('uv'); return p.index ? p.toNonIndexed() : p; }));
  });
}

// ---------------------------------------------------------------- calçado
function shoeGeometry(s, style) {
  return cached(`shoe:${s.toFixed(3)}:${style}`, () => {
    const parts = { sole: [], upper: [], skin: [] };
    const L = 0.26 * s;
    const W = 0.095 * s;
    const sole = new THREE.BoxGeometry(W, style === 'chinelos' ? 0.014 * s : 0.03 * s, L, 2, 1, 4);
    sole.translate(0, -0.07 * s, 0.065 * s);
    parts.sole.push(sole);
    if (style === 'chinelos') {
      const foot = new THREE.CapsuleGeometry(0.035 * s, 0.17 * s, 4, 8);
      foot.rotateX(Math.PI / 2);
      foot.scale(1.15, 0.7, 1);
      foot.translate(0, -0.05 * s, 0.06 * s);
      parts.skin.push(foot);
      const strap = new THREE.TorusGeometry(0.036 * s, 0.006 * s, 6, 12, Math.PI);
      strap.translate(0, -0.055 * s, 0.11 * s);
      parts.upper.push(strap);
    } else {
      const up = new THREE.CapsuleGeometry(0.045 * s, 0.15 * s, 4, 10);
      up.rotateX(Math.PI / 2);
      up.scale(1, style === 'sapatos' ? 0.6 : 0.78, 1);
      up.translate(0, -0.035 * s, 0.065 * s);
      parts.upper.push(up);
      if (style === 'botas') {
        const shaft = new THREE.CylinderGeometry(0.048 * s, 0.05 * s, 0.13 * s, 12);
        shaft.translate(0, 0.02 * s, -0.005 * s);
        parts.upper.push(shaft);
      } else {
        const collar = new THREE.CylinderGeometry(0.042 * s, 0.047 * s, 0.05 * s, 12);
        collar.translate(0, -0.02 * s, -0.01 * s);
        parts.upper.push(collar);
      }
    }
    const out = {};
    for (const [k, list] of Object.entries(parts)) if (list.length) out[k] = mergeGeometries(list.map((p) => p.index ? p.toNonIndexed() : p));
    return out;
  });
}

// ---------------------------------------------------------------- materiais
function clothMaterial(kind, color, pattern) {
  return cachedMat(`cloth:${kind}:${color}:${pattern}`, () => {
    let map;
    if (pattern === 'capulana' || kind.includes('capulana')) map = F.capulana(color);
    else if (pattern === 'riscas') map = F.stripes(color);
    else if (kind === 'calca_ganga' || kind === 'calca_cargo') map = F.denim(color);
    else if (kind === 'colete') map = F.quilted(color);
    else if (kind === 'fato_treino') map = F.tracksuit(color);
    else map = F.knit(color);
    return new THREE.MeshPhysicalMaterial({ map, color: 0xffffff, roughness: kind === 'colete' ? 0.45 : 0.85, sheen: 0.5, sheenRoughness: 0.8, sheenColor: new THREE.Color(color).multiplyScalar(0.6), vertexColors: true, side: THREE.DoubleSide });
  });
}

const skinMat = (tone) => cachedMat(`skin:${tone}`, () => new THREE.MeshPhysicalMaterial({ map: F.skin(tone), roughness: 0.52, sheen: 0.25, sheenColor: new THREE.Color('#ffd7c2'), sheenRoughness: 0.6 }));
const plainMat = (color, rough = 0.7, metal = 0, extra = {}) => cachedMat(`p:${color}:${rough}:${metal}:${JSON.stringify(extra)}`, () => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra }));
const hairMat = (color, coily) => cachedMat(`hair:${color}:${coily}`, () => new THREE.MeshStandardMaterial({ map: F.hairStrands(color, coily), roughness: 0.75, color: 0xffffff }));

const LONG = new Set(['camisa', 'casaco_leve', 'uniforme_seguranca', 'macacao', 'fato_treino', 'blazer', 'camisa_avental', 'hoodie', 'colete']);
const SKIRTS = new Set(['saia', 'saia_capulana']);

/** Normaliza aparências antigas (shoes = cor, accessory único). */
export function normalizeAppearance(a = {}) {
  const out = { gender: 'm', height: 1.75, bodyType: 'medio', skinTone: '#6b4430', hairStyle: 'curto', hairColor: '#1b1410', top: 't-shirt', topColor: '#1e88e5', topPattern: 'liso', bottom: 'calca_ganga', bottomColor: '#1c2a48', shoes: 'tenis', shoesColor: '#1a1a1a', accessories: {}, face: { shape: 0, eyes: 0, beard: 'nenhuma' }, posture: 'normal', ...a };
  if (typeof out.shoes === 'string' && out.shoes.startsWith('#')) { out.shoesColor = out.shoes; out.shoes = 'tenis'; }
  if (out.accessory && (!out.accessories || !Object.keys(out.accessories).length)) {
    const slot = { bone: 'head', chapeu: 'head', lenco_cabeca: 'head', auscultadores: 'head', oculos: 'eyes', fio: 'neck' }[out.accessory];
    out.accessories = slot ? { [slot]: out.accessory } : {};
  }
  out.face = { shape: 0, eyes: 0, beard: 'nenhuma', ...(out.face ?? {}) };
  return out;
}

export class Humanoid2 {
  constructor(appearance, { shadows = true } = {}) {
    this.a = normalizeAppearance(appearance);
    this.shadows = shadows;
    this.root = new THREE.Group();
    this.root.name = 'humanoid2';
    this.anim = 'idle';
    this.emote = null;
    this.phase = Math.random() * 10;
    this.pose = {};
    this.face = { smile: 0, sad: 0, open: 0, round: 0, browUp: 0, browAngry: 0, blink: 0 };
    this.handPose = { L: 'relaxed', R: 'relaxed' };
    this.nextBlink = 1 + Math.random() * 3;
    this.build();
  }

  build() {
    const a = this.a;
    const rig = rigLayout(a);
    this.rig = rig;
    // esqueleto
    const bones = {};
    for (const name of BONES) {
      const b = new THREE.Bone();
      b.name = name;
      bones[name] = b;
    }
    for (const name of BONES) {
      const par = rig.parent[name];
      const pw = rig.P[name];
      if (par) {
        const pp = rig.P[par];
        bones[name].position.set(pw[0] - pp[0], pw[1] - pp[1], pw[2] - pp[2]);
        bones[par].add(bones[name]);
      } else bones[name].position.set(...pw);
    }
    this.bones = bones;
    this.root.add(bones.hips);
    this.root.updateMatrixWorld(true);
    this.skeleton = new THREE.Skeleton(BONES.map((n) => bones[n]));
    this.restQ = Object.fromEntries(BONES.map((n) => [n, bones[n].quaternion.clone()]));
    this.restHipsY = bones.hips.position.y;

    const key = `${rig.s.toFixed(3)}:${a.gender}:${a.bodyType}`;
    const skinM = skinMat(a.skinTone);
    const addSkinned = (geo, mat) => {
      const m = new THREE.SkinnedMesh(geo, mat);
      m.bind(this.skeleton);
      m.castShadow = this.shadows;
      m.frustumCulled = false;
      this.root.add(m);
      return m;
    };

    // --- corpo (pele) — partes cobertas pela roupa ficam escondidas por baixo
    const bodyGeo = cached(`body:${key}`, () => {
      const torso = applySkin(torsoTube(rig, 0.86, 1.53, 0, { radial: 24, capStart: true, exponent: 2.3 }), rig, ['hips', 'spine', 'chest', 'neck', 'thighL', 'thighR', 'upperArmL', 'upperArmR']);
      const neck = applySkin(tube([V([0, 1.5 * rig.s, -0.012]), V([0, 1.63 * rig.s, -0.008])], (u) => ({ rx: (0.056 - u * 0.008) * rig.s * (rig.f ? 0.9 : 1), rz: (0.056 - u * 0.004) * rig.s })), rig, ['chest', 'neck', 'head']);
      const legs = ['L', 'R'].map((sd) => applySkin(tube(legPoints(rig, sd), legProfile(rig), { radial: 16 }), rig, ['hips', `thigh${sd}`, `shin${sd}`, `foot${sd}`]));
      const arms = ['L', 'R'].map((sd) => applySkin(tube(armPoints(rig, sd), armProfile(rig), { radial: 14, capEnd: true }), rig, ['chest', `upperArm${sd}`, `foreArm${sd}`, `hand${sd}`]));
      return mergeGeometries([torso, neck, ...legs, ...arms].map((g) => { g.deleteAttribute('color'); return g; }));
    });
    this.body = addSkinned(bodyGeo, skinM);

    // --- roupa
    this.buildClothing(rig, key, addSkinned);

    // --- cabeça, rosto e cabelo (rígidos no osso da cabeça)
    const head = bones.head;
    const s = rig.s;
    const hm = new THREE.Mesh(headGeometry(rig, a.face), skinM);
    hm.castShadow = this.shadows;
    head.add(hm);
    const iris = ['#3b2314', '#2a1a10', '#4a2e1a', '#1c120c'][a.face.eyes ?? 0];
    this.eyes = [];
    this.lids = [];
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeometry(s, iris), plainMat('#ffffff', 0.15, 0, { vertexColors: true }));
      eye.position.set(sx * 0.031 * s, 0.11 * s, 0.081 * s);
      head.add(eye);
      this.eyes.push(eye);
      const lid = new THREE.Mesh(cached(`lid:${s.toFixed(3)}`, () => new THREE.SphereGeometry(0.0138 * s, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5)), skinM);
      lid.position.copy(eye.position);
      head.add(lid);
      this.lids.push(lid);
      const brow = new THREE.Mesh(cached(`brow:${s.toFixed(3)}`, () => new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.015 * s, -0.002 * s, -0.003 * s), new THREE.Vector3(0, 0.004 * s, 0.002 * s), new THREE.Vector3(0.016 * s, -0.003 * s, -0.004 * s)), 8, 0.0022 * s, 5)), plainMat(a.hairColor, 0.9));
      brow.position.set(sx * 0.031 * s, 0.132 * s, 0.093 * s);
      brow.userData.side = sx;
      head.add(brow);
      (this.brows ??= []).push(brow);
    }
    const lipColor = `#${new THREE.Color(a.skinTone).multiplyScalar(0.72).lerp(new THREE.Color('#8a3a3a'), 0.25).getHexString()}`;
    const lipM = cachedMat(`lip:${lipColor}`, () => new THREE.MeshStandardMaterial({ color: lipColor, roughness: 0.35 }));
    this.mouthInner = new THREE.Mesh(cached('mouthIn', () => new THREE.CircleGeometry(0.014, 16)), plainMat('#2a0d0d', 1));
    this.mouthInner.position.set(0, 0.052 * s, 0.093 * s);
    this.mouthInner.scale.set(1, 0.05, 1);
    head.add(this.mouthInner);
    this.lips = [true, false].map((upper) => {
      const m = new THREE.Mesh(lipGeometry(s, upper), lipM);
      m.position.set(0, (upper ? 0.056 : 0.049) * s, 0.098 * s);
      m.morphTargetInfluences = [0, 0, 0, 0];
      head.add(m);
      return m;
    });
    this.buildHair(head, rig);
    this.buildBeard(head, rig);

    // --- mãos e calçado
    this.hands = {};
    for (const sd of ['L', 'R']) {
      const hmesh = new THREE.Mesh(handGeometry(s, 'relaxed', rig.f), skinM);
      hmesh.castShadow = this.shadows;
      bones[`hand${sd}`].add(hmesh);
      this.hands[sd] = hmesh;
      const shoe = shoeGeometry(s, a.shoes);
      const soleColor = a.shoes === 'tenis_brancos' || a.shoes === 'tenis' ? '#f2f2f2' : '#1b1b1b';
      if (shoe.sole) bones[`foot${sd}`].add(Object.assign(new THREE.Mesh(shoe.sole, plainMat(soleColor, 0.6)), { castShadow: this.shadows }));
      const upColor = a.shoes === 'tenis_brancos' ? '#f5f5f5' : a.shoesColor;
      if (shoe.upper) bones[`foot${sd}`].add(Object.assign(new THREE.Mesh(shoe.upper, a.shoes === 'sapatos' || a.shoes === 'botas' ? plainMat(upColor, 0.32, 0.1) : plainMat(upColor, 0.7)), { castShadow: this.shadows }));
      if (shoe.skin) bones[`foot${sd}`].add(new THREE.Mesh(shoe.skin, skinM));
    }
    this.buildAccessories(rig);
  }

  buildClothing(rig, key, addSkinned) {
    const a = this.a;
    const top = a.top;
    const dress = top === 'vestido';
    const long = LONG.has(top);
    const s = rig.s;
    const topCol = a.topColor;
    const topM = clothMaterial(top, topCol, a.topPattern);
    // parte de cima: tronco + mangas
    const topGeo = cached(`top:${key}:${top}`, () => {
      const parts = [];
      const torsoTop = top === 'colete' ? 1.495 : ['camisa', 'polo', 'blazer', 'uniforme_seguranca', 'camisa_avental'].includes(top) ? 1.535 : 1.515;
      const y0 = dress ? 0.98 : top === 'casaco_leve' || top === 'blazer' || top === 'hoodie' || top === 'colete' ? 0.9 : 0.93;
      parts.push(applySkin(torsoTube(rig, y0, torsoTop, (top === 'colete' ? 0.022 : 0.017) * rig.s, { radial: 24, exponent: 2.3, hem: [0.06, 2] }), rig, ['hips', 'spine', 'chest', 'neck', 'upperArmL', 'upperArmR']));
      const sleeveEnd = top === 'colete' ? 0 : long ? 0.97 : top === 'vestido' || top === 'blusa' ? 0.2 : 0.4;
      if (sleeveEnd > 0) {
        for (const sd of ['L', 'R']) {
          const ap = armProfile(rig, 0.01);
          const pts = armPoints(rig, sd);
          const full = pts[0].distanceTo(pts[1]) + pts[1].distanceTo(pts[2]);
          const cut = sleeveEnd * full;
          const d1 = pts[0].distanceTo(pts[1]);
          const endP = cut <= d1 ? pts[0].clone().lerp(pts[1], cut / d1) : pts[1].clone().lerp(pts[2], (cut - d1) / pts[1].distanceTo(pts[2]));
          const sp = cut <= d1 ? [pts[0], endP] : [pts[0], pts[1], endP];
          parts.push(applySkin(tube(sp, (u) => { const r = ap(u * sleeveEnd); return { rx: r.rx * (1 + (1 - u) * 0.12), rz: r.rz * (1 + (1 - u) * 0.12) }; }, { radial: 14, hem: [-1, 0.93] }), rig, ['chest', `upperArm${sd}`, `foreArm${sd}`, `hand${sd}`]));
        }
      }
      if (dress) parts.push(applySkin(tube([V([0, 1.0 * s, -0.01]), V([0, 0.5 * s, 0.0])], (u) => ({ rx: (0.17 + u * 0.13) * s * rig.w, rz: (0.12 + u * 0.1) * s }), { radial: 26, hem: [-1, 0.95] }), rig, ['hips', 'thighL', 'thighR'], 3));
      return mergeGeometries(parts);
    });
    this.top = addSkinned(topGeo, topM);
    if (top === 'colete') {
      // colete sobre hoodie cinzento (mangas compridas do hoodie)
      const hoodGeo = cached(`hoodsleeves:${key}`, () => mergeGeometries(['L', 'R'].map((sd) => applySkin(tube(armPoints(rig, sd), armProfile(rig, 0.012), { radial: 14, hem: [-1, 0.95] }), rig, ['chest', `upperArm${sd}`, `foreArm${sd}`, `hand${sd}`]))));
      addSkinned(hoodGeo, clothMaterial('hoodie', '#b0b4ba', 'liso'));
    }
    if (top === 'hoodie' || top === 'colete') {
      const hood = new THREE.Mesh(cached(`hood:${s.toFixed(3)}`, () => { const g = new THREE.SphereGeometry(0.11 * s, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.6); g.scale(1.1, 0.55, 0.8); g.rotateX(-1.9); g.translate(0, 0.18 * s, -0.07 * s); return g; }), clothMaterial('hoodie', top === 'colete' ? '#b0b4ba' : topCol, 'liso'));
      this.bones.chest.add(hood);
    }
    if (top === 'uniforme_seguranca') {
      const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.05 * s, 0.03 * s), plainMat('#f9a825', 0.4, 0.6));
      badge.position.set(0.07 * s, 0.1 * s, 0.11 * s);
      this.bones.chest.add(badge);
    }
    if (['avental', 'camisa_avental'].includes(top)) {
      const apron = new THREE.Mesh(new THREE.PlaneGeometry(0.28 * s, 0.5 * s), plainMat('#f5f5f5', 0.85, 0, { side: THREE.DoubleSide }));
      apron.position.set(0, -0.12 * s, 0.13 * s);
      this.bones.spine.add(apron);
    }
    // parte de baixo
    const bottom = a.bottom === 'macacao' ? 'calca' : a.bottom;
    const botCol = a.bottom === 'macacao' ? a.topColor : a.bottomColor;
    if (!dress) {
      const botM = clothMaterial(bottom, botCol, a.bottom === 'saia_capulana' ? 'capulana' : 'liso');
      const botGeo = cached(`bot:${key}:${bottom}`, () => {
        const parts = [];
        parts.push(applySkin(torsoTube(rig, 0.86, 1.06, 0.007 * rig.s, { radial: 24, exponent: 2.3, capStart: true, hem: [-1, 0.9] }), rig, ['hips', 'spine', 'thighL', 'thighR']));
        if (SKIRTS.has(bottom)) {
          parts.push(applySkin(tube([V([0, 1.0 * s, -0.01]), V([0, (bottom === 'saia_capulana' ? 0.32 : 0.55) * s, 0])], (u) => ({ rx: (0.17 + u * 0.1) * s * rig.w, rz: (0.125 + u * 0.08) * s }), { radial: 26, hem: [-1, 0.95] }), rig, ['hips', 'thighL', 'thighR'], 3));
        } else {
          const end = bottom === 'calcoes' ? 0.5 : 0.985;
          for (const sd of ['L', 'R']) {
            const lp = legProfile(rig, 0.012);
            const pts = legPoints(rig, sd);
            const full = pts[0].distanceTo(pts[1]) + pts[1].distanceTo(pts[2]);
            const cut = end * full;
            const d1 = pts[0].distanceTo(pts[1]);
            const endP = cut <= d1 ? pts[0].clone().lerp(pts[1], cut / d1) : pts[1].clone().lerp(pts[2], (cut - d1) / pts[1].distanceTo(pts[2]));
            const sp = cut <= d1 ? [pts[0], endP] : [pts[0], pts[1], endP];
            const cargo = bottom === 'calca_cargo';
            parts.push(applySkin(tube(sp, (u) => { const r = lp(u * end); const pocket = cargo ? 0.014 * s * Math.exp(-((u - 0.32) ** 2) / 0.004) : 0; return { rx: r.rx + pocket + (bottom === 'calcoes' ? 0.012 : 0.004) * s, rz: r.rz + 0.004 * s, back: r.back }; }, { radial: 16, hem: [-1, 0.96] }), rig, ['hips', `thigh${sd}`, `shin${sd}`, `foot${sd}`]));
          }
        }
        return mergeGeometries(parts);
      });
      this.bottom = addSkinned(botGeo, botM);
    }
  }

  buildHair(head, rig) {
    const a = this.a;
    const s = rig.s;
    const st = a.hairStyle;
    if (st === 'careca') return;
    const coily = ['afro', 'curto', 'rapado', 'degradê', 'trancas_curtas'].includes(st);
    const hm = hairMat(a.hairColor, coily);
    const capGeo = (scale, cover, key) => cached(`cap:${s.toFixed(3)}:${scale}:${cover}:${rig.f}:${key}`, () => {
      const g = new THREE.SphereGeometry(1, 32, 20, 0, Math.PI * 2, 0, Math.PI * cover);
      g.rotateX(-0.35); // cobre mais a nuca que a testa
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (rig.f ? 0.078 : 0.082) * s * scale, (p.getY(i) * 0.118 * scale + 0.11) * s, p.getZ(i) * (rig.f ? 0.099 : 0.102) * s * scale - 0.004 * s);
      g.computeVertexNormals();
      return g;
    });
    const add = (geo, mat = hm) => { const m = new THREE.Mesh(geo, mat); m.castShadow = this.shadows; head.add(m); return m; };
    switch (st) {
      case 'rapado': add(capGeo(1.01, 0.46, 'r')); break;
      case 'curto': add(capGeo(1.05, 0.5, 'c')); break;
      case 'degradê': { add(capGeo(1.07, 0.36, 'd1')); add(capGeo(1.015, 0.52, 'd2'), hairMat(`#${new THREE.Color(a.hairColor).lerp(new THREE.Color(a.skinTone), 0.45).getHexString()}`, true)); break; }
      case 'afro': {
        add(cached(`afro:${s.toFixed(3)}`, () => {
          const g = new THREE.IcosahedronGeometry(0.15 * s, 4);
          const p = g.attributes.position;
          for (let i = 0; i < p.count; i++) {
            const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
            const n = 1 + 0.05 * Math.sin(v.x * 180) * Math.sin(v.y * 170) * Math.sin(v.z * 160);
            v.multiplyScalar(n);
            p.setXYZ(i, v.x * 1.05, v.y * 0.95 + 0.15 * s, v.z * 1.0 - 0.02 * s);
          }
          g.computeVertexNormals();
          return g;
        }));
        break;
      }
      case 'trancas':
      case 'dreads':
      case 'trancas_curtas': {
        add(capGeo(1.04, 0.52, 'tc'));
        const n = st === 'trancas_curtas' ? 14 : 22;
        const len = (st === 'trancas' ? 0.42 : st === 'dreads' ? 0.3 : 0.12) * s;
        const thick = (st === 'dreads' ? 0.012 : 0.008) * s;
        const braidGeo = cached(`braid:${st}:${s.toFixed(3)}`, () => {
          const parts = [];
          for (let i = 0; i < n; i++) {
            const ang = Math.PI * 0.08 + (i / (n - 1)) * Math.PI * 0.84;
            const x0 = Math.cos(ang) * 0.085 * s;
            const z0 = -Math.sin(ang) * 0.075 * s + 0.01 * s;
            const pts = [new THREE.Vector3(x0, 0.16 * s, z0), new THREE.Vector3(x0 * 1.25, 0.06 * s, z0 * 1.2 - 0.01 * s), new THREE.Vector3(x0 * 1.35 + Math.sin(i) * 0.01 * s, 0.16 * s - len, z0 * 1.35 - 0.03 * s)];
            const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, thick, 6, false);
            parts.push(tg);
          }
          return mergeGeometries(parts);
        });
        add(braidGeo);
        if (st === 'trancas') {
          // missangas de madeira nas pontas (como na referência)
          const beads = cached(`beads:${s.toFixed(3)}`, () => {
            const parts = [];
            for (let i = 0; i < n; i += 2) {
              const ang = Math.PI * 0.08 + (i / (n - 1)) * Math.PI * 0.84;
              const x0 = Math.cos(ang) * 0.085 * s * 1.35 + Math.sin(i) * 0.01 * s;
              const z0 = (-Math.sin(ang) * 0.075 * s + 0.01 * s) * 1.35 - 0.03 * s;
              const b = new THREE.CylinderGeometry(thick * 1.6, thick * 1.6, 0.014 * s, 8);
              b.translate(x0, 0.16 * s - len + 0.025 * s, z0);
              parts.push(b);
            }
            return mergeGeometries(parts);
          });
          add(beads, plainMat('#c8a06a', 0.5));
        }
        break;
      }
      case 'coque': {
        add(capGeo(1.04, 0.52, 'co'));
        const b = add(cached(`bun:${s.toFixed(3)}`, () => new THREE.SphereGeometry(0.055 * s, 14, 10)));
        b.position.set(0, 0.21 * s, -0.07 * s);
        break;
      }
      case 'liso_comprido': {
        add(capGeo(1.06, 0.55, 'lc'));
        add(cached(`longback:${s.toFixed(3)}`, () => { const g = new THREE.CylinderGeometry(0.085 * s, 0.1 * s, 0.32 * s, 18, 1, true, Math.PI * 0.6, Math.PI * 1.8); g.translate(0, 0.0, -0.02 * s); return g; }), cachedMat(`hairds:${a.hairColor}`, () => new THREE.MeshStandardMaterial({ map: F.hairStrands(a.hairColor, false), roughness: 0.7, side: THREE.DoubleSide })));
        break;
      }
      case 'rabo_cavalo': {
        add(capGeo(1.04, 0.52, 'rc'));
        const t = add(cached(`pony:${s.toFixed(3)}`, () => { const g = new THREE.CapsuleGeometry(0.028 * s, 0.2 * s, 4, 8); g.translate(0, -0.1 * s, 0); return g; }));
        t.position.set(0, 0.17 * s, -0.11 * s);
        t.rotation.x = 0.35;
        break;
      }
      case 'lenco': {
        add(cached(`wrap:${s.toFixed(3)}`, () => { const g = new THREE.SphereGeometry(0.128 * s, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.56); g.scale(0.95, 1.3, 1.04); g.translate(0, 0.12 * s, -0.012 * s); return g; }), clothMaterial('capulana', a.topColor, 'capulana'));
        const knot = add(cached(`knot:${s.toFixed(3)}`, () => new THREE.SphereGeometry(0.04 * s, 10, 8)), clothMaterial('capulana', a.topColor, 'capulana'));
        knot.position.set(0.02 * s, 0.25 * s, 0.03 * s);
        break;
      }
      default: add(capGeo(1.05, 0.5, 'x'));
    }
  }

  buildBeard(head, rig) {
    const b = this.a.face?.beard;
    if (!b || b === 'nenhuma') return;
    const s = rig.s;
    const m = hairMat(this.a.hairColor, true);
    if (b === 'bigode') {
      const g = new THREE.Mesh(cached(`stache:${s.toFixed(3)}`, () => { const q = new THREE.CapsuleGeometry(0.005 * s, 0.03 * s, 3, 6); q.rotateZ(Math.PI / 2); return q; }), m);
      g.position.set(0, 0.064 * s, 0.1 * s);
      head.add(g);
      return;
    }
    const geo = cached(`beard:${s.toFixed(3)}:${b}`, () => {
      const g = new THREE.SphereGeometry(1, 24, 16, 0, Math.PI * 2, Math.PI * 0.6, Math.PI * 0.33);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        let x = p.getX(i);
        let z = p.getZ(i);
        if (b === 'pera') x *= 0.45;
        if (z < 0.05) z = 0.05;
        const y = p.getY(i);
        const narrow = 1 - 0.3 * Math.max(0, -y - 0.5);
        p.setXYZ(i, x * 0.08 * s * narrow, y * 0.108 * s + 0.1 * s, z * 0.1 * s * narrow + 0.008 * s);
      }
      g.computeVertexNormals();
      return g;
    });
    head.add(new THREE.Mesh(geo, m));
  }

  buildAccessories(rig) {
    const acc = this.a.accessories ?? {};
    const s = rig.s;
    const head = this.bones.head;
    const chest = this.bones.chest;
    const add = (parent, geo, mat, pos = [0, 0, 0]) => { const m = new THREE.Mesh(geo, mat); m.position.set(...pos); m.castShadow = this.shadows; parent.add(m); return m; };
    if (acc.head === 'bone') {
      const cm = clothMaterial('bone', this.a.topColor === '#1a237e' ? '#1a237e' : '#222831', 'liso');
      add(head, cached(`capC:${s.toFixed(3)}`, () => { const g = new THREE.SphereGeometry(0.106 * s, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5); g.scale(0.85, 0.85, 1.0); g.translate(0, 0.14 * s, -0.005 * s); return g; }), cm);
      add(head, cached(`visor:${s.toFixed(3)}`, () => { const g = new THREE.CylinderGeometry(0.075 * s, 0.075 * s, 0.006 * s, 20, 1, false, -Math.PI / 2, Math.PI); g.scale(1, 1, 0.9); g.rotateX(0.12); g.translate(0, 0.15 * s, 0.08 * s); return g; }), cm);
    } else if (acc.head === 'chapeu') {
      const hm = plainMat('#c8b28a', 0.8);
      add(head, cached(`brim:${s.toFixed(3)}`, () => new THREE.CylinderGeometry(0.17 * s, 0.17 * s, 0.008 * s, 28)), hm, [0, 0.19 * s, -0.005 * s]);
      add(head, cached(`crown:${s.toFixed(3)}`, () => new THREE.CylinderGeometry(0.085 * s, 0.098 * s, 0.1 * s, 22)), hm, [0, 0.24 * s, -0.005 * s]);
      add(head, cached(`band:${s.toFixed(3)}`, () => new THREE.CylinderGeometry(0.099 * s, 0.099 * s, 0.018 * s, 22)), plainMat('#3e2723', 0.6), [0, 0.2 * s, -0.005 * s]);
    } else if (acc.head === 'lenco_cabeca' && this.a.hairStyle !== 'lenco') {
      add(head, cached(`scarf:${s.toFixed(3)}`, () => { const g = new THREE.TorusGeometry(0.095 * s, 0.02 * s, 8, 24); g.rotateX(Math.PI / 2); g.scale(0.85, 1, 1.05); return g; }), clothMaterial('capulana', '#d84315', 'capulana'), [0, 0.17 * s, -0.005 * s]);
    } else if (acc.head === 'auscultadores') {
      const am = plainMat('#e53935', 0.35, 0.2);
      add(head, cached(`hb:${s.toFixed(3)}`, () => new THREE.TorusGeometry(0.092 * s, 0.009 * s, 8, 24, Math.PI)), am, [0, 0.12 * s, 0]);
      for (const sx of [-1, 1]) { const c = add(head, cached(`cup:${s.toFixed(3)}`, () => new THREE.CylinderGeometry(0.03 * s, 0.03 * s, 0.024 * s, 16)), am, [sx * 0.085 * s, 0.1 * s, 0]); c.rotation.z = Math.PI / 2; }
    }
    if (acc.eyes === 'oculos' || acc.eyes === 'oculos_sol') {
      const sun = acc.eyes === 'oculos_sol';
      const frame = plainMat('#111111', 0.3, 0.6);
      const lens = sun ? new THREE.MeshPhysicalMaterial({ color: '#101820', roughness: 0.05, metalness: 0.9 }) : new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0, transmission: 0.9, transparent: true, opacity: 0.25 });
      for (const sx of [-1, 1]) {
        add(head, cached(`rim:${s.toFixed(3)}`, () => { const g = new THREE.TorusGeometry(0.0155 * s, 0.0022 * s, 6, 16); g.scale(1.2, 0.9, 1); return g; }), frame, [sx * 0.032 * s, 0.11 * s, 0.098 * s]);
        add(head, cached(`lens:${s.toFixed(3)}`, () => { const g = new THREE.CircleGeometry(0.0155 * s, 16); g.scale(1.2, 0.9, 1); return g; }), lens, [sx * 0.032 * s, 0.11 * s, 0.099 * s]);
        const arm = add(head, cached(`garm:${s.toFixed(3)}`, () => new THREE.BoxGeometry(0.002 * s, 0.003 * s, 0.09 * s)), frame, [sx * 0.071 * s, 0.112 * s, 0.055 * s]);
        arm.rotation.y = sx * 0.06;
      }
      add(head, cached(`bridge:${s.toFixed(3)}`, () => new THREE.BoxGeometry(0.018 * s, 0.003 * s, 0.003 * s)), frame, [0, 0.114 * s, 0.1 * s]);
    }
    if (acc.ears === 'brincos') {
      for (const sx of [-1, 1]) add(head, cached(`hoop:${s.toFixed(3)}`, () => new THREE.TorusGeometry(0.012 * s, 0.0018 * s, 6, 16)), plainMat('#d4af37', 0.2, 1), [sx * 0.076 * s, 0.07 * s, 0.0]).rotation.y = Math.PI / 2;
    }
    if (acc.neck === 'fio') {
      const chain = add(chest, cached(`chain:${s.toFixed(3)}`, () => { const g = new THREE.TorusGeometry(0.075 * s, 0.003 * s, 6, 28); g.scale(1, 1.3, 1); return g; }), plainMat('#d4af37', 0.18, 1), [0, 0.12 * s, 0.05 * s]);
      chain.rotation.x = Math.PI / 2.3;
      add(chest, cached(`pend:${s.toFixed(3)}`, () => new THREE.CylinderGeometry(0.012 * s, 0.012 * s, 0.003 * s, 12)), plainMat('#d4af37', 0.15, 1), [0, 0.05 * s, 0.115 * s]).rotation.x = Math.PI / 2;
    }
    if (acc.wrist === 'relogio') {
      const fa = this.bones.foreArmL;
      const wristY = -0.24 * s;
      add(fa, cached(`strap:${s.toFixed(3)}`, () => { const g = new THREE.TorusGeometry(0.031 * s, 0.006 * s, 6, 18); g.rotateX(Math.PI / 2); return g; }), plainMat('#1b1b1b', 0.5), [0, wristY, 0]);
      const face = add(fa, cached(`wface:${s.toFixed(3)}`, () => new THREE.CylinderGeometry(0.014 * s, 0.014 * s, 0.008 * s, 18)), plainMat('#c0c4c8', 0.15, 1), [0.03 * s, wristY, 0]);
      face.rotation.z = Math.PI / 2;
      const glass = add(fa, cached(`wglass:${s.toFixed(3)}`, () => new THREE.CircleGeometry(0.011 * s, 18)), plainMat('#0b1d2a', 0.05, 0.3, { emissive: '#06283d', emissiveIntensity: 0.4 }), [0.0345 * s, wristY, 0]);
      glass.rotation.y = Math.PI / 2;
    }
    if (acc.back === 'mochila') {
      const bagM = clothMaterial('mochila', '#5d4037', 'liso');
      const body = add(chest, cached(`bag:${s.toFixed(3)}`, () => {
        const shape = new THREE.Shape();
        const w = 0.15 * s;
        const h = 0.21 * s;
        const r = 0.04 * s;
        shape.moveTo(-w + r, -h); shape.lineTo(w - r, -h); shape.quadraticCurveTo(w, -h, w, -h + r); shape.lineTo(w, h - r); shape.quadraticCurveTo(w, h, w - r, h); shape.lineTo(-w + r, h); shape.quadraticCurveTo(-w, h, -w, h - r); shape.lineTo(-w, -h + r); shape.quadraticCurveTo(-w, -h, -w + r, -h);
        const g = new THREE.ExtrudeGeometry(shape, { depth: 0.11 * s, bevelEnabled: true, bevelSize: 0.02 * s, bevelThickness: 0.02 * s, bevelSegments: 3 });
        g.translate(0, 0, -0.11 * s);
        return g;
      }), bagM, [0, -0.02 * s, -0.13 * s]);
      void body;
      add(chest, cached(`pocket:${s.toFixed(3)}`, () => new THREE.BoxGeometry(0.2 * s, 0.11 * s, 0.05 * s)), bagM, [0, -0.11 * s, -0.27 * s]);
      add(chest, cached(`zip:${s.toFixed(3)}`, () => new THREE.BoxGeometry(0.2 * s, 0.006 * s, 0.006 * s)), plainMat('#d4af37', 0.3, 1), [0, -0.055 * s, -0.297 * s]);
      for (const sx of [-1, 1]) {
        const st = add(chest, cached(`strapb:${s.toFixed(3)}`, () => { const g = new THREE.TorusGeometry(0.11 * s, 0.009 * s, 6, 18, Math.PI * 1.1); g.scale(1, 1.4, 0.9); return g; }), plainMat('#2b1d16', 0.7), [sx * 0.085 * s, 0.03 * s, -0.01 * s]);
        st.rotation.set(0, Math.PI / 2, Math.PI * 0.5);
      }
    }
  }

  // ------------------------------------------------------------ animação
  setAnim(anim) { if (anim) this.anim = anim; }

  /** Inicia um emote (a animação é uma função de pose; ver emoteAnimations.js). */
  playEmote(id, fn, { startedAtMs = performance.now(), dir = null } = {}) {
    this.emote = { id, fn, t0: startedAtMs, dir };
  }

  stopEmote() { this.emote = null; }

  setHandPose(side, pose) {
    if (this.handPose[side] === pose) return;
    this.handPose[side] = pose;
    this.hands[side].geometry = handGeometry(this.rig.s, pose, this.rig.f);
  }

  basePose(dt, speed) {
    const a = this.anim;
    const run = a === 'run' || speed > 3.2;
    const moving = a === 'walk' || a === 'run' || speed > 0.3;
    const stride = run ? 1.45 : 1.75;
    this.phase += dt * (moving ? Math.max(1.4, speed) * Math.PI / stride : 1);
    const p = this.phase;
    const t = performance.now() / 1000;
    const T = {
      thighL: [0, 0, 0], thighR: [0, 0, 0], shinL: [0, 0, 0], shinR: [0, 0, 0], footL: [0, 0, 0], footR: [0, 0, 0],
      upperArmL: [0, 0, 0.09], upperArmR: [0, 0, -0.09], foreArmL: [-0.12, 0, 0], foreArmR: [-0.12, 0, 0], handL: [0, 0, 0], handR: [0, 0, 0],
      spine: [this.a.posture === 'curvada' ? 0.2 : 0.02, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0], hips: [0, 0, 0], hipsY: 0,
      face: { smile: 0.12, sad: 0, open: 0, round: 0, browUp: 0, browAngry: 0 }, hand: { L: 'relaxed', R: 'relaxed' },
    };
    if (a === 'sit') {
      Object.assign(T, { thighL: [-1.5, 0, 0.05], thighR: [-1.5, 0, -0.05], shinL: [1.5, 0, 0], shinR: [1.5, 0, 0], hipsY: -0.47 * this.rig.s, spine: [-0.06, 0, 0], upperArmL: [-0.35, 0, 0.12], upperArmR: [-0.35, 0, -0.12], foreArmL: [-0.6, 0, 0], foreArmR: [-0.6, 0, 0] });
      T.head = [0, Math.sin(t * 0.4 + p) * 0.2, 0];
    } else if (a === 'drive') {
      Object.assign(T, { thighL: [-1.35, 0, 0], thighR: [-1.35, 0, 0], shinL: [1.15, 0, 0], shinR: [1.15, 0, 0], hipsY: -0.44 * this.rig.s, upperArmL: [-1.0, 0, 0.15], upperArmR: [-1.0, 0, -0.15], foreArmL: [-0.55, 0, 0], foreArmR: [-0.55, 0, 0], spine: [-0.12, 0, 0] });
      T.hand = { L: 'fist', R: 'fist' };
    } else if (moving) {
      const amp = run ? 0.82 : 0.48;
      const sp = Math.sin(p);
      T.thighL = [sp * amp - (run ? 0.15 : 0), 0, 0];
      T.thighR = [-sp * amp - (run ? 0.15 : 0), 0, 0];
      T.shinL = [Math.max(0, -Math.cos(p)) * (run ? 1.55 : 0.75) + 0.06, 0, 0];
      T.shinR = [Math.max(0, Math.cos(p)) * (run ? 1.55 : 0.75) + 0.06, 0, 0];
      T.footL = [Math.max(0, Math.cos(p)) * 0.25 - 0.05, 0, 0];
      T.footR = [Math.max(0, -Math.cos(p)) * 0.25 - 0.05, 0, 0];
      T.upperArmL = [-sp * amp * 0.85, 0, 0.1];
      T.upperArmR = [sp * amp * 0.85, 0, -0.1];
      T.foreArmL = [run ? -1.35 : -0.35 - Math.max(0, -sp) * 0.3, 0, 0];
      T.foreArmR = [run ? -1.35 : -0.35 - Math.max(0, sp) * 0.3, 0, 0];
      T.spine = [T.spine[0] + (run ? 0.2 : 0.04), sp * 0.08, 0];
      T.chest = [0, -sp * 0.12, 0];
      T.hips = [0, sp * 0.1, Math.sin(p) * 0.03];
      T.hipsY = -Math.abs(Math.cos(p)) * (run ? 0.06 : 0.025) - (run ? 0.03 : 0);
      if (run) T.hand = { L: 'fist', R: 'fist' };
    } else if (a === 'jump') {
      Object.assign(T, { thighL: [-0.7, 0, 0], thighR: [-0.35, 0, 0], shinL: [1.1, 0, 0], shinR: [0.8, 0, 0], upperArmL: [-2.3, 0, 0.3], upperArmR: [-2.3, 0, -0.3], foreArmL: [-0.2, 0, 0], foreArmR: [-0.2, 0, 0] });
    } else {
      // idle com respiração e transferência de peso
      const br = Math.sin(t * 1.5 + p) * 0.018;
      T.spine = [T.spine[0] + br, 0, 0];
      T.chest = [-br * 0.5, 0, 0];
      T.hips = [0, 0, Math.sin(t * 0.35 + p) * 0.025];
      T.head = [0, Math.sin(t * 0.3 + p) * 0.3, Math.sin(t * 0.21) * 0.04];
      if (a === 'work') {
        T.upperArmL = [-0.85 + Math.sin(t * 2.2 + p) * 0.25, 0, 0.15];
        T.upperArmR = [-0.7 + Math.cos(t * 2.0 + p) * 0.3, 0, -0.15];
        T.foreArmL = [-1.2, 0, 0];
        T.foreArmR = [-1.0 + Math.sin(t * 3 + p) * 0.3, 0, 0];
        T.spine[0] += 0.14;
        T.head = [0.2, Math.sin(t * 0.8 + p) * 0.2, 0];
      } else if (a === 'talk' || a === 'talk_idle') {
        T.upperArmR = [-0.45 + Math.sin(t * 2.4 + p) * 0.22, 0, -0.2];
        T.foreArmR = [-1.15 + Math.sin(t * 3.1) * 0.3, 0.3, 0];
        if (a === 'talk') T.upperArmL = [-0.3 + Math.cos(t * 1.9) * 0.2, 0, 0.2];
        T.neck = [Math.sin(t * 3.0 + p) * 0.06, 0, 0];
        T.head = [0, Math.sin(t * 0.9 + p) * 0.15, 0];
        T.face = { ...T.face, smile: 0.35, open: Math.max(0, Math.sin(t * 9 + p)) * 0.5 };
        T.hand.R = 'open';
      } else if (a === 'wave') {
        T.upperArmR = [-0.4, 0, -2.6];
        T.foreArmR = [-0.25, 0, -0.3 + Math.sin(t * 9) * 0.45];
        T.face = { ...T.face, smile: 0.8 };
        T.hand.R = 'open';
      }
    }
    return T;
  }

  update(dt, speed = 0) {
    let T = this.basePose(dt, speed);
    if (this.emote) {
      const et = (performance.now() - this.emote.t0) / 1000;
      const E = this.emote.fn(et, this);
      if (E === null) this.emote = null;
      else T = { ...T, ...E, face: { ...T.face, ...(E.face ?? {}) }, hand: { ...T.hand, ...(E.hand ?? {}) } };
    }
    const k = 1 - Math.exp(-dt * 11);
    const P = this.pose;
    for (const name of BONES) {
      const target = name === 'hips' ? T.hips : T[name] ?? [0, 0, 0];
      const cur = (P[name] ??= [0, 0, 0]);
      for (let i = 0; i < 3; i++) cur[i] += (target[i] - cur[i]) * k;
      const b = this.bones[name];
      b.quaternion.copy(this.restQ[name]);
      b.rotateX(cur[0]);
      b.rotateY(cur[1]);
      b.rotateZ(cur[2]);
    }
    P.hipsY = (P.hipsY ?? 0) + ((T.hipsY ?? 0) - (P.hipsY ?? 0)) * k;
    this.bones.hips.position.y = this.restHipsY + P.hipsY;
    this.bones.hips.position.x = T.hipsX ?? 0;
    // rosto
    const fk = 1 - Math.exp(-dt * 8);
    for (const key of ['smile', 'sad', 'open', 'round', 'browUp', 'browAngry']) this.face[key] += ((T.face[key] ?? 0) - this.face[key]) * fk;
    const f = this.face;
    for (const lip of this.lips) {
      lip.morphTargetInfluences[0] = Math.max(0, f.smile);
      lip.morphTargetInfluences[1] = Math.max(0, f.sad);
      lip.morphTargetInfluences[2] = f.open;
      lip.morphTargetInfluences[3] = f.round;
    }
    this.mouthInner.scale.y = 0.05 + (f.open + f.round) * 0.55;
    for (const brow of this.brows) {
      const sx = brow.userData.side;
      brow.position.y = (0.132 + f.browUp * 0.007 - f.browAngry * 0.003 + f.sad * 0.003) * this.rig.s;
      brow.rotation.z = sx * (f.browAngry * 0.35 - f.sad * 0.3);
    }
    // piscar de olhos
    this.nextBlink -= dt;
    if (this.nextBlink < 0) { f.blink = 1; this.nextBlink = 2 + Math.random() * 4; }
    f.blink = Math.max(0, f.blink - dt * 7);
    const lidOpen = -0.3 - f.browUp * 0.35 + f.sad * 0.25;
    for (const lid of this.lids) lid.rotation.x = lidOpen + f.blink * 1.75;
    this.setHandPose('L', T.hand.L);
    this.setHandPose('R', T.hand.R);
  }

  dispose() { this.root.removeFromParent(); }
}
