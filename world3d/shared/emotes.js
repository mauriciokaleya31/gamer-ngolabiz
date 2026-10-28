/**
 * Biblioteca de emotes e emojis (dados). Adicionar um emote = acrescentar uma entrada
 * aqui com a sua animação (faixas de pose em web/js/emoteAnimations.js; no UE5, um
 * Animation Montage com o mesmo id). O servidor valida id, estado, regras e ritmo;
 * o administrador pode activar/desactivar cada emote sem reconstruir o sistema.
 *
 * Campos:
 *  id, name, category, icon (miniatura emoji), anim (id da animação), durationMs,
 *  loop (repete até o jogador se mexer), rules { onFoot, inVehicle, inRace, cooldownMs },
 *  active, platforms (web, ue5), interruptible (movimento cancela).
 */
export const EMOTE_CATEGORIES = Object.freeze({
  saudacao: 'Saudação',
  reaccao: 'Reacção',
  celebracao: 'Celebração',
  danca: 'Dança',
  gesto: 'Gesto',
  descanso: 'Descanso',
});

const E = (id, name, category, icon, durationMs, extra = {}) => ({
  id, name, category, icon, anim: id, durationMs,
  loop: false, interruptible: true, active: true, platforms: ['web', 'ue5'],
  rules: { onFoot: true, inVehicle: false, inRace: false, cooldownMs: 1200 },
  ...extra,
});

export const EMOTES = Object.freeze([
  E('acenar', 'Acenar', 'saudacao', '👋', 2200),
  E('positivo', 'Positivo', 'gesto', '👍', 1800),
  E('negativo', 'Desaprovar', 'gesto', '👎', 1800),
  E('rir', 'Rir', 'reaccao', '😂', 2600),
  E('aplaudir', 'Aplaudir', 'celebracao', '👏', 2600),
  E('celebrar', 'Celebrar vitória', 'celebracao', '🏆', 2800),
  E('surpresa', 'Surpresa', 'reaccao', '😮', 2000),
  E('tristeza', 'Tristeza', 'reaccao', '😢', 3000),
  E('desculpa', 'Pedir desculpa', 'gesto', '🙏', 2400),
  E('apontar', 'Apontar', 'gesto', '👉', 2000),
  E('pensar', 'Pensar', 'gesto', '🤔', 2600),
  E('chamar', 'Provocar (vem cá!)', 'gesto', '😏', 2200),
  E('danca_kuduro', 'Dança Kuduro', 'danca', '🕺', 6000, { loop: true }),
  E('danca_semba', 'Dança Semba', 'danca', '💃', 6000, { loop: true }),
  E('sentar_chao', 'Sentar no chão', 'descanso', '🧘', 4000, { loop: true }),
  E('bracos_cruzados', 'Braços cruzados', 'descanso', '🙅', 3000, { loop: true }),
]);

export const EMOTE_BY_ID = new Map(EMOTES.map((e) => [e.id, e]));

/** Painel de emojis por categoria (reacções rápidas sobre a personagem). */
export const EMOJI_CATEGORIES = Object.freeze({
  alegria: { name: 'Alegria', list: ['😀', '😄', '😊', '🙂', '😎', '🤩'] },
  riso: { name: 'Riso', list: ['😂', '🤣', '😆', '😹'] },
  amor: { name: 'Amor e amizade', list: ['❤️', '😍', '🤗', '🤝', '💛', '🫶'] },
  surpresa: { name: 'Surpresa', list: ['😮', '😲', '🤯', '😳'] },
  tristeza: { name: 'Tristeza', list: ['😢', '😭', '😞', '🥺'] },
  raiva: { name: 'Raiva', list: ['😠', '😤', '🙄'] },
  celebracao: { name: 'Celebração', list: ['🎉', '🥳', '🏆', '🔥', '💯', '🏁'] },
  aprovacao: { name: 'Aprovação', list: ['👍', '👎', '👌', '✅', '❌'] },
  rapidas: { name: 'Reacções rápidas', list: ['👋', '🙏', '💪', '⚡', '🚗', '🏍️'] },
});

export const ALLOWED_EMOJIS = new Set(Object.values(EMOJI_CATEGORIES).flatMap((c) => c.list));

export const EMOTE_LIMITS = Object.freeze({
  perMinute: 20,
  emojiPerMinute: 30,
  minIntervalMs: 800,
  broadcastRadius: 60,
  maxFavorites: 8,
  emojiDisplayMs: 2600,
});
