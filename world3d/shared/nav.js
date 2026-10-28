/**
 * Grafo de navegação pedonal da zona (equivalente leve a um NavMesh).
 *
 * - Passeios: linhas ao longo de cada estrada, com nós nas esquinas e subdivisões.
 * - Passadeiras: arestas que atravessam faixas de rodagem nos cruzamentos
 *   (com referência ao semáforo quando existe).
 * - Terreno aberto (largo, jardim, arena, logradouros): grelha com custo ligeiramente
 *   superior, para os NPCs preferirem passeios e caminhos.
 * - POIs (portas, bancos, balcões) ligados ao nó visível mais próximo.
 *
 * No UE5 este grafo é substituído pelo NavMesh + Smart Links nas passadeiras;
 * o JSON exportado serve para validar a colocação dos POIs.
 */
import {
  ROADS, INTERSECTIONS, POIS, BUILDINGS, RESERVED_WALK_AREAS,
  roadRect, collisionBoxes, doorPoint, pointInRect,
} from './zone.js';

const SIDEWALK_STEP = 7;
const GRID_STEP = 5;

export const BLOCKS = Object.freeze([
  { id: 'oeste_norte', minX: -128, maxX: -63, minZ: -108, maxZ: -15 },
  { id: 'oeste_sul', minX: -128, maxX: -63, minZ: 15, maxZ: 108 },
  { id: 'centro_norte', minX: -47, maxX: 47, minZ: -82, maxZ: -15 },
  { id: 'centro_sul', minX: -47, maxX: 47, minZ: 15, maxZ: 82 },
  { id: 'este_norte', minX: 63, maxX: 128, minZ: -108, maxZ: -15 },
  { id: 'este_sul', minX: 63, maxX: 128, minZ: 15, maxZ: 108 },
  { id: 'faixa_norte', minX: -47, maxX: 47, minZ: -108, maxZ: -98 },
  { id: 'faixa_sul', minX: -47, maxX: 47, minZ: 98, maxZ: 108 },
]);

export function buildNavGraph() {
  const nodes = [];
  const adj = new Map();
  const roadRects = ROADS.map((r) => ({ id: r.id, axis: r.axis, ...roadRect(r) }));
  const boxes = collisionBoxes();

  const addNode = (x, z, kind, extra = {}) => {
    const n = { id: nodes.length, x, z, kind, ...extra };
    nodes.push(n);
    adj.set(n.id, []);
    return n;
  };
  const addEdge = (a, b, extra = {}) => {
    if (a.id === b.id) return;
    if (adj.get(a.id).some((e) => e.to === b.id)) return;
    const mult = extra.mult ?? 1;
    const cost = Math.hypot(a.x - b.x, a.z - b.z) * mult + (extra.crosswalk ? 4 : 0);
    adj.get(a.id).push({ to: b.id, cost, ...extra });
    adj.get(b.id).push({ to: a.id, cost, ...extra });
  };

  const inCarriageway = (x, z, pad = 0) => roadRects.find((r) => pointInRect(x, z, r, pad));
  const blocked = (x, z, ignoreId) => boxes.some((b) => b.id !== ignoreId && pointInRect(x, z, b, 0.35));
  const clearLine = (a, b, { allowRoad = false, ignoreId = null } = {}) => {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.ceil(len / 0.5));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      if (blocked(x, z, ignoreId)) return false;
      if (!allowRoad && inCarriageway(x, z)) return false;
    }
    return true;
  };

  // 1. Linhas de passeio
  const lines = [];
  for (const r of ROADS) {
    for (const side of [-1, 1]) {
      lines.push({ roadId: r.id, axis: r.axis, c: r.at + side * (r.width / 2 + r.sidewalk / 2), from: r.from, to: r.to });
    }
  }
  // 2. Nós de esquina
  const corner = [];
  for (const i of INTERSECTIONS) {
    const h = ROADS.find((r) => r.id === i.roadEW);
    const v = ROADS.find((r) => r.id === i.roadNS);
    const ov = v.width / 2 + v.sidewalk / 2;
    const oh = h.width / 2 + h.sidewalk / 2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) corner.push({ x: i.x + sx * ov, z: i.z + sz * oh, intersectionId: i.id });
  }
  const sidewalkNodes = [];
  const findOrAdd = (x, z, extra) => {
    const f = sidewalkNodes.find((n) => Math.abs(n.x - x) < 0.05 && Math.abs(n.z - z) < 0.05);
    if (f) return f;
    const n = addNode(x, z, 'sidewalk', extra);
    sidewalkNodes.push(n);
    return n;
  };
  for (const c of corner) {
    if (!inCarriageway(c.x, c.z)) findOrAdd(c.x, c.z, { intersectionId: c.intersectionId });
  }
  for (const l of lines) {
    for (const end of [l.from + 0.5, l.to - 0.5]) {
      const x = l.axis === 'x' ? end : l.c;
      const z = l.axis === 'x' ? l.c : end;
      if (!inCarriageway(x, z) && !blocked(x, z)) findOrAdd(x, z, {});
    }
  }
  // 3. Arestas ao longo das linhas (com passadeiras e subdivisão)
  for (const l of lines) {
    const along = (n) => (l.axis === 'x' ? n.x : n.z);
    const across = (n) => (l.axis === 'x' ? n.z : n.x);
    const onLine = sidewalkNodes
      .filter((n) => Math.abs(across(n) - l.c) < 0.05 && along(n) >= l.from - 0.6 && along(n) <= l.to + 0.6)
      .sort((a, b) => along(a) - along(b));
    for (let k = 0; k + 1 < onLine.length; k++) {
      const a = onLine[k];
      const b = onLine[k + 1];
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      const crossed = roadRects.find((r) => r.id !== l.roadId && pointInRect(mx, mz, r));
      if (crossed) {
        const inter = INTERSECTIONS.find((i) => i.hasLight && Math.hypot(i.x - mx, i.z - mz) < 25);
        addEdge(a, b, {
          crosswalk: true,
          roadId: crossed.id,
          lightId: inter ? `tl_${inter.roadNS}` : null,
          // atravessar uma estrada N-S só é seguro quando o trânsito N-S está parado
          crossesAxis: crossed.axis === 'z' ? 'NS' : 'EW',
        });
        continue;
      }
      const len = Math.abs(along(b) - along(a));
      const pieces = Math.max(1, Math.round(len / SIDEWALK_STEP));
      let prev = a;
      for (let p = 1; p < pieces; p++) {
        const t = p / pieces;
        const n = findOrAdd(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, {});
        addEdge(prev, n);
        prev = n;
      }
      addEdge(prev, b);
    }
  }

  // 4. Grelha de terreno aberto
  const gridNodes = [];
  for (const blk of BLOCKS) {
    for (let x = blk.minX + 2; x <= blk.maxX - 1.5; x += GRID_STEP) {
      for (let z = blk.minZ + 2; z <= blk.maxZ - 1.5; z += GRID_STEP) {
        if (blocked(x, z) || inCarriageway(x, z, 0.5) || BUILDINGS.some((b) => pointInRect(x, z, b, 0.4))) continue;
        const pathArea = RESERVED_WALK_AREAS.some((r) => pointInRect(x, z, r));
        gridNodes.push(addNode(x, z, pathArea ? 'path' : 'ground', { block: blk.id }));
      }
    }
  }
  const gridKey = (x, z) => `${Math.round(x * 10)}:${Math.round(z * 10)}`;
  const gridIndex = new Map(gridNodes.map((n) => [gridKey(n.x, n.z), n]));
  for (const n of gridNodes) {
    for (const [dx, dz] of [[GRID_STEP, 0], [0, GRID_STEP], [GRID_STEP, GRID_STEP], [GRID_STEP, -GRID_STEP]]) {
      const m = gridIndex.get(gridKey(n.x + dx, n.z + dz));
      if (m && clearLine(n, m)) addEdge(n, m, { mult: n.kind === 'path' && m.kind === 'path' ? 1.0 : 1.3 });
    }
  }
  for (const n of gridNodes) {
    for (const s of sidewalkNodes) {
      if (Math.abs(s.x - n.x) > 7 || Math.abs(s.z - n.z) > 7) continue;
      if (Math.hypot(s.x - n.x, s.z - n.z) <= 7 && clearLine(n, s)) addEdge(n, s, { mult: 1.15 });
    }
  }

  // 5. POIs (portas, interiores, bancos, balcões)
  const walkable = nodes.slice();
  const attach = (poiNode, ignoreId = null) => {
    const cands = walkable
      .map((n) => ({ n, d: Math.hypot(n.x - poiNode.x, n.z - poiNode.z) }))
      .filter((c) => c.d < 25)
      .sort((a, b) => a.d - b.d);
    let linked = 0;
    for (const { n } of cands) {
      if (clearLine(poiNode, n, { ignoreId })) { addEdge(poiNode, n); if (++linked >= 2) break; }
    }
    return linked > 0;
  };
  const poiNodes = new Map();
  const doorNodes = new Map();
  const unlinked = [];
  for (const b of BUILDINGS.filter((bb) => bb.interior && POIS.some((p) => p.indoor && p.buildingId === bb.id))) {
    const out = doorPoint(b, 1.6);
    const inn = doorPoint(b, -1.6);
    const o = addNode(out.x, out.z, 'door', { buildingId: b.id });
    const i = addNode(inn.x, inn.z, 'indoor', { buildingId: b.id });
    attach(o);
    addEdge(o, i);
    doorNodes.set(b.id, i);
  }
  for (const p of POIS) {
    const n = addNode(p.x, p.z, 'poi', { poiId: p.id, indoor: !!p.indoor, buildingId: p.buildingId });
    poiNodes.set(p.id, n.id);
    if (p.indoor) {
      const inside = doorNodes.get(p.buildingId);
      if (inside) addEdge(n, inside);
      else unlinked.push(p.id);
    } else if (!attach(n)) {
      unlinked.push(p.id);
    }
  }

  return finalizeGraph({ nodes, adj, poiNodes, unlinked });
}

function finalizeGraph(g) {
  const { nodes, adj } = g;
  // índice espacial simples (células de 10 m) para nearestNode
  const cell = 10;
  const buckets = new Map();
  for (const n of nodes) {
    const k = `${Math.floor(n.x / cell)}:${Math.floor(n.z / cell)}`;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(n);
  }
  g.nearestNode = (x, z, filter = null) => {
    const cx = Math.floor(x / cell);
    const cz = Math.floor(z / cell);
    for (let r = 0; r < 30; r++) {
      let best = null;
      let bestD = Infinity;
      for (let i = cx - r; i <= cx + r; i++) {
        for (let j = cz - r; j <= cz + r; j++) {
          if (Math.max(Math.abs(i - cx), Math.abs(j - cz)) !== r) continue;
          for (const n of buckets.get(`${i}:${j}`) || []) {
            if (n.kind === 'poi' || (filter && !filter(n))) continue;
            const d = Math.hypot(n.x - x, n.z - z);
            if (d < bestD) { bestD = d; best = n; }
          }
        }
      }
      if (best) return best;
    }
    return null;
  };
  g.edge = (a, b) => adj.get(a)?.find((e) => e.to === b) || null;
  g.findPath = (fromId, toId) => aStar(g, fromId, toId);
  g.componentOf = (startId) => {
    const seen = new Set([startId]);
    const stack = [startId];
    while (stack.length) {
      for (const e of adj.get(stack.pop())) if (!seen.has(e.to)) { seen.add(e.to); stack.push(e.to); }
    }
    return seen;
  };
  return g;
}

/** A* com heurística euclidiana e fila de prioridade binária. */
export function aStar(g, fromId, toId) {
  if (fromId === toId) return [fromId];
  const { nodes, adj } = g;
  const goal = nodes[toId];
  const h = (id) => Math.hypot(nodes[id].x - goal.x, nodes[id].z - goal.z);
  const gScore = new Map([[fromId, 0]]);
  const came = new Map();
  const heap = [[h(fromId), fromId]];
  const push = (item) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  const closed = new Set();
  while (heap.length) {
    const [, cur] = pop();
    if (cur === toId) {
      const path = [cur];
      let c = cur;
      while (came.has(c)) { c = came.get(c); path.push(c); }
      return path.reverse();
    }
    if (closed.has(cur)) continue;
    closed.add(cur);
    for (const e of adj.get(cur)) {
      const ng = gScore.get(cur) + e.cost;
      if (ng < (gScore.get(e.to) ?? Infinity)) {
        gScore.set(e.to, ng);
        came.set(e.to, cur);
        push([ng + h(e.to), e.to]);
      }
    }
  }
  return null;
}
