/**
 * Emotes e emojis multijogador: o servidor valida (existência, estado activo, regras
 * de contexto, ritmo/cooldown), regista o estado actual do jogador (para quem chega
 * depois também ver o emote) e difunde o evento aos jogadores próximos com o
 * instante do servidor, para que todos os clientes sincronizem a animação.
 */
import { EMOTES, ALLOWED_EMOJIS, EMOTE_LIMITS } from '../../shared/emotes.js';

export class ExpressionError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

export class ExpressionService {
  constructor({ now = () => Date.now(), overrides = {} } = {}) {
    this.now = now;
    this.setOverrides(overrides);
  }

  /** Sobreposições do administrador: { [emoteId]: { active, durationMs, cooldownMs } } */
  setOverrides(overrides = {}) {
    this.overrides = overrides;
    this.library = new Map(EMOTES.map((e) => {
      const o = overrides[e.id] ?? {};
      return [e.id, { ...e, active: o.active ?? e.active, durationMs: o.durationMs ?? e.durationMs, rules: { ...e.rules, cooldownMs: o.cooldownMs ?? e.rules.cooldownMs } }];
    }));
  }

  list() { return [...this.library.values()]; }

  publicList() {
    return this.list().map((e) => ({ id: e.id, name: e.name, category: e.category, icon: e.icon, durationMs: e.durationMs, loop: e.loop, active: e.active, rules: e.rules, platforms: e.platforms }));
  }

  rate(p, key, perMinute) {
    const now = this.now();
    p[key] = (p[key] ?? []).filter((t) => now - t < 60000);
    if (p[key].length >= perMinute) throw new ExpressionError('Estás a enviar expressões depressa demais.', 'rate');
    const last = p[key].at(-1) ?? -Infinity;
    if (now - last < EMOTE_LIMITS.minIntervalMs) throw new ExpressionError('Aguarda um momento.', 'rate');
    p[key].push(now);
  }

  /**
   * @param p jogador ({ inVehicle, inRace, emote })
   * @returns evento a difundir
   */
  startEmote(p, id, { dir = null, inRace = false } = {}) {
    const def = this.library.get(String(id));
    if (!def) throw new ExpressionError('Emote desconhecido.', 'unknown');
    if (!def.active) throw new ExpressionError('Este emote está desactivado.', 'inactive');
    if (p.inVehicle && !def.rules.inVehicle) throw new ExpressionError('Sai do veículo para usar este emote.', 'context');
    if (inRace && !def.rules.inRace) throw new ExpressionError('Emotes indisponíveis durante a corrida.', 'context');
    const now = this.now();
    const lastSame = p.lastEmoteAt?.[def.id] ?? -Infinity;
    if (now - lastSame < def.rules.cooldownMs) throw new ExpressionError('Aguarda um momento.', 'cooldown');
    this.rate(p, 'emoteTimes', EMOTE_LIMITS.perMinute);
    p.lastEmoteAt = { ...(p.lastEmoteAt ?? {}), [def.id]: now };
    const d = Number(dir);
    p.emote = { id: def.id, startedAt: now, until: now + (def.loop ? 120000 : def.durationMs), x: p.x, z: p.z, dir: Number.isFinite(d) ? d : null };
    return { t: 'emote', playerId: p.id, id: def.id, at: now, durationMs: def.durationMs, loop: def.loop, dir: p.emote.dir };
  }

  stopEmote(p) {
    if (!p.emote) return null;
    p.emote = null;
    return { t: 'emote_stop', playerId: p.id, at: this.now() };
  }

  /** Movimento cancela emotes interrompíveis; emotes terminam pela duração. */
  maintain(p) {
    if (!p.emote) return null;
    const def = this.library.get(p.emote.id);
    const moved = Math.hypot(p.x - p.emote.x, p.z - p.emote.z) > 0.4;
    if (this.now() > p.emote.until || (moved && def?.interruptible) || (p.inVehicle && !def?.rules.inVehicle)) return this.stopEmote(p);
    return null;
  }

  emoji(p, e) {
    const emoji = String(e ?? '');
    if (!ALLOWED_EMOJIS.has(emoji)) throw new ExpressionError('Emoji não permitido.', 'unknown');
    this.rate(p, 'emojiTimes', EMOTE_LIMITS.emojiPerMinute);
    return { t: 'emoji', playerId: p.id, e: emoji, at: this.now(), durationMs: EMOTE_LIMITS.emojiDisplayMs };
  }

  sanitizeFavorites(list) {
    return [...new Set((Array.isArray(list) ? list : []).map(String).filter((id) => this.library.has(id)))].slice(0, EMOTE_LIMITS.maxFavorites);
  }
}
