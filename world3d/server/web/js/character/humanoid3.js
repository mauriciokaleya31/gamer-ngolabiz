/**
 * Personagem v3 — corpo esculpido por campos de distância (SDF) + Surface Nets,
 * esqueleto com skinning real (sem juntas visíveis entre tronco/membros/roupa).
 *
 * Porta da versão "personagens v3" fornecida pelo utilizador, com estas adaptações
 * para se integrar no resto do jogo sem reescrever o sistema já testado:
 *  - Nomes dos ossos traduzidos para os nomes canónicos usados pelo motor de poses
 *    e pela biblioteca de emotes (hips/spine/chest/neck/head/upperArmL…), para que
 *    `character/emoteAnimations.js` e o sistema de pose (andar, correr, saltar,
 *    sentar, trabalhar, falar, acenar) funcionem sem alterações.
 *  - `appearance` (o esquema usado pelo criador de personagem e pelo guarda-roupa)
 *    é traduzido para o esquema de opções desta versão (ver `paraV3()`).
 *  - Expressão facial: a boca abre/fecha ao falar e os olhos piscam de forma
 *    autónoma (como no original). Sobrancelhas não são uma peça separada nesta
 *    escultura — por isso `browUp`/`browAngry` não têm efeito visível aqui
 *    (limitação conhecida, documentada no relatório de testes).
 *  - Mãos e barba: esta versão não tem barba nem dedos articuláveis; mãos ficam
 *    sempre na pose entalhada (limitação conhecida).
 */
import * as THREE from 'three';
import * as SDF from './sdf.js';
import { emoteAnimation } from './emoteAnimations.js';

const { esfera, elipsoide, cone, caixa, forma } = SDF;
const malhar = (...a) => SDF.malhar(...a);
const sin = Math.sin, cos = Math.cos, PI = Math.PI;

export const PELE = ['#2e1a12', '#3b2219', '#4a2c1f', '#5a3624', '#6a412a', '#7a4c31', '#8a5838', '#9a6441', '#ab744f', '#bf8963', '#d3a07c', '#e2b896'];
export const CABELO_COR = ['#0d0907', '#2b1a10', '#5a2e17', '#a8782f', '#b3aea6'];
export const CIMA = { tshirt: 'T-shirt', logo: 'T-shirt NgolaBiz', camisa: 'Camisa', casaco: 'Casaco comprido', top: 'Top', vestido: 'Vestido comprido' };
export const BAIXO = { ganga: 'Calças de ganga', cargo: 'Calças cargo', calcoes: 'Calções', saia: 'Saia comprida', nenhum: 'Nada (com vestido)' };
export const CALCADO = { tenis: 'Ténis', botas: 'Botas', sandalias: 'Sandálias' };
export const CABELOS = { curto: 'Curto encaracolado', afro: 'Afro', trancas: 'Tranças com missangas', coque: 'Coque', lenco: 'Lenço de capulana', rapado: 'Rapado' };

// ------------------------------------------------------------ texturas
const texCache = new Map();
function tela(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tom(hex, dl, ds = 0) { const c = new THREE.Color(hex); const h = {}; c.getHSL(h); c.setHSL(h.h, Math.min(1, Math.max(0, h.s + ds)), Math.min(1, Math.max(0, h.l + dl))); return '#' + c.getHexString(); }
function fazTex(key, w, h, desenho, rep = [1, 1]) {
  const k = key + '|' + rep.join('x');
  if (texCache.has(k)) return texCache.get(k);
  const c = tela(w, h); desenho(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.name = k; texCache.set(k, t); return t;
}
function ruidoTecido(g, w, h, a = 6) {
  if (!g.getImageData) return;
  const id = g.getImageData(0, 0, w, h), d = id.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() * 2 - 1) * a; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(id, 0, 0);
}
function texLiso(cor) { return fazTex('liso' + cor, 256, 256, (g, w, h) => { g.fillStyle = cor; g.fillRect(0, 0, w, h); ruidoTecido(g, w, h, 5); }, [4, 4]); }
function texRiscas(cor) {
  return fazTex('riscas' + cor, 256, 256, (g, w, h) => {
    g.fillStyle = cor; g.fillRect(0, 0, w, h); g.fillStyle = tom(cor, 0.3);
    for (let y = 0; y < h; y += 64) g.fillRect(0, y, w, 24); ruidoTecido(g, w, h, 4);
  }, [1, 5]);
}
function texGanga(cor) {
  return fazTex('ganga' + cor, 256, 256, (g, w, h) => {
    g.fillStyle = cor; g.fillRect(0, 0, w, h);
    g.strokeStyle = tom(cor, 0.08); g.lineWidth = 1.2; g.globalAlpha = 0.5;
    for (let i = -h; i < w; i += 4) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); }
    g.globalAlpha = 1; ruidoTecido(g, w, h, 12);
  }, [6, 8]);
}
function texCapulana(cor) {
  return fazTex('capulana' + cor, 512, 512, (g, S) => {
    const p = [tom(cor, -0.22), '#fff4dc', '#f2b632', '#173a6e', '#e4572e', '#1f9e8a'];
    g.fillStyle = cor; g.fillRect(0, 0, S, S);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const cx = c * 128 + 64 + (r % 2) * 64, cy = r * 128 + 64;
      if ((r + c) % 2 === 0) {
        [[54, p[0]], [46, p[1]], [37, p[3]], [27, p[2]], [16, p[4]], [7, p[1]]].forEach(([rr, f]) => { g.fillStyle = f; g.beginPath(); g.arc(cx % S, cy, rr, 0, PI * 2); g.fill(); });
      } else {
        g.save(); g.translate(cx % S, cy);
        for (let k = 0; k < 8; k++) { g.rotate(PI / 4); g.fillStyle = k % 2 ? p[5] : p[2]; g.beginPath(); g.ellipse(0, -30, 9, 22, 0, 0, PI * 2); g.fill(); }
        g.fillStyle = p[1]; g.beginPath(); g.arc(0, 0, 11, 0, PI * 2); g.fill(); g.restore();
      }
    }
    ruidoTecido(g, S, S, 5);
  }, [3, 3]);
}
function texCamisola(cor, logo) {
  return fazTex('tshirt' + cor + logo, 1024, 512, (g, W, H) => {
    g.fillStyle = cor; g.fillRect(0, 0, W, H); ruidoTecido(g, W, H, 5);
    if (!logo) return;
    const claro = new THREE.Color(cor).getHSL({}).l < 0.5;
    const coroa = (x, y, s) => {
      g.fillStyle = '#f2b632'; g.beginPath(); g.moveTo(x - 30 * s, y + 18 * s); g.lineTo(x - 34 * s, y - 14 * s); g.lineTo(x - 16 * s, y + 2 * s); g.lineTo(x, y - 22 * s); g.lineTo(x + 16 * s, y + 2 * s); g.lineTo(x + 34 * s, y - 14 * s); g.lineTo(x + 30 * s, y + 18 * s); g.closePath(); g.fill();
      g.fillRect(x - 30 * s, y + 20 * s, 60 * s, 7 * s);
    };
    const texto = (x, y, s) => {
      g.textAlign = 'center'; g.font = `900 ${34 * s}px "Arial Black", Arial, sans-serif`;
      g.fillStyle = claro ? '#f4f1ea' : '#16171c'; g.fillText('NGOLABIZ', x, y);
      g.fillStyle = '#d42a2a'; g.fillText('GAMER', x, y + 36 * s);
    };
    coroa(W * 0.5, H * 0.3, 0.8); texto(W * 0.5, H * 0.42, 0.75);
    [0, W].forEach((x) => { coroa(x, H * 0.24, 1.3); texto(x, H * 0.43, 1.25); });
  });
}
function textura(tipo, cor) {
  if (tipo === 'capulana') return texCapulana(cor);
  if (tipo === 'riscas') return texRiscas(cor);
  if (tipo === 'ganga') return texGanga(cor);
  if (tipo === 'logo') return texCamisola(cor, true);
  if (tipo === 'tshirt') return texCamisola(cor, false);
  return texLiso(cor);
}

// ------------------------------------------------------------ esqueleto
// Nomes canónicos (iguais aos usados por emoteAnimations.js e pelo sistema de poses).
const ANG = 15 * PI / 180;
function esqueleto(gen) {
  const f = gen === 'f';
  const om = f ? 0.145 : 0.158, lb = f ? 0.27 : 0.28, la = f ? 0.24 : 0.25, ax = f ? 0.09 : 0.088;
  const B = {
    hips: [null, [0, 0.97, 0]], spine: ['hips', [0, 1.1, 0]], chest: ['spine', [0, 1.26, 0]],
    neck: ['chest', [0, 1.445, -0.01]], head: ['neck', [0, 1.545, 0]],
  };
  [['L', 1], ['R', -1]].forEach(([l, s]) => {
    const d = [s * sin(ANG), -cos(ANG), 0];
    const o = [s * om, 1.415, -0.012], c = [o[0] + d[0] * lb, o[1] + d[1] * lb, -0.005], m = [c[0] + d[0] * la, c[1] + d[1] * la, 0];
    B['clav' + l] = ['chest', [s * 0.04, 1.42, -0.01]]; B['upperArm' + l] = ['clav' + l, o]; B['foreArm' + l] = ['upperArm' + l, c]; B['hand' + l] = ['foreArm' + l, m];
    B['thigh' + l] = ['hips', [s * ax, 0.93, 0]]; B['shin' + l] = ['thigh' + l, [s * (ax + 0.01), 0.515, 0.005]]; B['foot' + l] = ['shin' + l, [s * (ax + 0.012), 0.085, -0.012]];
  });
  return B;
}
function segmentos(gen) {
  const B = esqueleto(gen), P = (n) => B[n][1];
  const segs = [['hips', [0, 0.88, 0], [0, 1.1, 0]], ['spine', P('spine'), P('chest')], ['chest', P('chest'), [0, 1.42, 0]], ['neck', P('neck'), P('head')], ['head', P('head'), [0, 1.7, 0]]];
  ['L', 'R'].forEach((l) => {
    const s = l === 'L' ? 1 : -1, m = P('hand' + l);
    segs.push(['clav' + l, P('clav' + l), P('upperArm' + l)], ['upperArm' + l, P('upperArm' + l), P('foreArm' + l)], ['foreArm' + l, P('foreArm' + l), m],
      ['hand' + l, m, [m[0] + s * 0.05, m[1] - 0.07, 0]], ['thigh' + l, P('thigh' + l), P('shin' + l)], ['shin' + l, P('shin' + l), P('foot' + l)],
      ['foot' + l, P('foot' + l), [P('foot' + l)[0], 0.03, 0.12]]);
  });
  return segs;
}
export const ORDEM = Object.keys(esqueleto('m'));
export const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'upperArmL', 'foreArmL', 'handL', 'upperArmR', 'foreArmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];

function distSeg(x, y, z, a, b) {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
  let t = ((x - a[0]) * bx + (y - a[1]) * by + (z - a[2]) * bz) / (bx * bx + by * by + bz * bz);
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - a[0] - bx * t, y - a[1] - by * t, z - a[2] - bz * t);
}
const PERMITIDOS = {
  tronco: ['hips', 'spine', 'chest', 'neck', 'head', 'clavL', 'clavR', 'thighL', 'thighR', 'upperArmL', 'upperArmR'],
  bracoL: ['chest', 'clavL', 'upperArmL', 'foreArmL', 'handL'], bracoR: ['chest', 'clavR', 'upperArmR', 'foreArmR', 'handR'],
  pernaL: ['hips', 'thighL', 'shinL', 'footL'], pernaR: ['hips', 'thighR', 'shinR', 'footR'],
};
const regCache = new Map();
function regioes(gen, forte) {
  const k = gen + forte; if (regCache.has(k)) return regCache.get(k);
  const L = partesCorpo(gen, forte);
  const R = {
    tronco: forma([...L.tronco, ...L.pescoco]),
    bracoL: forma([...L.bracoSup, ...L.bracoInf].filter((o) => o.lado === 1).map((o, i) => ({ ...o, k: i ? o.k : 0 }))),
    bracoR: forma([...L.bracoSup, ...L.bracoInf].filter((o) => o.lado === -1).map((o, i) => ({ ...o, k: i ? o.k : 0 }))),
    pernaL: forma(L.perna.filter((o) => o.lado === 1).map((o, i) => ({ ...o, k: i ? o.k : 0 }))),
    pernaR: forma(L.perna.filter((o) => o.lado === -1).map((o, i) => ({ ...o, k: i ? o.k : 0 }))),
  };
  regCache.set(k, R); return R;
}
function pesos(pos, gen, saia, forte, semBracos) {
  const segs = segmentos(gen), n = pos.length / 3, R = regioes(gen, forte), nomesR = Object.keys(R);
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  const ws = new Float64Array(segs.length);
  for (let v = 0; v < n; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    let reg = 'tronco', best = 1e9;
    for (const r of nomesR) { const d = R[r](x, y, z); if (d < best) { best = d; reg = r; } }
    if (saia && (y < 0.98 || semBracos)) reg = 'tronco';
    if (semBracos && reg.startsWith('braco')) reg = 'tronco';
    const ok = PERMITIDOS[reg];
    for (let s = 0; s < segs.length; s++) {
      const nome = segs[s][0];
      if (!ok.includes(nome)) { ws[s] = 0; continue; }
      if (reg === 'tronco' && /^upperArm/.test(nome) && y < 1.3) { ws[s] = 0; continue; }
      const d = distSeg(x, y, z, segs[s][1], segs[s][2]) + 0.004;
      let w = 1 / Math.pow(d, 6);
      if (saia && y < 0.98 && nome.startsWith('thigh')) w *= 0.3;
      if (nome === 'head' && y < 1.53) w = 0;
      ws[s] = w;
    }
    const top = [...ws.keys()].sort((a, b) => ws[b] - ws[a]).slice(0, 4);
    const tot = top.reduce((a, i) => a + ws[i], 0) || 1;
    top.forEach((i, k) => { si[v * 4 + k] = ORDEM.indexOf(segs[i][0]); sw[v * 4 + k] = ws[i] / tot; });
  }
  return { si, sw };
}

// ------------------------------------------------------------ corpo esculpido
function partesCorpo(gen, forte) {
  const f = gen === 'f', k = forte ? 1.08 : 1, B = esqueleto(gen), P = (n) => B[n][1];
  const L = { tronco: [], bracoSup: [], bracoInf: [], perna: [], pescoco: [], pes: [] };
  const T = (p, kk) => L.tronco.push({ p, k: kk });
  if (f) {
    T(elipsoide(0, 0.955, -0.01, 0.168 * k, 0.11, 0.105 * k), 0);
    [-1, 1].forEach((s) => T(elipsoide(s * 0.066, 0.92, -0.06, 0.082 * k, 0.092, 0.072 * k), 0.045));
    T(elipsoide(0, 1.1, 0.0, 0.118 * k, 0.125, 0.086 * k), 0.07);
    T(elipsoide(0, 1.28, -0.008, 0.142 * k, 0.128, 0.093 * k), 0.07);
    [-1, 1].forEach((s) => T(elipsoide(s * 0.062, 1.275, 0.058, 0.062, 0.06, 0.056), 0.03));
    T(cone([-0.128, 1.412, -0.012], [0.128, 1.412, -0.012], 0.045, 0.045), 0.05);
  } else {
    T(elipsoide(0, 0.955, -0.008, 0.152 * k, 0.105, 0.1 * k), 0);
    [-1, 1].forEach((s) => T(elipsoide(s * 0.062, 0.925, -0.055, 0.075 * k, 0.085, 0.065 * k), 0.04));
    T(elipsoide(0, 1.1, 0.008, 0.132 * k, 0.13, 0.093 * k), 0.07);
    T(elipsoide(0, 1.285, -0.004, 0.162 * k, 0.135, 0.1 * k), 0.07);
    [-1, 1].forEach((s) => T(elipsoide(s * 0.068, 1.3, 0.05, 0.068 * k, 0.055, 0.045 * k), 0.035));
    T(cone([-0.142, 1.415, -0.012], [0.142, 1.415, -0.012], 0.052 * k, 0.052 * k), 0.05);
  }
  L.pescoco.push({ p: cone([0, 1.38, -0.012], [0, 1.565, 0], f ? 0.049 : 0.056, f ? 0.044 : 0.05), k: 0.035 });
  const rb = f ? 0.87 : 1;
  [['L', 1], ['R', -1]].forEach(([l, s]) => {
    L.bracoSup.push({ p: elipsoide(s * ((f ? 0.145 : 0.158) + 0.01), 1.395, -0.012, 0.052 * rb * k, 0.066, 0.054 * rb * k), k: 0.03, lado: s });
    L.bracoSup.push({ p: cone(P('upperArm' + l), P('foreArm' + l), 0.047 * rb * k, 0.037 * rb * k), k: 0.015, lado: s });
    const m = P('hand' + l), dd = [s * sin(ANG) * 0.012, -cos(ANG) * 0.012, 0];
    L.bracoInf.push({ p: cone(P('foreArm' + l), [m[0] + dd[0], m[1] + dd[1], 0], 0.039 * rb * k, 0.028 * rb), k: 0.02, lado: s });
    L.perna.push({ p: cone(P('thigh' + l), P('shin' + l), (f ? 0.088 : 0.083) * k, 0.052 * rb), k: 0.045, lado: s });
    L.perna.push({ p: cone(P('shin' + l), P('foot' + l), 0.05 * rb, 0.033 * rb), k: 0.02, lado: s });
    L.perna.push({ p: elipsoide(s * ((f ? 0.09 : 0.088) + 0.01), 0.37, -0.03, 0.046 * rb, 0.09, 0.045 * rb), k: 0.03, lado: s });
    const pe = P('foot' + l);
    L.pes.push({ p: cone(pe, [pe[0], 0.028, 0.115], 0.034 * rb, 0.026 * rb), k: 0.02 });
  });
  return L;
}
const geoCache = new Map();
function cache(k, f) { if (!geoCache.has(k)) geoCache.set(k, f()); return geoCache.get(k); }

function geoDe(m, gen, saia, uv, forte, semBracos) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(m.nor, 3));
  g.setIndex(new THREE.BufferAttribute(m.ind, 1));
  if (gen) { const w = pesos(m.pos, gen, saia, !!forte, semBracos); g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(w.si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(w.sw, 4)); }
  if (uv) {
    const n = m.pos.length / 3, a = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { const x = m.pos[i * 3], y = m.pos[i * 3 + 1], z = m.pos[i * 3 + 2]; a[i * 2] = Math.atan2(x, z) / (2 * PI) + 0.5; a[i * 2 + 1] = uv(y, x, z); }
    g.setAttribute('uv', new THREE.BufferAttribute(a, 2));
  }
  g.computeBoundingSphere();
  return g;
}
const LIM_CORPO = [[-0.58, 0, -0.2], [0.58, 1.6, 0.22]];
function geoCorpo(gen, forte) {
  return cache('corpo' + gen + forte, () => {
    const L = partesCorpo(gen, forte);
    const ops = [...L.tronco, ...L.pescoco, ...L.bracoSup, ...L.bracoInf, ...L.perna, ...L.pes];
    return geoDe(malhar(forma(ops), LIM_CORPO[0], LIM_CORPO[1], 0.0115), gen, false, (y) => y, forte);
  });
}

// ------------------------------------------------------------ roupa
function geoPeca(gen, forte, tipo) {
  return cache('peca' + gen + forte + tipo, () => {
    const L = partesCorpo(gen, forte), B = esqueleto(gen), P = (n) => B[n][1];
    const f = gen === 'f', omx = (f ? 0.145 : 0.158);
    const corteBraco = (frac) => ({
      op: 'f', f: (d, x, y, z) => {
        if (Math.abs(x) < omx) return d;
        const l = x > 0 ? 'L' : 'R', a = P('upperArm' + l), dir = [Math.sign(x) * sin(ANG), -cos(ANG), 0];
        const len = frac <= 1 ? (f ? 0.27 : 0.28) * frac : (f ? 0.27 : 0.28) + (f ? 0.24 : 0.25) * (frac - 1);
        const cx = a[0] + dir[0] * len, cy = a[1] + dir[1] * len;
        return Math.max(d, (x - cx) * dir[0] + (y - cy) * dir[1]);
      },
    });
    const inflar = (t) => ({ op: 'f', f: (d) => d - t });
    const entre = (y0, y1) => ({ op: 'f', f: (d, x, y) => Math.max(d, y0 - y, y - y1) });
    let ops, lo = [-0.6, 0.1, -0.24], hi = [0.6, 1.6, 0.26], saia = false, uv = (y) => (y - 0.9) / 0.62, passo = 0.0115;
    const gola = (r0, h) => ({ op: 'f', f: (d, x, y, z) => { const rr = Math.hypot(x, (z + 0.008) * 1.1); const ring = Math.max(rr - r0, (r0 - 0.011) - rr, 1.41 - y, y - (1.41 + h)); return Math.min(d, ring); } });
    if (tipo === 'tshirt' || tipo === 'logo' || tipo === 'camisa') {
      ops = [...L.tronco, { p: elipsoide(0, 1.0, -0.006, gen === 'f' ? 0.17 : 0.158, 0.11, gen === 'f' ? 0.112 : 0.106), k: 0.05 }, ...L.bracoSup.map((o) => ({ ...o, k: Math.max(o.k, 0.05) })), inflar(0.013), corteBraco(0.45), entre(0.925, 1.468)];
      if (tipo === 'camisa') ops.push(gola(f ? 0.06 : 0.067, 0.045));
      uv = (y) => (y - 0.88) / 0.62;
    } else if (tipo === 'top') {
      ops = [...L.tronco, inflar(0.01), entre(1.16, 1.43), { op: 'f', f: (d, x) => Math.abs(x) > omx - 0.01 ? Math.max(d, Math.abs(x) - (omx - 0.01)) : d }];
    } else if (tipo === 'casaco') {
      ops = [...L.tronco, ...L.bracoSup, ...L.bracoInf, { p: cone([0, 1.02, -0.01], [0, 0.44, -0.015], 0.17, 0.24), k: 0.06 }, inflar(0.017), corteBraco(1.86), entre(0.42, 1.468), gola(f ? 0.066 : 0.072, 0.13)];
      saia = true; uv = (y) => (y - 0.4) / 1.1;
    } else if (tipo === 'vestido') {
      ops = [...L.tronco, ...L.bracoSup, { p: cone([0, 1.02, -0.01], [0, 0.2, -0.02], 0.165, 0.225), k: 0.07 }, inflar(0.013), corteBraco(0.35), entre(0.19, 1.462)];
      saia = true; uv = (y) => (y - 0.2) / 0.5;
    } else if (tipo === 'ganga' || tipo === 'cargo' || tipo === 'calcoes') {
      const quad = L.tronco.slice(0, 3);
      const fim = tipo === 'calcoes' ? (f ? 0.7 : 0.6) : 0.1;
      ops = [...quad, ...L.perna, inflar(0.014), entre(fim, 1.035)];
      if (tipo === 'cargo') [-1, 1].forEach((s) => ops.splice(ops.length - 2, 0, { p: elipsoide(s * 0.152, 0.64, 0.01, 0.03, 0.065, 0.055), k: 0.02 }));
      lo = [-0.3, 0.05, -0.2]; hi = [0.3, 1.1, 0.2]; uv = (y) => y / 0.5; passo = 0.011;
    } else if (tipo === 'saia') {
      const quad = L.tronco.slice(0, 3);
      ops = [...quad, { p: cone([0, 1.0, -0.012], [0, 0.14, -0.02], 0.17, 0.235), k: 0.08 }, inflar(0.012), entre(0.13, 1.035)];
      lo = [-0.32, 0.08, -0.28]; hi = [0.32, 1.1, 0.26]; saia = true; uv = (y) => (y - 0.1) / 0.5;
    } else return null;
    return geoDe(malhar(forma(ops), lo, hi, passo), gen, saia, uv, forte, ['ganga', 'cargo', 'calcoes', 'saia'].includes(tipo));
  });
}

// ------------------------------------------------------------ cabeça esculpida
const ROSTOS = [
  { mand: 1.0, nariz: 1.0, labio: 1.0, olhos: 0.034, mac: 1.0 },
  { mand: 1.1, nariz: 1.18, labio: 1.12, olhos: 0.035, mac: 1.08 },
  { mand: 0.9, nariz: 0.92, labio: 0.95, olhos: 0.033, mac: 0.95 },
  { mand: 1.0, nariz: 1.08, labio: 1.28, olhos: 0.0345, mac: 1.04 },
];
function partesCabeca(gen, r) {
  const f = gen === 'f', rs = ROSTOS[r % 4], nz = rs.nariz, lb = rs.labio * (f ? 1.1 : 1);
  const ops = [
    { p: elipsoide(0, 0.018, -0.012, 0.087, 0.098, 0.1), k: 0 },
    { p: elipsoide(0, -0.03, 0.018, 0.072, 0.075, 0.078), k: 0.035 },
    { p: elipsoide(0, -0.066, 0.02, 0.056 * rs.mand * (f ? 0.92 : 1), 0.034, 0.06), k: 0.03 },
    { p: esfera(0, -0.088, 0.05, f ? 0.019 : 0.022), k: 0.022 },
    ...[-1, 1].map((s) => ({ p: elipsoide(s * 0.046, -0.014, 0.05, 0.034 * rs.mac, 0.03, 0.03), k: 0.025 })),
    { p: cone([-0.044, 0.034, 0.07], [0.044, 0.034, 0.07], f ? 0.009 : 0.012, f ? 0.009 : 0.012), k: 0.02 },
    ...[-1, 1].map((s) => ({ p: esfera(s * rs.olhos, 0.012, 0.075, 0.0205), k: 0.008, op: '-' })),
    { p: cone([0, 0.022, 0.082], [0, -0.016, 0.098], 0.0072, 0.011 * nz), k: 0.01 },
    { p: esfera(0, -0.022, 0.0985, 0.0128 * nz), k: 0.008 },
    ...[-1, 1].map((s) => ({ p: esfera(s * 0.0158 * nz, -0.027, 0.088, 0.0108 * nz), k: 0.008 })),
    { p: cone([-0.018 * lb, -0.0475, 0.0865], [0.018 * lb, -0.0475, 0.084], 0.0064 * lb, 0.0064 * lb), k: 0.006 },
    { p: elipsoide(0, -0.0602, 0.0822, 0.0175 * lb, 0.0088 * lb, 0.0085 * lb), k: 0.006 },
    { p: cone([-0.021 * lb, -0.0536, 0.094], [0.02 * lb, -0.0536, 0.091], 0.0011, 0.0011), k: 0.0015, op: '-' },
    ...[-1, 1].map((s) => ({ p: elipsoide(s * 0.088, 0.0, -0.008, 0.012, 0.03, 0.021), k: 0.01 })),
    { p: cone([0, -0.06, -0.02], [0, -0.15, -0.022], f ? 0.046 : 0.052, f ? 0.046 : 0.052), k: 0.03 },
  ];
  const marcas = {
    labios: [ops[ops.length - 5].p, ops[ops.length - 4].p],
    sobr: [-1, 1].map((s) => [cone([s * 0.016, 0.041, 0.086], [s * 0.034, 0.047, 0.082], f ? 0.0028 : 0.0038, f ? 0.0032 : 0.0042), cone([s * 0.034, 0.047, 0.082], [s * 0.053, 0.041, 0.07], f ? 0.0032 : 0.0042, f ? 0.0018 : 0.003)]).flat(),
    narinas: [-1, 1].map((s) => esfera(s * 0.0092 * nz, -0.0315, 0.0955, 0.0042)),
    orbitas: [-1, 1].map((s) => esfera(s * rs.olhos, 0.012, 0.075, 0.0205)),
  };
  return { ops, marcas, rs };
}
function geoCabeca(gen, r) {
  return cache('cabeca' + gen + r, () => {
    const { ops, marcas } = partesCabeca(gen, r);
    const m = malhar(forma(ops), [-0.105, -0.16, -0.125], [0.105, 0.125, 0.125], 0.0037);
    const g = geoDe(m, null, false, null);
    const n = m.pos.length / 3, col = new Float32Array(n * 3);
    const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    for (let i = 0; i < n; i++) {
      const x = m.pos[i * 3], y = m.pos[i * 3 + 1], z = m.pos[i * 3 + 2];
      let r = 1, gg = 1, b = 1;
      const dl = Math.min(...marcas.labios.map((p) => p.d(x, y, z)));
      const lab = 1 - ss(0.0002, 0.0019, dl);
      const lc = gen === 'f' ? [0.56, 0.36, 0.38] : [0.64, 0.46, 0.44];
      r *= 1 + (lc[0] - 1) * lab; gg *= 1 + (lc[1] - 1) * lab; b *= 1 + (lc[2] - 1) * lab;
      const ds = Math.min(...marcas.sobr.map((p) => p.d(x, y, z)));
      const sob = z > 0.04 ? 1 - ss(0.0, 0.0035, ds) : 0;
      r *= 1 - 0.82 * sob; gg *= 1 - 0.84 * sob; b *= 1 - 0.85 * sob;
      const dn = Math.min(...marcas.narinas.map((p) => p.d(x, y, z)));
      const nar = 1 - ss(0, 0.003, dn); r *= 1 - 0.55 * nar; gg *= 1 - 0.6 * nar; b *= 1 - 0.6 * nar;
      const dor = Math.min(...marcas.orbitas.map((p) => Math.abs(p.d(x, y, z))));
      const orb = (1 - ss(0.0, 0.007, dor)) * (z > 0.05 ? 1 : 0); r *= 1 - 0.06 * orb; gg *= 1 - 0.07 * orb; b *= 1 - 0.06 * orb;
      const boch = Math.exp(-(((Math.abs(x) - 0.047) / 0.022) ** 2 + ((y + 0.02) / 0.02) ** 2)) * (z > 0.03 ? 1 : 0);
      r *= 1 + 0.04 * boch; gg *= 1 - 0.03 * boch; b *= 1 - 0.03 * boch;
      col[i * 3] = r; col[i * 3 + 1] = gg; col[i * 3 + 2] = b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
}

// ------------------------------------------------------------ mãos e calçado
function geoMao(gen, s) {
  return cache('mao' + gen + s, () => {
    const k = gen === 'f' ? 0.9 : 1, ops = [{ p: elipsoide(0, -0.052 * k, 0, 0.017 * k, 0.05 * k, 0.041 * k), k: 0 }];
    for (let i = 0; i < 4; i++) {
      const z = (i - 1.5) * 0.0205 * k, len = (0.075 - Math.abs(i - 1.2) * 0.008) * k;
      const a = [0, -0.09 * k, z], b = [-s * 0.012 * k, -0.09 * k - len * 0.92, z * 1.08];
      ops.push({ p: cone(a, b, 0.0088 * k, 0.0072 * k), k: 0.012 });
    }
    ops.push({ p: cone([-s * 0.008, -0.03 * k, 0.03 * k], [-s * 0.026 * k, -0.075 * k, 0.046 * k], 0.011 * k, 0.0082 * k), k: 0.012 });
    return geoDe(malhar(forma(ops), [-0.045, -0.19, -0.065], [0.045, 0.015, 0.075], 0.0034), null, false, null);
  });
}
function geoCalcado(tipo) {
  return cache('calc' + tipo, () => {
    let ops;
    if (tipo === 'sandalias') {
      ops = [{ p: caixa(0, -0.077, 0.045, 0.043, 0.008, 0.125, 0.008), k: 0 },
        { p: cone([-0.04, -0.06, 0.07], [0.04, -0.06, 0.07], 0.007, 0.007), k: 0.004 }];
    } else {
      ops = [{ p: caixa(0, -0.072, 0.045, 0.047, 0.014, 0.128, 0.013), k: 0 },
        { p: elipsoide(0, -0.038, 0.05, 0.046, 0.045, 0.118), k: 0.02 },
        { p: cone([0, -0.04, -0.012], [0, tipo === 'botas' ? 0.13 : 0.035, -0.016], 0.047, 0.046), k: 0.02 },
        { op: 'f', f: (d, x, y, z) => Math.max(d, -0.086 - y) }];
    }
    return geoDe(malhar(forma(ops), [-0.07, -0.1, -0.1], [0.07, 0.16, 0.2], 0.004), null, false, null);
  });
}

// ------------------------------------------------------------ cabelo
function hash(i) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
function juntar(geos) {
  let n = 0, ni = 0; geos.forEach((g) => { n += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; });
  const p = new Float32Array(n * 3), nr = new Float32Array(n * 3), ind = new Uint32Array(ni); let o = 0, oi = 0;
  geos.forEach((g) => {
    p.set(g.attributes.position.array, o * 3); nr.set(g.attributes.normal.array, o * 3);
    if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i++) ind[oi + i] = a[i] + o; oi += a.length; } else { for (let i = 0; i < g.attributes.position.count; i++) ind[oi + i] = o + i; oi += g.attributes.position.count; }
    o += g.attributes.position.count;
  });
  const r = new THREE.BufferGeometry(); r.setAttribute('position', new THREE.BufferAttribute(p, 3)); r.setAttribute('normal', new THREE.BufferAttribute(nr, 3)); r.setIndex(new THREE.BufferAttribute(ind, 1)); return r;
}
function couro(rExtra, corte) {
  const e = elipsoide(0, 0.018, -0.012, 0.087 + rExtra, 0.098 + rExtra, 0.1 + rExtra);
  return (x, y, z) => {
    const d = e.d(x, y, z);
    const linha = 0.074 + corte - 0.35 * Math.max(0, -z) - 0.55 * Math.max(0, Math.abs(x) - 0.045);
    return Math.max(d, linha - y - (z < -0.03 ? 0.12 : 0));
  };
}
function geoCabelo(tipo, gen) {
  return cache('pelo' + tipo + gen, () => {
    const out = [];
    if (tipo === 'curto' || tipo === 'rapado') {
      const ex = tipo === 'curto' ? 0.006 : 0.0025;
      out.push({ geo: geoDe(malhar(couro(ex, 0.0), [-0.11, -0.06, -0.13], [0.11, 0.13, 0.12], 0.003), null, false, null), mat: 'cabelo' });
      if (tipo === 'curto') {
        const bolas = [];
        for (let i = 0; i < 300; i++) {
          const u = hash(i) * 2 - 1, a = hash(i + 99) * PI * 2, th = Math.acos(Math.max(-1, Math.min(1, u)));
          const dir = new THREE.Vector3(sin(th) * cos(a), cos(th), sin(th) * sin(a));
          if (dir.y < 0.25 && !(dir.z < 0 && dir.y > -0.25)) continue;
          if (dir.y < 0.45 && dir.z > 0.55) continue;
          const s = new THREE.SphereGeometry(0.0095 + hash(i + 7) * 0.004, 6, 4);
          const pnt = new THREE.Vector3(dir.x * (0.093), 0.018 + dir.y * 0.104 + 0.004, -0.012 + dir.z * 0.106);
          s.translate(pnt.x, pnt.y, pnt.z); bolas.push(s);
        }
        out.push({ geo: juntar(bolas), mat: 'cabelo' });
      }
    } else if (tipo === 'afro') {
      const eA = elipsoide(0, 0.05, -0.02, 0.15, 0.135, 0.14);
      const sdf = (x, y, z) => {
        const d = eA.d(x, y, z);
        const n = Math.sin(x * 160) * Math.sin(y * 170 + 1.3) * Math.sin(z * 150 + 0.7) * 0.004 + Math.sin(x * 60 + y * 40) * 0.003;
        return Math.max(d + n, -(z - 0.075) - 0.0, 0.0 - (y + 0.0 - 0.06 * Math.max(0, z)) - 0.0 * x * 0);
      };
      out.push({ geo: geoDe(malhar(sdf, [-0.17, -0.1, -0.18], [0.17, 0.2, 0.14], 0.0045), null, false, null), mat: 'cabelo' });
      out.push({ geo: geoDe(malhar(couro(0.004, 0.0), [-0.11, -0.06, -0.13], [0.11, 0.13, 0.12], 0.003), null, false, null), mat: 'cabelo' });
    } else if (tipo === 'trancas') {
      out.push({ geo: geoDe(malhar(couro(0.004, -0.004), [-0.11, -0.06, -0.13], [0.11, 0.13, 0.12], 0.003), null, false, null), mat: 'cabelo' });
      const tubos = [], contas = [];
      for (let i = 0; i < 40; i++) {
        const a = -PI * 0.92 + (i / 39) * PI * 1.84;
        const x0 = sin(a) * 0.088, z0 = -cos(a) * 0.092 - 0.012;
        if (z0 > 0.045 && Math.abs(x0) < 0.06) continue;
        const comp = 0.26 + hash(i) * 0.06, y0 = 0.07 - Math.abs(cos(a)) * 0.02;
        const lado = Math.sign(x0) || 1;
        const pts = [new THREE.Vector3(x0 * 0.55, 0.1, z0 * 0.5), new THREE.Vector3(x0 * 1.04, y0, z0 * 1.02),
          new THREE.Vector3(x0 * 1.2 + lado * 0.005, -0.06, z0 * 1.12), new THREE.Vector3(x0 * 1.2 + lado * 0.01, -comp * 0.6, z0 * 1.1 - 0.012), new THREE.Vector3(x0 * 1.15 + lado * 0.012, -comp, z0 * 1.05 - 0.03)];
        const curva = new THREE.CatmullRomCurve3(pts);
        const t = new THREE.TubeGeometry(curva, 48, 0.0068, 7, false);
        const p = t.attributes.position, nr = t.attributes.normal;
        for (let v = 0; v < p.count; v++) {
          const seg = Math.floor(v / 8), ang = (v % 8) / 7 * PI * 2;
          const bump = 0.0016 * sin(seg * 1.9 + ang * 2);
          p.setXYZ(v, p.getX(v) + nr.getX(v) * bump, p.getY(v) + nr.getY(v) * bump, p.getZ(v) + nr.getZ(v) * bump);
        }
        t.computeVertexNormals(); tubos.push(t);
        if (hash(i + 3) > 0.45) {
          const nc = 1 + Math.floor(hash(i + 5) * 3);
          for (let c = 0; c < nc; c++) {
            const pos = curva.getPointAt(0.78 + c * 0.065), tg = curva.getTangentAt(0.78 + c * 0.065);
            const cg = new THREE.CylinderGeometry(0.0105, 0.0105, 0.016, 12, 1);
            cg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tg)); cg.translate(pos.x, pos.y, pos.z); contas.push(cg);
          }
        }
      }
      out.push({ geo: juntar(tubos), mat: 'cabelo' });
      if (contas.length) out.push({ geo: juntar(contas), mat: 'contas' });
    } else if (tipo === 'coque') {
      out.push({ geo: geoDe(malhar(couro(0.004, -0.004), [-0.11, -0.06, -0.13], [0.11, 0.13, 0.12], 0.003), null, false, null), mat: 'cabelo' });
      const b = new THREE.SphereGeometry(0.055, 28, 20); b.translate(0, 0.105, -0.065); out.push({ geo: b, mat: 'cabelo' });
    } else if (tipo === 'lenco') {
      const e1 = elipsoide(0, 0.045, -0.02, 0.098, 0.1, 0.11), e2 = elipsoide(0, 0.12, -0.04, 0.085, 0.07, 0.085), e3 = elipsoide(0.03, 0.15, 0.01, 0.05, 0.035, 0.06);
      const sdf = (x, y, z) => {
        let d = e1.d(x, y, z);
        d = SDF.smin(d, e2.d(x, y, z), 0.04);
        d = SDF.smin(d, e3.d(x, y, z), 0.03);
        const dobras = Math.sin(y * 140 + x * 30) * 0.0018;
        return Math.max(d + dobras, 0.062 - y + Math.max(0, -z) * 0.3);
      };
      const g = geoDe(malhar(sdf, [-0.13, -0.02, -0.15], [0.13, 0.22, 0.13], 0.0035), null, false, null);
      const p = g.attributes.position, uvs = new Float32Array(p.count * 2);
      for (let i = 0; i < p.count; i++) { uvs[i * 2] = Math.atan2(p.getX(i), p.getZ(i)) / (2 * PI) + 0.5; uvs[i * 2 + 1] = p.getY(i) * 3; }
      g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      out.push({ geo: g, mat: 'lenco' });
      out.push({ geo: geoDe(malhar(couro(0.002, 0.0), [-0.11, -0.06, -0.13], [0.11, 0.13, 0.12], 0.003), null, false, null), mat: 'cabelo' });
    }
    return out;
  });
}

// ------------------------------------------------------------ materiais
function matPele(hex, vc) {
  return new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.48, metalness: 0, sheen: 0.55, sheenRoughness: 0.5, sheenColor: new THREE.Color('#a8492f'), clearcoat: 0.08, clearcoatRoughness: 0.55, vertexColors: !!vc });
}
const matCor = (hex, rough = 0.7, metal = 0) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal });

// ------------------------------------------------------------ tradução appearance → opções v3
const HAIR_MAP = { curto: 'curto', 'degradê': 'curto', afro: 'afro', dreads: 'trancas', trancas_curtas: 'trancas', rapado: 'rapado', careca: 'rapado', trancas: 'trancas', coque: 'coque', liso_comprido: 'coque', rabo_cavalo: 'coque', lenco: 'lenco' };
const TOP_MAP = { 't-shirt': 'tshirt', polo: 'camisa', camisa: 'camisa', casaco_leve: 'casaco', camisa_capulana: 'camisa', fato_treino: 'casaco', hoodie: 'casaco', colete: 'top', blusa: 'top', vestido: 'vestido' };
const BOTTOM_MAP = { calca_ganga: 'ganga', calca: 'ganga', calcoes: 'calcoes', saia: 'saia', saia_capulana: 'saia', calca_cargo: 'cargo' };
const SHOE_MAP = { tenis: 'tenis', tenis_brancos: 'tenis', sapatos: 'tenis', botas: 'botas', chinelos: 'sandalias' };
const ACC_MAP = { eyes: 'oculos', ears: 'argolas', neck: 'fio', wrist: 'relogio', back: 'mochila' }; // slot → acessório v3 (head/bone mapeado à parte)

export function nearestPeleIndex(hex) {
  const c = new THREE.Color(hex);
  let best = 0, bd = Infinity;
  PELE.forEach((p, i) => { const pc = new THREE.Color(p); const d = (pc.r - c.r) ** 2 + (pc.g - c.g) ** 2 + (pc.b - c.b) ** 2; if (d < bd) { bd = d; best = i; } });
  return best;
}

function paraV3(a) {
  const gen = a.gender === 'f' ? 'f' : 'm';
  const top = TOP_MAP[a.top] ?? 'tshirt';
  const padrao = a.top === 'camisa_capulana' ? 'capulana' : (a.topPattern ?? 'liso');
  const baixo = top === 'vestido' ? 'nenhum' : (BOTTOM_MAP[a.bottom] ?? 'ganga');
  const padraoBaixo = a.bottom === 'saia_capulana' ? 'capulana' : 'liso';
  const acessorios = [];
  for (const [slot, id] of Object.entries(a.accessories ?? {})) {
    if (slot === 'head' && id === 'bone') acessorios.push('bone');
    else if (ACC_MAP[slot]) acessorios.push(ACC_MAP[slot]);
  }
  return {
    genero: gen,
    corpo: a.bodyType === 'robusto' ? 'forte' : 'normal',
    pele: a.skinTone ?? PELE[5],
    rosto: a.face?.shape ?? 0,
    cabelo: HAIR_MAP[a.hairStyle] ?? 'curto',
    corCabelo: a.hairColor ?? CABELO_COR[0],
    cima: top, corCima: a.topColor ?? '#2f6fd8', padrao,
    baixo, corBaixo: a.bottomColor ?? '#24314f', padraoBaixo,
    calcado: SHOE_MAP[a.shoes] ?? 'tenis', corCalcado: a.shoesColor ?? '#f2f0ea',
    acessorios, corMochila: a.bottomColor, corLenco: a.topColor,
    altura: (a.height ?? 1.75) / 1.75,
  };
}

// ------------------------------------------------------------ construção da personagem
function construir(o) {
  const gen = o.genero, forte = o.corpo === 'forte';
  const raiz = new THREE.Group();
  const B = esqueleto(gen), ossos = {};
  ORDEM.forEach((n) => { const b = new THREE.Bone(); b.name = n; ossos[n] = b; });
  ORDEM.forEach((n) => {
    const [pai, p] = B[n], b = ossos[n];
    if (pai) { const pp = B[pai][1]; b.position.set(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]); ossos[pai].add(b); } else b.position.set(p[0], p[1], p[2]);
  });
  raiz.add(ossos.hips);
  raiz.updateMatrixWorld(true);
  const esqu = new THREE.Skeleton(ORDEM.map((n) => ossos[n]));
  const peleHex = typeof o.pele === 'string' ? o.pele : PELE[o.pele % PELE.length];
  const pele = matPele(peleHex);
  const meshes = [];
  const juntarSkin = (geo, mat) => { const m = new THREE.SkinnedMesh(geo, mat); m.castShadow = m.receiveShadow = true; m.frustumCulled = false; raiz.add(m); m.bind(esqu); meshes.push(m); return m; };
  juntarSkin(geoCorpo(gen, forte), pele);
  const cimaTipo = o.cima, temVestido = cimaTipo === 'vestido';
  const texCima = cimaTipo === 'logo' ? textura('logo', o.corCima) : (cimaTipo === 'tshirt' && o.padrao === 'liso' ? textura('tshirt', o.corCima) : textura(o.padrao, o.corCima));
  if (temVestido && o.padrao === 'liso') texCima.repeat.set(4, 4);
  const gc = geoPeca(gen, forte, cimaTipo);
  if (gc) juntarSkin(gc, new THREE.MeshStandardMaterial({ map: texCima, roughness: cimaTipo === 'casaco' ? 0.75 : 0.88, side: THREE.DoubleSide }));
  if (!temVestido && o.baixo !== 'nenhum') {
    const pb = o.baixo === 'ganga' || o.baixo === 'calcoes' ? 'ganga' : (o.baixo === 'saia' ? o.padraoBaixo : 'liso');
    const gb = geoPeca(gen, forte, o.baixo);
    if (gb) juntarSkin(gb, new THREE.MeshStandardMaterial({ map: textura(pb, o.corBaixo), roughness: 0.9, side: THREE.DoubleSide }));
  }
  const P = (n) => B[n][1], cabPos = [0, 1.618, 0.004];
  const cab = new THREE.Group(); cab.position.set(cabPos[0] - P('head')[0], cabPos[1] - P('head')[1], cabPos[2] - P('head')[2]);
  if (gen === 'f') cab.scale.setScalar(0.95);
  ossos.head.add(cab);
  const mCab = new THREE.Mesh(geoCabeca(gen, o.rosto % 4), matPele(peleHex, true)); mCab.castShadow = true; mCab.receiveShadow = true; cab.add(mCab);
  const rs = ROSTOS[o.rosto % 4], palp = [];
  const mBranco = matCor('#ebe2d6', 0.22), mIris = matCor(o.olhos || '#2e1a0e', 0.25), mPup = matCor('#060404', 0.2), mBrilho = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  [-1, 1].forEach((s) => {
    const E = new THREE.Group(); E.position.set(s * rs.olhos, 0.012, 0.0668); cab.add(E);
    const gl = new THREE.Mesh(new THREE.SphereGeometry(0.0156, 24, 18), mBranco); E.add(gl);
    const ir = new THREE.Mesh(new THREE.CircleGeometry(0.0103, 28), mIris); ir.position.z = 0.015; E.add(ir);
    const pu = new THREE.Mesh(new THREE.CircleGeometry(0.0047, 20), mPup); pu.position.z = 0.0153; E.add(pu);
    const br = new THREE.Mesh(new THREE.CircleGeometry(0.0021, 10), mBrilho); br.position.set(0.0032, 0.0036, 0.0156); E.add(br);
    const pi = new THREE.Mesh(new THREE.SphereGeometry(0.0166, 24, 8, 0, PI * 2, PI * 0.62, PI * 0.38), pele); pi.rotation.x = 0.2; pi.scale.setScalar(1.03); E.add(pi);
    const pl = new THREE.Mesh(new THREE.SphereGeometry(0.0168, 24, 10, 0, PI * 2, 0, PI * 0.5), pele); pl.rotation.x = -0.45; pl.scale.set(1.05, 1.05, 1.05); E.add(pl); palp.push(pl);
    const cil = new THREE.Mesh(new THREE.TorusGeometry(0.0166, gen === 'f' ? 0.0017 : 0.0011, 6, 20, PI * 0.9), matCor('#0b0706', 0.6));
    cil.rotation.set(-0.05, 0, PI * 0.05); cil.position.z = 0.0035; cil.scale.set(1.02, 1, 1); E.add(cil); palp.push(cil);
  });
  const boca = new THREE.Mesh(new THREE.SphereGeometry(0.011, 16, 10), matCor('#2a0e0b', 0.7)); boca.scale.set(1.5, 0.02, 0.5); boca.position.set(0, -0.0545, 0.091); cab.add(boca);
  const mats = { cabelo: new THREE.MeshStandardMaterial({ color: o.corCabelo, roughness: 0.78, metalness: 0.0 }), contas: matCor('#c79a5e', 0.55), lenco: new THREE.MeshStandardMaterial({ map: textura('capulana', o.corLenco || o.corCima), roughness: 0.85 }) };
  geoCabelo(o.cabelo, gen).forEach(({ geo, mat }) => { const m = new THREE.Mesh(geo, mats[mat]); m.castShadow = true; cab.add(m); });
  ['L', 'R'].forEach((l) => {
    const s = l === 'L' ? 1 : -1, m = new THREE.Mesh(geoMao(gen, s), pele); m.castShadow = true;
    m.rotation.z = s * ANG; ossos['hand' + l].add(m);
    const c = new THREE.Mesh(geoCalcado(o.calcado), matCor(o.corCalcado, o.calcado === 'botas' ? 0.6 : 0.5)); c.castShadow = true; ossos['foot' + l].add(c);
    if (o.calcado === 'tenis') { const sola = new THREE.Mesh(new THREE.BoxGeometry(0.094, 0.012, 0.25), matCor('#f4f2ec', 0.6)); sola.position.set(0, -0.079, 0.045); ossos['foot' + l].add(sola); }
  });
  const ac = new Set(o.acessorios || []);
  if (ac.has('oculos')) {
    const mo = matCor('#0e0e10', 0.25, 0.3), lente = new THREE.MeshPhysicalMaterial({ color: '#141d26', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.85, clearcoat: 1 });
    [-1, 1].forEach((s) => {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.026, 24, 12, 0, PI * 2, 0, 0.55), lente); l.rotation.x = PI / 2; l.scale.set(1.0, 0.75, 0.3); l.position.set(s * rs.olhos, 0.012, 0.086); cab.add(l);
      const a = new THREE.Mesh(new THREE.TorusGeometry(0.0205, 0.0022, 8, 28), mo); a.scale.set(1.0, 0.78, 1); a.position.set(s * rs.olhos, 0.012, 0.094); cab.add(a);
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.004, 0.09), mo); h.position.set(s * 0.083, 0.016, 0.045); cab.add(h);
    });
    const pt = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.02, 6), mo); pt.rotation.z = PI / 2; pt.position.set(0, 0.018, 0.097); cab.add(pt);
  }
  if (ac.has('argolas')) [-1, 1].forEach((s) => { const b = new THREE.Mesh(new THREE.TorusGeometry(0.013, 0.0016, 8, 24), matCor('#e0b24a', 0.25, 1)); b.rotation.y = PI / 2; b.position.set(s * 0.093, -0.033, -0.006); cab.add(b); });
  if (ac.has('fio')) { const fio = new THREE.Mesh(new THREE.TorusGeometry(gen === 'f' ? 0.072 : 0.082, 0.0028, 8, 48), matCor('#e3b64f', 0.2, 1)); fio.rotation.x = PI / 2 + 0.45; fio.position.set(0, 1.385 - P('chest')[1], 0.03); ossos.chest.add(fio); }
  if (ac.has('relogio')) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.02, 20, 1, true), matCor('#cfd2d6', 0.25, 1)); r.material.side = THREE.DoubleSide;
    const d = [sin(ANG), -cos(ANG), 0]; r.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...d)); r.position.set(d[0] * 0.21, d[1] * 0.21, 0); ossos.foreArmL.add(r);
    const mostr = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.006, 20), matCor('#1d2a3a', 0.2, 0.5)); mostr.rotation.z = PI / 2; mostr.position.set(d[0] * 0.21 + 0.03, d[1] * 0.21, 0); ossos.foreArmL.add(mostr);
  }
  if (ac.has('mochila')) {
    const g = cache('mochila', () => geoDe(malhar(forma([{ p: caixa(0, 0, 0, 0.13, 0.18, 0.06, 0.04), k: 0 }, { p: caixa(0, -0.07, 0.06, 0.09, 0.07, 0.025, 0.02), k: 0.01 }]), [-0.16, -0.22, -0.1], [0.16, 0.22, 0.12], 0.008), null, false, null));
    const m = new THREE.Mesh(g, matCor(o.corMochila || '#5a3a24', 0.8)); m.position.set(0, 1.25 - P('chest')[1], -0.165); m.castShadow = true; ossos.chest.add(m);
    [-1, 1].forEach((s) => { const a = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.008, 6, 24, PI * 0.9), matCor('#3a2618', 0.8)); a.rotation.set(0, PI / 2, PI * 0.55); a.position.set(s * 0.09, 1.33 - P('chest')[1], -0.04); ossos.chest.add(a); });
  }
  if (ac.has('bone')) {
    const mb = matCor('#14151a', 0.7);
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.1, 32, 16, 0, PI * 2, 0, PI * 0.5), mb); c.scale.set(0.98, 1.05, 1.08); c.position.set(0, 0.035, -0.012); c.rotation.x = -0.12; cab.add(c);
    const faixa = new THREE.Mesh(new THREE.CylinderGeometry(0.098, 0.1, 0.022, 32, 1, true), mb); faixa.material.side = THREE.DoubleSide; faixa.scale.set(0.98, 1, 1.08); faixa.position.set(0, 0.03, -0.012); faixa.rotation.x = -0.12; cab.add(faixa);
    const pala = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.006, 28, 1, false, -PI / 2, PI), mb); pala.position.set(0, 0.035, 0.1); pala.rotation.x = 0.12; pala.scale.set(1, 1, 0.9); cab.add(pala);
  }
  raiz.scale.setScalar((o.altura || 1) * (gen === 'f' ? 0.965 : 1));
  return { raiz, ossos, boca, palp, restHipsY: B.hips[1][1] };
}

const lerpAng = (cur, target, k) => cur + (target - cur) * k;

/**
 * Personagem v3 — interface igual à de `Humanoid2` (ver humanoid2.js) para que
 * `actors.js`, `player.js` e `creator.js` possam usar qualquer uma delas.
 */
export class Humanoid3 {
  constructor(appearance, { shadows = true } = {}) {
    this.a = appearance ?? {};
    this.shadows = shadows;
    this.anim = 'idle';
    this.emote = null;
    this.phase = Math.random() * 10;
    this.pose = {};
    this.face = { smile: 0, sad: 0, open: 0, round: 0, blink: 0 };
    this.nextBlink = 1 + Math.random() * 3;
    const o = paraV3(this.a);
    const { raiz, ossos, boca, palp, restHipsY } = construir(o);
    this.root = raiz;
    this.bones = ossos;
    this.boca = boca;
    this.palp = palp;
    this.restHipsY = restHipsY;
    if (!shadows) this.root.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; } });
  }

  setAnim(anim) { if (anim) this.anim = anim; }
  playEmote(id, fn, { startedAtMs = performance.now(), dir = null } = {}) { this.emote = { id, fn, t0: startedAtMs, dir }; }
  stopEmote() { this.emote = null; }
  setHandPose() { /* mãos sem dedos articuláveis nesta versão */ }

  // Pose base (andar, correr, saltar, sentar, trabalhar, falar, acenar, idle).
  // Idêntica à de Humanoid2 (mesma semântica de nomes de ossos) — ver ali os comentários.
  basePose(dt, speed) {
    const a = this.anim;
    const run = a === 'run' || speed > 3.2;
    const moving = a === 'walk' || a === 'run' || speed > 0.3;
    const stride = run ? 1.45 : 1.75;
    this.phase += dt * (moving ? Math.max(1.4, speed) * Math.PI / stride : 1);
    const p = this.phase;
    const t = performance.now() / 1000;
    const T = {
      thighL: [0, 0, 0], thighR: [0, 0, 0], shinL: [0, 0, 0], shinR: [0, 0, 0], footL: [0, 0, 0], footR: [0, 0, 0],
      upperArmL: [0, 0, 0.09], upperArmR: [0, 0, -0.09], foreArmL: [-0.12, 0, 0], foreArmR: [-0.12, 0, 0], handL: [0, 0, 0], handR: [0, 0, 0],
      spine: [0.02, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0], hips: [0, 0, 0], hipsY: 0,
      face: { smile: 0.12, sad: 0, open: 0, round: 0 },
    };
    if (a === 'sit') {
      Object.assign(T, { thighL: [-1.5, 0, 0.05], thighR: [-1.5, 0, -0.05], shinL: [1.5, 0, 0], shinR: [1.5, 0, 0], hipsY: -0.47, spine: [-0.06, 0, 0], upperArmL: [-0.35, 0, 0.12], upperArmR: [-0.35, 0, -0.12], foreArmL: [-0.6, 0, 0], foreArmR: [-0.6, 0, 0] });
      T.head = [0, Math.sin(t * 0.4 + p) * 0.2, 0];
    } else if (a === 'drive') {
      Object.assign(T, { thighL: [-1.35, 0, 0], thighR: [-1.35, 0, 0], shinL: [1.15, 0, 0], shinR: [1.15, 0, 0], hipsY: -0.44, upperArmL: [-1.0, 0, 0.15], upperArmR: [-1.0, 0, -0.15], foreArmL: [-0.55, 0, 0], foreArmR: [-0.55, 0, 0], spine: [-0.12, 0, 0] });
    } else if (moving) {
      const amp = run ? 0.82 : 0.48;
      const sp = Math.sin(p);
      T.thighL = [sp * amp - (run ? 0.15 : 0), 0, 0];
      T.thighR = [-sp * amp - (run ? 0.15 : 0), 0, 0];
      T.shinL = [Math.max(0, -Math.cos(p)) * (run ? 1.55 : 0.75) + 0.06, 0, 0];
      T.shinR = [Math.max(0, Math.cos(p)) * (run ? 1.55 : 0.75) + 0.06, 0, 0];
      T.footL = [Math.max(0, Math.cos(p)) * 0.25 - 0.05, 0, 0];
      T.footR = [Math.max(0, -Math.cos(p)) * 0.25 - 0.05, 0, 0];
      T.upperArmL = [-sp * amp * 0.85, 0, 0.1];
      T.upperArmR = [sp * amp * 0.85, 0, -0.1];
      T.foreArmL = [run ? -1.35 : -0.35 - Math.max(0, -sp) * 0.3, 0, 0];
      T.foreArmR = [run ? -1.35 : -0.35 - Math.max(0, sp) * 0.3, 0, 0];
      T.spine = [T.spine[0] + (run ? 0.2 : 0.04), sp * 0.08, 0];
      T.chest = [0, -sp * 0.12, 0];
      T.hips = [0, sp * 0.1, Math.sin(p) * 0.03];
      T.hipsY = -Math.abs(Math.cos(p)) * (run ? 0.06 : 0.025) - (run ? 0.03 : 0);
    } else if (a === 'jump') {
      Object.assign(T, { thighL: [-0.7, 0, 0], thighR: [-0.35, 0, 0], shinL: [1.1, 0, 0], shinR: [0.8, 0, 0], upperArmL: [-2.3, 0, 0.3], upperArmR: [-2.3, 0, -0.3], foreArmL: [-0.2, 0, 0], foreArmR: [-0.2, 0, 0] });
    } else {
      const br = Math.sin(t * 1.5 + p) * 0.018;
      T.spine = [T.spine[0] + br, 0, 0];
      T.chest = [-br * 0.5, 0, 0];
      T.hips = [0, 0, Math.sin(t * 0.35 + p) * 0.025];
      T.head = [0, Math.sin(t * 0.3 + p) * 0.3, Math.sin(t * 0.21) * 0.04];
      if (a === 'work') {
        T.upperArmL = [-0.85 + Math.sin(t * 2.2 + p) * 0.25, 0, 0.15];
        T.upperArmR = [-0.7 + Math.cos(t * 2.0 + p) * 0.3, 0, -0.15];
        T.foreArmL = [-1.2, 0, 0];
        T.foreArmR = [-1.0 + Math.sin(t * 3 + p) * 0.3, 0, 0];
        T.spine[0] += 0.14;
        T.head = [0.2, Math.sin(t * 0.8 + p) * 0.2, 0];
      } else if (a === 'talk' || a === 'talk_idle') {
        T.upperArmR = [-0.45 + Math.sin(t * 2.4 + p) * 0.22, 0, -0.2];
        T.foreArmR = [-1.15 + Math.sin(t * 3.1) * 0.3, 0.3, 0];
        if (a === 'talk') T.upperArmL = [-0.3 + Math.cos(t * 1.9) * 0.2, 0, 0.2];
        T.neck = [Math.sin(t * 3.0 + p) * 0.06, 0, 0];
        T.head = [0, Math.sin(t * 0.9 + p) * 0.15, 0];
        T.face = { ...T.face, smile: 0.35, open: Math.max(0, Math.sin(t * 9 + p)) * 0.5 };
      } else if (a === 'wave') {
        T.upperArmR = [-0.4, 0, -2.6];
        T.foreArmR = [-0.25, 0, -0.3 + Math.sin(t * 9) * 0.45];
        T.face = { ...T.face, smile: 0.8 };
      }
    }
    return T;
  }

  update(dt, speed = 0) {
    let T = this.basePose(dt, speed);
    if (this.emote) {
      const et = (performance.now() - this.emote.t0) / 1000;
      const E = this.emote.fn(et, this);
      if (E === null) this.emote = null;
      else T = { ...T, ...E, face: { ...T.face, ...(E.face ?? {}) } };
    }
    const k = 1 - Math.exp(-dt * 11);
    const P = this.pose;
    for (const name of BONES) {
      const target = name === 'hips' ? T.hips : T[name] ?? [0, 0, 0];
      const cur = (P[name] ??= [0, 0, 0]);
      for (let i = 0; i < 3; i++) cur[i] = lerpAng(cur[i], target[i], k);
      const b = this.bones[name];
      b.rotation.set(cur[0], cur[1], cur[2]);
    }
    P.hipsY = lerpAng(P.hipsY ?? 0, T.hipsY ?? 0, k);
    this.bones.hips.position.y = this.restHipsY + P.hipsY;
    this.bones.hips.position.x = T.hipsX ?? 0;
    const fk = 1 - Math.exp(-dt * 8);
    for (const key of ['smile', 'sad', 'open', 'round']) this.face[key] = lerpAng(this.face[key], T.face[key] ?? 0, fk);
    this.boca.scale.y = 0.02 + Math.max(0, this.face.open + this.face.round * 0.6) * 0.55;
    this.nextBlink -= dt;
    if (this.nextBlink < 0) { this.face.blink = 1; this.nextBlink = 2 + Math.random() * 4; }
    this.face.blink = Math.max(0, this.face.blink - dt * 7);
    this.palp.forEach((pl, i) => { pl.rotation.x = (i % 2 === 0 ? -0.45 : -0.05) + this.face.blink * (i % 2 === 0 ? 0.95 : 0.9); });
  }

  dispose() { this.root.removeFromParent(); }
}
