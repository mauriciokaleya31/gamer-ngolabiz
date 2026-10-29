/**
 * Centros de Competição Físicos e Modos Multijogador 1v1 / Sobrevivência (Autoritativo).
 *
 * Modos suportados em arenas dedicadas e isoladas:
 *  - combate_1v1   : Combate Corpo a Corpo 1v1 no Centro de Combate & Ringue 1v1 (centro_combate)
 *  - tiro_1v1      : Duelo Táctico de Tiro 1v1 na Arena Táctica de Tiro (arena_tiro)
 *  - sobrevivencia : Desafio de Sobrevivência por Rondas na Arena Táctica (arena_tiro)
 *
 * Modelo económico obrigatório (por omissão feePct = 20):
 *  - Pote total = soma das entradas validadas (ex.: 1.000 + 1.000 = 2.000 Kz demo)
 *  - Prémio do vencedor = 80% do pote total (ex.: 1.600 Kz demo)
 *  - Comissão da casa   = 20% do pote total (ex.: 400 Kz demo)
 *  - Liquidação atómica via DemoLedger.settle() com prevenção de pagamento duplicado e hash SHA-256.
 */
import { createHash, randomUUID } from 'node:crypto';
import { ALLOWED_STAKES_KZ as ALLOWED_STAKES } from '../economy/ledger.js';

export const COMPETITION_CENTERS = Object.freeze({
  centro_combate: {
    id: 'centro_combate',
    name: 'Centro de Combate & Ringue 1v1',
    poi: 'centro_combate_poi',
    modes: ['combate_1v1'],
    arenaBounds: { minX: -36, maxX: -10, minZ: 120, maxZ: 140 },
    spawns: [[-28, 130, Math.PI / 2], [-18, 130, -Math.PI / 2]],
    spectatorSpot: [-23, 144, Math.PI],
  },
  arena_tiro: {
    id: 'arena_tiro',
    name: 'Arena Táctica de Tiro & Sobrevivência',
    poi: 'arena_tiro_poi',
    modes: ['tiro_1v1', 'sobrevivencia'],
    arenaBounds: { minX: 12, maxX: 40, minZ: 120, maxZ: 140 },
    spawns: [[18, 130, Math.PI / 2], [34, 130, -Math.PI / 2]],
    spectatorSpot: [26, 144, Math.PI],
  },
  arena_kianda: {
    id: 'arena_kianda',
    name: 'Arena Principal & Casa de Apostas Kianda',
    poi: 'arena_quadro',
    modes: ['combate_1v1', 'tiro_1v1', 'sobrevivencia'],
    arenaBounds: { minX: 15, maxX: 45, minZ: 18, maxZ: 53 },
    spawns: [[24, 35, Math.PI / 2], [36, 35, -Math.PI / 2]],
    spectatorSpot: [30, 50, Math.PI],
  },
});

export const ARENA_BOTS = Object.freeze([
  { id: 'arena_bot_kamba', name: 'Lutador Kamba', difficulty: 'facil', skill: 0.45, mode: 'combate_1v1' },
  { id: 'arena_bot_relampago', name: 'Mestre Kalunga', difficulty: 'media', skill: 0.68, mode: 'combate_1v1' },
  { id: 'arena_bot_campeao', name: 'Campeão de Luanda', difficulty: 'dificil', skill: 0.85, mode: 'combate_1v1' },
  { id: 'tiro_bot_falcao', name: 'Atirador Falcão', difficulty: 'facil', skill: 0.48, mode: 'tiro_1v1' },
  { id: 'tiro_bot_sombra', name: 'Operador Sombra', difficulty: 'media', skill: 0.70, mode: 'tiro_1v1' },
  { id: 'tiro_bot_elite', name: 'Comandante Kianda', difficulty: 'dificil', skill: 0.88, mode: 'tiro_1v1' },
]);

/** Calcula de forma transparente a divisão 80% vencedor / 20% casa (ou feePct configurado). */
export function calculatePrizeSplit(stakeKz, participantsCount = 2, feePct = 20) {
  const stake = Math.max(0, Math.round(Number(stakeKz) || 0));
  const potKz = stake * participantsCount;
  const pct = Math.max(0, Math.min(30, Number(feePct) ?? 20));
  const feeKz = Math.round((potKz * pct) / 100);
  const prizeKz = potKz - feeKz;
  return { stakeKz: stake, participantsCount, potKz, prizeKz, feeKz, winnerPct: 100 - pct, housePct: pct };
}

export function hashArenaMatch(record) {
  return createHash('sha256').update(JSON.stringify(record)).digest('hex');
}

export function verifyArenaMatch(stored) {
  if (!stored?.record || !stored?.hash) return { ok: false };
  return { ok: hashArenaMatch(stored.record) === stored.hash };
}

export class ArenaError extends Error {
  constructor(message, code = 'arena_error') { super(message); this.code = code; }
}

export class ArenaModesManager {
  constructor({ store, ledger, now = () => Date.now(), send = () => {}, onTeleport = () => {}, config = {} }) {
    this.store = store;
    this.ledger = ledger;
    this.now = now;
    this.send = send;
    this.onTeleport = onTeleport;
    this.config = { feePct: 20, countdownMs: 3000, maxDurationMs: 90000, ...config };
    this.lobbies = new Map();
    this.matches = new Map();
  }

  publicState() {
    return {
      centers: Object.values(COMPETITION_CENTERS),
      bots: ARENA_BOTS,
      feePct: this.config.feePct,
      openLobbies: [...this.lobbies.values()].map((l) => ({
        id: l.id, mode: l.mode, centerId: l.centerId, hostId: l.host.id, hostName: l.host.name,
        stakeKz: l.stakeKz, split: calculatePrizeSplit(l.stakeKz, 2, this.config.feePct), createdAt: l.createdAt,
      })),
      activeMatches: [...this.matches.values()].map((m) => ({
        matchId: m.id, mode: m.mode, centerId: m.centerId, status: m.status, stakeKz: m.stakeKz,
        fighters: m.fighters.map((f) => ({ id: f.id, name: f.name, hp: f.hp, maxHp: f.maxHp, ammo: f.ammo, score: f.score, isBot: f.isBot })),
        spectators: m.spectators.size,
      })),
      recentResults: this.store.recentArenaMatches(10),
    };
  }

  inArenaMatch(playerId) {
    for (const m of this.matches.values()) {
      if (m.status !== 'ended' && m.fighters.some((f) => f.id === playerId)) return true;
    }
    return false;
  }

  /** Cria uma sala/desafio aberto num Centro de Competição para outro jogador aceitar. */
  createLobby(player, { mode = 'combate_1v1', centerId = 'centro_combate', stakeKz = 0 } = {}) {
    if (!['combate_1v1', 'tiro_1v1', 'sobrevivencia'].includes(mode)) throw new ArenaError('Modo de competição inválido.', 'bad_mode');
    if (this.inArenaMatch(player.id)) throw new ArenaError('Já estás numa competição em curso.', 'busy');
    const stake = Number(stakeKz) || 0;
    if (!ALLOWED_STAKES.includes(stake)) throw new ArenaError('Valor de entrada não permitido.', 'bad_stake');
    if (stake > 0) {
      this.ledger.ensurePlayer(player.id);
      if (this.ledger.wallet(player.id).balanceKz < stake) throw new ArenaError('Saldo demo insuficiente para esta entrada.', 'insufficient_funds');
    }
    // Remove lobby anterior do mesmo jogador
    for (const [id, l] of this.lobbies) if (l.host.id === player.id) this.lobbies.delete(id);
    const center = COMPETITION_CENTERS[centerId] ?? (mode === 'combate_1v1' ? COMPETITION_CENTERS.centro_combate : COMPETITION_CENTERS.arena_tiro);
    const lobby = {
      id: `lob_${randomUUID().slice(0, 8)}`,
      mode,
      centerId: center.id,
      host: { id: player.id, name: player.displayName ?? player.id },
      stakeKz: stake,
      createdAt: this.now(),
    };
    this.lobbies.set(lobby.id, lobby);
    return lobby;
  }

  /** Outro jogador humano junta-se a uma sala aberta: valida saldos, retém em garantia (escrow) e inicia o duelo. */
  joinLobby(player, lobbyId) {
    const lobby = this.lobbies.get(String(lobbyId));
    if (!lobby) throw new ArenaError('Desafio não encontrado ou já iniciado.', 'no_lobby');
    if (lobby.host.id === player.id) throw new ArenaError('Não podes aceitar o teu próprio desafio.', 'self');
    if (this.inArenaMatch(player.id) || this.inArenaMatch(lobby.host.id)) throw new ArenaError('Um dos jogadores já está em competição.', 'busy');
    if (lobby.stakeKz > 0) {
      this.ledger.ensurePlayer(player.id);
      if (this.ledger.wallet(player.id).balanceKz < lobby.stakeKz) throw new ArenaError('Saldo demo insuficiente para aceitar este desafio.', 'insufficient_funds');
    }
    this.lobbies.delete(lobby.id);
    return this.startMatch({
      mode: lobby.mode,
      centerId: lobby.centerId,
      stakeKz: lobby.stakeKz,
      fighters: [
        { id: lobby.host.id, name: lobby.host.name, isBot: false },
        { id: player.id, name: player.displayName ?? player.id, isBot: false },
      ],
    });
  }

  /** Inicia um duelo imediato (contra oponente de treino da Arena ou modo Sobrevivência). */
  startInstantMatch(player, { mode = 'combate_1v1', botId = null, stakeKz = 0 } = {}) {
    if (this.inArenaMatch(player.id)) throw new ArenaError('Já estás numa competição em curso.', 'busy');
    const stake = Number(stakeKz) || 0;
    if (stake > 0) throw new ArenaError('Competições contra oponentes de treino são gratuitas. Para valer saldo demo, desafia outro jogador!', 'bot_stake');
    const center = mode === 'combate_1v1' ? COMPETITION_CENTERS.centro_combate : COMPETITION_CENTERS.arena_tiro;
    const botDef = ARENA_BOTS.find((b) => b.id === botId) ?? ARENA_BOTS.find((b) => b.mode === (mode === 'combate_1v1' ? 'combate_1v1' : 'tiro_1v1')) ?? ARENA_BOTS[0];
    return this.startMatch({
      mode,
      centerId: center.id,
      stakeKz: 0,
      fighters: [
        { id: player.id, name: player.displayName ?? player.id, isBot: false },
        { id: botDef.id, name: botDef.name, isBot: true, skill: botDef.skill, difficulty: botDef.difficulty },
      ],
    });
  }

  startMatch({ mode, centerId, stakeKz = 0, fighters }) {
    const center = COMPETITION_CENTERS[centerId] ?? COMPETITION_CENTERS.centro_combate;
    const matchId = `arenam_${randomUUID().slice(0, 10)}`;
    const now = this.now();

    if (stakeKz > 0) {
      if (fighters.some((f) => f.isBot)) throw new ArenaError('Bots não podem entrar em competições com saldo demo.', 'bot_stake');
      const ids = fighters.map((f) => f.id);
      this.ledger.openEscrow(matchId, ids, stakeKz);
      try {
        for (const id of ids) this.ledger.hold(matchId, id);
      } catch (e) {
        this.ledger.refund(matchId, 'falha_reserva');
        throw e;
      }
    }

    const stateFighters = fighters.map((f, idx) => {
      const sp = center.spawns[idx % center.spawns.length];
      if (!f.isBot) this.onTeleport(f.id, sp[0], sp[1], sp[2]);
      return {
        id: f.id,
        name: f.name,
        isBot: !!f.isBot,
        skill: f.skill ?? 0.55,
        hp: 100,
        maxHp: 100,
        ammo: mode === 'combate_1v1' ? 0 : 12,
        maxAmmo: mode === 'combate_1v1' ? 0 : 12,
        guardUntil: 0,
        lastActionAt: 0,
        score: 0,
        hitsLanded: 0,
        wave: 1,
        x: sp[0],
        z: sp[1],
        heading: sp[2],
      };
    });

    const match = {
      id: matchId,
      mode,
      centerId: center.id,
      centerName: center.name,
      stakeKz,
      split: calculatePrizeSplit(stakeKz, fighters.length, this.config.feePct),
      status: 'countdown',
      createdAt: now,
      goAt: now + this.config.countdownMs,
      endsAt: now + this.config.countdownMs + this.config.maxDurationMs,
      fighters: stateFighters,
      spectators: new Set(),
      events: [],
      settled: false,
    };
    this.matches.set(matchId, match);
    this.broadcastMatch(match, { t: 'arena_setup', match: this.serializeMatch(match) });
    return match;
  }

  spectate(player, matchId) {
    const match = this.matches.get(String(matchId)) ?? [...this.matches.values()][0];
    if (!match) throw new ArenaError('Nenhuma competição em curso neste momento.', 'no_match');
    const center = COMPETITION_CENTERS[match.centerId] ?? COMPETITION_CENTERS.centro_combate;
    match.spectators.add(player.id);
    this.onTeleport(player.id, center.spectatorSpot[0], center.spectatorSpot[1], center.spectatorSpot[2]);
    this.send(player.id, { t: 'arena_setup', match: this.serializeMatch(match), spectator: true });
    return match;
  }

  /** Processa acções de combate/tiro validadas pelo servidor. */
  onAction(playerId, { action = 'strike' } = {}) {
    const now = this.now();
    const match = [...this.matches.values()].find((m) => m.status === 'active' && m.fighters.some((f) => f.id === playerId));
    if (!match) return null;
    const me = match.fighters.find((f) => f.id === playerId);
    const opp = match.fighters.find((f) => f.id !== playerId);
    if (!me || !opp || me.hp <= 0 || opp.hp <= 0) return null;

    if (now - me.lastActionAt < 380) return null; // anti-spam cooldown autoritativo
    me.lastActionAt = now;

    if (action === 'guard') {
      me.guardUntil = now + 1400;
      this.broadcastMatch(match, { t: 'arena_state', match: this.serializeMatch(match), lastEvent: `${me.name} activou defesa táctica!` });
      return match;
    }

    if (action === 'reload' && match.mode !== 'combate_1v1') {
      me.ammo = me.maxAmmo;
      this.broadcastMatch(match, { t: 'arena_state', match: this.serializeMatch(match), lastEvent: `${me.name} recarregou (${me.ammo}/${me.maxAmmo}).` });
      return match;
    }

    let dmg = 0;
    let label = '';
    if (match.mode === 'combate_1v1') {
      if (action === 'heavy') {
        dmg = 22;
        label = 'Golpe Forte';
      } else {
        dmg = 14;
        label = 'Golpe Rápido';
      }
    } else {
      if (me.ammo <= 0) {
        me.ammo = me.maxAmmo;
        this.broadcastMatch(match, { t: 'arena_state', match: this.serializeMatch(match), lastEvent: `${me.name} recarregou automaticamente.` });
        return match;
      }
      me.ammo -= 1;
      dmg = action === 'aimed_shot' ? 24 : 16;
      label = action === 'aimed_shot' ? 'Disparo de Precisão' : 'Disparo Táctico';
    }

    if (opp.guardUntil > now) dmg = Math.max(4, Math.round(dmg * 0.35));
    opp.hp = Math.max(0, opp.hp - dmg);
    me.score += dmg;
    me.hitsLanded += 1;
    match.events.push({ at: now, by: me.id, action, dmg, oppHp: opp.hp });

    if (opp.hp <= 0) {
      if (match.mode === 'sobrevivencia' && opp.isBot && me.wave < 3) {
        me.wave += 1;
        opp.hp = 100;
        opp.name = `Onda ${me.wave} · Patrulha Táctica`;
        this.broadcastMatch(match, { t: 'arena_state', match: this.serializeMatch(match), lastEvent: `🔥 ${me.name} venceu a onda e avançou para a Ronda ${me.wave}/3!` });
        return match;
      }
      this.finishMatch(match, me.id, 'knockout');
      return match;
    }

    this.broadcastMatch(match, { t: 'arena_state', match: this.serializeMatch(match), lastEvent: `${me.name}: ${label} (-${dmg} HP)` });
    return match;
  }

  tick() {
    const now = this.now();
    for (const match of [...this.matches.values()]) {
      if (match.status === 'countdown' && now >= match.goAt) {
        match.status = 'active';
        this.broadcastMatch(match, { t: 'arena_go', matchId: match.id, match: this.serializeMatch(match) });
      }
      if (match.status !== 'active') continue;

      // Simulação autoritativa do oponente bot em treinos/sobrevivência
      const bot = match.fighters.find((f) => f.isBot && f.hp > 0);
      const human = match.fighters.find((f) => !f.isBot && f.hp > 0);
      if (bot && human && now - bot.lastActionAt >= Math.max(650, Math.round(1450 - bot.skill * 700))) {
        bot.lastActionAt = now;
        const dmg = Math.max(6, Math.round((match.mode === 'combate_1v1' ? 11 : 13) * (0.7 + bot.skill * 0.5)));
        const actual = human.guardUntil > now ? Math.max(3, Math.round(dmg * 0.35)) : dmg;
        human.hp = Math.max(0, human.hp - actual);
        bot.score += actual;
        bot.hitsLanded += 1;
        if (human.hp <= 0) {
          this.finishMatch(match, bot.id, 'knockout');
          continue;
        }
        this.broadcastMatch(match, { t: 'arena_state', match: this.serializeMatch(match), lastEvent: `${bot.name} atacou (-${actual} HP)` });
      }

      if (now >= match.endsAt) {
        const sorted = [...match.fighters].sort((a, b) => b.hp - a.hp || b.score - a.score);
        if (sorted[0].hp === sorted[1].hp && sorted[0].score === sorted[1].score) {
          this.finishMatch(match, null, 'draw');
        } else {
          this.finishMatch(match, sorted[0].id, 'time_decision');
        }
      }
    }
  }

  onDisconnect(playerId) {
    for (const [id, l] of this.lobbies) if (l.host.id === playerId) this.lobbies.delete(id);
    for (const match of [...this.matches.values()]) {
      match.spectators.delete(playerId);
      const idx = match.fighters.findIndex((f) => f.id === playerId);
      if (idx === -1) continue;
      const other = match.fighters.find((f) => f.id !== playerId);
      if (other && !other.isBot) {
        this.finishMatch(match, other.id, 'opponent_disconnect');
      } else {
        this.finishMatch(match, null, 'abandoned');
      }
    }
  }

  finishMatch(match, winnerId, reason = 'knockout') {
    if (match.settled || match.status === 'ended') return;
    match.settled = true;
    match.status = 'ended';
    const now = this.now();

    let settlement = null;
    if (match.stakeKz > 0) {
      if (winnerId) {
        settlement = this.ledger.settle(match.id, winnerId, { decidedBy: 'competition_server' });
      } else {
        this.ledger.refund(match.id, reason);
        settlement = { refunded: true, reason };
      }
    }

    for (const f of match.fighters) {
      if (!f.isBot) this.store.recordRaceStats(f.id, f.id === winnerId, null);
    }

    const record = {
      matchId: match.id,
      mode: match.mode,
      centerId: match.centerId,
      centerName: match.centerName,
      stakeKz: match.stakeKz,
      split: match.split,
      startedAt: match.goAt,
      endedAt: now,
      winnerId: winnerId ?? null,
      reason,
      fighters: match.fighters.map((f) => ({ id: f.id, name: f.name, isBot: f.isBot, hp: f.hp, score: f.score, hitsLanded: f.hitsLanded, wave: f.wave })),
      settlement,
    };
    const hash = hashArenaMatch(record);
    this.store.saveArenaMatch(record, hash);
    this.store.audit('arena_match_end', { matchId: match.id, mode: match.mode, winnerId, stakeKz: match.stakeKz, hash });
    this.broadcastMatch(match, { t: 'arena_result', record, hash });
    this.matches.delete(match.id);
  }

  serializeMatch(m) {
    return {
      matchId: m.id,
      mode: m.mode,
      centerId: m.centerId,
      centerName: m.centerName,
      status: m.status,
      stakeKz: m.stakeKz,
      split: m.split,
      goAt: m.goAt,
      endsAt: m.endsAt,
      fighters: m.fighters.map((f) => ({ id: f.id, name: f.name, isBot: f.isBot, hp: f.hp, maxHp: f.maxHp, ammo: f.ammo, maxAmmo: f.maxAmmo, score: f.score, wave: f.wave })),
      spectators: m.spectators.size,
    };
  }

  broadcastMatch(match, msg) {
    for (const f of match.fighters) if (!f.isBot) this.send(f.id, msg);
    for (const sid of match.spectators) this.send(sid, msg);
  }
}
