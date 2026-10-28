import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNavGraph } from '../../shared/nav.js';
import { POIS, BUILDINGS, ROADS, roadRect, rectsOverlap, collisionBoxes, trafficLightState, TRAFFIC_LIGHTS, RACE_TRACK, trackLength, pointInRect } from '../../shared/zone.js';

const g = buildNavGraph();

test('todos os POIs estão ligados à rede pedonal', () => {
  assert.deepEqual(g.unlinked, []);
  const comp = g.componentOf(g.poiNodes.get('largo_centro'));
  for (const p of POIS) assert.ok(comp.has(g.poiNodes.get(p.id)), `POI inacessível: ${p.id}`);
});

test('edifícios não ocupam estradas nem passeios', () => {
  for (const b of BUILDINGS) {
    for (const r of ROADS) assert.ok(!rectsOverlap(b, roadRect(r), 4), `${b.id} sobre ${r.id}`);
  }
});

test('escala coerente: faixas ≥ 3.5 m, passeios ≥ 4 m, pisos ~3.2 m', () => {
  for (const r of ROADS) {
    assert.ok(r.width / r.lanes >= 3.5, r.id);
    assert.ok(r.sidewalk >= 4, r.id);
  }
  for (const b of BUILDINGS) assert.ok(b.height / b.floors >= 2.8 && b.height / b.floors <= (b.floors === 1 ? 10 : 5.5), `${b.id} ${b.height}/${b.floors}`);
});

test('passadeiras existem e as dos semáforos sabem que eixo atravessam', () => {
  const edges = [...g.adj.values()].flat().filter((e) => e.crosswalk);
  assert.ok(edges.length >= 16);
  const lit = edges.filter((e) => e.lightId);
  assert.ok(lit.length >= 8);
  for (const e of lit) assert.ok(['NS', 'EW'].includes(e.crossesAxis));
});

test('caminho do balcão do mercado até à oficina não atravessa edifícios', () => {
  const path = g.findPath(g.poiNodes.get('mercado_balcao'), g.poiNodes.get('oficina_kalunga_porta'));
  assert.ok(path && path.length > 5);
  const boxes = collisionBoxes();
  for (let i = 1; i < path.length; i++) {
    const a = g.nodes[path[i - 1]];
    const b = g.nodes[path[i]];
    for (let t = 0; t <= 1; t += 0.1) {
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      assert.ok(!boxes.some((bx) => pointInRect(x, z, bx, 0.2)), `atravessa obstáculo em ${x.toFixed(1)},${z.toFixed(1)}`);
    }
  }
});

test('semáforos: EW e NS nunca verdes ao mesmo tempo', () => {
  for (const l of TRAFFIC_LIGHTS) {
    for (let s = 0; s < 120; s += 0.5) {
      const st = trafficLightState(s * 1000, l.id);
      assert.ok(!(st.ew !== 'red' && st.ns !== 'red'), `${l.id} t=${s}`);
    }
  }
});

test('circuito de corrida tem pontos de controlo na estrada', () => {
  assert.ok(trackLength() > 450);
  for (const [x, z] of RACE_TRACK.checkpoints) {
    assert.ok(ROADS.some((r) => pointInRect(x, z, roadRect(r), 0.5)), `checkpoint fora da estrada ${x},${z}`);
  }
});
