/**
 * Texturas de tecido, pele e cabelo geradas em canvas (sem ficheiros externos):
 * malha de algodão, ganga com sarja e pespontos, capulana, riscas, acolchoado,
 * fato de treino com riscas laterais, uniforme, fios de cabelo.
 */
import * as THREE from 'three';
import { makeRng } from '../../../shared/rng.js';

const cache = new Map();

function tex(key, w, h, draw, repeat = [1, 1]) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

function shade(hex, k) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
}

/** Malha de algodão (t-shirt, pólo, hoodie). */
export function knit(color) {
  return tex(`knit:${color}`, 128, 128, (g, w, h) => {
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) {
      g.fillStyle = y % 4 ? shade(color, 1.04) : shade(color, 0.94);
      g.fillRect(0, y, w, 1);
    }
    const rng = makeRng(color);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${rng.next() * 0.05})`; g.fillRect(rng.next() * w, rng.next() * h, 2, 1); }
  }, [3, 3]);
}

/** Ganga com sarja diagonal, costuras laranja e bolsos. */
export function denim(color) {
  return tex(`denim:${color}`, 256, 256, (g, w, h) => {
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    for (let i = -h; i < w; i += 3) {
      g.strokeStyle = `rgba(255,255,255,${0.06 + (i % 9 === 0 ? 0.05 : 0)})`;
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke();
    }
    const rng = makeRng(`d${color}`);
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(255,255,255,${rng.next() * 0.08})`; g.fillRect(rng.next() * w, rng.next() * h, 3, 1); }
    g.strokeStyle = '#c98a3a';
    g.setLineDash([4, 3]);
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(w * 0.25, 0); g.lineTo(w * 0.25, h); g.moveTo(w * 0.75, 0); g.lineTo(w * 0.75, h); g.stroke();
  }, [2, 2]);
}

export function stripes(color, stripe = 'rgba(255,255,255,0.8)') {
  return tex(`stripes:${color}:${stripe}`, 128, 128, (g, w, h) => {
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    g.fillStyle = stripe;
    for (let y = 0; y < h; y += 16) g.fillRect(0, y, w, 5);
  }, [2, 4]);
}

/** Capulana: padrão original de círculos e losangos em cores fortes. */
export function capulana(color) {
  return tex(`capulana:${color}`, 256, 256, (g, w, h) => {
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    const cols = ['#f9a825', '#0d47a1', '#ffffff', '#1b5e20', '#4e342e', '#e65100'];
    for (let y = 0; y < h; y += 64) {
      for (let x = 0; x < w; x += 64) {
        const i = ((x + y) / 64) % cols.length;
        g.fillStyle = cols[i];
        g.beginPath(); g.arc(x + 32, y + 32, 24, 0, Math.PI * 2); g.fill();
        g.fillStyle = color;
        g.beginPath(); g.arc(x + 32, y + 32, 14, 0, Math.PI * 2); g.fill();
        g.fillStyle = cols[(i + 2) % cols.length];
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          g.beginPath(); g.arc(x + 32 + Math.cos(a) * 19, y + 32 + Math.sin(a) * 19, 3, 0, Math.PI * 2); g.fill();
        }
        g.fillStyle = cols[(i + 4) % cols.length];
        g.beginPath(); g.moveTo(x, y + 32); g.lineTo(x + 6, y + 26); g.lineTo(x + 12, y + 32); g.lineTo(x + 6, y + 38); g.fill();
      }
    }
  }, [2, 2]);
}

/** Acolchoado (colete): faixas horizontais com costuras. */
export function quilted(color) {
  return tex(`quilt:${color}`, 128, 128, (g, w, h) => {
    for (let y = 0; y < h; y += 32) {
      const grad = g.createLinearGradient(0, y, 0, y + 32);
      grad.addColorStop(0, shade(color, 0.8));
      grad.addColorStop(0.5, shade(color, 1.15));
      grad.addColorStop(1, shade(color, 0.75));
      g.fillStyle = grad;
      g.fillRect(0, y, w, 32);
    }
  }, [2, 5]);
}

export function tracksuit(color) {
  return tex(`track:${color}`, 128, 128, (g, w, h) => {
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff';
    g.fillRect(w * 0.47, 0, 3, h);
    g.fillRect(w * 0.53, 0, 3, h);
  }, [1, 1]);
}

export function leather(color) {
  return tex(`leather:${color}`, 64, 64, (g, w, h) => {
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    const rng = makeRng(`l${color}`);
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(255,255,255,${rng.next() * 0.05})`; g.fillRect(rng.next() * w, rng.next() * h, 1, 1); }
  });
}

/** Fios de cabelo (para calotes e penteados). */
export function hairStrands(color, coily = false) {
  return tex(`hair:${color}:${coily}`, 256, 256, (g, w, h) => {
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    const rng = makeRng(`h${color}${coily}`);
    for (let i = 0; i < (coily ? 2600 : 1400); i++) {
      const x = rng.next() * w;
      const y = rng.next() * h;
      g.strokeStyle = rng.next() > 0.5 ? `rgba(255,255,255,${0.04 + rng.next() * 0.06})` : `rgba(0,0,0,${0.1 + rng.next() * 0.15})`;
      g.lineWidth = 1;
      g.beginPath();
      if (coily) g.arc(x, y, 1.5 + rng.next() * 2, 0, Math.PI * 1.6);
      else { g.moveTo(x, y); g.quadraticCurveTo(x + 3, y + 12, x + rng.next() * 4 - 2, y + 26); }
      g.stroke();
    }
  }, [2, 2]);
}

/** Pele com variação subtil (poros/tom), mantém o tom escolhido. */
export function skin(color) {
  return tex(`skin:${color}`, 128, 128, (g, w, h) => {
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    const rng = makeRng(`s${color}`);
    for (let i = 0; i < 1600; i++) {
      g.fillStyle = rng.next() > 0.5 ? `rgba(255,220,200,${rng.next() * 0.035})` : `rgba(60,20,10,${rng.next() * 0.04})`;
      g.fillRect(rng.next() * w, rng.next() * h, 2, 2);
    }
  }, [4, 4]);
}

export function printedText(text, bg, fg) {
  return tex(`print:${text}:${bg}`, 256, 256, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.font = 'bold 30px Rajdhani, Arial';
    g.textAlign = 'center';
    g.fillText(text, w * 0.25, h * 0.55);
    g.fillText(text, w * 0.75, h * 0.55);
  });
}
