import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { DemoLedger } from '../src/economy/ledger.js';
import { ShopService } from '../src/shop.js';
import { RaceManager } from '../src/competition/race.js';
import { DEFAULT_TRAINING_BOTS } from '../src/competition/trainingBot.js';
import { ArenaModesManager, calculatePrizeSplit, verifyArenaMatch } from '../src/competition/arenaModes.js';
import { defaultAdminConfig } from '../src/config.js';
import { ZONE_BOUNDS, BUILDINGS, POIS, RACE_TRACKS, ROADS, roadRect, pointInRect } from '../../shared/zone.js';
import { buildNavGraph } from '../../shared/nav.js';

const AT = {
  super: { x: -100, z: -147 },
  rental: { x: 158, z: -30 },
  realestate: { x: -4, z: -147 },
};

function setup(feePct = 20) {
  let now = 1_900_000_000_000;
  const store = new Store(':memory:');
  const ledger = new DemoLedger(store, { feePct });
  const shop = new ShopService({ store, ledger });
  const sent = [];
  const arena = new ArenaModesManager({ store, ledger, now: () => now, send: (pid, msg) => sent.push({ pid, msg }), config: { feePct } });
  for (const id of ['u:a', 'u:b']) { store.upsertProfile({ playerId: id, displayName: id, isGuest: false }); ledger.ensurePlayer(id); }
  return { store, ledger, shop, arena, sent, step: (ms) => { now += ms; arena.tick(); }, now: () => now };
}

test('mapa expandido: área ≥ 3× maior, novos edifícios e POIs ligados', () => {
  const area = (ZONE_BOUNDS.maxX - ZONE_BOUNDS.minX) * (ZONE_BOUNDS.maxZ - ZONE_BOUNDS.minZ);
  assert.ok(area >= 260 * 220 * 3, `área ${area}`);
  for (const id of ['supermercado_kwanza', 'concessionario_kalunga', 'aluguer_kianda', 'imobiliaria_kianda', 'vivenda_miramar', 'centro_combate', 'arena_tiro', 'centro_corridas']) {
    const b = BUILDINGS.find((x) => x.id === id);
    assert.ok(b, `edifício em falta: ${id}`);
    assert.ok(b.interior, `${id} deve ter interior acessível`);
  }
  const g = buildNavGraph();
  const comp = g.componentOf(g.poiNodes.get('largo_centro'));
  for (const id of ['supermercado_kwanza_porta_poi', 'aluguer_kianda_poi', 'imobiliaria_kianda_poi', 'centro_combate_poi', 'arena_tiro_poi', 'centro_corridas_poi']) {
    assert.ok(POIS.some((p) => p.id === id), id);
    assert.ok(comp.has(g.poiNodes.get(id)), `POI inacessível: ${id}`);
  }
});

test('circuito grande: pontos de controlo sobre estradas', () => {
  const t = RACE_TRACKS.circuito_grande_luanda;
  for (const [x, z] of t.checkpoints) assert.ok(ROADS.some((r) => pointInRect(x, z, roadRect(r), 0.5)), `${x},${z}`);
});

test('modelo 80/20: 1.000 + 1.000 = 2.000 → 1.600 vencedor e 400 casa', () => {
  assert.equal(defaultAdminConfig().competitions.feePct, 20);
  const s = calculatePrizeSplit(1000, 2, 20);
  assert.deepEqual([s.potKz, s.prizeKz, s.feeKz, s.winnerPct, s.housePct], [2000, 1600, 400, 80, 20]);
});

test('supermercado: só junto à loja, inventário persistente e pedido duplicado não cobra duas vezes', () => {
  const { shop, ledger, store } = setup();
  assert.throws(() => shop.buy({ id: 'u:a', x: 0, z: 0 }, 'agua_kianda'), /Supermercado/);
  const p = { id: 'u:a', ...AT.super };
  shop.buy(p, 'sumo_muka', { reqId: 'r1' });
  shop.buy(p, 'sumo_muka', { reqId: 'r1' }); // repetido
  shop.buy(p, 'sumo_muka', { reqId: 'r2' });
  assert.equal(store.consumablesOf('u:a').sumo_muka, 2);
  assert.equal(ledger.wallet('u:a').balanceKz, 10000 - 700);
  assert.ok(ledger.verify().ok);
});

test('aluguer de veículos: contrato activo, devolução e saldo debitado', () => {
  const { shop, ledger, store } = setup();
  assert.throws(() => shop.rentVehicle({ id: 'u:a', x: 0, z: 0 }, 'rent_suv_namibe'), /Rent-a-Car/);
  const r = shop.rentVehicle({ id: 'u:a', ...AT.rental }, 'rent_suv_namibe', 1000);
  assert.equal(ledger.wallet('u:a').balanceKz, 9200);
  assert.equal(store.activeRentalsOf('u:a', 2000).length, 1);
  shop.returnVehicle({ id: 'u:a' }, r.contractId, 2000);
  assert.equal(store.activeRentalsOf('u:a', 2000).length, 0);
  assert.throws(() => shop.returnVehicle({ id: 'u:a' }, r.contractId, 2000), /não encontrado/);
});

test('imobiliária: comprar uma vez, arrendar com validade', () => {
  const { shop, ledger, store } = setup();
  const p = { id: 'u:a', ...AT.realestate };
  shop.acquireProperty(p, 'prop_apartamento_largo', 'buy', 1000);
  assert.equal(ledger.wallet('u:a').balanceKz, 5500);
  assert.throws(() => shop.acquireProperty(p, 'prop_apartamento_largo', 'buy', 2000), /proprietário/);
  shop.acquireProperty(p, 'prop_moradia_mangueiras', 'rent', 3000);
  const props = store.propertiesOf('u:a', 4000);
  assert.equal(props.length, 2);
  assert.ok(props.find((x) => x.propertyId === 'prop_moradia_mangueiras').expiresAt > 4000);
  assert.equal(store.propertiesOf('u:a', 3000 + 8 * 86400000).length, 1, 'arrendamento expira');
});

test('arena 1v1 entre humanos: escrow, vitória por KO e liquidação 1.600/400 com hash', () => {
  const env = setup();
  const lobby = env.arena.createLobby({ id: 'u:a', displayName: 'A' }, { mode: 'combate_1v1', stakeKz: 1000 });
  env.arena.joinLobby({ id: 'u:b', displayName: 'B' }, lobby.id);
  assert.equal(env.ledger.wallet('u:a').balanceKz, 9000);
  assert.equal(env.ledger.wallet('u:b').balanceKz, 9000);
  env.step(3100);
  for (let i = 0; i < 20 && env.arena.matches.size; i++) { env.step(400); env.arena.onAction('u:a', { action: 'heavy' }); }
  const res = env.sent.find((s) => s.msg.t === 'arena_result').msg;
  assert.equal(res.record.winnerId, 'u:a');
  assert.deepEqual([res.record.settlement.prizeKz, res.record.settlement.feeKz], [1600, 400]);
  assert.equal(env.ledger.wallet('u:a').balanceKz, 10600);
  assert.equal(env.ledger.wallet('u:b').balanceKz, 9000);
  const stored = env.store.recentArenaMatches(1)[0];
  assert.ok(verifyArenaMatch(stored).ok);
  stored.record.winnerId = 'u:b';
  assert.equal(verifyArenaMatch(stored).ok, false);
  assert.ok(env.ledger.verify().ok);
});

test('arena: desconexão dá vitória ao adversário; bots não entram com saldo; cooldown anti-spam', () => {
  const env = setup();
  assert.throws(() => env.arena.startInstantMatch({ id: 'u:a' }, { mode: 'tiro_1v1', stakeKz: 500 }), /gratuitas/);
  const lobby = env.arena.createLobby({ id: 'u:a', displayName: 'A' }, { mode: 'tiro_1v1', centerId: 'arena_tiro', stakeKz: 500 });
  env.arena.joinLobby({ id: 'u:b', displayName: 'B' }, lobby.id);
  env.step(3100);
  const m = [...env.arena.matches.values()][0];
  env.arena.onAction('u:a', { action: 'shot' });
  env.arena.onAction('u:a', { action: 'shot' }); // ignorado (cooldown)
  assert.equal(m.fighters[1].hp, 84);
  env.arena.onDisconnect('u:b');
  assert.equal(env.ledger.wallet('u:a').balanceKz, 10000 - 500 + 800);
});

test('corrida no Grande Circuito com bot de treino arranca no grid correcto', () => {
  const store = new Store(':memory:');
  const ledger = new DemoLedger(store, { feePct: 20 });
  const races = new RaceManager({ store, ledger, now: () => 1, send: () => {} });
  const race = races.startTraining({ id: 'u:a', displayName: 'A' }, DEFAULT_TRAINING_BOTS[0], 'car', 'circuito_grande_luanda');
  assert.equal(race.track, 'circuito_grande_luanda');
  assert.deepEqual(race.participants[0].grid, RACE_TRACKS.circuito_grande_luanda.grid[0]);
});
