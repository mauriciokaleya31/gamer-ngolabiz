/**
 * Animações dos emotes: cada uma é uma função (t em segundos) → pose parcial
 * (rotações de ossos, altura da anca, expressão facial, pose das mãos) ou null
 * quando termina. As funções são puras e deterministas, por isso todos os clientes
 * reproduzem o mesmo movimento a partir do instante enviado pelo servidor.
 *
 * Convenções: +X = esquerda da personagem. Braço: rotação X negativa = para a
 * frente; Z positivo levanta o braço esquerdo para fora, Z negativo o direito.
 */
import { EMOTE_BY_ID } from '../../../shared/emotes.js';

const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
/** Envelope de entrada/saída (0→1→0) para emotes com duração. */
const env = (t, dur, inT = 0.25, outT = 0.3) => Math.min(ease(t / inT), ease((dur - t) / outT));
const mix = (k, pose) => {
  const out = {};
  for (const [key, v] of Object.entries(pose)) {
    if (Array.isArray(v)) out[key] = v.map((x) => x * k);
    else if (key === 'hipsY') out[key] = v * k;
    else out[key] = v;
  }
  return out;
};

const ANIMS = {
  acenar: (t) => ({
    upperArmR: [-0.3, 0, -2.55], foreArmR: [-0.3, 0, -0.35 + Math.sin(t * 10) * 0.5], head: [0, -0.15, 0.08],
    face: { smile: 0.9 }, hand: { R: 'open' },
  }),
  positivo: (t) => ({
    upperArmR: [-1.3, 0, -0.35], foreArmR: [-0.9 - Math.sin(Math.min(1, t * 4) * Math.PI) * 0.2, 0.4, 0], spine: [-0.04, 0, 0], head: [0.1, 0, 0],
    face: { smile: 0.8 }, hand: { R: 'thumb' },
  }),
  negativo: () => ({
    upperArmR: [-1.2, 0, -0.35], foreArmR: [-0.8, 0.4, 0], handR: [Math.PI, 0, 0], head: [0, Math.sin(performance.now() / 120) * 0.15, 0],
    face: { sad: 0.6, browAngry: 0.4 }, hand: { R: 'thumb' },
  }),
  rir: (t) => ({
    spine: [0.25 + Math.sin(t * 16) * 0.05, 0, 0], chest: [Math.sin(t * 16) * 0.04, 0, 0], head: [-0.35, 0, 0],
    upperArmL: [-0.5, 0, 0.35], upperArmR: [-0.5, 0, -0.35], foreArmL: [-1.4, 0, 0], foreArmR: [-1.4, 0, 0],
    hipsY: -0.02 + Math.abs(Math.sin(t * 16)) * 0.01,
    face: { smile: 1, open: 0.7, browUp: 0.3 }, hand: { L: 'fist', R: 'fist' },
  }),
  aplaudir: (t) => {
    const c = Math.abs(Math.sin(t * 9));
    return {
      upperArmL: [-1.25, 0, 0.35 - c * 0.3], upperArmR: [-1.25, 0, -0.35 + c * 0.3], foreArmL: [-1.0, -0.4, 0], foreArmR: [-1.0, 0.4, 0],
      face: { smile: 0.8, open: 0.2 }, hand: { L: 'clap', R: 'clap' },
    };
  },
  celebrar: (t) => {
    const j = Math.max(0, Math.sin(t * 6));
    return {
      upperArmR: [-0.3, 0, -2.8], foreArmR: [-0.2, 0, -0.1], upperArmL: [-0.3, 0, 2.8 - Math.sin(t * 12) * 0.2], foreArmL: [-0.2, 0, 0.1],
      hipsY: j * 0.12, thighL: [-j * 0.5, 0, 0], thighR: [-j * 0.5, 0, 0], shinL: [j * 0.9, 0, 0], shinR: [j * 0.9, 0, 0],
      head: [-0.3, 0, 0], face: { smile: 1, open: 0.8, browUp: 0.5 }, hand: { L: 'fist', R: 'fist' },
    };
  },
  surpresa: (t) => ({
    upperArmL: [-1.7, 0, 0.6], upperArmR: [-1.7, 0, -0.6], foreArmL: [-1.6, 0, 0], foreArmR: [-1.6, 0, 0], spine: [-0.15, 0, 0], head: [-0.15, 0, 0],
    hipsY: t < 0.3 ? 0.03 : 0, face: { round: 0.9, browUp: 1 }, hand: { L: 'open', R: 'open' },
  }),
  tristeza: () => ({
    spine: [0.35, 0, 0], chest: [0.15, 0, 0], neck: [0.3, 0, 0], head: [0.35, 0, 0], upperArmL: [0.1, 0, 0.03], upperArmR: [0.1, 0, -0.03],
    hipsY: -0.02, face: { sad: 1, smile: 0 }, hand: { L: 'relaxed', R: 'relaxed' },
  }),
  desculpa: (t) => ({
    upperArmR: [-1.0, 0, 0.35], foreArmR: [-1.9, 0, 0], upperArmL: [-0.2, 0, 0.1],
    spine: [0.35 * Math.min(1, Math.sin(Math.min(1, t / 1.2) * Math.PI) + 0.4), 0, 0], head: [0.25, 0, 0],
    face: { sad: 0.4, smile: 0.2 }, hand: { R: 'open' },
  }),
  apontar: (t, h) => {
    const d = h.emote?.dir;
    const yaw = d === null || d === undefined ? 0 : d;
    return {
      chest: [0, yaw * 0.4, 0], upperArmR: [-1.55, 0, -0.15], foreArmR: [-0.05, 0, 0], head: [0, yaw * 0.5, 0],
      face: { browUp: 0.3, open: Math.min(1, t * 3) * 0.2 }, hand: { R: 'point' },
    };
  },
  pensar: () => ({
    upperArmR: [-0.9, 0, 0.25], foreArmR: [-2.0, 0.3, 0], upperArmL: [-0.6, 0, -0.35], foreArmL: [-1.6, 0, 0],
    head: [0.15, 0.2, 0.12], face: { browAngry: 0.2, smile: -0.1 }, hand: { R: 'fist', L: 'open' },
  }),
  chamar: (t) => ({
    upperArmR: [-1.2, 0.2, -0.2], foreArmR: [-0.6 - Math.max(0, Math.sin(t * 7)) * 1.2, 0, 0], head: [-0.1, 0, -0.12], hips: [0, 0, 0.06],
    face: { smile: 0.8, browUp: 0.4 }, hand: { R: 'open' },
  }),
  danca_kuduro: (t) => {
    // passos rápidos e energéticos, braços a "cortar" o ar (inspirado no kuduro, coreografia original)
    const b = t * Math.PI * 2 * 2.2;
    const s = Math.sin(b);
    const c = Math.cos(b);
    return {
      hipsY: -0.06 + Math.abs(s) * 0.05, hips: [0, s * 0.35, s * 0.08], spine: [0.15, -s * 0.2, 0], chest: [0, s * 0.25, 0],
      thighL: [-0.4 - Math.max(0, s) * 0.5, 0, 0.15], thighR: [-0.4 - Math.max(0, -s) * 0.5, 0, -0.15], shinL: [0.7 + Math.max(0, s) * 0.5, 0, 0], shinR: [0.7 + Math.max(0, -s) * 0.5, 0, 0],
      upperArmL: [-1.2 + c * 0.6, 0, 0.6 + s * 0.3], upperArmR: [-1.2 - c * 0.6, 0, -0.6 + s * 0.3], foreArmL: [-1.3, 0, 0], foreArmR: [-1.3, 0, 0],
      head: [0.1, -s * 0.2, 0], face: { smile: 0.9, open: 0.25 }, hand: { L: 'fist', R: 'fist' },
    };
  },
  danca_semba: (t) => {
    // movimento fluido de anca e ombros, passos laterais (inspirado na semba)
    const b = t * Math.PI * 2 * 1.1;
    const s = Math.sin(b);
    const c = Math.cos(b);
    return {
      hipsY: -0.03 + Math.abs(c) * 0.02, hipsX: s * 0.06, hips: [0, s * 0.2, -s * 0.12], spine: [0.05, 0, s * 0.1], chest: [0, -s * 0.15, -s * 0.08],
      thighL: [-Math.max(0, s) * 0.35, 0, 0.12 * c], thighR: [-Math.max(0, -s) * 0.35, 0, 0.12 * c], shinL: [Math.max(0, s) * 0.5, 0, 0], shinR: [Math.max(0, -s) * 0.5, 0, 0],
      upperArmL: [-0.6, 0, 0.9 + c * 0.2], upperArmR: [-0.6, 0, -0.9 + c * 0.2], foreArmL: [-0.9, 0, 0], foreArmR: [-0.9, 0, 0],
      head: [0, s * 0.25, s * 0.08], face: { smile: 0.8 }, hand: { L: 'open', R: 'open' },
    };
  },
  sentar_chao: () => ({
    hipsY: -0.82, thighL: [-1.45, 0.4, 0.35], thighR: [-1.45, -0.4, -0.35], shinL: [2.2, 0, 0], shinR: [2.2, 0, 0], spine: [0.15, 0, 0],
    upperArmL: [-0.5, 0, 0.1], upperArmR: [-0.5, 0, -0.1], foreArmL: [-0.4, 0, 0], foreArmR: [-0.4, 0, 0], face: { smile: 0.3 },
  }),
  bracos_cruzados: (t) => ({
    upperArmL: [-0.55, 0, 0.0], upperArmR: [-0.55, 0, 0.0], foreArmL: [-1.75, 0.9, 0], foreArmR: [-1.75, -0.9, 0],
    hips: [0, 0, 0.05], head: [0, Math.sin(t * 0.5) * 0.25, 0], face: { smile: 0.15, browAngry: 0.15 },
  }),
};

/** Devolve a função de animação para um id (com envelope e fim automático). */
export function emoteAnimation(id) {
  const def = EMOTE_BY_ID.get(id);
  const fn = ANIMS[id];
  if (!def || !fn) return null;
  const dur = def.durationMs / 1000;
  return (t, h) => {
    if (!def.loop && t > dur) return null;
    const k = def.loop ? ease(t / 0.3) : env(t, dur);
    const pose = fn(t, h);
    const out = mix(k, pose);
    out.face = Object.fromEntries(Object.entries(pose.face ?? {}).map(([kk, v]) => [kk, v * k]));
    out.hand = k > 0.4 ? pose.hand ?? {} : {};
    return out;
  };
}

export const ANIMATED_EMOTES = Object.keys(ANIMS);
