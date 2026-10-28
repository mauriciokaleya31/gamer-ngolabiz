/**
 * SDF + Surface Nets — esculpir formas orgânicas sem costuras (NgolaBiz World 3D).
 *
 * Motor de modelação por campos de distância com sinal (primitivas, operações
 * booleanas suaves) poligonalizado por Surface Nets (malha contínua, sem juntas
 * visíveis entre partes do corpo — ao contrário de cápsulas/caixas encostadas).
 *
 * Porta directa (apenas módulo ES em vez de global `window.NgolaSDF`) do motor
 * usado nas personagens v3 fornecidas pelo utilizador. Algoritmo inalterado.
 */
const sqrt = Math.sqrt, abs = Math.abs, max = Math.max, min = Math.min;

// ---- primitivas: devolvem {d(x,y,z), c:[cx,cy,cz], r:raio de envolvimento}
export function esfera(cx, cy, cz, r) { return { d: (x, y, z) => sqrt((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2) - r, c: [cx, cy, cz], r }; }
export function elipsoide(cx, cy, cz, rx, ry, rz) {
  return {
    d: (x, y, z) => {
      const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz;
      const k0 = sqrt(px * px + py * py + pz * pz);
      const k1 = sqrt((px / rx) ** 2 + (py / ry) ** 2 + (pz / rz) ** 2);
      return k1 < 1e-9 ? -min(rx, ry, rz) : k0 * (k0 - 1) / k1;
    }, c: [cx, cy, cz], r: max(rx, ry, rz),
  };
}
// cone arredondado entre a e b (Inigo Quilez)
export function cone(a, b, r1, r2) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz, rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  return {
    d: (x, y, z) => {
      const pax = x - a[0], pay = y - a[1], paz = z - a[2];
      const yy = pax * bax + pay * bay + paz * baz, zz = yy - l2;
      const qx = pax * l2 - bax * yy, qy = pay * l2 - bay * yy, qz = paz * l2 - baz * yy;
      const x2 = qx * qx + qy * qy + qz * qz, y2 = yy * yy * l2, z2 = zz * zz * l2;
      const k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(zz) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
      if (Math.sign(yy) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
      return (sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
    },
    c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], r: sqrt(l2) / 2 + max(r1, r2),
  };
}
export function caixa(cx, cy, cz, hx, hy, hz, rr = 0) {
  return {
    d: (x, y, z) => {
      const qx = abs(x - cx) - hx + rr, qy = abs(y - cy) - hy + rr, qz = abs(z - cz) - hz + rr;
      return sqrt(max(qx, 0) ** 2 + max(qy, 0) ** 2 + max(qz, 0) ** 2) + min(max(qx, qy, qz), 0) - rr;
    }, c: [cx, cy, cz], r: sqrt(hx * hx + hy * hy + hz * hz),
  };
}
export function smin(a, b, k) { if (k <= 0) return min(a, b); const h = max(k - abs(a - b), 0) / k; return min(a, b) - h * h * k * 0.25; }
export function smax(a, b, k) { return -smin(-a, -b, k); }

// ---- forma composta: lista de operações {p, k, op:'+'|'-'|'&'|'f'}
export function forma(ops) {
  return (x, y, z) => {
    let d = 1e9;
    for (let i = 0; i < ops.length; i++) {
      const o = ops[i], p = o.p;
      if (o.op === '+' || !o.op) {
        // salto rápido: longe da esfera envolvente
        const bx = x - p.c[0], by = y - p.c[1], bz = z - p.c[2];
        const lim = sqrt(bx * bx + by * by + bz * bz) - p.r;
        if (lim > d + o.k) continue;
        d = smin(d, p.d(x, y, z), o.k);
      } else if (o.op === '-') {
        const bx = x - p.c[0], by = y - p.c[1], bz = z - p.c[2];
        if (sqrt(bx * bx + by * by + bz * bz) - p.r > o.k + 0.002) continue;
        d = smax(d, -p.d(x, y, z), o.k);
      } else if (o.op === '&') d = smax(d, p.d(x, y, z), o.k);
      else if (o.op === 'f') d = o.f(d, x, y, z);
    }
    return d;
  };
}

// ---- Surface Nets
export function malhar(sdf, lo, hi, passo) {
  const nx = Math.ceil((hi[0] - lo[0]) / passo) + 1, ny = Math.ceil((hi[1] - lo[1]) / passo) + 1, nz = Math.ceil((hi[2] - lo[2]) / passo) + 1;
  const V = new Float32Array(nx * ny * nz);
  const id = (i, j, k) => i + nx * (j + ny * k);
  // grelha grossa primeiro: só se avalia em detalhe perto da superfície
  const F = 4, cx = Math.ceil((nx - 1) / F) + 1, cy = Math.ceil((ny - 1) / F) + 1, cz = Math.ceil((nz - 1) / F) + 1;
  const G = new Float32Array(cx * cy * cz), gid = (i, j, k) => i + cx * (j + cy * k);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) G[gid(i, j, k)] = sdf(lo[0] + i * F * passo, lo[1] + j * F * passo, lo[2] + k * F * passo);
  const lim = passo * F * 0.95;
  for (let k = 0; k < nz; k++) { const z = lo[2] + k * passo, gk = Math.min(cz - 1, Math.round(k / F));
    for (let j = 0; j < ny; j++) { const y = lo[1] + j * passo, gj = Math.min(cy - 1, Math.round(j / F));
      for (let i = 0; i < nx; i++) { const g = G[gid(Math.min(cx - 1, Math.round(i / F)), gj, gk)];
        V[id(i, j, k)] = Math.abs(g) > lim ? g : sdf(lo[0] + i * passo, y, z); } } }
  const cel = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cid = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const pos = [];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const C = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const v = new Float32Array(8);
  let nv = 0;
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let neg = 0;
    for (let c = 0; c < 8; c++) { v[c] = V[id(i + C[c][0], j + C[c][1], k + C[c][2])]; if (v[c] < 0) neg++; }
    if (neg === 0 || neg === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of E) {
      if ((v[a] < 0) === (v[b] < 0)) continue;
      const t = v[a] / (v[a] - v[b]);
      sx += C[a][0] + (C[b][0] - C[a][0]) * t; sy += C[a][1] + (C[b][1] - C[a][1]) * t; sz += C[a][2] + (C[b][2] - C[a][2]) * t; n++;
    }
    cel[cid(i, j, k)] = nv++;
    pos.push(lo[0] + (i + sx / n) * passo, lo[1] + (j + sy / n) * passo, lo[2] + (k + sz / n) * passo);
  }
  const ind = [];
  const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) ind.push(a, c, b, a, d, c); else ind.push(a, b, c, a, c, d); };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = V[id(i, j, k)], b = V[id(i + 1, j, k)]; if ((a < 0) === (b < 0)) continue;
    quad(cel[cid(i, j - 1, k - 1)], cel[cid(i, j, k - 1)], cel[cid(i, j, k)], cel[cid(i, j - 1, k)], a >= 0);
  }
  for (let k = 1; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const a = V[id(i, j, k)], b = V[id(i, j + 1, k)]; if ((a < 0) === (b < 0)) continue;
    quad(cel[cid(i - 1, j, k - 1)], cel[cid(i - 1, j, k)], cel[cid(i, j, k)], cel[cid(i, j, k - 1)], a >= 0);
  }
  for (let k = 0; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const a = V[id(i, j, k)], b = V[id(i, j, k + 1)]; if ((a < 0) === (b < 0)) continue;
    quad(cel[cid(i - 1, j - 1, k)], cel[cid(i, j - 1, k)], cel[cid(i, j, k)], cel[cid(i - 1, j, k)], a >= 0);
  }
  // normais pelo gradiente da SDF
  const nor = new Float32Array(pos.length), e = passo * 0.5;
  for (let q = 0; q < pos.length; q += 3) {
    const x = pos[q], y = pos[q + 1], z = pos[q + 2];
    let gx = sdf(x + e, y, z) - sdf(x - e, y, z), gy = sdf(x, y + e, z) - sdf(x, y - e, z), gz = sdf(x, y, z + e) - sdf(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1; nor[q] = gx / l; nor[q + 1] = gy / l; nor[q + 2] = gz / l;
  }
  return { pos: new Float32Array(pos), nor, ind: nv > 65535 ? new Uint32Array(ind) : new Uint16Array(ind) };
}
