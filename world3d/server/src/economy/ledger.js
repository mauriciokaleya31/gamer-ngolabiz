/**
 * Economia de DEMONSTRAÇÃO — razão (ledger) de partidas dobradas, auditável.
 *
 *  - Moeda: KZD ("Kwanza demo"), sem valor real. Não existem depósitos nem
 *    levantamentos. A ligação ao saldo real (users.user_wallet_balance) NÃO existe
 *    e está bloqueada por desenho até validação jurídica e integração autorizada.
 *  - Valores em cêntimos (inteiros) para evitar erros de vírgula flutuante.
 *  - Cada transacção: soma das entradas = 0, chave de idempotência única,
 *    encadeamento de hashes (prev_hash → hash) para detectar adulterações.
 *  - Reserva (hold) → conta de garantia (escrow) por competição → liquidação
 *    (prémio + taxa) ou reembolso integral.
 *  - Só o servidor de competições chama settle/refund, com o vencedor determinado
 *    pelo servidor. NPCs e o serviço de diálogo não têm acesso a este módulo.
 */
import { createHash, randomUUID } from 'node:crypto';

export const CURRENCY = 'KZD';
export const REAL_MONEY_ENABLED = false;
export const DEMO_GRANT_KZ = 10000;
export const ALLOWED_STAKES_KZ = [0, 500, 1000, 2000, 5000];

const FAUCET = 'sys:faucet_demo';
const PLATFORM = 'sys:platform_fees_demo';

export class LedgerError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

export const kzToCents = (kz) => Math.round(Number(kz) * 100);
export const centsToKz = (c) => c / 100;

function canonical(obj) {
  if (Array.isArray(obj)) return `[${obj.map(canonical).join(',')}]`;
  if (obj && typeof obj === 'object') return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`;
  return JSON.stringify(obj);
}

export class DemoLedger {
  constructor(store, { feePct = 10, realMoney = false } = {}) {
    if (realMoney || REAL_MONEY_ENABLED) {
      throw new LedgerError('Dinheiro real não é suportado: requer validação jurídica e integração financeira aprovada.', 'real_money_blocked');
    }
    this.store = store;
    this.db = store.db;
    this.feePct = feePct;
    this.ensureAccount(FAUCET, null, 'faucet');
    this.ensureAccount(PLATFORM, null, 'platform');
  }

  ensureAccount(id, owner, kind) {
    this.db.prepare('INSERT OR IGNORE INTO ledger_accounts (id, owner, kind, currency, created_at) VALUES (?, ?, ?, ?, ?)').run(id, owner, kind, CURRENCY, Date.now());
    return id;
  }

  playerAccount(playerId) { return `player:${playerId}`; }
  escrowAccount(competitionId) { return `escrow:${competitionId}`; }

  balance(accountId) {
    return this.db.prepare('SELECT COALESCE(SUM(amount), 0) AS b FROM ledger_entries WHERE account_id = ?').get(accountId).b;
  }

  lastHash() {
    return this.db.prepare('SELECT hash FROM ledger_txns ORDER BY seq DESC LIMIT 1').get()?.hash ?? 'GENESIS';
  }

  /** Núcleo: grava uma transacção equilibrada de forma atómica e idempotente. */
  post({ type, ref = null, idempotencyKey, memo = '', entries }) {
    const existing = this.db.prepare('SELECT id FROM ledger_txns WHERE idempotency_key = ?').get(idempotencyKey);
    if (existing) return { txnId: existing.id, duplicate: true };
    const sum = entries.reduce((s, e) => s + e.amount, 0);
    if (sum !== 0) throw new LedgerError('transacção desequilibrada', 'unbalanced');
    if (entries.some((e) => !Number.isInteger(e.amount))) throw new LedgerError('valores devem ser inteiros (cêntimos)', 'not_integer');
    return this.store.tx(() => {
      // saldos de jogadores e garantias nunca podem ficar negativos
      for (const e of entries) {
        if (e.account.startsWith('player:') || e.account.startsWith('escrow:')) {
          if (this.balance(e.account) + entries.filter((x) => x.account === e.account).reduce((s, x) => s + x.amount, 0) < 0) {
            throw new LedgerError('saldo demo insuficiente', 'insufficient');
          }
        }
      }
      const id = randomUUID();
      const createdAt = Date.now();
      const prev = this.lastHash();
      const body = { id, type, ref, idempotencyKey, memo, createdAt, entries: entries.map((e) => ({ account: e.account, amount: e.amount })) };
      const hash = createHash('sha256').update(prev + canonical(body)).digest('hex');
      this.db.prepare('INSERT INTO ledger_txns (id, type, ref, idempotency_key, memo, created_at, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, type, ref, idempotencyKey, memo, createdAt, prev, hash);
      const ins = this.db.prepare('INSERT INTO ledger_entries (txn_id, account_id, amount) VALUES (?, ?, ?)');
      for (const e of entries) ins.run(id, e.account, e.amount);
      return { txnId: id, hash, duplicate: false };
    });
  }

  /** Abre a carteira demo do jogador com o crédito inicial (uma única vez). */
  ensurePlayer(playerId) {
    const acc = this.ensureAccount(this.playerAccount(playerId), playerId, 'player');
    this.post({ type: 'demo_grant', ref: playerId, idempotencyKey: `grant:${playerId}`, memo: 'Crédito inicial de demonstração', entries: [{ account: FAUCET, amount: -kzToCents(DEMO_GRANT_KZ) }, { account: acc, amount: kzToCents(DEMO_GRANT_KZ) }] });
    return this.wallet(playerId);
  }

  wallet(playerId) {
    const acc = this.playerAccount(playerId);
    const held = this.db.prepare(`SELECT COALESCE(SUM(e.stake), 0) AS h FROM escrows e WHERE e.status = 'open' AND EXISTS (SELECT 1 FROM json_each(e.participants) j WHERE j.value = ?)`).get(playerId).h;
    return { playerId, currency: CURRENCY, isDemo: true, balanceKz: centsToKz(this.balance(acc)), heldKz: centsToKz(held) };
  }

  openEscrow(competitionId, participants, stakeKz) {
    if (!ALLOWED_STAKES_KZ.includes(stakeKz)) throw new LedgerError('valor de entrada não permitido', 'bad_stake');
    if (participants.length < 2) throw new LedgerError('são precisos pelo menos 2 participantes', 'participants');
    const stake = kzToCents(stakeKz);
    this.db.prepare('INSERT OR IGNORE INTO escrows (id, competition_id, stake, participants, status, fee_pct, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(this.escrowAccount(competitionId), competitionId, stake, JSON.stringify(participants), 'open', this.feePct, Date.now());
    this.ensureAccount(this.escrowAccount(competitionId), null, 'escrow');
    return this.escrow(competitionId);
  }

  escrow(competitionId) {
    const r = this.db.prepare('SELECT * FROM escrows WHERE competition_id = ?').get(competitionId);
    return r ? { ...r, participants: JSON.parse(r.participants), balance: this.balance(r.id) } : null;
  }

  /** Reserva a entrada de um participante (bloqueia o saldo demo). */
  hold(competitionId, playerId) {
    const esc = this.escrow(competitionId);
    if (!esc || esc.status !== 'open') throw new LedgerError('garantia inexistente ou fechada', 'escrow_closed');
    if (!esc.participants.includes(playerId)) throw new LedgerError('participante inválido', 'not_participant');
    if (esc.stake === 0) return { txnId: null, duplicate: false };
    return this.post({ type: 'hold', ref: competitionId, idempotencyKey: `hold:${competitionId}:${playerId}`, memo: 'Reserva de entrada', entries: [{ account: this.playerAccount(playerId), amount: -esc.stake }, { account: esc.id, amount: esc.stake }] });
  }

  /**
   * Liquidação: prémio = pote − taxa. Exemplo: 1.000 + 1.000 = 2.000 → 1.800 vencedor, 200 plataforma.
   * O vencedor TEM de ser um participante e TEM de vir do servidor de competições.
   */
  settle(competitionId, winnerId, { decidedBy }) {
    if (decidedBy !== 'competition_server') throw new LedgerError('liquidação só pelo servidor de competições', 'forbidden');
    const esc = this.escrow(competitionId);
    if (!esc) throw new LedgerError('garantia inexistente', 'no_escrow');
    if (esc.status === 'settled') return { duplicate: true, ...this.settlementOf(competitionId) };
    if (esc.status !== 'open') throw new LedgerError('garantia já fechada', 'escrow_closed');
    if (!esc.participants.includes(winnerId)) throw new LedgerError('vencedor não participou', 'bad_winner');
    const pot = esc.balance;
    if (pot !== esc.stake * esc.participants.length) throw new LedgerError('reservas incompletas', 'incomplete_holds');
    const fee = Math.round((pot * esc.fee_pct) / 100);
    const prize = pot - fee;
    const entries = pot === 0 ? [] : [{ account: esc.id, amount: -pot }, { account: this.playerAccount(winnerId), amount: prize }, ...(fee ? [{ account: PLATFORM, amount: fee }] : [])];
    const r = entries.length ? this.post({ type: 'settle', ref: competitionId, idempotencyKey: `settle:${competitionId}`, memo: `Prémio para ${winnerId}`, entries }) : { txnId: null };
    this.db.prepare("UPDATE escrows SET status = 'settled', closed_at = ? WHERE competition_id = ?").run(Date.now(), competitionId);
    return { txnId: r.txnId, potKz: centsToKz(pot), prizeKz: centsToKz(prize), feeKz: centsToKz(fee), winnerId };
  }

  settlementOf(competitionId) {
    const t = this.db.prepare("SELECT id FROM ledger_txns WHERE idempotency_key = ?").get(`settle:${competitionId}`);
    if (!t) return null;
    const entries = this.db.prepare('SELECT account_id, amount FROM ledger_entries WHERE txn_id = ?').all(t.id);
    return { txnId: t.id, entries };
  }

  /** Reembolso integral (cancelamento, empate sem vencedor, falha técnica). */
  refund(competitionId, reason) {
    const esc = this.escrow(competitionId);
    if (!esc) return null;
    if (esc.status !== 'open') return { duplicate: true, status: esc.status };
    const results = [];
    for (const pid of esc.participants) {
      if (esc.stake === 0) continue;
      const mine = this.db.prepare('SELECT id FROM ledger_txns WHERE idempotency_key = ?').get(`hold:${competitionId}:${pid}`);
      if (!mine) continue;
      results.push(this.post({ type: 'refund', ref: competitionId, idempotencyKey: `refund:${competitionId}:${pid}`, memo: `Reembolso: ${reason}`, entries: [{ account: esc.id, amount: -esc.stake }, { account: this.playerAccount(pid), amount: esc.stake }] }));
    }
    this.db.prepare("UPDATE escrows SET status = 'refunded', closed_at = ? WHERE competition_id = ?").run(Date.now(), competitionId);
    return { refunded: results.length, reason };
  }

  history(playerId, limit = 30) {
    return this.db.prepare(`SELECT t.id, t.type, t.ref, t.memo, t.created_at, e.amount FROM ledger_entries e JOIN ledger_txns t ON t.id = e.txn_id WHERE e.account_id = ? ORDER BY t.seq DESC LIMIT ?`)
      .all(this.playerAccount(playerId), limit)
      .map((r) => ({ txnId: r.id, type: r.type, ref: r.ref, memo: r.memo, at: r.created_at, amountKz: centsToKz(r.amount) }));
  }

  /** Auditoria completa: equilíbrio, saldos não negativos e cadeia de hashes. */
  verify() {
    const problems = [];
    let prev = 'GENESIS';
    const txns = this.db.prepare('SELECT * FROM ledger_txns ORDER BY seq ASC').all();
    for (const t of txns) {
      const entries = this.db.prepare('SELECT account_id AS account, amount FROM ledger_entries WHERE txn_id = ? ORDER BY id ASC').all(t.id);
      if (entries.reduce((s, e) => s + e.amount, 0) !== 0) problems.push(`txn ${t.id} desequilibrada`);
      if (t.prev_hash !== prev) problems.push(`txn ${t.id} quebra a cadeia`);
      const body = { id: t.id, type: t.type, ref: t.ref, idempotencyKey: t.idempotency_key, memo: t.memo, createdAt: t.created_at, entries: entries.map((e) => ({ account: e.account, amount: e.amount })) };
      const h = createHash('sha256').update(prev + canonical(body)).digest('hex');
      if (h !== t.hash) problems.push(`txn ${t.id} hash inválido`);
      prev = t.hash;
    }
    const neg = this.db.prepare(`SELECT account_id, SUM(amount) AS b FROM ledger_entries WHERE account_id LIKE 'player:%' OR account_id LIKE 'escrow:%' GROUP BY account_id HAVING b < 0`).all();
    for (const n of neg) problems.push(`saldo negativo em ${n.account_id}`);
    const total = this.db.prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM ledger_entries').get().s;
    if (total !== 0) problems.push('soma global diferente de zero');
    return { ok: problems.length === 0, transactions: txns.length, problems, headHash: prev };
  }
}
