import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNavGraph } from '../../shared/nav.js';
import { zonedToUtc } from '../../shared/time.js';
import { generatePopulation, planArchetypes } from '../src/npc/population.js';
import { NpcSimulation, routineSlot } from '../src/npc/simulation.js';
import { WorldClock } from '../src/clock.js';
import { WeatherSystem } from '../src/weather.js';
import { TrafficSystem } from '../src/traffic.js';
import { ARCHETYPE_MINIMUMS } from '../src/npc/archetypes.js';

const graph = buildNavGraph();

test('população determinística, diversa e identificada como IA', () => {
  const a = generatePopulation({ count: 80, seed: 'teste' });
  const b = generatePopulation({ count: 80, seed: 'teste' });
  assert.deepEqual(a, b);
  const looks = new Set(a.map((n) => JSON.stringify([n.appearance.gender, n.appearance.skinTone, n.appearance.hairStyle, n.appearance.top, n.appearance.topColor, n.appearance.bottomColor])));
  assert.ok(looks.size >= 76, `aparências distintas: ${looks.size}/80`);
  for (const n of a) {
    assert.equal(n.isAI, true);
    assert.equal(n.limits.canTouchEconomy, false);
    assert.equal(n.limits.canAffectCompetitionResults, false);
    assert.ok(n.id && n.name && n.routine.length && n.homePoiId);
  }
  assert.ok(new Set(a.map((n) => n.appearance.gender)).size === 2);
  assert.ok(new Set(a.map((n) => n.appearance.ageGroup)).size >= 3);
  for (const [arch, min] of Object.entries(ARCHETYPE_MINIMUMS)) assert.ok(a.filter((n) => n.archetype === arch).length >= min, arch);
});

test('aumentar a população mantém os NPCs existentes', () => {
  const small = generatePopulation({ count: 30, seed: 'k' });
  const big = generatePopulation({ count: 60, seed: 'k' });
  const plan30 = planArchetypes(30, undefined, undefined, 'k');
  const plan60 = planArchetypes(60, undefined, undefined, 'k');
  assert.deepEqual(plan60.slice(0, 30), plan30);
  for (let i = 0; i < 30; i++) {
    assert.equal(big[i].id, small[i].id);
    assert.equal(big[i].name, small[i].name);
  }
});

function makeSim({ hour, count = 60, players = [] }) {
  let now = zonedToUtc({ year: 2026, month: 10, day: 28, hour: Math.floor(hour), minute: Math.round((hour % 1) * 60) });
  const clock = new WorldClock({ now: () => now, allowDiagnostics: true });
  const weather = new WeatherSystem({ enabled: false }, () => now);
  const traffic = new TrafficSystem();
  const sim = new NpcSimulation({ graph, population: generatePopulation({ count }), clock, weather, traffic, config: { farEvery: 1, midEvery: 1 } });
  const run = (seconds) => {
    for (let i = 0; i < seconds * 10; i++) { now += 100; sim.tick(now, players); }
  };
  return { sim, run, clock, weather, advance: (ms) => { now += ms; }, now: () => now };
}

test('de madrugada a maioria dorme; guardas e trabalhadores nocturnos estão activos', () => {
  const { sim, run } = makeSim({ hour: 3 });
  run(5);
  const npcs = [...sim.npcs.values()];
  const visible = npcs.filter((n) => n.visible);
  assert.ok(visible.length < npcs.length * 0.35, `visíveis às 3h: ${visible.length}`);
  for (const n of visible) assert.ok(['seguranca', 'trabalhador_nocturno', 'condutor', 'empregado_cafe'].includes(n.def.archetype), `${n.def.archetype} acordado às 3h`);
  assert.ok(npcs.filter((n) => n.def.archetype === 'trabalhador_nocturno' && n.mode === 'work').length >= 1);
});

test('de manhã os comerciantes vão trabalhar e a cidade enche', () => {
  const { sim, run } = makeSim({ hour: 10.5 });
  run(120);
  const npcs = [...sim.npcs.values()];
  const visible = npcs.filter((n) => n.visible || n.mode === 'drive');
  assert.ok(visible.length > npcs.length * 0.6, `activos às 10h30: ${visible.length}`);
  const merchants = npcs.filter((n) => n.def.archetype === 'comerciante');
  assert.ok(merchants.every((m) => m.mode === 'work'));
  const atWork = merchants.filter((m) => !m.path && m.anim === 'work');
  assert.ok(atWork.length >= 1, 'pelo menos um comerciante no posto');
  assert.ok(npcs.some((n) => n.anim === 'walk' || n.anim === 'run'), 'há peões a caminhar');
  assert.equal(sim.metrics.pathFailures, 0);
});

test('rotina muda com a hora: o mesmo NPC tem actividades diferentes', () => {
  const npc = generatePopulation({ count: 60 }).find((n) => n.archetype === 'habitante');
  const modes = [3, 10, 20, 23.5].map((h) => routineSlot({ ...npc, scheduleJitterH: 0 }, h).mode);
  assert.equal(modes[0], 'sleep');
  assert.equal(modes[1], 'roam');
  assert.equal(modes[3], 'sleep');
});

test('níveis de simulação: NPCs perto do jogador são "near", os restantes não', () => {
  const player = { id: 'p1', x: 0, z: -42 };
  const { sim, run } = makeSim({ hour: 11, players: [player] });
  run(150);
  const t = sim.metrics.tiers;
  assert.ok(t.near > 0, 'há NPCs perto');
  assert.ok(t.mid + t.far > 0, 'há NPCs longe');
  for (const n of sim.npcs.values()) {
    if (n.tier === 'near' && !n.attention && !n.chatPartner) assert.ok(Math.hypot(n.x - player.x, n.z - player.z) < 46);
  }
});

test('NPC reage à aproximação do jogador (vira-se e pára)', () => {
  const { sim, run } = makeSim({ hour: 11 });
  run(30);
  const npc = [...sim.npcs.values()].find((n) => n.visible && n.mode === 'roam');
  const player = { id: 'p_reacao', x: npc.x + 1.5, z: npc.z };
  sim.config.nearRadius = 45;
  for (let i = 0; i < 3; i++) sim.tick(Date.now(), [player]);
  // tick directo com o relógio real só para a reacção
  sim.handlePlayerAttention(npc, [player], Date.now());
  assert.equal(npc.attention, 'p_reacao');
  assert.ok(Math.abs(npc.heading - Math.atan2(player.x - npc.x, player.z - npc.z)) < 1e-6);
});

test('chuva leva NPCs ao ar livre a procurar abrigo', () => {
  const { sim, run, weather } = makeSim({ hour: 15 });
  run(60);
  weather.config.enabled = true;
  weather.state.rain = 0.9;
  run(5);
  const roaming = [...sim.npcs.values()].filter((n) => n.mode === 'roam' && n.targetPoiId);
  const outdoor = roaming.filter((n) => ['plaza', 'park', 'bench', 'arena'].includes(n.targetPoiId?.split('_')[0]) || n.targetPoiId?.startsWith('banco'));
  assert.ok(roaming.length > 0);
  assert.ok(outdoor.length <= roaming.length * 0.2, `ainda ao ar livre: ${outdoor.length}/${roaming.length}`);
});

test('administração: NPC em manutenção deixa de ser visível', () => {
  const { sim, run } = makeSim({ hour: 11 });
  run(5);
  const npc = [...sim.npcs.values()].find((n) => n.visible);
  assert.ok(sim.setNpcStatus(npc.id, 'maintenance'));
  run(1);
  assert.equal(npc.visible, false);
  assert.ok(!sim.snapshotFor(npc.x, npc.z, 500).some((s) => s.id === npc.id));
  assert.equal(sim.publicProfile(npc.id).isAI, true);
});
