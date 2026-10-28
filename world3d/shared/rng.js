/** Gerador pseudo-aleatório determinístico (mulberry32) e hash de strings (FNV-1a). */

export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const next = mulberry32(typeof seed === 'string' ? hashString(seed) : seed);
  return {
    next,
    range: (a, b) => a + (b - a) * next(),
    int: (a, b) => a + Math.floor(next() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    weighted(entries) {
      // entries: [[valor, peso], ...]
      const total = entries.reduce((s, [, w]) => s + Math.max(0, w), 0);
      let r = next() * total;
      for (const [v, w] of entries) {
        r -= Math.max(0, w);
        if (r <= 0) return v;
      }
      return entries[entries.length - 1][0];
    },
  };
}
