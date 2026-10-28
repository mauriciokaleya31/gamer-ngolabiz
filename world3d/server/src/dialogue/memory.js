/**
 * Memória controlada dos NPCs.
 *
 * - Chave SEMPRE (npcId, playerId): a memória de um NPC sobre um jogador nunca é
 *   lida no contexto de outro jogador (isolamento).
 * - Curto prazo: últimas N falas, expiram após `turnTtlMs`.
 * - Longo prazo (limitado): nome apresentado pelo próprio jogador no jogo, número de
 *   encontros, último encontro, tarefa em curso, preferência de tom, relação (0..1).
 *   Expira após `factsTtlDays` sem encontros.
 * - Não guarda e-mails, telefones, IBAN, moradas ou outros dados pessoais: o texto é
 *   filtrado antes de ser guardado.
 */

export const DEFAULT_MEMORY_CONFIG = {
  maxTurns: 6,
  turnTtlMs: 30 * 60 * 1000,
  factsTtlDays: 30,
  maxEntriesPerNpc: 400,
};

const PII_PATTERNS = [
  /[\w.+-]+@[\w-]+\.[\w.]+/g, // e-mail
  /\b(?:\+?244)?\s?9\d{2}[\s-]?\d{3}[\s-]?\d{3}\b/g, // telemóvel angolano
  /\bAO\d{2}[\s\d]{15,30}\b/gi, // IBAN angolano
  /\b\d{9}[A-Z]{2}\d{3}\b/g, // n.º de BI
  /\b\d{6,}\b/g, // números longos (cartões, referências)
];

export function scrubPII(text) {
  let t = String(text ?? '');
  for (const re of PII_PATTERNS) t = t.replace(re, '[removido]');
  return t;
}

export class NpcMemory {
  constructor(store = null, config = {}) {
    this.store = store; // persistência opcional (Store.kv*)
    this.config = { ...DEFAULT_MEMORY_CONFIG, ...config };
    this.cache = new Map();
  }

  key(npcId, playerId) {
    if (!npcId || !playerId) throw new Error('memória exige npcId e playerId');
    return `${npcId}|${playerId}`;
  }

  get(npcId, playerId, now = Date.now()) {
    const k = this.key(npcId, playerId);
    let m = this.cache.get(k);
    if (!m && this.store) {
      m = this.store.getMemory(npcId, playerId);
      if (m) this.cache.set(k, m);
    }
    if (!m) return { npcId, playerId, facts: {}, turns: [], meetCount: 0, lastMet: 0, relation: 0.5 };
    // expiração
    m.turns = m.turns.filter((t) => now - t.at < this.config.turnTtlMs);
    if (now - m.lastMet > this.config.factsTtlDays * 86400000) {
      m.facts = {};
      m.relation = 0.5;
      m.meetCount = 0;
    }
    return m;
  }

  save(m) {
    const k = this.key(m.npcId, m.playerId);
    m.turns = m.turns.slice(-this.config.maxTurns);
    this.cache.set(k, m);
    this.store?.putMemory(m, this.config.maxEntriesPerNpc);
  }

  recordMeeting(npcId, playerId, now = Date.now()) {
    const m = this.get(npcId, playerId, now);
    if (now - m.lastMet > 10 * 60 * 1000) m.meetCount += 1;
    m.lastMet = now;
    this.save(m);
    return m;
  }

  addTurn(npcId, playerId, role, text, now = Date.now()) {
    const m = this.get(npcId, playerId, now);
    m.turns.push({ role, text: scrubPII(text).slice(0, 280), at: now });
    m.lastMet = now;
    this.save(m);
    return m;
  }

  setFact(npcId, playerId, key, value, now = Date.now()) {
    const allowed = ['displayName', 'task', 'tone', 'lastTopic'];
    if (!allowed.includes(key)) throw new Error(`facto não permitido: ${key}`);
    const m = this.get(npcId, playerId, now);
    m.facts[key] = scrubPII(String(value)).slice(0, 40);
    this.save(m);
    return m;
  }

  adjustRelation(npcId, playerId, delta, now = Date.now()) {
    const m = this.get(npcId, playerId, now);
    m.relation = Math.max(0, Math.min(1, (m.relation ?? 0.5) + delta));
    this.save(m);
    return m;
  }

  /** Direito ao esquecimento: apaga tudo o que os NPCs sabem de um jogador. */
  forgetPlayer(playerId) {
    for (const k of [...this.cache.keys()]) if (k.endsWith(`|${playerId}`)) this.cache.delete(k);
    this.store?.deleteMemoriesForPlayer(playerId);
  }
}
