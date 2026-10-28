/**
 * Construção da zona "Kianda Centro" a partir de shared/zone.js (mesma fonte de
 * dados do servidor). Instancing para objectos repetidos, geometria fundida por
 * material para reduzir draw calls, e janelas com iluminação nocturna por shader.
 */
import * as THREE from 'three';
import {
  ROADS, BUILDINGS, PROPS, BENCHES, INTERSECTIONS, TRAFFIC_LIGHTS, PARKED_VEHICLES, RACE_TRACK, ZONE_BOUNDS,
  sidewalkRects, roadRect, interiorWalls, doorPoint, pointInRect,
} from '../../shared/zone.js';
import { makeRng } from '../../shared/rng.js';
import {
  asphaltTexture, sidewalkTexture, wavePavementTexture, grassTexture, dirtTexture, courtTexture,
  facadeTextures, shopfrontTexture, houseTexture, signTexture, FACADE_TILE,
} from './textures.js';
import { createVehicle } from './vehicles2.js';

/** Uniformes globais das janelas (actualizados pelo ambiente a cada frame). */
export const WINDOW_UNIFORMS = {
  uLitFraction: { value: 0 },
  uNight: { value: 0 },
  uWarm: { value: new THREE.Color('#ffcf8a') },
};

function windowMaterial(map, emissiveMap, { rough = 0.85, metal = 0.0, warm = true } = {}) {
  const m = new THREE.MeshStandardMaterial({ map, emissiveMap, emissive: 0xffffff, roughness: rough, metalness: metal });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uLitFraction = WINDOW_UNIFORMS.uLitFraction;
    shader.uniforms.uNight = WINDOW_UNIFORMS.uNight;
    shader.uniforms.uWarm = WINDOW_UNIFORMS.uWarm;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uLitFraction;\nuniform float uNight;\nuniform vec3 uWarm;')
      .replace('#include <emissivemap_fragment>', `
        #ifdef USE_EMISSIVEMAP
          vec4 emTex = texture2D( emissiveMap, vEmissiveMapUv );
          float th = emTex.r;
          float lit = step(0.001, th) * step(th, uLitFraction);
          vec3 tint = ${warm ? 'uWarm' : 'mix(uWarm, vec3(0.85, 0.92, 1.0), 0.7)'};
          totalEmissiveRadiance = tint * lit * uNight * (0.3 + 0.7 * emTex.g) * 1.05;
        #endif`);
  };
  m.customProgramCacheKey = () => `win:${warm}`;
  return m;
}

/** Geometria de caixa com UV em metros (texturas repetidas sem esticar). */
function boxUV(w, h, d, scale = 1) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  const n = geo.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(n.getX(i));
    const ny = Math.abs(n.getY(i));
    const [a, b] = ny > 0.5 ? [w, d] : nx > 0.5 ? [d, h] : [w, h];
    uv.setXY(i, uv.getX(i) * a / scale, uv.getY(i) * b / scale);
  }
  return geo;
}

function planeXZ(minX, maxX, minZ, maxZ, y, uvScale = 1) {
  const geo = new THREE.PlaneGeometry(maxX - minX, maxZ - minZ);
  geo.rotateX(-Math.PI / 2);
  geo.translate((minX + maxX) / 2, y, (minZ + maxZ) / 2);
  const uv = geo.attributes.uv;
  const pos = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / uvScale, pos.getZ(i) / uvScale);
  return geo;
}

/** Funde geometrias (não indexadas) num único BufferGeometry. */
export function mergeGeometries(list) {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const total = parts.reduce((s, g) => s + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}

/** Paredes de um edifício entre y0 e y1, com UV alinhados ao mosaico da fachada. */
function wallsGeometry(b, y0, y1, tileW, tileH, uOffset = 0) {
  const quads = [];
  const sides = [
    [[b.minX, b.maxZ], [b.maxX, b.maxZ], [0, 0, 1]], // Sul
    [[b.maxX, b.maxZ], [b.maxX, b.minZ], [1, 0, 0]], // Este
    [[b.maxX, b.minZ], [b.minX, b.minZ], [0, 0, -1]], // Norte
    [[b.minX, b.minZ], [b.minX, b.maxZ], [-1, 0, 0]], // Oeste
  ];
  const pos = [];
  const nor = [];
  const uv = [];
  for (const [[ax, az], [bx, bz], n] of sides) {
    const len = Math.hypot(bx - ax, bz - az);
    const u0 = uOffset;
    const u1 = uOffset + len / tileW;
    const v0 = y0 / tileH;
    const v1 = y1 / tileH;
    const p = [[ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az]];
    const t = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(...p[i]); nor.push(...n); uv.push(...t[i]); }
    quads.push(len);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geo;
}

function gableRoof(b, color) {
  const alongX = b.maxX - b.minX >= b.maxZ - b.minZ;
  const span = alongX ? b.maxZ - b.minZ : b.maxX - b.minX;
  const len = alongX ? b.maxX - b.minX : b.maxZ - b.minZ;
  const shape = new THREE.Shape();
  shape.moveTo(-span / 2 - 0.4, 0);
  shape.lineTo(span / 2 + 0.4, 0);
  shape.lineTo(0, span * 0.32);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: len + 0.6, bevelEnabled: false });
  geo.translate(0, 0, -(len + 0.6) / 2);
  if (alongX) geo.rotateY(Math.PI / 2);
  geo.translate(b.cx, b.height, b.cz);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
  m.castShadow = true;
  return m;
}

export class City {
  constructor(scene, { quality }) {
    this.scene = scene;
    this.quality = quality;
    this.group = new THREE.Group();
    this.group.name = 'kianda_centro';
    scene.add(this.group);
    this.lampPositions = [];
    this.lightHeads = new Map();
    this.signMaterials = [];
    this.wetMaterials = [];
    this.animated = [];
    this.parked = new Map();
    this.sidewalks = sidewalkRects();
    this.buildGround();
    this.buildRoads();
    this.buildSidewalks();
    this.buildBuildings();
    this.buildPlaza();
    this.buildPark();
    this.buildArena();
    this.buildEastSide();
    this.buildStreetFurniture();
    this.buildTrees();
    this.buildTrafficLights();
    this.buildParkedVehicles();
    this.buildSkyline();
  }

  add(obj, { cast = false, receive = true } = {}) {
    obj.castShadow = cast;
    obj.receiveShadow = receive;
    this.group.add(obj);
    return obj;
  }

  // ------------------------------------------------------------------ chão
  buildGround() {
    const t = dirtTexture().clone();
    t.needsUpdate = true;
    t.repeat.set(1, 1);
    const ground = new THREE.Mesh(planeXZ(-700, 700, -700, 700, -0.25, 6), new THREE.MeshStandardMaterial({ map: dirtTexture(), roughness: 1 }));
    this.add(ground);
    // blocos urbanos: pavimento de betão por baixo dos edifícios e logradouros
    const lotM = new THREE.MeshStandardMaterial({ map: sidewalkTexture(), color: 0xb9b2a4, roughness: 0.95 });
    const lots = [];
    for (const b of [[-130, -63, -110, -15], [-130, -63, 15, 110], [63, 130, -110, -15], [63, 130, 15, 110], [-47, 47, -110, -98], [-47, 47, 98, 110], [-47, 47, -82, -15], [-47, 47, 15, 82]]) {
      lots.push(planeXZ(b[0], b[1], b[2], b[3], 0.0, 3));
    }
    this.add(new THREE.Mesh(mergeGeometries(lots), lotM));
  }

  // ---------------------------------------------------------------- estradas
  buildRoads() {
    const roadM = new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.92, metalness: 0.0, envMapIntensity: 0.6 });
    this.roadMaterial = roadM;
    this.wetMaterials.push({ mat: roadM, dryRough: 0.92, wetRough: 0.18, dryColor: new THREE.Color(0xffffff), wetColor: new THREE.Color(0x8a8f96) });
    const geos = ROADS.map((r) => { const rr = roadRect(r); return planeXZ(rr.minX, rr.maxX, rr.minZ, rr.maxZ, 0.02, 8); });
    // asfalto dos cruzamentos e do parque de estacionamento
    geos.push(planeXZ(94, 127, -52, -16, 0.025, 8), planeXZ(94, 127, 16, 44, 0.025, 8), planeXZ(63, 94, -14, -9.9, 0.02, 8));
    this.add(new THREE.Mesh(mergeGeometries(geos), roadM));

    // marcações rodoviárias (instanciadas)
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 });
    const dash = [];
    const add = (x, z, w, d) => dash.push([x, z, w, d]);
    const inIntersection = (x, z, pad = 1) => INTERSECTIONS.some((i) => Math.abs(x - i.x) < i.halfNS + pad && Math.abs(z - i.z) < i.halfEW + pad);
    for (const r of ROADS) {
      const len = r.to - r.from;
      if (r.axis === 'x') {
        if (r.lanes === 4) {
          for (let x = r.from; x < r.to; x += 1) if (!inIntersection(x, 0)) { add(x + 0.5, r.at - 0.12, 1, 0.12); add(x + 0.5, r.at + 0.12, 1, 0.12); }
          for (const off of [-3.5, 3.5]) for (let x = r.from; x < r.to; x += 9) if (!inIntersection(x, 0)) add(x + 1.5, r.at + off, 3, 0.14);
          for (const off of [-7, 7]) for (let x = r.from; x < r.to; x += 1) if (!inIntersection(x, 0)) add(x + 0.5, r.at + off, 1, 0.14);
          // baias de estacionamento
          for (const off of [-8.5, 8.5]) for (let x = r.from + 4; x < r.to; x += 6) if (!inIntersection(x, 0, 6)) add(x, r.at + off, 0.12, 2.6);
        } else {
          for (let x = r.from; x < r.to; x += 8) if (!inIntersection(x + 1.5, r.at, 2)) add(x + 1.5, r.at, 3, 0.14);
        }
      } else {
        for (let z = r.from; z < r.to; z += 8) if (!inIntersection(r.at, z + 1.5, 2)) add(r.at, z + 1.5, 0.14, 3);
      }
      void len;
    }
    // linhas de paragem e passadeiras (zebras) junto aos cruzamentos
    for (const i of INTERSECTIONS) {
      const zebra = (cx, cz, alongX, length, width) => {
        const n = Math.floor(length / 1.0);
        for (let k = 0; k < n; k++) {
          const t = -length / 2 + 0.5 + k;
          if (alongX) add(cx + t, cz, 0.5, width); else add(cx, cz + t, width, 0.5);
        }
      };
      const offEW = i.halfEW + 2.5;
      const offNS = i.halfNS + 2.5;
      // atravessar a estrada N-S (zebras orientadas ao longo de X)
      for (const sz of [-1, 1]) if (i.kind === 'cross' || sz !== 0) zebra(i.x, i.z + sz * offEW, true, i.halfNS * 2, 3);
      if (i.kind === 'cross') for (const sx of [-1, 1]) zebra(i.x + sx * offNS, i.z, false, i.halfEW * 2, 3);
      else zebra(i.x + (i.x > 0 ? 1 : -1) * -offNS, i.z, false, i.halfEW * 2, 3);
    }
    // grelha de partida da corrida
    for (let k = 0; k < 10; k++) add(-18, -94 + 0.8 * k, 0.4, 0.4);
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const inst = new THREE.InstancedMesh(geo, white, dash.length);
    const mtx = new THREE.Matrix4();
    dash.forEach(([x, z, w, d], i) => { mtx.makeScale(w, 1, d); mtx.setPosition(x, 0.045, z); inst.setMatrixAt(i, mtx); });
    inst.receiveShadow = true;
    this.group.add(inst);
  }

  buildSidewalks() {
    const top = new THREE.MeshStandardMaterial({ map: sidewalkTexture(), roughness: 0.85 });
    this.wetMaterials.push({ mat: top, dryRough: 0.85, wetRough: 0.35, dryColor: new THREE.Color(0xffffff), wetColor: new THREE.Color(0xa9a59c) });
    const geos = this.sidewalks.map((s) => {
      const g = boxUV(s.maxX - s.minX, 0.17, s.maxZ - s.minZ, 2.5);
      g.translate((s.minX + s.maxX) / 2, 0.085, (s.minZ + s.maxZ) / 2);
      return g;
    });
    this.add(new THREE.Mesh(mergeGeometries(geos), top));
  }

  groundHeightAt(x, z) {
    for (const s of this.sidewalks) if (pointInRect(x, z, s)) return 0.17;
    if (pointInRect(x, z, { minX: -21, maxX: 21, minZ: -66, maxZ: -15 })) return 0.07;
    for (const b of this.interiorBuildings ?? []) if (pointInRect(x, z, b)) return 0.12;
    return 0.02;
  }

  // -------------------------------------------------------------- edifícios
  buildBuildings() {
    const rng = makeRng('kianda-visual');
    const roofM = new THREE.MeshStandardMaterial({ color: 0x8a8a86, roughness: 0.95 });
    const roofGeos = [];
    const tanks = [];
    this.interiorBuildings = [];
    for (const b of BUILDINGS) {
      if (b.interior) { this.buildInteriorShop(b); this.interiorBuildings.push(b); continue; }
      const commercial = ['shop', 'cafe', 'restaurant', 'hotel', 'gym', 'workshop'].includes(b.type);
      const floorH = b.height / b.floors;
      if (b.type === 'house') {
        const tex = houseTexture(b.color, b.id);
        const geo = wallsGeometry(b, 0, b.height, 10, 6.4, rng.next());
        this.add(new THREE.Mesh(geo, windowMaterial(tex.map, tex.emissive)), { cast: true });
        if (b.roof === 'gable') this.add(gableRoof(b, rng.pick(['#9c4a2f', '#b5552f', '#7d3b25'])), { cast: true });
        else roofGeos.push(planeXZ(b.minX, b.maxX, b.minZ, b.maxZ, b.height, 4));
        if (rng.chance(0.6)) tanks.push([b.minX + 1.5 + rng.next() * (b.maxX - b.minX - 3), b.height + (b.roof === 'gable' ? 1.5 : 0), b.minZ + 1.5 + rng.next() * (b.maxZ - b.minZ - 3)]);
        this.addDoor(b);
        continue;
      }
      const style = b.glass ? 'glass' : b.type === 'office' || b.type === 'hotel' ? 'office' : b.type === 'warehouse' ? 'warehouse' : 'residential';
      const tex = facadeTextures(style, b.color, b.id.length % 3);
      const tileW = FACADE_TILE.bays * FACADE_TILE.bayW;
      const tileH = FACADE_TILE.floors * floorH;
      const groundBand = commercial ? Math.min(4.2, b.height) : 0;
      if (b.height > groundBand) {
        const geo = wallsGeometry(b, groundBand, b.height, tileW, tileH, rng.next());
        const m = windowMaterial(tex.map, tex.emissive, { rough: b.glass ? 0.15 : 0.85, metal: b.glass ? 0.5 : 0, warm: !b.glass && b.type !== 'office' });
        this.add(new THREE.Mesh(geo, m), { cast: true });
        if (b.glass) this.wetMaterials.push({ mat: m, glass: true });
      }
      if (groundBand > 0) {
        const st = shopfrontTexture(b.color, b.id);
        const geo = wallsGeometry(b, 0, groundBand, 14, groundBand);
        this.add(new THREE.Mesh(geo, windowMaterial(st.map, st.emissive, { rough: 0.5 })), { cast: true });
        this.addAwning(b, groundBand);
      }
      roofGeos.push(planeXZ(b.minX, b.maxX, b.minZ, b.maxZ, b.height, 4));
      // platibanda (parapeito) e caixas de água nos telhados — muito comuns em Luanda
      const par = boxUV(b.maxX - b.minX + 0.3, 0.9, 0.3, 4);
      if (b.height > 6) {
        for (const [dx, dz, rot, len] of [[0, -1, 0, b.maxX - b.minX], [0, 1, 0, b.maxX - b.minX], [-1, 0, 1, b.maxZ - b.minZ], [1, 0, 1, b.maxZ - b.minZ]]) {
          const g2 = boxUV(rot ? 0.3 : len + 0.3, 0.9, rot ? len + 0.3 : 0.3, 4);
          g2.translate(dx ? (dx < 0 ? b.minX : b.maxX) : b.cx, b.height + 0.45, dz ? (dz < 0 ? b.minZ : b.maxZ) : b.cz);
          roofGeos.push(g2);
        }
        const n = 1 + Math.floor(rng.next() * 3);
        for (let k = 0; k < n; k++) tanks.push([b.minX + 2 + rng.next() * Math.max(0.1, b.maxX - b.minX - 4), b.height, b.minZ + 2 + rng.next() * Math.max(0.1, b.maxZ - b.minZ - 4)]);
      }
      void par;
      if (b.sign) this.addSign(b, groundBand || 3.6);
      this.addDoor(b);
    }
    this.add(new THREE.Mesh(mergeGeometries(roofGeos), roofM), { cast: true });
    // caixas de água (instanciadas)
    const tankGeo = new THREE.CylinderGeometry(0.7, 0.7, 1.4, 12);
    tankGeo.translate(0, 0.7, 0);
    const tankInst = new THREE.InstancedMesh(tankGeo, new THREE.MeshStandardMaterial({ color: 0x1f3b57, roughness: 0.6 }), tanks.length);
    const mtx = new THREE.Matrix4();
    tanks.forEach(([x, y, z], i) => { mtx.makeTranslation(x, y, z); tankInst.setMatrixAt(i, mtx); });
    tankInst.castShadow = true;
    this.group.add(tankInst);
  }

  addDoor(b) {
    const d = doorPoint(b, 0.06);
    const vertical = b.face === 'N' || b.face === 'S';
    const geo = new THREE.BoxGeometry(vertical ? (b.garageDoor ? 6 : 1.4) : 0.12, b.garageDoor ? 4 : 2.3, vertical ? 0.12 : 1.4);
    const door = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: b.garageDoor ? 0x2a2d31 : 0x5d4037, roughness: 0.7 }));
    door.position.set(d.x, (b.garageDoor ? 2 : 1.15), d.z);
    this.group.add(door);
  }

  addAwning(b, h) {
    const vertical = b.face === 'N' || b.face === 'S';
    const len = vertical ? b.maxX - b.minX : b.maxZ - b.minZ;
    const geo = new THREE.BoxGeometry(vertical ? len : 1.6, 0.08, vertical ? 1.6 : len);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: new THREE.Color(b.color).offsetHSL(0, 0.2, -0.25), roughness: 0.8 }));
    const d = doorPoint(b, 0.8);
    m.position.set(vertical ? b.cx : d.x, h - 0.3, vertical ? d.z : b.cz);
    m.rotation[vertical ? 'x' : 'z'] = (b.face === 'S' || b.face === 'E' ? 1 : -1) * 0.18 * (vertical ? 1 : -1);
    m.castShadow = true;
    this.group.add(m);
  }

  addSign(b, y) {
    const vertical = b.face === 'N' || b.face === 'S';
    const len = Math.min(10, (vertical ? b.maxX - b.minX : b.maxZ - b.minZ) * 0.8);
    const tex = signTexture(b.sign, { bg: '#151515', fg: b.type === 'shop' && b.sign.includes('FARM') ? '#4cff8a' : '#ffffff' });
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0, roughness: 0.5 });
    this.signMaterials.push({ mat, openHours: b.openHours ?? [0, 24] });
    const geo = new THREE.PlaneGeometry(len, len * 0.19);
    const m = new THREE.Mesh(geo, mat);
    const d = doorPoint(b, 0.12);
    m.position.set(vertical ? b.cx : d.x, y + 0.7, vertical ? d.z : b.cz);
    m.rotation.y = { S: 0, N: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 }[b.face];
    this.group.add(m);
  }

  /** Interior acessível: Lojas, Casas, Oficina, Café, Mercado e Casa de Apostas. */
  buildInteriorShop(b) {
    const rng = makeRng(`int-${b.id}`);
    const groundH = b.floors > 1 ? Math.min(4.0, b.height) : b.height;
    const wallColor = b.type === 'house' ? b.color : b.id === 'loja_muxima' ? 0xf5ebe0 : b.id === 'oficina_kalunga' ? 0xcfd8dc : b.id === 'ginasio' ? 0x1e293b : 0xe9d8b4;
    const wallM = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.88 });
    const walls = interiorWalls(b).map((w) => {
      const g = boxUV(w.maxX - w.minX, groundH, w.maxZ - w.minZ, 3);
      g.translate((w.minX + w.maxX) / 2, groundH / 2, (w.minZ + w.maxZ) / 2);
      return g;
    });
    this.add(new THREE.Mesh(mergeGeometries(walls), wallM), { cast: true });

    // Pisos superiores para edifícios de vários andares (mantém a fachada completa por cima do rés-do-chão)
    if (b.height > groundH + 0.2) {
      const floorSlab = new THREE.Mesh(boxUV(b.maxX - b.minX, 0.25, b.maxZ - b.minZ, 3), new THREE.MeshStandardMaterial({ color: 0xd7ccc8, roughness: 0.9 }));
      floorSlab.position.set(b.cx, groundH, b.cz);
      this.add(floorSlab, { cast: true });
      if (b.type === 'house') {
        const tex = houseTexture(b.color, b.id);
        const geo = wallsGeometry(b, groundH, b.height, 10, 6.4, rng.next());
        this.add(new THREE.Mesh(geo, windowMaterial(tex.map, tex.emissive)), { cast: true });
      } else {
        const style = b.type === 'hotel' ? 'office' : 'residential';
        const tex = facadeTextures(style, b.color, b.id.length % 3);
        const tileW = FACADE_TILE.bays * FACADE_TILE.bayW;
        const tileH = FACADE_TILE.floors * (b.height / b.floors);
        const geo = wallsGeometry(b, groundH, b.height, tileW, tileH, rng.next());
        this.add(new THREE.Mesh(geo, windowMaterial(tex.map, tex.emissive, { rough: 0.85 })), { cast: true });
      }
    }

    if (b.type === 'house' && b.roof === 'gable') {
      this.add(gableRoof(b, rng.pick(['#9c4a2f', '#b5552f', '#7d3b25'])), { cast: true });
    } else {
      const roof = new THREE.Mesh(boxUV(b.maxX - b.minX + 0.4, 0.3, b.maxZ - b.minZ + 0.4, 3), new THREE.MeshStandardMaterial({ color: 0x8a8a86, roughness: 0.9 }));
      roof.position.set(b.cx, b.height + 0.15, b.cz);
      this.add(roof, { cast: true });
    }

    const floorColor = b.type === 'house' ? 0xd7b899 : b.id === 'ginasio' ? 0x1e293b : 0xf3efe6;
    const floor = new THREE.Mesh(planeXZ(b.minX + 0.25, b.maxX - 0.25, b.minZ + 0.25, b.maxZ - 0.25, 0.12, 1.2), new THREE.MeshStandardMaterial({ map: sidewalkTexture(), color: floorColor, roughness: 0.45 }));
    this.add(floor);

    // Painel de luz no tecto do rés-do-chão
    const panelMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e0, emissiveIntensity: 1.2 });
    this.signMaterials.push({ mat: panelMat, openHours: b.openHours ?? [0, 24], alwaysOnWhenOpen: true, base: 1.2 });
    const p = new THREE.Mesh(new THREE.BoxGeometry(Math.min(2.4, (b.maxX - b.minX) * 0.4), 0.05, 0.6), panelMat);
    p.position.set(b.cx, groundH - 0.12, b.cz);
    this.group.add(p);

    if (b.id === 'mercado_kianda') {
      this.interiorLightPos = new THREE.Vector3(b.cx, groundH - 0.8, b.cz);
      const counter = new THREE.Mesh(new THREE.BoxGeometry(6, 1.1, 1), new THREE.MeshStandardMaterial({ color: 0x6d4c41, roughness: 0.6 }));
      counter.position.set(b.minX + 6, 0.55, b.minZ + 2.5);
      this.add(counter, { cast: true });
      const shelfM = new THREE.MeshStandardMaterial({ color: 0xbdbdbd, metalness: 0.4, roughness: 0.5 });
      const products = [];
      for (let i = 0; i < 3; i++) {
        const x = b.cx - 2 + i * 4.5;
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.0, 7), shelfM);
        shelf.position.set(x, 1.0, b.cz + 0.5);
        this.add(shelf, { cast: true });
        for (let lvl = 0; lvl < 4; lvl++) for (let k = 0; k < 12; k++) for (const sx of [-1, 1]) products.push([x + sx * 0.5, 0.35 + lvl * 0.5, b.cz - 2.8 + k * 0.55, (i * 7 + lvl * 3 + k) % 6]);
      }
      const colors = [0xe53935, 0xfdd835, 0x43a047, 0x1e88e5, 0xfb8c00, 0xf5f5f5];
      const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.3, 0.4), new THREE.MeshStandardMaterial({ roughness: 0.6 }), products.length);
      const mtx = new THREE.Matrix4();
      const c = new THREE.Color();
      products.forEach(([x, y, z, ci], i) => { mtx.makeTranslation(x, y, z); inst.setMatrixAt(i, mtx); inst.setColorAt(i, c.setHex(colors[ci])); });
      this.group.add(inst);
      const fridge = new THREE.Mesh(new THREE.BoxGeometry(3, 2.2, 0.8), new THREE.MeshStandardMaterial({ color: 0xe0f7fa, emissive: 0x80deea, emissiveIntensity: 0.4, roughness: 0.2 }));
      fridge.position.set(b.maxX - 2.5, 1.1, b.minZ + 1);
      this.group.add(fridge);
    } else if (b.id === 'loja_muxima') {
      // Boutique de roupa: balcão, araras de roupa colorida e espelho
      const counter = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.05, 0.9), new THREE.MeshStandardMaterial({ color: 0x4e342e, roughness: 0.5 }));
      counter.position.set(b.cx, 0.55, b.minZ + 2.2);
      this.add(counter, { cast: true });
      const rackColors = [0xe53935, 0x1e88e5, 0xfdd835, 0x8e24aa, 0x43a047];
      for (const sx of [-3.2, 3.2]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.6, 5.5), new THREE.MeshStandardMaterial({ color: 0x90a4ae, metalness: 0.7, roughness: 0.3 }));
        bar.position.set(b.cx + sx, 0.9, b.cz + 0.5);
        this.add(bar, { cast: true });
        for (let k = 0; k < 5; k++) {
          const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.85, 0.35), new THREE.MeshStandardMaterial({ color: rackColors[k], roughness: 0.7 }));
          shirt.position.set(b.cx + sx, 1.15, b.cz - 1.5 + k * 0.95);
          this.group.add(shirt);
        }
      }
    } else if (b.id === 'oficina_kalunga') {
      // Oficina e Garagem: elevador de carros, bancadas de ferramentas vermelhas
      const lift = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.22, 6.5), new THREE.MeshStandardMaterial({ color: 0x37474f, metalness: 0.5, roughness: 0.5 }));
      lift.position.set(b.cx, 0.22, b.cz - 1);
      this.add(lift);
      const bench = new THREE.Mesh(new THREE.BoxGeometry(6, 1.1, 0.9), new THREE.MeshStandardMaterial({ color: 0xc62828, roughness: 0.4, metalness: 0.3 }));
      bench.position.set(b.cx, 0.65, b.minZ + 1.5);
      this.add(bench, { cast: true });
    } else if (b.id === 'ginasio') {
      // Casa de Apostas & Desafios Kianda: terminais luminosos e balcão central
      const desk = new THREE.Mesh(new THREE.BoxGeometry(7, 1.15, 1.2), new THREE.MeshStandardMaterial({ color: 0xb71c1c, roughness: 0.4 }));
      desk.position.set(b.cx, 0.6, b.minZ + 3.0);
      this.add(desk, { cast: true });
      const screenM = new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x10b981, emissiveIntensity: 0.9, roughness: 0.2 });
      for (let k = -2; k <= 2; k++) {
        const term = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.8, 0.7), new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.5 }));
        term.position.set(b.cx + k * 4.2, 1.0, b.cz);
        this.add(term, { cast: true });
        const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.6), screenM);
        scr.position.set(b.cx + k * 4.2, 1.35, b.cz + 0.36);
        this.group.add(scr);
      }
    } else if (b.type === 'house') {
      // Interior de moradia: tapete, sofá e mesa de sala
      const rug = new THREE.Mesh(planeXZ(b.cx - 1.8, b.cx + 1.8, b.cz - 1.4, b.cz + 1.4, 0.135, 1), new THREE.MeshStandardMaterial({ color: 0x8d3b2f, roughness: 0.9 }));
      this.group.add(rug);
      const sofa = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.75, 0.9), new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.8 }));
      sofa.position.set(b.cx, 0.48, b.cz - 1.6);
      this.group.add(sofa);
      const table = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.48, 0.8), new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.6 }));
      table.position.set(b.cx, 0.36, b.cz);
      this.group.add(table);
    } else {
      // Café, restaurante, farmácia, barbearia, hotel
      const counter = new THREE.Mesh(new THREE.BoxGeometry(Math.min(4.5, (b.maxX - b.minX) * 0.5), 1.05, 0.9), new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.6 }));
      counter.position.set(b.cx, 0.55, b.minZ + 2.2);
      this.add(counter, { cast: true });
    }

    if (b.sign) this.addSign(b, Math.min(groundH - 0.6, 3.6));
  }

  // ---------------------------------------------------------- largo / jardim
  buildPlaza() {
    const wave = wavePavementTexture();
    const plaza = new THREE.Mesh(planeXZ(-21, 21, -66, -15, 0.07, 7), new THREE.MeshStandardMaterial({ map: wave, roughness: 0.75 }));
    this.add(plaza);
    // fonte
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.6, 0.8, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0xd7d0c2, roughness: 0.7, side: THREE.DoubleSide }));
    basin.position.set(0, 0.45, -50);
    this.add(basin, { cast: true });
    const water = new THREE.Mesh(new THREE.CircleGeometry(3.3, 32), new THREE.MeshStandardMaterial({ color: 0x3e7fa6, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.85 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, 0.65, -50);
    this.add(water);
    this.water = water;
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 2.4, 16), basin.material);
    column.position.set(0, 1.2, -50);
    this.add(column, { cast: true });
    // jacto de água animado (partículas)
    const n = 220;
    const jetGeo = new THREE.BufferGeometry();
    const arr = new Float32Array(n * 3);
    jetGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    this.jet = new THREE.Points(jetGeo, new THREE.PointsMaterial({ color: 0xcfe8ff, size: 0.09, transparent: true, opacity: 0.8 }));
    this.jet.userData.seeds = Array.from({ length: n }, () => [Math.random() * Math.PI * 2, Math.random()]);
    this.group.add(this.jet);
    // palco do largo
    const stage = new THREE.Mesh(boxUV(9, 1.0, 5, 2), new THREE.MeshStandardMaterial({ color: 0x4e342e, roughness: 0.8 }));
    stage.position.set(0, 0.5, -62.5);
    this.add(stage, { cast: true });
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.4), new THREE.MeshStandardMaterial({ map: signTexture('EVENTOS DA KIANDA', { bg: '#b71c1c' }), emissive: 0xffffff, emissiveMap: signTexture('EVENTOS DA KIANDA', { bg: '#b71c1c' }), emissiveIntensity: 0 }));
    banner.position.set(0, 4.2, -64.9);
    this.signMaterials.push({ mat: banner.material, openHours: [15, 23] });
    this.group.add(banner);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.8, 8), new THREE.MeshStandardMaterial({ color: 0x222222 }));
      post.position.set(sx * 4.2, 2.4, -64.9);
      this.add(post, { cast: true });
    }
  }

  buildPark() {
    const grass = new THREE.Mesh(planeXZ(-45, 11, 17, 81, 0.04, 4), new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 1 }));
    this.add(grass);
    const pathM = new THREE.MeshStandardMaterial({ map: sidewalkTexture(), color: 0xd9cdb3, roughness: 0.9 });
    const paths = [planeXZ(-19.5, -14.5, 15, 82, 0.06, 2.5), planeXZ(-46, 12, 46.5, 51.5, 0.065, 2.5), planeXZ(-46, 12, 22, 26, 0.065, 2.5)];
    this.add(new THREE.Mesh(mergeGeometries(paths), pathM));
    // quiosque
    const k = PROPS.find((p) => p.kind === 'kiosk');
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 2.6, 8), new THREE.MeshStandardMaterial({ color: 0xffb74d, roughness: 0.7 }));
    base.position.set(k.x, 1.3, k.z);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.2, 1.4, 8), new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.8 }));
    roof.position.set(k.x, 3.3, k.z);
    this.add(base, { cast: true });
    this.add(roof, { cast: true });
  }

  buildArena() {
    const court = new THREE.Mesh(planeXZ(14, 46, 17, 54, 0.05, 6), new THREE.MeshStandardMaterial({ map: courtTexture(), roughness: 0.85 }));
    this.add(court);
    const lines = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
    for (const [x, z, w, d] of [[30, 17.4, 32, 0.15], [30, 53.6, 32, 0.15], [14.4, 35.5, 0.15, 37], [45.6, 35.5, 0.15, 37], [30, 35.5, 0.15, 37]]) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lines);
      l.rotation.x = -Math.PI / 2;
      l.position.set(x, 0.065, z);
      this.group.add(l);
    }
    // bancadas
    const standM = new THREE.MeshStandardMaterial({ color: 0x546e7a, roughness: 0.8 });
    for (let s = 0; s < 3; s++) {
      const st = new THREE.Mesh(boxUV(28, 0.5, 1, 2), standM);
      st.position.set(30, 0.25 + s * 0.5, 51 + s * 1.0);
      this.add(st, { cast: true });
    }
    // quadro de desafios + Pavilhão Casa de Apostas na Arena
    const tex = signTexture('CASA DE APOSTAS & DESAFIOS', { bg: '#0d47a1' });
    const board = new THREE.Mesh(new THREE.BoxGeometry(5.2, 2.4, 0.25), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35 }));
    board.position.set(18, 2.3, 19.5);
    this.add(board, { cast: true });
    this.signMaterials.push({ mat: board.material, openHours: [0, 24], base: 0.4 });
    // Cobertura iluminada do Pavilhão de Desafios
    const pavRoof = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.35, 5.5), new THREE.MeshStandardMaterial({ color: 0x1e293b, emissive: 0xf5b942, emissiveIntensity: 0.25 }));
    pavRoof.position.set(18, 4.1, 21.5);
    this.add(pavRoof, { cast: true });
    const arenaSign = signTexture('ARENA & APOSTAS KIANDA', { bg: '#b71c1c' });
    const arch = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.6), new THREE.MeshStandardMaterial({ map: arenaSign, emissive: 0xffffff, emissiveMap: arenaSign, emissiveIntensity: 0 }));
    arch.position.set(30, 5.2, 17.2);
    arch.rotation.y = Math.PI;
    this.group.add(arch);
    this.signMaterials.push({ mat: arch.material, openHours: [0, 24] });
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 6, 0.4), new THREE.MeshStandardMaterial({ color: 0x263238 }));
      post.position.set(30 + sx * 6.2, 3, 17.2);
      this.add(post, { cast: true });
    }
  }

  buildEastSide() {
    // linhas do parque de estacionamento
    const white = new THREE.MeshStandardMaterial({ color: 0xeeeeee });
    for (let i = 0; i <= 3; i++) {
      for (const z of [-46, -24]) {
        const l = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 5), white);
        l.rotation.x = -Math.PI / 2;
        l.position.set(95.5 + i * 9, 0.045, z);
        this.group.add(l);
      }
    }
    // posto de combustível: cobertura iluminada
    const canopyM = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.6 });
    this.signMaterials.push({ mat: canopyM, openHours: [0, 24], canopy: true });
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(28, 0.6, 12), canopyM);
    canopy.position.set(110, 5.2, 30);
    this.add(canopy, { cast: true });
    for (const x of [99, 121]) for (const z of [26, 34]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 5, 10), new THREE.MeshStandardMaterial({ color: 0x00796b }));
      col.position.set(x, 2.5, z);
      this.add(col, { cast: true });
    }
    for (const p of PROPS.filter((pp) => pp.kind === 'fuel_pump')) {
      const pump = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, 0.6), new THREE.MeshStandardMaterial({ color: 0xc62828 }));
      pump.position.set(p.x, 0.8, p.z);
      this.add(pump, { cast: true });
    }
    const tex = signTexture('KWANZA ENERGIA', { bg: '#00796b' });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.3), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0 }));
    sign.position.set(110, 5.2, 36.05);
    this.group.add(sign);
    this.signMaterials.push({ mat: sign.material, openHours: [0, 24] });
    this.stationLightPos = new THREE.Vector3(110, 4.5, 30);
  }

  // ------------------------------------------------------ mobiliário urbano
  buildStreetFurniture() {
    const lamps = PROPS.filter((p) => p.kind === 'streetlight');
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.13, 7.5, 8);
    poleGeo.translate(0, 3.75, 0);
    const armGeo = new THREE.BoxGeometry(0.08, 0.08, 1.6);
    armGeo.translate(0, 7.4, 0.75);
    const headGeo = new THREE.BoxGeometry(0.35, 0.14, 0.7);
    headGeo.translate(0, 7.32, 1.45);
    const bulbGeo = new THREE.PlaneGeometry(0.28, 0.6);
    bulbGeo.rotateX(Math.PI / 2);
    bulbGeo.translate(0, 7.24, 1.45);
    const metal = new THREE.MeshStandardMaterial({ color: 0x3a4148, roughness: 0.5, metalness: 0.6 });
    this.bulbMaterial = new THREE.MeshStandardMaterial({ color: 0xfff1d0, emissive: 0xffd9a0, emissiveIntensity: 0 });
    const poles = new THREE.InstancedMesh(mergeGeometries([poleGeo, armGeo, headGeo]), metal, lamps.length);
    const bulbs = new THREE.InstancedMesh(bulbGeo, this.bulbMaterial, lamps.length);
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const yaw = { N: Math.PI, S: 0, E: Math.PI / 2, W: -Math.PI / 2 };
    lamps.forEach((l, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw[l.facing]);
      mtx.compose(new THREE.Vector3(l.x, 0.15, l.z), q, new THREE.Vector3(1, 1, 1));
      poles.setMatrixAt(i, mtx);
      bulbs.setMatrixAt(i, mtx);
      const dx = Math.sin(yaw[l.facing]) * 1.45;
      const dz = Math.cos(yaw[l.facing]) * 1.45;
      this.lampPositions.push(new THREE.Vector3(l.x + dx, 7.0, l.z + dz));
    });
    poles.castShadow = true;
    this.group.add(poles, bulbs);

    // bancos
    const benchGeo = mergeGeometries([
      (() => { const gg = new THREE.BoxGeometry(1.8, 0.08, 0.5); gg.translate(0, 0.45, 0); return gg; })(),
      (() => { const gg = new THREE.BoxGeometry(1.8, 0.5, 0.06); gg.translate(0, 0.75, -0.24); return gg; })(),
      (() => { const gg = new THREE.BoxGeometry(0.08, 0.45, 0.45); gg.translate(-0.8, 0.22, 0); return gg; })(),
      (() => { const gg = new THREE.BoxGeometry(0.08, 0.45, 0.45); gg.translate(0.8, 0.22, 0); return gg; })(),
    ]);
    const benches = new THREE.InstancedMesh(benchGeo, new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.8 }), BENCHES.length);
    BENCHES.forEach((bch, i) => {
      // o banco "olha" para angle → a sua frente (+Z local) roda para essa direcção
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), bch.angle);
      mtx.compose(new THREE.Vector3(bch.x - Math.sin(bch.angle) * 0.1, 0.06, bch.z - Math.cos(bch.angle) * 0.1), q, new THREE.Vector3(1, 1, 1));
      benches.setMatrixAt(i, mtx);
    });
    benches.castShadow = true;
    this.group.add(benches);

    // paragem de autocarro
    const stop = PROPS.find((p) => p.kind === 'bus_stop');
    const shelterM = new THREE.MeshStandardMaterial({ color: 0x9ec5d6, transparent: true, opacity: 0.35, roughness: 0.1 });
    const back = new THREE.Mesh(new THREE.BoxGeometry(4, 2.4, 0.05), shelterM);
    back.position.set(stop.x, 1.35, stop.z + 1.2);
    const roofS = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.1, 1.8), new THREE.MeshStandardMaterial({ color: 0x37474f }));
    roofS.position.set(stop.x, 2.6, stop.z + 0.5);
    this.add(back);
    this.add(roofS, { cast: true });
    const stopSign = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.5), new THREE.MeshStandardMaterial({ map: signTexture('PARAGEM', { bg: '#1565c0' }) }));
    stopSign.position.set(stop.x + 2.3, 2.3, stop.z + 0.4);
    this.group.add(stopSign);

    // caixotes do lixo ao longo da avenida
    const bins = [];
    for (let x = -120; x <= 120; x += 30) for (const z of [-13.6, 13.6]) bins.push([x + 5, z]);
    const binInst = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.26, 0.9, 10), new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.7 }), bins.length);
    bins.forEach(([x, z], i) => { mtx.makeTranslation(x, 0.6, z); binInst.setMatrixAt(i, mtx); });
    this.group.add(binInst);
  }

  buildTrees() {
    const trees = PROPS.filter((p) => p.kind === 'tree');
    const bySpecies = { acacia: [], mangueira: [], palmeira: [] };
    for (const t of trees) (bySpecies[t.species] ?? bySpecies.acacia).push(t);
    const trunkM = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.9 });
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const s = new THREE.Vector3();
    this.foliage = [];
    const foliageMat = (color) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true });
      m.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = WIND.uTime;
        shader.uniforms.uWind = WIND.uWind;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
            vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
            float sway = (0.15 + uWind * 0.6) * max(0.0, position.y);
            transformed.x += sin(uTime * 1.3 + wp.x * 0.37 + wp.z * 0.21) * sway * 0.08;
            transformed.z += cos(uTime * 1.1 + wp.z * 0.33) * sway * 0.06;`);
      };
      return m;
    };
    for (const [species, list] of Object.entries(bySpecies)) {
      if (!list.length) continue;
      const trunkGeo = species === 'palmeira' ? new THREE.CylinderGeometry(0.16, 0.24, 1, 7) : new THREE.CylinderGeometry(0.18, 0.28, 1, 7);
      trunkGeo.translate(0, 0.5, 0);
      let crownGeo;
      let crownColor;
      if (species === 'palmeira') {
        crownGeo = mergeGeometries(Array.from({ length: 7 }, (_, i) => {
          const leaf = new THREE.ConeGeometry(0.35, 3.2, 4);
          leaf.rotateX(Math.PI / 2 + 0.5);
          leaf.translate(0, 0, 1.4);
          leaf.rotateY((i / 7) * Math.PI * 2);
          return leaf;
        }));
        crownColor = 0x3f7d2c;
      } else if (species === 'mangueira') {
        crownGeo = new THREE.IcosahedronGeometry(1, 1);
        crownGeo.scale(2.6, 2.2, 2.6);
        crownColor = 0x2f5e24;
      } else {
        crownGeo = new THREE.IcosahedronGeometry(1, 1);
        crownGeo.scale(3.0, 1.2, 3.0);
        crownColor = 0x5b8a3a;
      }
      const trunks = new THREE.InstancedMesh(trunkGeo, trunkM, list.length);
      const crowns = new THREE.InstancedMesh(crownGeo, foliageMat(crownColor), list.length);
      list.forEach((t, i) => {
        const trunkH = species === 'palmeira' ? t.h : t.h * 0.45;
        mtx.compose(v.set(t.x, 0, t.z), q.identity(), s.set(1, trunkH, 1));
        trunks.setMatrixAt(i, mtx);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (i * 1.7) % (Math.PI * 2));
        const k = 0.8 + ((i * 37) % 10) / 25;
        mtx.compose(v.set(t.x, trunkH + (species === 'palmeira' ? 0 : t.h * 0.18), t.z), q, s.set(k, k, k));
        crowns.setMatrixAt(i, mtx);
      });
      trunks.castShadow = true;
      crowns.castShadow = true;
      crowns.receiveShadow = true;
      this.group.add(trunks, crowns);
    }
  }

  buildTrafficLights() {
    const poleM = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.5, metalness: 0.5 });
    const boxM = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
    const lampMat = (c) => new THREE.MeshStandardMaterial({ color: 0x222222, emissive: c, emissiveIntensity: 0 });
    for (const tl of TRAFFIC_LIGHTS) {
      const heads = { ew: [], ns: [] };
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const x = tl.x + sx * (tl.halfNS + 1.2);
        const z = tl.z + sz * (tl.halfEW + 1.2);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4.2, 8), poleM);
        pole.position.set(x, 2.25, z);
        this.add(pole, { cast: true });
        // cabeça virada para o trânsito EW (que vem pela direita da estrada) e para o NS
        for (const axis of ['ew', 'ns']) {
          const head = new THREE.Group();
          const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.95, 0.25), boxM);
          head.add(box);
          const lamps = {};
          [['red', 0xff2a1a, 0.3], ['yellow', 0xffb300, 0], ['green', 0x1aff6a, -0.3]].forEach(([name, color, y]) => {
            const l = new THREE.Mesh(new THREE.CircleGeometry(0.1, 12), lampMat(color));
            l.position.set(0, y, 0.13);
            head.add(l);
            lamps[name] = l.material;
          });
          head.position.set(x, 3.6, z);
          // EW: virado para quem chega pelo eixo X (cabeça rodada ±90°)
          if (axis === 'ew') head.rotation.y = sx < 0 ? -Math.PI / 2 : Math.PI / 2;
          else head.rotation.y = sz < 0 ? Math.PI : 0;
          head.position.y += axis === 'ew' ? 0 : 0.05;
          this.group.add(head);
          heads[axis].push(lamps);
        }
      }
      this.lightHeads.set(tl.id, heads);
    }
  }

  setTrafficLights(states) {
    for (const s of states ?? []) {
      const heads = this.lightHeads.get(s.id);
      if (!heads) continue;
      for (const axis of ['ew', 'ns']) {
        for (const lamps of heads[axis]) {
          for (const name of ['red', 'yellow', 'green']) lamps[name].emissiveIntensity = s[axis] === name ? 3 : 0;
        }
      }
    }
  }

  buildParkedVehicles() {
    const rng = makeRng('estacionados');
    const colors = ['#f5f5f5', '#212121', '#b71c1c', '#0d47a1', '#9e9e9e', '#1b5e20', '#f9a825', '#cfd8dc'];
    for (const v of PARKED_VEHICLES) {
      if (v.usable) continue; // os utilizáveis são geridos pelo servidor (actores)
      const model = createVehicle(v.kind === 'moto' ? 'moto_ngola' : rng.pick(['sedan_kianda', 'hatch_muxima', 'suv_namibe', 'carrinha_lobito']), { paint: rng.pick(colors), rims: rng.pick(['classica', 'desportiva', 'cromada']) });
      model.root.position.set(v.x, 0, v.z);
      model.root.rotation.y = v.heading;
      this.group.add(model.root);
    }
  }

  /** Silhueta urbana distante (escala da cidade além da zona jogável). */
  buildSkyline() {
    const rng = makeRng('skyline');
    const items = [];
    for (let i = 0; i < 140; i++) {
      const ang = rng.next() * Math.PI * 2;
      const r = 190 + rng.next() * 260;
      const x = Math.cos(ang) * r * 1.2;
      const z = Math.sin(ang) * r;
      if (Math.abs(x) < 150 && Math.abs(z) < 130) continue;
      items.push([x, z, 12 + rng.next() * 22, 12 + rng.next() * 22, 10 + rng.next() * (r < 300 ? 55 : 90)]);
    }
    const tex = facadeTextures('office', '#8c99a6', 7);
    const m = windowMaterial(tex.map, tex.emissive, { warm: true });
    const geos = items.map(([x, z, w, d, h]) => {
      const b = { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 };
      return wallsGeometry(b, 0, h, 14, 12.8, rng.next());
    });
    const sky = new THREE.Mesh(mergeGeometries(geos), m);
    this.group.add(sky);
    void ZONE_BOUNDS;
    void RACE_TRACK;
  }

  /** Actualizações por frame (água, letreiros, molhado, luzes). */
  update(dt, env) {
    const t = performance.now() / 1000;
    WIND.uTime.value = t;
    WIND.uWind.value = env.weather?.wind ?? 0.2;
    if (this.jet) {
      const pos = this.jet.geometry.attributes.position;
      const seeds = this.jet.userData.seeds;
      for (let i = 0; i < seeds.length; i++) {
        const [a, off] = seeds[i];
        const life = (t * 0.8 + off) % 1;
        const r = life * 1.6;
        pos.setXYZ(i, Math.cos(a) * r, 2.4 + life * 2.2 - life * life * 3.6, -50 + Math.sin(a) * r);
      }
      pos.needsUpdate = true;
    }
    const hour = env.hour ?? 12;
    const night = env.light?.streetLights ?? 0;
    this.bulbMaterial.emissiveIntensity = night * 6;
    for (const s of this.signMaterials) {
      const [a, b] = s.openHours ?? [0, 24];
      const open = a === 0 && b === 24 ? true : b > a ? hour >= a && hour < b : hour >= a || hour < b;
      s.mat.emissiveIntensity = s.alwaysOnWhenOpen ? (open ? s.base : 0.05) : (open ? Math.max(s.base ?? 0, night * (s.canopy ? 1.2 : 1.8)) : 0);
    }
    const wet = env.weather?.wetness ?? 0;
    for (const w of this.wetMaterials) {
      if (w.glass) continue;
      w.mat.roughness = THREE.MathUtils.lerp(w.dryRough, w.wetRough, wet);
      w.mat.color.copy(w.dryColor).lerp(w.wetColor, wet * 0.8);
      w.mat.envMapIntensity = 0.6 + wet * 1.4;
    }
  }
}

export const WIND = { uTime: { value: 0 }, uWind: { value: 0.2 } };
