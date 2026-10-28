/**
 * NgolaBiz World 3D — Definição da primeira zona urbana: "Kianda Centro".
 *
 * Cidade fictícia com referência solar em Luanda. Unidades em metros.
 * Eixos (convenção three.js): +X = Este, +Z = Sul, +Y = cima. Norte = -Z.
 * Trânsito pela direita (como em Angola).
 *
 * Este módulo é a fonte única do layout: o servidor usa-o para navegação de NPCs,
 * trânsito e validação de corridas; o cliente web usa-o para construir a geometria;
 * `tools/export-zone.mjs` exporta-o em JSON para o importador do UE5.
 */
import { makeRng } from './rng.js';

export const ZONE_ID = 'kianda_centro';
export const ZONE_BOUNDS = Object.freeze({ minX: -130, maxX: 130, minZ: -110, maxZ: 110 });

export const ROADS = Object.freeze([
  { id: 'av_kianda', name: 'Avenida da Kianda', axis: 'x', at: 0, from: -130, to: 130, width: 20, sidewalk: 5, lanes: 4, parking: true },
  { id: 'rua_mercado', name: 'Rua do Mercado', axis: 'z', at: -55, from: -110, to: 110, width: 8, sidewalk: 4, lanes: 2 },
  { id: 'rua_oficina', name: 'Rua da Oficina', axis: 'z', at: 55, from: -110, to: 110, width: 8, sidewalk: 4, lanes: 2 },
  { id: 'rua_acacias', name: 'Rua das Acácias', axis: 'x', at: -90, from: -55, to: 55, width: 8, sidewalk: 4, lanes: 2 },
  { id: 'rua_parque', name: 'Rua do Parque', axis: 'x', at: 90, from: -55, to: 55, width: 8, sidewalk: 4, lanes: 2 },
]);

export const DISTRICTS = Object.freeze({
  centro: { name: 'Largo da Kianda', style: 'comercial', palette: ['#e8dcc4', '#d9c7a3', '#f1e6d0', '#c9b79a'] },
  parque: { name: 'Jardim do Parque', style: 'lazer', palette: ['#dfe7d4', '#cfd9c0'] },
  residencial: { name: 'Bairro das Mangueiras', style: 'residencial', palette: ['#f2b5a7', '#f4d58d', '#a8d5ba', '#9fc5e8', '#e6b8d0', '#f7c873'] },
  oficinas: { name: 'Zona Kalunga', style: 'industrial', palette: ['#b8bcc2', '#9aa3ad', '#c7c2b8', '#8f9aa6'] },
});

// ---------------------------------------------------------------------------
// Geometria básica
// ---------------------------------------------------------------------------

export function roadRect(r) {
  return r.axis === 'x'
    ? { minX: r.from, maxX: r.to, minZ: r.at - r.width / 2, maxZ: r.at + r.width / 2 }
    : { minX: r.at - r.width / 2, maxX: r.at + r.width / 2, minZ: r.from, maxZ: r.to };
}

export function rectsOverlap(a, b, pad = 0) {
  return a.minX < b.maxX + pad && a.maxX > b.minX - pad && a.minZ < b.maxZ + pad && a.maxZ > b.minZ - pad;
}

export function pointInRect(x, z, r, pad = 0) {
  return x >= r.minX - pad && x <= r.maxX + pad && z >= r.minZ - pad && z <= r.maxZ + pad;
}

const ROAD_RECTS = ROADS.map((r) => ({ id: r.id, ...roadRect(r) }));

export function roadAt(x, z) {
  return ROAD_RECTS.find((r) => pointInRect(x, z, r)) || null;
}

/** Passeios recortados nos cruzamentos (para renderização e colisão de peões). */
export function sidewalkRects() {
  const out = [];
  for (const r of ROADS) {
    for (const side of [-1, 1]) {
      const inner = r.at + side * r.width / 2;
      const outer = r.at + side * (r.width / 2 + r.sidewalk);
      const lo = Math.min(inner, outer);
      const hi = Math.max(inner, outer);
      // intervalos ao longo do eixo cortados pelas faixas de rodagem que cruzam
      let pieces = [[r.from, r.to]];
      for (const o of ROAD_RECTS) {
        if (o.id === r.id) continue;
        const cross = r.axis === 'x' ? [o.minX, o.maxX] : [o.minZ, o.maxZ];
        const across = r.axis === 'x' ? [o.minZ, o.maxZ] : [o.minX, o.maxX];
        if (across[1] <= lo || across[0] >= hi) continue;
        const next = [];
        for (const [a, b] of pieces) {
          if (cross[1] <= a || cross[0] >= b) { next.push([a, b]); continue; }
          if (cross[0] > a) next.push([a, cross[0]]);
          if (cross[1] < b) next.push([cross[1], b]);
        }
        pieces = next;
      }
      for (const [a, b] of pieces) {
        if (b - a < 0.5) continue;
        out.push(r.axis === 'x'
          ? { roadId: r.id, minX: a, maxX: b, minZ: lo, maxZ: hi }
          : { roadId: r.id, minX: lo, maxX: hi, minZ: a, maxZ: b });
      }
    }
  }
  return out;
}

/** Cruzamentos entre estradas perpendiculares. */
export function intersections() {
  const out = [];
  for (const h of ROADS.filter((r) => r.axis === 'x')) {
    for (const v of ROADS.filter((r) => r.axis === 'z')) {
      const x = v.at;
      const z = h.at;
      if (x < h.from - 0.01 || x > h.to + 0.01 || z < v.from - 0.01 || z > v.to + 0.01) continue;
      const isT = Math.abs(x - h.from) < 0.01 || Math.abs(x - h.to) < 0.01;
      out.push({
        id: `x_${h.id}_${v.id}`,
        x, z, roadEW: h.id, roadNS: v.id,
        kind: isT ? 'T' : 'cross',
        hasLight: h.id === 'av_kianda',
        halfEW: h.width / 2, halfNS: v.width / 2,
      });
    }
  }
  return out;
}

export const INTERSECTIONS = Object.freeze(intersections());
export const TRAFFIC_LIGHTS = Object.freeze(INTERSECTIONS.filter((i) => i.hasLight).map((i) => ({ id: `tl_${i.roadNS}`, intersectionId: i.id, x: i.x, z: i.z, halfEW: i.halfEW, halfNS: i.halfNS })));

/**
 * Ciclo semafórico determinístico a partir do relógio real do servidor
 * (não acelera com o tempo virtual). Fases: EW verde → amarelo → todos vermelho → NS verde → ...
 */
export const LIGHT_CYCLE = Object.freeze([
  { phase: 'EW_GREEN', seconds: 24, ew: 'green', ns: 'red' },
  { phase: 'EW_YELLOW', seconds: 4, ew: 'yellow', ns: 'red' },
  { phase: 'ALL_RED_1', seconds: 2, ew: 'red', ns: 'red' },
  { phase: 'NS_GREEN', seconds: 16, ew: 'red', ns: 'green' },
  { phase: 'NS_YELLOW', seconds: 4, ew: 'red', ns: 'yellow' },
  { phase: 'ALL_RED_2', seconds: 2, ew: 'red', ns: 'red' },
]);
const LIGHT_CYCLE_TOTAL = LIGHT_CYCLE.reduce((s, p) => s + p.seconds, 0);

export function trafficLightState(realMs, lightId = '', override = null) {
  if (override) return override;
  // pequeno desfasamento por semáforo para "onda verde"
  const offset = lightId === 'tl_rua_oficina' ? 6 : 0;
  let t = ((realMs / 1000 + offset) % LIGHT_CYCLE_TOTAL + LIGHT_CYCLE_TOTAL) % LIGHT_CYCLE_TOTAL;
  for (const p of LIGHT_CYCLE) {
    if (t < p.seconds) return { ...p, remaining: p.seconds - t };
    t -= p.seconds;
  }
  return { ...LIGHT_CYCLE[0], remaining: 0 };
}

// ---------------------------------------------------------------------------
// Edifícios, POIs e mobiliário urbano (determinísticos por semente)
// ---------------------------------------------------------------------------

/**
 * face = direcção para onde está virada a fachada principal/porta.
 * N: porta em minZ; S: porta em maxZ; W: porta em minX; E: porta em maxX.
 */
function building(id, minX, maxX, minZ, maxZ, opts) {
  return { id, minX, maxX, minZ, maxZ, ...opts, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 };
}

export function doorPoint(b, outside = 1.6) {
  switch (b.face) {
    case 'N': return { x: b.doorX ?? b.cx, z: b.minZ - outside };
    case 'S': return { x: b.doorX ?? b.cx, z: b.maxZ + outside };
    case 'W': return { x: b.minX - outside, z: b.doorZ ?? b.cz };
    default: return { x: b.maxX + outside, z: b.doorZ ?? b.cz };
  }
}

const RESERVED = [
  { id: 'largo', minX: -21, maxX: 21, minZ: -66, maxZ: -34 },
  { id: 'acesso_largo', minX: -8, maxX: 8, minZ: -34, maxZ: -15 },
  { id: 'jardim', minX: -45, maxX: 11, minZ: 17, maxZ: 81 },
  { id: 'arena', minX: 14, maxX: 46, minZ: 17, maxZ: 54 },
  { id: 'parque_estac', minX: 94, maxX: 127, minZ: -52, maxZ: -16 },
  { id: 'posto', minX: 94, maxX: 127, minZ: 16, maxZ: 44 },
];

/** Áreas pedonais pavimentadas (custo de navegação normal). */
export const RESERVED_WALK_AREAS = Object.freeze(RESERVED.filter((r) => ['largo', 'acesso_largo', 'jardim', 'arena'].includes(r.id)));

function generateBuildings() {
  const rng = makeRng('kianda-buildings-v1');
  const B = [];
  const fits = (b) => {
    const r = { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ };
    if (r.minX < ZONE_BOUNDS.minX + 1 || r.maxX > ZONE_BOUNDS.maxX - 1 || r.minZ < ZONE_BOUNDS.minZ + 1 || r.maxZ > ZONE_BOUNDS.maxZ - 1) return false;
    if (ROAD_RECTS.some((rr) => rectsOverlap(r, rr, 4.5))) return false; // respeita passeios
    if (RESERVED.some((rr) => rectsOverlap(r, rr, 0.5))) return false;
    return !B.some((o) => rectsOverlap(r, o, 1.5));
  };
  const add = (b) => { if (fits(b)) { B.push(b); return true; } return false; };

  // --- Marcos (landmarks) do Largo e Avenida ---------------------------------
  add(building('mercado_kianda', -44, -24, -30, -16, { name: 'Mercado Kianda', type: 'shop', district: 'centro', floors: 1, height: 5.2, face: 'S', interior: true, color: '#e9d8b4', openHours: [7, 21], sign: 'MERCADO KIANDA' }));
  add(building('cafe_marginal', -21, -10, -28, -16, { name: 'Café Marginal', type: 'cafe', district: 'centro', floors: 2, height: 7, face: 'S', interior: true, color: '#c96f4a', openHours: [6, 23], sign: 'CAFÉ MARGINAL' }));
  add(building('loja_muxima', 10, 22, -28, -16, { name: 'Moda Muxima', type: 'shop', district: 'centro', floors: 3, height: 10.5, face: 'S', interior: true, color: '#d8c3a5', openHours: [9, 19], sign: 'MODA MUXIMA' }));
  add(building('barbearia', 24, 33, -26, -16, { name: 'Barbearia Estilo', type: 'shop', district: 'centro', floors: 2, height: 7, face: 'S', interior: true, color: '#4f6d7a', openHours: [8, 20], sign: 'BARBEARIA' }));
  add(building('farmacia', 35, 45, -28, -16, { name: 'Farmácia Ngola', type: 'shop', district: 'centro', floors: 2, height: 7.5, face: 'S', interior: true, color: '#eef2ee', openHours: [0, 24], sign: 'FARMÁCIA 24H' }));
  add(building('hotel_kianda', 33, 46, -66, -36, { name: 'Hotel Kianda', type: 'hotel', district: 'centro', floors: 9, height: 30, face: 'W', interior: true, color: '#d4c8b0', openHours: [0, 24], sign: 'HOTEL KIANDA' }));
  add(building('edificio_largo', -46, -33, -64, -36, { name: 'Edifício do Largo', type: 'apartment', district: 'centro', floors: 7, height: 23, face: 'E', color: '#e2cfa8' }));
  add(building('escritorios_acacias', 22, 46, -82, -70, { name: 'Torre Acácias', type: 'office', district: 'centro', floors: 11, height: 38, face: 'N', color: '#9fb3c8', glass: true }));
  add(building('residencial_acacias', -46, -24, -82, -70, { name: 'Residencial Acácias', type: 'apartment', district: 'centro', floors: 6, height: 20, face: 'N', color: '#f0d9b5' }));
  add(building('ginasio', 16, 45, 60, 82, { name: 'Casa de Apostas & Desafios Kianda', type: 'gym', district: 'parque', floors: 2, height: 8, face: 'S', interior: true, color: '#2f3e4e', openHours: [0, 24], sign: 'CASA DE APOSTAS' }));

  // --- Zona Kalunga (Este) -------------------------------------------------
  add(building('oficina_kalunga', 66, 90, -42, -18, { name: 'Oficina Kalunga Motors', type: 'workshop', district: 'oficinas', floors: 1, height: 7, face: 'S', interior: true, color: '#b9b2a2', garageDoor: true, openHours: [7, 19], sign: 'KALUNGA MOTORS' }));
  add(building('torre_kalunga', 66, 88, -104, -64, { name: 'Torre Kalunga', type: 'apartment', district: 'oficinas', floors: 14, height: 46, face: 'W', color: '#a9b4be', glass: true }));
  add(building('armazem_norte', 96, 126, -104, -62, { name: 'Armazém Norte', type: 'warehouse', district: 'oficinas', floors: 1, height: 9, face: 'W', color: '#8d969f' }));
  add(building('restaurante_ilha', 66, 90, 18, 40, { name: 'Restaurante da Ilha', type: 'restaurant', district: 'oficinas', floors: 2, height: 8, face: 'N', interior: true, color: '#f3e3c3', openHours: [11, 24], sign: 'RESTAURANTE DA ILHA' }));
  add(building('escritorios_sul', 66, 92, 56, 104, { name: 'Centro Empresarial Sul', type: 'office', district: 'oficinas', floors: 10, height: 34, face: 'W', color: '#c3ccd4', glass: true }));
  add(building('armazem_sul', 98, 126, 56, 104, { name: 'Armazém Sul', type: 'warehouse', district: 'oficinas', floors: 1, height: 10, face: 'W', color: '#9da5ad' }));

  // --- Bairro das Mangueiras (Oeste): moradias e prédios -------------------
  const resPalette = DISTRICTS.residencial.palette;
  // moradias viradas para a Rua do Mercado (lado oeste, porta a Este)
  for (let z = -106; z < -18; z += rng.range(13, 16)) {
    const w = rng.range(9, 12);
    const d = rng.range(10, 14);
    add(building(`moradia_m_${B.length}`, -63.5 - d, -63.5, z, z + w, { name: 'Moradia', type: 'house', district: 'residencial', floors: rng.int(1, 2), height: 0, face: 'E', color: rng.pick(resPalette), roof: rng.pick(['flat', 'gable']) }));
  }
  // moradias viradas para a Avenida (lado norte, porta a Sul)
  for (let x = -128; x < -80; x += rng.range(13, 16)) {
    const w = rng.range(10, 12);
    add(building(`moradia_a_${B.length}`, x, x + w, -29, -16.5, { name: 'Moradia', type: 'house', district: 'residencial', floors: rng.int(1, 2), height: 0, face: 'S', color: rng.pick(resPalette), roof: rng.pick(['flat', 'gable']) }));
  }
  // segunda fila de moradias
  for (let z = -100; z < -40; z += rng.range(14, 17)) {
    for (let x = -126; x < -96; x += rng.range(14, 16)) {
      add(building(`moradia_i_${B.length}`, x, x + rng.range(9, 11), z, z + rng.range(9, 11), { name: 'Moradia', type: 'house', district: 'residencial', floors: rng.int(1, 2), height: 0, face: rng.pick(['S', 'E']), color: rng.pick(resPalette), roof: rng.pick(['flat', 'gable']) }));
    }
  }
  // prédios residenciais a sul da Avenida (porta a Norte/Este)
  for (let x = -128; x < -70; x += rng.range(19, 23)) {
    add(building(`predio_a_${B.length}`, x, x + rng.range(15, 18), 16.5, 16.5 + rng.range(14, 18), { name: 'Prédio Residencial', type: 'apartment', district: 'residencial', floors: rng.int(4, 8), height: 0, face: 'N', color: rng.pick(resPalette) }));
  }
  for (let z = 40; z < 104; z += rng.range(18, 22)) {
    add(building(`predio_m_${B.length}`, -63.5 - rng.range(14, 18), -63.5, z, z + rng.range(13, 16), { name: 'Prédio Residencial', type: 'apartment', district: 'residencial', floors: rng.int(3, 7), height: 0, face: 'E', color: rng.pick(resPalette) }));
  }
  for (let z = 42; z < 104; z += rng.range(18, 22)) {
    add(building(`predio_i_${B.length}`, -126, -126 + rng.range(14, 20), z, z + rng.range(13, 16), { name: 'Prédio Residencial', type: 'apartment', district: 'residencial', floors: rng.int(4, 9), height: 0, face: 'E', color: rng.pick(resPalette) }));
  }

  // --- Fachadas de fecho a norte e sul do anel ------------------------------
  for (let x = -46; x < 44; x += rng.range(16, 20)) {
    add(building(`fecho_n_${B.length}`, x, x + rng.range(13, 16), -109, -98.5, { name: 'Edifício', type: 'apartment', district: 'centro', floors: rng.int(6, 12), height: 0, face: 'S', color: rng.pick(DISTRICTS.centro.palette) }));
    add(building(`fecho_s_${B.length}`, x, x + rng.range(13, 16), 98.5, 109, { name: 'Edifício', type: 'apartment', district: 'parque', floors: rng.int(5, 10), height: 0, face: 'N', color: rng.pick(DISTRICTS.residencial.palette) }));
  }

  for (const b of B) {
    if (!b.height) b.height = b.floors * 3.2 + (b.roof === 'gable' ? 0.4 : 0.6);
    b.homeSlots = b.type === 'house' ? 3 : b.type === 'apartment' ? Math.min(12, b.floors * 2) : 0;
    if (b.type === 'house') b.interior = true;
  }
  return B;
}

export const BUILDINGS = Object.freeze(generateBuildings());

/** Paredes do interior acessível (casca oca com abertura de porta). */
export function interiorWalls(b, thickness = 0.3, doorWidth = 2.4) {
  const t = thickness;
  const dw = b.garageDoor ? 4.8 : doorWidth;
  const walls = [];
  const dx = b.doorX ?? b.cx;
  const dz = b.doorZ ?? b.cz;
  const sideN = { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.minZ + t };
  const sideS = { minX: b.minX, maxX: b.maxX, minZ: b.maxZ - t, maxZ: b.maxZ };
  const sideW = { minX: b.minX, maxX: b.minX + t, minZ: b.minZ, maxZ: b.maxZ };
  const sideE = { minX: b.maxX - t, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ };
  const split = (w, axis, c) => (axis === 'x'
    ? [{ ...w, maxX: c - dw / 2 }, { ...w, minX: c + dw / 2 }]
    : [{ ...w, maxZ: c - dw / 2 }, { ...w, minZ: c + dw / 2 }]);
  walls.push(...(b.face === 'N' ? split(sideN, 'x', dx) : [sideN]));
  walls.push(...(b.face === 'S' ? split(sideS, 'x', dx) : [sideS]));
  walls.push(...(b.face === 'W' ? split(sideW, 'z', dz) : [sideW]));
  walls.push(...(b.face === 'E' ? split(sideE, 'z', dz) : [sideE]));
  return walls;
}

/** Caixas de colisão estáticas (edifícios fechados, paredes de interiores, obstáculos). */
export function collisionBoxes() {
  const boxes = [];
  for (const b of BUILDINGS) {
    if (b.interior) {
      for (const w of interiorWalls(b)) boxes.push({ ...w, h: b.height, id: `${b.id}_wall` });
      if (b.id === 'mercado_kianda') {
        // balcão interior do mercado
        boxes.push({ minX: b.minX + 3, maxX: b.minX + 9, minZ: b.minZ + 2, maxZ: b.minZ + 3, h: 1.1, id: `${b.id}_balcao` });
      }
    } else {
      boxes.push({ minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, h: b.height, id: b.id });
    }
  }
  for (const p of PROPS.filter((p) => p.solid)) {
    boxes.push({ minX: p.x - p.r, maxX: p.x + p.r, minZ: p.z - p.r, maxZ: p.z + p.r, h: p.h ?? 1, id: p.id });
  }
  return boxes;
}

function generateProps() {
  const rng = makeRng('kianda-props-v1');
  const P = [];
  // Candeeiros ao longo dos passeios (a cada ~24 m), do lado da rua
  for (const s of sidewalkRects()) {
    const road = ROADS.find((r) => r.id === s.roadId);
    const horizontal = road.axis === 'x';
    const len = horizontal ? s.maxX - s.minX : s.maxZ - s.minZ;
    const n = Math.floor(len / 24);
    const nearRoad = horizontal
      ? (s.minZ >= road.at ? s.minZ + 0.6 : s.maxZ - 0.6)
      : (s.minX >= road.at ? s.minX + 0.6 : s.maxX - 0.6);
    for (let i = 0; i <= n; i++) {
      const t = n === 0 ? 0.5 : i / n;
      const a = (horizontal ? s.minX : s.minZ) + 3 + t * (len - 6);
      const x = horizontal ? a : nearRoad;
      const z = horizontal ? nearRoad : a;
      const facing = horizontal ? (s.minZ >= road.at ? 'N' : 'S') : (s.minX >= road.at ? 'W' : 'E');
      P.push({ id: `lamp_${P.length}`, kind: 'streetlight', x, z, facing, h: 7.5, r: 0.2, solid: true });
    }
  }
  // Árvores ao longo da Avenida (canteiros) — instanciadas no cliente
  for (const side of [-1, 1]) {
    for (let x = -126; x <= 126; x += 12) {
      if (INTERSECTIONS.some((i) => Math.abs(i.x - x) < 9)) continue;
      const z = side * (10 + 5 - 1.2);
      if (P.some((p) => p.kind === 'streetlight' && Math.hypot(p.x - x, p.z - z) < 3)) continue;
      if (Math.abs(x + 30) < 5 && side > 0) continue; // paragem de autocarro
      if (BUILDINGS.some((b) => { const d = doorPoint(b); return Math.hypot(d.x - x, d.z - z) < 4; })) continue;
      P.push({ id: `tree_av_${P.length}`, kind: 'tree', species: 'acacia', x: x + rng.range(-1, 1), z, h: rng.range(6, 9), r: 0.35, solid: true });
    }
  }
  // Jardim: árvores, bancos, quiosque, caminhos
  for (let i = 0; i < 34; i++) {
    const x = rng.range(-42, 8);
    const z = rng.range(20, 78);
    if (Math.abs(x + 17) < 4 || Math.abs(z - 49) < 4) continue; // caminhos em cruz
    if (Math.hypot(x + 17, z - 49) < 9) continue;
    P.push({ id: `tree_j_${P.length}`, kind: 'tree', species: rng.pick(['mangueira', 'acacia', 'palmeira']), x, z, h: rng.range(5, 10), r: 0.4, solid: true });
  }
  P.push({ id: 'quiosque', kind: 'kiosk', x: -17, z: 49, h: 3.2, r: 2.2, solid: true, name: 'Quiosque Mukumbu' });
  // Largo: fonte, bancos, palco
  P.push({ id: 'fonte', kind: 'fountain', x: 0, z: -50, h: 1.2, r: 3.2, solid: true });
  P.push({ id: 'palco', kind: 'stage', x: 0, z: -62.5, h: 1.0, r: 3.5, solid: false });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    P.push({ id: `tree_l_${i}`, kind: 'tree', species: 'palmeira', x: Math.cos(a) * 15, z: -50 + Math.sin(a) * 11, h: 8, r: 0.3, solid: true });
  }
  // Paragem de autocarro
  P.push({ id: 'paragem_av', kind: 'bus_stop', x: -30, z: 13.5, facing: 'N', h: 2.6, r: 0.4, solid: false });
  // Bombas do posto
  for (let i = 0; i < 3; i++) P.push({ id: `bomba_${i}`, kind: 'fuel_pump', x: 102 + i * 8, z: 30, h: 1.6, r: 0.5, solid: true });
  // Bancadas da arena
  P.push({ id: 'bancada_arena', kind: 'stands', x: 30, z: 51.5, h: 2.2, r: 0, solid: false, w: 28, d: 3 });
  return P;
}

export const PROPS = Object.freeze(generateProps());

/** Bancos (assentos) — POIs de "sentar". Cada banco tem 2 lugares. angle = rumo de quem se senta (0 = +Z/Sul). */
function generateBenches() {
  const seats = [];
  const bench = (id, x, z, faceAngle) => seats.push({ id, x, z, angle: faceAngle, seats: 2 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    bench(`banco_largo_${i}`, Math.cos(a) * 8.5, -50 + Math.sin(a) * 6.5, Math.atan2(-Math.cos(a), -Math.sin(a)));
  }
  for (let i = 0; i < 6; i++) bench(`banco_jardim_${i}`, -38 + i * 8, 46, 0);
  for (let i = 0; i < 4; i++) bench(`banco_jardim_n_${i}`, -13.6, 24 + i * 14, -Math.PI / 2);
  bench('banco_paragem', -30, 14.2, Math.PI);
  return seats;
}

export const BENCHES = Object.freeze(generateBenches());

// ---------------------------------------------------------------------------
// Pontos de interesse usados pelas rotinas dos NPCs e pelo diálogo
// ---------------------------------------------------------------------------

function generatePois() {
  const pois = [];
  const byId = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));
  const poi = (id, type, name, x, z, extra = {}) => pois.push({ id, type, name, x, z, capacity: 4, ...extra });

  const mk = byId.mercado_kianda;
  poi('mercado_balcao', 'shop_counter', 'Balcão do Mercado Kianda', mk.minX + 6, mk.minZ + 4.2, { buildingId: mk.id, indoor: true, capacity: 1, openHours: mk.openHours });
  poi('mercado_corredor', 'shop_floor', 'Corredores do Mercado Kianda', mk.cx + 4, mk.cz, { buildingId: mk.id, indoor: true, capacity: 6, openHours: mk.openHours });
  for (const b of BUILDINGS) {
    const d = doorPoint(b);
    if (['shop', 'cafe', 'restaurant', 'gym', 'hotel', 'workshop'].includes(b.type) && b.id !== 'mercado_kianda') {
      poi(`${b.id}_porta`, b.type === 'workshop' ? 'workshop' : b.type, b.name, d.x, d.z, { buildingId: b.id, capacity: b.type === 'cafe' || b.type === 'restaurant' ? 8 : 3, openHours: b.openHours });
    }
    if (b.homeSlots > 0) poi(`${b.id}_casa`, 'home', b.name, d.x, d.z, { buildingId: b.id, capacity: b.homeSlots, private: true });
  }
  poi('largo_centro', 'plaza', 'Largo da Kianda', 0, -42, { capacity: 30 });
  poi('palco_largo', 'event_stage', 'Palco do Largo', 0, -59, { capacity: 2 });
  poi('jardim_centro', 'park', 'Jardim do Parque', -17, 40, { capacity: 30 });
  poi('quiosque_balcao', 'kiosk', 'Quiosque Mukumbu', -17, 45.5, { capacity: 1, openHours: [7, 22] });
  poi('arena_centro', 'arena', 'Arena Kianda (competições)', 30, 34, { capacity: 20 });
  poi('arena_quadro', 'challenge_board', 'Quadro de Desafios da Arena', 18, 22, { capacity: 3 });
  poi('posto_loja', 'fuel_station', 'Posto Kwanza Energia', 110, 22, { capacity: 3, openHours: [0, 24] });
  poi('estacionamento', 'parking', 'Parque de Estacionamento Kalunga', 110, -34, { capacity: 10 });
  poi('paragem_av', 'bus_stop', 'Paragem da Avenida', -30, 14.6, { capacity: 6 });
  poi('posto_seguranca_largo', 'guard_post', 'Posto de Segurança do Largo', 18, -36, { capacity: 1 });
  poi('posto_seguranca_arena', 'guard_post', 'Posto de Segurança da Arena', 46, 18, { capacity: 1 });
  for (const s of BENCHES) poi(s.id, 'bench', 'Banco', s.x, s.z, { capacity: s.seats, angle: s.angle });
  return pois;
}

export const POIS = Object.freeze(generatePois());

/** Rondas de patrulha dos seguranças (sequências de pontos). */
export const PATROL_ROUTES = Object.freeze({
  largo: [[18, -36], [18, -64], [-18, -64], [-18, -36], [0, -20]],
  arena: [[46, 18], [46, 54], [14, 54], [14, 18]],
  avenida: [[-47, -13], [47, -13], [47, 13], [-47, 13]],
});

// ---------------------------------------------------------------------------
// Trânsito: faixas e circuitos (trânsito pela direita)
// ---------------------------------------------------------------------------

const RING = { w: -53, e: 53, n: -88, s: 88 }; // eixos das faixas do anel (lado direito)

export const TRAFFIC_LOOPS = Object.freeze({
  // Anel no sentido horário (visto de cima): Acácias → Oficina → Parque → Mercado
  anel_horario: [[-50, -88], [50, -88], [53, -85], [53, 85], [50, 88], [-50, 88], [-53, 85], [-53, -85]],
  // Anel no sentido anti-horário (faixa oposta)
  anel_anti: [[50, -92], [-50, -92], [-57, -85], [-57, 85], [-50, 92], [50, 92], [57, 85], [57, -85]],
  // Metade sul: Avenida (Este) → Oficina (Sul) → Parque (Oeste) → Mercado (Norte)
  sul_horario: [[-50, 5.25], [50, 5.25], [RING.e, 9], [RING.e, 85], [50, RING.s], [-50, RING.s], [RING.w, 85], [RING.w, 9]],
  // Metade norte: Avenida (Oeste) → Mercado (Norte) → Acácias (Este) → Oficina (Sul)
  norte_horario: [[50, -5.25], [-50, -5.25], [RING.w, -9], [RING.w, -85], [-50, RING.n], [50, RING.n], [RING.e, -85], [RING.e, -9]],
  // Atravessamento da Avenida (sai numa ponta e reentra na outra, fora do campo de visão)
  avenida_este: [[-138, 1.75], [138, 1.75]],
  avenida_oeste: [[138, -1.75], [-138, -1.75]],
});
export const THROUGH_LOOPS = Object.freeze(['avenida_este', 'avenida_oeste']);

/** Estacionamento: posições de carros e motas parados (todos utilizáveis pelo jogador). */
export const PARKED_VEHICLES = Object.freeze([
  // Junto ao Largo e entrada principal (imediatamente visíveis ao entrar no mundo)
  { id: 'spawn_car_1', kind: 'car', x: -7.5, z: -21, heading: 0, usable: true },
  { id: 'spawn_moto_1', kind: 'moto', x: 7.5, z: -21, heading: 0, usable: true },
  { id: 'spawn_car_2', kind: 'car', x: -14, z: -8.5, heading: -Math.PI / 2, usable: true },
  { id: 'spawn_moto_2', kind: 'moto', x: -4, z: -8.5, heading: -Math.PI / 2, usable: true },
  { id: 'spawn_car_3', kind: 'car', x: 6, z: -8.5, heading: -Math.PI / 2, usable: true },
  { id: 'spawn_moto_3', kind: 'moto', x: 16, z: -8.5, heading: -Math.PI / 2, usable: true },
  // Junto à Arena e Casa de Apostas
  { id: 'arena_car_1', kind: 'car', x: 14, z: 8.5, heading: Math.PI / 2, usable: true },
  { id: 'arena_moto_1', kind: 'moto', x: 22, z: 8.5, heading: Math.PI / 2, usable: true },
  ...[-120, -108, -96, -84, -40, -28, 70, 84, 96, 120].map((x, i) => ({ id: `park_av_n_${i}`, kind: i % 3 === 1 ? 'moto' : 'car', x, z: -8.5, heading: Math.PI / 2 * -1, usable: true })),
  ...[-118, -100, -20, 26, 40, 78, 108].map((x, i) => ({ id: `park_av_s_${i}`, kind: i % 3 === 2 ? 'moto' : 'car', x, z: 8.5, heading: Math.PI / 2, usable: true })),
  ...[0, 1, 2, 3, 4, 5].map((i) => ({ id: `park_lot_${i}`, kind: i >= 4 ? 'moto' : 'car', x: 100 + (i % 3) * 9, z: i < 3 ? -46 : -24, heading: i < 3 ? 0 : Math.PI, usable: true })),
  { id: 'oficina_moto', kind: 'moto', x: 78, z: -15, heading: Math.PI / 2, usable: true },
]);

// ---------------------------------------------------------------------------
// Circuito de corrida (anel), pontos de controlo e grelha de partida
// ---------------------------------------------------------------------------

export const RACE_TRACK = Object.freeze({
  id: 'circuito_anel_kianda',
  name: 'Circuito do Anel da Kianda',
  laps: 1,
  checkpointRadius: 11,
  // sentido horário, partida/chegada na Rua das Acácias
  checkpoints: [
    [30, -90], [55, -62], [55, -20], [55, 30], [55, 72], [25, 90], [-25, 90], [-55, 62], [-55, 20], [-55, -30], [-55, -72], [-5, -90],
  ],
  start: { heading: Math.PI / 2 }, // rumo a Este
  grid: [[-22, -88.2], [-22, -91.8], [-30, -88.2], [-30, -91.8]],
  // linha de corrida pelas faixas (usada pelos bots de treino e pelo minimapa)
  racingLine: [[-22, -90], [49, -90], [55, -84], [55, 84], [49, 90], [-49, 90], [-55, 84], [-55, -84], [-49, -90], [-5, -90]],
  closedRoads: ['rua_mercado', 'rua_oficina', 'rua_acacias', 'rua_parque'],
});

export function trackLength() {
  const cps = RACE_TRACK.checkpoints;
  let len = Math.hypot(cps[0][0] - RACE_TRACK.grid[0][0], cps[0][1] - RACE_TRACK.grid[0][1]);
  for (let i = 1; i < cps.length; i++) len += Math.hypot(cps[i][0] - cps[i - 1][0], cps[i][1] - cps[i - 1][1]);
  return len;
}

export const PLAYER_SPAWNS = Object.freeze([[0, -28], [4, -30], [-4, -30], [0, -32], [6, -26], [-6, -26]]);
