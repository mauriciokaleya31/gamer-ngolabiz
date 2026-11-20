/**
 * Texturas procedurais geradas em canvas (sem ficheiros externos): asfalto, calçada
 * portuguesa (incluindo a calçada ondulada típica de Luanda), relva, fachadas com
 * janelas e máscara de iluminação nocturna, letreiros. São recursos PROVISÓRIOS
 * originais; o cliente UE5 usa materiais PBR feitos no editor.
 */
import * as THREE from 'three';
import { makeRng } from '../../shared/rng.js';

const cache = new Map();
const maxAniso = { value: 4 };
export function setMaxAnisotropy(v) { maxAniso.value = v; }

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAniso.value;
  return t;
}

function noise(g, w, h, rng, count, colors, size = [1, 3]) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = colors[Math.floor(rng.next() * colors.length)];
    const s = size[0] + rng.next() * (size[1] - size[0]);
    g.fillRect(rng.next() * w, rng.next() * h, s, s);
  }
}

export function asphaltTexture() {
  if (cache.has('asphalt')) return cache.get('asphalt');
  const [c, g] = canvas(512, 512);
  const rng = makeRng('asfalto');
  g.fillStyle = '#3a3c3f';
  g.fillRect(0, 0, 512, 512);
  noise(g, 512, 512, rng, 26000, ['#2f3134', '#45474b', '#35373a', '#505256', '#2a2b2d'], [1, 2.5]);
  // remendos e manchas de óleo
  for (let i = 0; i < 6; i++) {
    g.fillStyle = `rgba(20,20,22,${0.15 + rng.next() * 0.2})`;
    g.beginPath();
    g.ellipse(rng.next() * 512, rng.next() * 512, 20 + rng.next() * 50, 10 + rng.next() * 30, rng.next() * 3, 0, Math.PI * 2);
    g.fill();
  }
  const t = toTexture(c);
  cache.set('asphalt', t);
  return t;
}

export function sidewalkTexture() {
  if (cache.has('sidewalk')) return cache.get('sidewalk');
  const [c, g] = canvas(256, 256);
  const rng = makeRng('passeio');
  g.fillStyle = '#c9c3b6';
  g.fillRect(0, 0, 256, 256);
  // calçada de pedra pequena
  for (let y = 0; y < 256; y += 8) {
    for (let x = (y / 8) % 2 ? 4 : 0; x < 256; x += 8) {
      const v = 190 + Math.floor(rng.next() * 40);
      g.fillStyle = `rgb(${v},${v - 6},${v - 16})`;
      g.fillRect(x + 0.5, y + 0.5, 7, 7);
    }
  }
  const t = toTexture(c);
  cache.set('sidewalk', t);
  return t;
}

/** Calçada portuguesa ondulada (preto e branco), como em várias praças de Luanda. */
export function wavePavementTexture() {
  if (cache.has('wave')) return cache.get('wave');
  const [c, g] = canvas(512, 512);
  const rng = makeRng('ondas');
  for (let y = 0; y < 512; y += 4) {
    for (let x = 0; x < 512; x += 4) {
      const wave = Math.sin((x / 512) * Math.PI * 4 + (y / 512) * Math.PI * 2) * 40;
      const band = Math.floor((y + wave) / 32) % 2;
      const v = band ? 58 + rng.next() * 22 : 196 + rng.next() * 26;
      g.fillStyle = `rgb(${v},${v - 2},${v - (band ? 0 : 10)})`;
      g.fillRect(x + 0.3, y + 0.3, 3.4, 3.4);
    }
  }
  const t = toTexture(c);
  cache.set('wave', t);
  return t;
}

export function grassTexture() {
  if (cache.has('grass')) return cache.get('grass');
  const [c, g] = canvas(256, 256);
  const rng = makeRng('relva');
  g.fillStyle = '#4f7a3a';
  g.fillRect(0, 0, 256, 256);
  noise(g, 256, 256, rng, 9000, ['#5d8b42', '#43692f', '#6a9a4c', '#3c5d2a', '#7a8f45'], [1, 2]);
  const t = toTexture(c);
  cache.set('grass', t);
  return t;
}

export function dirtTexture() {
  if (cache.has('dirt')) return cache.get('dirt');
  const [c, g] = canvas(256, 256);
  const rng = makeRng('terra');
  g.fillStyle = '#9b7653';
  g.fillRect(0, 0, 256, 256);
  noise(g, 256, 256, rng, 8000, ['#a5805c', '#8c6a49', '#b48d66', '#7d5e40'], [1, 3]);
  const t = toTexture(c);
  cache.set('dirt', t);
  return t;
}

export function courtTexture() {
  if (cache.has('court')) return cache.get('court');
  const [c, g] = canvas(256, 256);
  const rng = makeRng('arena');
  g.fillStyle = '#a2412e';
  g.fillRect(0, 0, 256, 256);
  noise(g, 256, 256, rng, 5000, ['#ad4a35', '#963a28', '#b65640'], [1, 2]);
  const t = toTexture(c);
  cache.set('court', t);
  return t;
}

export const FACADE_TILE = { bays: 4, floors: 4, bayW: 3.5, floorH: 3.2 };

/**
 * Fachada em mosaico 4 vãos × 4 pisos. Devolve { map, emissive } onde emissive é uma
 * máscara de dados: R = limiar aleatório de iluminação da janela (0 = parede),
 * G = intensidade. O shader acende janelas cujo limiar < fracção de luzes acesas.
 */
export function facadeTextures(style, color, seed) {
  const key = `facade:${style}:${color}:${seed}`;
  if (cache.has(key)) return cache.get(key);
  const W = 512;
  const H = 512;
  const [c, g] = canvas(W, H);
  const [ce, ge] = canvas(W, H);
  const rng = makeRng(key);
  const bw = W / FACADE_TILE.bays;
  const fh = H / FACADE_TILE.floors;
  g.fillStyle = color;
  g.fillRect(0, 0, W, H);
  // textura de reboco/betão
  const col = new THREE.Color(color);
  for (let i = 0; i < 9000; i++) {
    const k = 0.9 + rng.next() * 0.18;
    g.fillStyle = `rgba(${Math.min(255, col.r * 255 * k) | 0},${Math.min(255, col.g * 255 * k) | 0},${Math.min(255, col.b * 255 * k) | 0},0.5)`;
    g.fillRect(rng.next() * W, rng.next() * H, 2, 2);
  }
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, W, H);
  const glassy = style === 'glass';
  for (let f = 0; f < FACADE_TILE.floors; f++) {
    // linha de laje
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(0, f * fh + fh - 6, W, 6);
    for (let b = 0; b < FACADE_TILE.bays; b++) {
      const x0 = b * bw;
      const y0 = f * fh;
      let wx = x0 + bw * 0.18;
      let wy = y0 + fh * 0.22;
      let ww = bw * 0.64;
      let wh = fh * 0.55;
      if (glassy) { wx = x0 + 3; wy = y0 + 4; ww = bw - 6; wh = fh - 14; }
      // varanda em edifícios residenciais
      if (style === 'residential' && (b + f) % 3 === 0) {
        g.fillStyle = 'rgba(40,40,40,0.55)';
        g.fillRect(wx - 6, wy + wh + 2, ww + 12, 8);
        g.fillStyle = 'rgba(255,255,255,0.35)';
        for (let k = 0; k < ww + 12; k += 8) g.fillRect(wx - 6 + k, wy + wh - 16, 2, 18);
      }
      // moldura
      g.fillStyle = glassy ? '#596876' : 'rgba(255,255,255,0.55)';
      g.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
      // vidro com reflexo do céu (gradiente)
      const grad = g.createLinearGradient(wx, wy, wx + ww, wy + wh);
      grad.addColorStop(0, glassy ? '#6f8eab' : '#33475b');
      grad.addColorStop(1, glassy ? '#2d3f52' : '#1c2733');
      g.fillStyle = grad;
      g.fillRect(wx, wy, ww, wh);
      // cortinas/estores aleatórios
      if (!glassy && rng.next() < 0.45) {
        g.fillStyle = `rgba(${200 + rng.next() * 55 | 0},${180 + rng.next() * 60 | 0},${150 + rng.next() * 60 | 0},0.65)`;
        g.fillRect(wx, wy, ww, wh * (0.2 + rng.next() * 0.5));
      }
      if (!glassy) {
        g.fillStyle = 'rgba(255,255,255,0.5)';
        g.fillRect(wx + ww / 2 - 1, wy, 2, wh);
      }
      // máscara de iluminação
      const threshold = 0.04 + rng.next() * 0.96;
      const intensity = 0.55 + rng.next() * 0.45;
      ge.fillStyle = `rgb(${Math.round(threshold * 255)},${Math.round(intensity * 255)},0)`;
      ge.fillRect(wx, wy, ww, wh);
    }
  }
  // ar condicionados (detalhe de uso quotidiano)
  if (!glassy) {
    for (let i = 0; i < 3; i++) {
      const b = Math.floor(rng.next() * FACADE_TILE.bays);
      const f = Math.floor(rng.next() * FACADE_TILE.floors);
      g.fillStyle = '#d8d8d8';
      g.fillRect(b * bw + bw * 0.62, f * fh + fh * 0.8, 22, 12);
    }
  }
  const out = { map: toTexture(c), emissive: toTexture(ce, { srgb: false }) };
  out.emissive.magFilter = THREE.NearestFilter;
  out.emissive.minFilter = THREE.NearestFilter;
  out.emissive.generateMipmaps = false;
  cache.set(key, out);
  return out;
}

/** Rés-do-chão comercial: montras, porta e toldo pintado. */
export function shopfrontTexture(color, seed) {
  const key = `shop:${color}:${seed}`;
  if (cache.has(key)) return cache.get(key);
  const [c, g] = canvas(512, 128);
  const [ce, ge] = canvas(512, 128);
  g.fillStyle = '#3b3b3b';
  g.fillRect(0, 0, 512, 128);
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 4; i++) {
    const x = i * 128 + 8;
    const grad = g.createLinearGradient(x, 20, x + 110, 120);
    grad.addColorStop(0, '#8fb3c9');
    grad.addColorStop(1, '#2a3b48');
    g.fillStyle = grad;
    g.fillRect(x, 24, 112, 96);
    g.fillStyle = '#e6e2d8';
    g.fillRect(x - 4, 20, 120, 4);
    // produtos na montra
    const rng = makeRng(`${key}:${i}`);
    for (let k = 0; k < 7; k++) {
      g.fillStyle = ['#e53935', '#fdd835', '#43a047', '#1e88e5', '#fb8c00'][k % 5];
      g.fillRect(x + 8 + rng.next() * 90, 80 + rng.next() * 30, 10, 12);
    }
    ge.fillStyle = 'rgb(20,255,0)'; // montras: limiar baixo → acesas cedo
    ge.fillRect(x, 24, 112, 96);
  }
  g.fillStyle = color;
  for (let x = 0; x < 512; x += 32) {
    g.fillStyle = (x / 32) % 2 ? color : '#f5f5f5';
    g.fillRect(x, 0, 32, 18);
  }
  const out = { map: toTexture(c), emissive: toTexture(ce, { srgb: false }) };
  cache.set(key, out);
  return out;
}

export function houseTexture(color, seed) {
  const key = `house:${color}:${seed}`;
  if (cache.has(key)) return cache.get(key);
  const [c, g] = canvas(256, 256);
  const [ce, ge] = canvas(256, 256);
  const rng = makeRng(key);
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(0,0,0,${rng.next() * 0.06})`; g.fillRect(rng.next() * 256, rng.next() * 256, 2, 2); }
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, 256, 256);
  // rodapé
  g.fillStyle = 'rgba(80,60,40,0.35)';
  g.fillRect(0, 236, 256, 20);
  for (const [x, y] of [[30, 60], [150, 60], [30, 170], [150, 170]]) {
    g.fillStyle = '#f2f2f2';
    g.fillRect(x - 4, y - 4, 78, 58);
    g.fillStyle = '#2b3a48';
    g.fillRect(x, y, 70, 50);
    // grades de janela (comuns em Luanda)
    g.strokeStyle = 'rgba(30,30,30,0.8)';
    g.lineWidth = 2;
    for (let k = 8; k < 70; k += 10) { g.beginPath(); g.moveTo(x + k, y); g.lineTo(x + k, y + 50); g.stroke(); }
    const th = 0.05 + rng.next() * 0.9;
    ge.fillStyle = `rgb(${Math.round(th * 255)},220,0)`;
    ge.fillRect(x, y, 70, 50);
  }
  const out = { map: toTexture(c), emissive: toTexture(ce, { srgb: false }) };
  cache.set(key, out);
  return out;
}

export function signTexture(text, { bg = '#111', fg = '#fff', w = 512, h = 96 } = {}) {
  const key = `sign:${text}:${bg}:${fg}`;
  if (cache.has(key)) return cache.get(key);
  const [c, g] = canvas(w, h);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.font = `bold ${Math.floor(h * 0.55)}px Rajdhani, Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 2, w - 20);
  const t = toTexture(c, { repeat: false });
  cache.set(key, t);
  return t;
}

export function cloudTexture() {
  if (cache.has('clouds')) return cache.get('clouds');
  const [c, g] = canvas(512, 512);
  const rng = makeRng('nuvens');
  g.clearRect(0, 0, 512, 512);
  for (let i = 0; i < 140; i++) {
    const x = rng.next() * 512;
    const y = rng.next() * 512;
    const r = 20 + rng.next() * 70;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    for (const [dx, dy] of [[0, 0], [512, 0], [-512, 0], [0, 512], [0, -512]]) { g.save(); g.translate(dx, dy); g.fillRect(x - r, y - r, r * 2, r * 2); g.restore(); }
  }
  const t = toTexture(c);
  cache.set('clouds', t);
  return t;
}
