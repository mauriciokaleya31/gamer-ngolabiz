import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.js';
import { DemoLedger, LedgerError } from '../src/economy/ledger.js';

const mk = () => { const store = new Store(':memory:'); return { store, ledger: new DemoLedger(store, { feePct: 10 }) }; };

test('crédito inicial demo é idempotente', () => {
  const { ledger } = mk();
  ledger.ensurePlayer('u:1');
  ledger.ensurePlayer('u:1');
  assert.equal(ledger.wallet('u:1').balanceKz, 10000);
  assert.equal(ledger.wallet('u:1').isDemo, true);
});

test('modelo 1.000 + 1.000 → 1.800 ao vencedor e 200 de taxa', () => {
  const { ledger } = mk();
  ledger.ensurePlayer('a');
  ledger.ensurePlayer('b');
  ledger.openEscrow('c1', ['a', 'b'], 1000);
  ledger.hold('c1', 'a');
  ledger.hold('c1', 'b');
  assert.equal(ledger.wallet('a').balanceKz, 9000);
  assert.equal(ledger.wallet('a').heldKz, 1000);
  const s = ledger.settle('c1', 'a', { decidedBy: 'competition_server' });
  assert.deepEqual([s.potKz, s.prizeKz, s.feeKz], [2000, 1800, 200]);
  assert.equal(ledger.wallet('a').balanceKz, 10800);
  assert.equal(ledger.wallet('b').balanceKz, 9000);
  assert.equal(ledger.balance('sys:platform_fees_demo'), 20000);
  // liquidação repetida não paga duas vezes
  ledger.settle('c1', 'a', { decidedBy: 'competition_server' });
  assert.equal(ledger.wallet('a').balanceKz, 10800);
  assert.ok(ledger.verify().ok);
});

test('reembolso devolve as entradas e fecha a garantia', () => {
  const { ledger } = mk();
  ledger.ensurePlayer('a');
  ledger.ensurePlayer('b');
  ledger.openEscrow('c2', ['a', 'b'], 2000);
  ledger.hold('c2', 'a');
  ledger.hold('c2', 'b');
  ledger.refund('c2', 'empate');
  assert.equal(ledger.wallet('a').balanceKz, 10000);
  assert.equal(ledger.wallet('b').balanceKz, 10000);
  assert.throws(() => ledger.settle('c2', 'a', { decidedBy: 'competition_server' }), LedgerError);
  assert.ok(ledger.verify().ok);
});

test('regras: saldo insuficiente, vencedor inválido, quem pode liquidar, entradas permitidas', () => {
  const { ledger } = mk();
  ledger.ensurePlayer('a');
  ledger.ensurePlayer('b');
  assert.throws(() => ledger.openEscrow('x', ['a', 'b'], 1234), /não permitido/);
  ledger.openEscrow('c3', ['a', 'b'], 5000);
  ledger.hold('c3', 'a');
  ledger.openEscrow('c4', ['a', 'b'], 5000);
  ledger.hold('c4', 'a');
  ledger.openEscrow('c5', ['a', 'b'], 5000);
  assert.throws(() => ledger.hold('c5', 'a'), /insuficiente/);
  ledger.hold('c3', 'b');
  assert.throws(() => ledger.settle('c3', 'npc_x', { decidedBy: 'competition_server' }), /não participou/);
  assert.throws(() => ledger.settle('c3', 'a', { decidedBy: 'npc' }), /servidor de competições/);
  assert.throws(() => ledger.settle('c4', 'a', { decidedBy: 'competition_server' }), /incompletas/);
});

test('dinheiro real está bloqueado por desenho', () => {
  assert.throws(() => new DemoLedger(new Store(':memory:'), { realMoney: true }), /Dinheiro real/);
});

test('adulteração da base é detectada pela cadeia de hashes', () => {
  const { store, ledger } = mk();
  ledger.ensurePlayer('a');
  ledger.ensurePlayer('b');
  assert.ok(ledger.verify().ok);
  store.db.prepare("UPDATE ledger_entries SET amount = amount + 100000 WHERE account_id = 'player:a'").run();
  const v = ledger.verify();
  assert.equal(v.ok, false);
  assert.ok(v.problems.length >= 1);
});
