import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { DemoLedger } from '../src/economy/ledger.js';
import { RaceManager, verifyRace } from '../src/competition/race.js';
import { DEFAULT_TRAINING_BOTS } from '../src/competition/trainingBot.js';
import { RACE_TRACK } from '../../shared/zone.js';

function setup() {
  let now = 1_800_000_000_000;
  const store = new Store(':memory:');
  const ledger = new DemoLedger(store, { feePct: 10 });
  const sent = [];
  const races = new RaceManager({ store, ledger, now: () => now, send: (pid, msg) => sent.push({ pid, msg }) });
  for (const id of ['u:a', 'u:b']) { store.upsertProfile({ playerId: id, displayName: id, isGuest: false }); ledger.ensurePlayer(id); }
  return { store, ledger, races, sent, step: (ms) => { now += ms; races.tick(ms / 1000); }, now: () => now };
}

/** Conduz um jogador simulado pela linha de corrida a velocidade constante. */
function driveLine(env, playerId, speed, { skipCheckpoints = false } = {}) {
  const line = skipCheckpoints ? [[-22, -90], [-5, -90]] : RACE_TRACK.racingLine;
  const pts = [];
  for (let i = 1; i < line.length; i++) {
    const [ax, az] = line[i - 1];
    const [bx, bz] = line[i];
    const len = Math.hypot(bx - ax, bz - az);
    for (let d = 0; d < len; d += speed * 0.1) pts.push([ax + (bx - ax) * d / len, az + (bz - az) * d / len]);
  }
  pts.push(line.at(-1), [line.at(-1)[0] + 2, line.at(-1)[1]]);
  return pts;
}

test('corrida de treino contra bot: servidor decide, regista e o hash verifica', () => {
  const env = setup();
  const race = env.races.startTraining({ id: 'u:a', displayName: 'A' }, DEFAULT_TRAINING_BOTS[0], 'car');
  assert.equal(race.participants[1].isBot, true);
  env.step(5000); // contagem
  const path = driveLine(env, 'u:a', 30);
  for (const [x, z] of path) { env.step(100); env.races.onPlayerState('u:a', x, z, env.now()); }
  for (let i = 0; i < 700 && env.races.races.size; i++) env.step(100);
  const result = env.sent.find((s) => s.msg.t === 'race_result');
  assert.ok(result, 'resultado enviado');
  assert.equal(result.msg.record.winnerId, 'u:a', 'humano a 30 m/s vence bot fácil (15 m/s)');
  const stored = env.store.getRace(result.msg.record.raceId);
  assert.ok(verifyRace(stored).ok);
  stored.record.winnerId = 'bot_treino_kiluanji';
  assert.equal(verifyRace(stored).ok, false, 'adulteração detectada');
  assert.equal(env.store.getProfile('u:a').wins, 1);
});

test('saltar pontos de controlo não conta como chegada; teletransporte desclassifica', () => {
  const env = setup();
  env.races.startTraining({ id: 'u:a', displayName: 'A' }, DEFAULT_TRAINING_BOTS[2], 'car');
  env.step(5000);
  for (const [x, z] of driveLine(env, 'u:a', 20, { skipCheckpoints: true })) { env.step(100); env.races.onPlayerState('u:a', x, z, env.now()); }
  const race = [...env.races.races.values()][0];
  const me = race.participants.find((p) => p.id === 'u:a');
  assert.equal(me.status, 'racing');
  assert.ok(me.nextCp <= 1);
  for (let i = 0; i < 3; i++) { env.step(100); env.races.onPlayerState('u:a', i % 2 ? -50 : 50, 90, env.now()); }
  assert.equal(me.status, 'dq');
});

test('corrida com entrada demo entre humanos liquida 1.800/200', () => {
  const env = setup();
  const c = env.races.challenge({ id: 'u:a', displayName: 'A' }, { id: 'u:b', displayName: 'B' }, { vehicle: 'moto', stake: 1000 });
  env.races.respond(c.id, 'u:b', true);
  assert.equal(env.ledger.wallet('u:a').balanceKz, 9000);
  env.step(5000);
  const pa = driveLine(env, 'u:a', 28);
  const pb = driveLine(env, 'u:b', 22);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    env.step(100);
    if (pa[i]) env.races.onPlayerState('u:a', ...pa[i], env.now());
    if (pb[i]) env.races.onPlayerState('u:b', ...pb[i], env.now());
  }
  for (let i = 0; i < 600 && env.races.races.size; i++) env.step(100);
  const result = env.sent.find((s) => s.msg.t === 'race_result').msg;
  assert.equal(result.record.winnerId, 'u:a');
  assert.deepEqual([result.record.settlement.prizeKz, result.record.settlement.feeKz], [1800, 200]);
  assert.equal(env.ledger.wallet('u:a').balanceKz, 10800);
  assert.equal(env.ledger.wallet('u:b').balanceKz, 9000);
  assert.ok(env.ledger.verify().ok);
});

test('bots não entram em corridas com saldo; abandono reembolsa', () => {
  const env = setup();
  assert.throws(() => env.races.startRace([{ id: 'u:a', name: 'A', isBot: false, vehicle: 'car' }, { id: 'bot', name: 'Bot', isBot: true, vehicle: 'car', botDef: DEFAULT_TRAINING_BOTS[0] }], { stake: 1000 }), /Bots não podem/);
  const c = env.races.challenge({ id: 'u:a', displayName: 'A' }, { id: 'u:b', displayName: 'B' }, { stake: 2000 });
  env.races.respond(c.id, 'u:b', true);
  env.step(5000);
  env.races.onDisconnect('u:a');
  env.races.onDisconnect('u:b');
  env.step(200);
  assert.equal(env.ledger.wallet('u:a').balanceKz, 10000);
  assert.equal(env.ledger.wallet('u:b').balanceKz, 10000);
});

test('partida falsa durante a contagem desclassifica', () => {
  const env = setup();
  env.races.startTraining({ id: 'u:a', displayName: 'A' }, DEFAULT_TRAINING_BOTS[0], 'car');
  env.step(1000);
  env.races.onPlayerState('u:a', 10, -90, env.now());
  const race = [...env.races.races.values()][0];
  assert.equal(race.participants[0].status, 'dq');
});
