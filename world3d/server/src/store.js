/**
 * Persistência do servidor de mundo (SQLite embutido do Node ≥ 22).
 * Em produção pode ser substituída por MySQL/PostgreSQL mantendo esta interface.
 * Não guarda segredos (as chaves vêm de variáveis de ambiente).
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS profiles (
  player_id TEXT PRIMARY KEY, display_name TEXT NOT NULL, appearance TEXT, is_guest INTEGER NOT NULL DEFAULT 0,
  races INTEGER NOT NULL DEFAULT 0, wins INTEGER NOT NULL DEFAULT 0, best_lap_ms INTEGER,
  created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS friendships (
  a TEXT NOT NULL, b TEXT NOT NULL, status TEXT NOT NULL, requested_by TEXT NOT NULL, created_at INTEGER NOT NULL,
  PRIMARY KEY (a, b)
);
CREATE TABLE IF NOT EXISTS races (id TEXT PRIMARY KEY, record TEXT NOT NULL, hash TEXT NOT NULL, winner_id TEXT, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS race_participants (race_id TEXT NOT NULL, player_id TEXT NOT NULL, status TEXT NOT NULL, finish_ms INTEGER, PRIMARY KEY (race_id, player_id));
CREATE TABLE IF NOT EXISTS npc_memory (npc_id TEXT NOT NULL, player_id TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (npc_id, player_id));
CREATE INDEX IF NOT EXISTS idx_npc_memory_player ON npc_memory(player_id);
CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ledger_accounts (id TEXT PRIMARY KEY, owner TEXT, kind TEXT NOT NULL, currency TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ledger_txns (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, type TEXT NOT NULL, ref TEXT, idempotency_key TEXT UNIQUE NOT NULL,
  memo TEXT, created_at INTEGER NOT NULL, prev_hash TEXT NOT NULL, hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ledger_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT, txn_id TEXT NOT NULL REFERENCES ledger_txns(id), account_id TEXT NOT NULL REFERENCES ledger_accounts(id),
  amount INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_entries_account ON ledger_entries(account_id);
CREATE TABLE IF NOT EXISTS inventory (
  player_id TEXT NOT NULL, item_id TEXT NOT NULL, acquired_at INTEGER NOT NULL, source TEXT NOT NULL, txn_id TEXT,
  PRIMARY KEY (player_id, item_id)
);
CREATE TABLE IF NOT EXISTS player_prefs (player_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS escrows (
  id TEXT PRIMARY KEY, competition_id TEXT UNIQUE NOT NULL, stake INTEGER NOT NULL, participants TEXT NOT NULL,
  status TEXT NOT NULL, fee_pct REAL NOT NULL, created_at INTEGER NOT NULL, closed_at INTEGER
);
`;

export class Store {
  constructor(path = ':memory:') {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(SCHEMA);
  }

  tx(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const r = fn();
      this.db.exec('COMMIT');
      return r;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  // --- kv ---
  getJSON(k, fallback = null) {
    const row = this.db.prepare('SELECT v FROM kv WHERE k = ?').get(k);
    return row ? JSON.parse(row.v) : fallback;
  }

  setJSON(k, v) {
    this.db.prepare('INSERT INTO kv (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at').run(k, JSON.stringify(v), Date.now());
  }

  // --- perfis ---
  upsertProfile({ playerId, displayName, appearance, isGuest }) {
    const now = Date.now();
    this.db.prepare(`INSERT INTO profiles (player_id, display_name, appearance, is_guest, created_at, last_seen) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(player_id) DO UPDATE SET display_name = excluded.display_name, appearance = COALESCE(excluded.appearance, profiles.appearance), last_seen = excluded.last_seen`)
      .run(playerId, displayName, appearance ? JSON.stringify(appearance) : null, isGuest ? 1 : 0, now, now);
    return this.getProfile(playerId);
  }

  getProfile(playerId) {
    const r = this.db.prepare('SELECT * FROM profiles WHERE player_id = ?').get(playerId);
    if (!r) return null;
    return { playerId: r.player_id, displayName: r.display_name, appearance: r.appearance ? JSON.parse(r.appearance) : null, isGuest: !!r.is_guest, races: r.races, wins: r.wins, bestLapMs: r.best_lap_ms, createdAt: r.created_at, lastSeen: r.last_seen };
  }

  recordRaceStats(playerId, won, finishMs) {
    this.db.prepare(`UPDATE profiles SET races = races + 1, wins = wins + ?, best_lap_ms = CASE WHEN ? IS NOT NULL AND (best_lap_ms IS NULL OR ? < best_lap_ms) THEN ? ELSE best_lap_ms END WHERE player_id = ?`)
      .run(won ? 1 : 0, finishMs ?? null, finishMs ?? null, finishMs ?? null, playerId);
  }

  leaderboard(limit = 20) {
    return this.db.prepare('SELECT player_id, display_name, races, wins, best_lap_ms FROM profiles WHERE races > 0 ORDER BY wins DESC, best_lap_ms ASC LIMIT ?').all(limit)
      .map((r) => ({ playerId: r.player_id, displayName: r.display_name, races: r.races, wins: r.wins, bestLapMs: r.best_lap_ms }));
  }

  // --- amizades ---
  friendKey(x, y) { return x < y ? [x, y] : [y, x]; }

  requestFriend(from, to) {
    const [a, b] = this.friendKey(from, to);
    const existing = this.db.prepare('SELECT * FROM friendships WHERE a = ? AND b = ?').get(a, b);
    if (existing) return existing.status;
    this.db.prepare('INSERT INTO friendships (a, b, status, requested_by, created_at) VALUES (?, ?, ?, ?, ?)').run(a, b, 'pending', from, Date.now());
    return 'pending';
  }

  acceptFriend(by, from) {
    const [a, b] = this.friendKey(by, from);
    const r = this.db.prepare('SELECT * FROM friendships WHERE a = ? AND b = ?').get(a, b);
    if (!r || r.status !== 'pending' || r.requested_by !== from) return false;
    this.db.prepare("UPDATE friendships SET status = 'accepted' WHERE a = ? AND b = ?").run(a, b);
    return true;
  }

  friendsOf(playerId) {
    return this.db.prepare('SELECT * FROM friendships WHERE a = ? OR b = ?').all(playerId, playerId).map((r) => ({
      playerId: r.a === playerId ? r.b : r.a, status: r.status, incoming: r.status === 'pending' && r.requested_by !== playerId,
    }));
  }

  // --- corridas ---
  saveRace(record, hash) {
    this.tx(() => {
      this.db.prepare('INSERT INTO races (id, record, hash, winner_id, created_at) VALUES (?, ?, ?, ?, ?)').run(record.raceId, JSON.stringify(record), hash, record.winnerId ?? null, Date.now());
      for (const p of record.participants) {
        this.db.prepare('INSERT INTO race_participants (race_id, player_id, status, finish_ms) VALUES (?, ?, ?, ?)').run(record.raceId, p.id, p.status, p.finishMs ?? null);
      }
    });
  }

  getRace(id) {
    const r = this.db.prepare('SELECT * FROM races WHERE id = ?').get(id);
    return r ? { record: JSON.parse(r.record), hash: r.hash } : null;
  }

  racesOf(playerId, limit = 20) {
    return this.db.prepare('SELECT r.id, r.record, r.hash FROM race_participants p JOIN races r ON r.id = p.race_id WHERE p.player_id = ? ORDER BY r.created_at DESC LIMIT ?').all(playerId, limit)
      .map((r) => { const rec = JSON.parse(r.record); return { raceId: r.id, hash: r.hash, winnerId: rec.winnerId, endedAt: rec.endedAt, stake: rec.stake, participants: rec.participants.map((p) => ({ id: p.id, name: p.name, isBot: p.isBot, status: p.status, finishMs: p.finishMs })) }; });
  }

  // --- memória de NPCs ---
  getMemory(npcId, playerId) {
    const r = this.db.prepare('SELECT data FROM npc_memory WHERE npc_id = ? AND player_id = ?').get(npcId, playerId);
    return r ? JSON.parse(r.data) : null;
  }

  putMemory(m, maxPerNpc) {
    this.db.prepare('INSERT INTO npc_memory (npc_id, player_id, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(npc_id, player_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at')
      .run(m.npcId, m.playerId, JSON.stringify(m), Date.now());
    // retenção: manter só as N memórias mais recentes por NPC
    this.db.prepare('DELETE FROM npc_memory WHERE npc_id = ? AND player_id NOT IN (SELECT player_id FROM npc_memory WHERE npc_id = ? ORDER BY updated_at DESC LIMIT ?)').run(m.npcId, m.npcId, maxPerNpc);
  }

  deleteMemoriesForPlayer(playerId) {
    this.db.prepare('DELETE FROM npc_memory WHERE player_id = ?').run(playerId);
  }

  purgeOldMemories(olderThanMs) {
    return this.db.prepare('DELETE FROM npc_memory WHERE updated_at < ?').run(Date.now() - olderThanMs).changes;
  }

  // --- inventário e preferências ---
  ownedItems(playerId) {
    return this.db.prepare('SELECT item_id FROM inventory WHERE player_id = ?').all(playerId).map((r) => r.item_id);
  }

  grantItem(playerId, itemId, source, txnId = null) {
    this.db.prepare('INSERT OR IGNORE INTO inventory (player_id, item_id, acquired_at, source, txn_id) VALUES (?, ?, ?, ?, ?)').run(playerId, itemId, Date.now(), source, txnId);
  }

  getPrefs(playerId) {
    const r = this.db.prepare('SELECT data FROM player_prefs WHERE player_id = ?').get(playerId);
    return r ? JSON.parse(r.data) : {};
  }

  setPrefs(playerId, patch) {
    const data = { ...this.getPrefs(playerId), ...patch };
    this.db.prepare('INSERT INTO player_prefs (player_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(player_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at').run(playerId, JSON.stringify(data), Date.now());
    return data;
  }

  // --- auditoria ---
  audit(type, data) {
    this.db.prepare('INSERT INTO audit_log (type, data, created_at) VALUES (?, ?, ?)').run(type, JSON.stringify(data), Date.now());
  }

  recentAudit(limit = 50, type = null) {
    const rows = type
      ? this.db.prepare('SELECT * FROM audit_log WHERE type = ? ORDER BY id DESC LIMIT ?').all(type, limit)
      : this.db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').all(limit);
    return rows.map((r) => ({ id: r.id, type: r.type, data: JSON.parse(r.data), createdAt: r.created_at }));
  }
}
