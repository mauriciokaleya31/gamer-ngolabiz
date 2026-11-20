/**
 * Personagem humanoide procedural (MODELO PROVISÓRIO, claramente identificado).
 *
 * Esqueleto hierárquico (anca → coluna → peito → pescoço → cabeça; ombros → braços;
 * coxas → pernas) com animação procedural por mistura de poses: idle, walk, run,
 * jump, sit, work, talk, wave, drive. A aparência (género, tom de pele, rosto,
 * cabelo, roupa, padrão, acessório, altura, tipo de corpo, postura) vem de dados,
 * o que permite centenas de variações sem modelos idênticos.
 *
 * No cliente UE5 este papel é desempenhado por Skeletal Meshes (ex.: MetaHuman ou
 * modelos licenciados) com Animation Blueprints — ver docs/UNREAL.md.
 */
import * as THREE from 'three';

const GEO = new Map();
const MAT = new Map();

function geo(key, make) {
  if (!GEO.has(key)) GEO.set(key, make());
  return GEO.get(key);
}

const PATTERN_TEX = new Map();
function patternTexture(kind, color) {
  const key = `${kind}:${color}`;
  if (PATTERN_TEX.has(key)) return PATTERN_TEX.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.fillRect(0, 0, 128, 128);
  if (kind === 'riscas') {
    g.fillStyle = 'rgba(255,255,255,0.75)';
    for (let y = 0; y < 128; y += 16) g.fillRect(0, y, 128, 6);
  } else if (kind === 'capulana') {
    // padrão inspirado em panos africanos (formas geométricas originais)
    const cols = ['#f9a825', '#1b5e20', '#0d47a1', '#ffffff', '#4e342e'];
    for (let y = 0; y < 128; y += 32) {
      for (let x = 0; x < 128; x += 32) {
        g.fillStyle = cols[((x + y) / 32) % cols.length];
        g.beginPath();
        g.arc(x + 16, y + 16, 11, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = color;
        g.beginPath();
        g.arc(x + 16, y + 16, 5, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.35)';
        g.lineWidth = 2;
        g.strokeRect(x + 2, y + 2, 28, 28);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  PATTERN_TEX.set(key, t);
  return t;
}

function mat(color, { pattern = 'liso', rough = 0.85, metal = 0, emissive = null } = {}) {
  const key = `${color}|${pattern}|${rough}|${metal}|${emissive}`;
  if (MAT.has(key)) return MAT.get(key);
  const m = new THREE.MeshStandardMaterial({ color: pattern === 'liso' ? color : 0xffffff, roughness: rough, metalness: metal });
  if (pattern !== 'liso') m.map = patternTexture(pattern, color);
  if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = 1; }
  MAT.set(key, m);
  return m;
}

const LONG_SLEEVES = new Set(['camisa', 'casaco_leve', 'uniforme_seguranca', 'macacao', 'fato_treino', 'blazer', 'camisa_avental']);
const DRESS_TOPS = new Set(['vestido']);
const SKIRTS = new Set(['saia', 'saia_capulana']);
const SHORTS = new Set(['calcoes']);

function limb(len, r, material, key) {
  const g = geo(`limb:${len.toFixed(2)}:${r.toFixed(3)}:${key}`, () => {
    const cg = new THREE.CapsuleGeometry(r, Math.max(0.01, len - 2 * r), 4, 8);
    cg.translate(0, -len / 2, 0);
    return cg;
  });
  const m = new THREE.Mesh(g, material);
  m.castShadow = true;
  return m;
}

export class Humanoid {
  /**
   * @param {object} appearance ver server/src/npc/population.js (generateAppearance)
   * @param {{shadows?:boolean}} opts
   */
  constructor(appearance, { shadows = true } = {}) {
    this.a = { gender: 'm', height: 1.75, bodyType: 'medio', skinTone: '#6b4430', hairStyle: 'curto', hairColor: '#1b1410', top: 't-shirt', topColor: '#1e88e5', topPattern: 'liso', bottom: 'calca_ganga', bottomColor: '#1c2a48', shoes: '#1a1a1a', accessory: 'nenhum', posture: 'normal', face: { shape: 0, eyes: 0, beard: 'nenhuma' }, ...appearance };
    this.root = new THREE.Group();
    this.root.name = 'humanoid';
    this.pose = {};
    this.phase = Math.random() * Math.PI * 2;
    this.anim = 'idle';
    this.blend = 0;
    this.shadows = shadows;
    this.build();
  }

  build() {
    const a = this.a;
    const f = a.gender === 'f';
    const s = a.height / 1.75;
    const wide = a.bodyType === 'robusto' ? 1.18 : a.bodyType === 'magro' ? 0.9 : 1;
    const skin = mat(a.skinTone, { rough: 0.6 });
    const topM = mat(a.topColor, { pattern: a.topPattern ?? 'liso' });
    const botM = mat(a.bottom === 'macacao' ? a.topColor : a.bottomColor, { pattern: a.bottom === 'saia_capulana' ? 'capulana' : 'liso' });
    const shoeM = mat(a.shoes, { rough: 0.5 });
    const hairM = mat(a.hairColor, { rough: 0.9 });

    const legLen = 0.86 * s;
    const thighL = legLen * 0.52;
    const shinL = legLen * 0.48;
    const torsoL = 0.55 * s;
    const shoulderW = (f ? 0.17 : 0.2) * s * wide;
    const hipW = (f ? 0.11 : 0.095) * s * wide;
    this.dims = { legLen, thighL, shinL, torsoL, s };

    const hips = new THREE.Group();
    hips.position.y = legLen;
    this.root.add(hips);
    const spine = new THREE.Group();
    hips.add(spine);
    const chest = new THREE.Group();
    chest.position.y = torsoL * 0.5;
    spine.add(chest);

    // tronco: parte inferior (anca) e superior (peito) com proporções por género
    const pelvis = new THREE.Mesh(geo(`pelvis:${f}:${wide}:${s}`, () => {
      const g = new THREE.CapsuleGeometry(0.13 * s * wide * (f ? 1.08 : 1), 0.12 * s, 4, 10);
      g.scale(1, 1, 0.68);
      g.translate(0, 0.06 * s, 0);
      return g;
    }), DRESS_TOPS.has(a.top) ? topM : (a.bottom === 'macacao' ? topM : botM));
    spine.add(pelvis);
    const torso = new THREE.Mesh(geo(`torso:${f}:${wide}:${s}`, () => {
      const g = new THREE.CapsuleGeometry(0.15 * s * wide * (f ? 0.93 : 1), torsoL * 0.38, 4, 10);
      g.scale(f ? 1.0 : 1.08, 1, 0.62);
      return g;
    }), topM);
    torso.position.y = 0;
    chest.add(torso);

    // pescoço + cabeça
    const neck = new THREE.Group();
    neck.position.y = torsoL * 0.36;
    chest.add(neck);
    const neckM = new THREE.Mesh(geo(`neck:${s}`, () => new THREE.CylinderGeometry(0.045 * s, 0.05 * s, 0.1 * s, 8)), skin);
    neckM.position.y = 0.04 * s;
    neck.add(neckM);
    const head = new THREE.Group();
    head.position.y = 0.11 * s;
    neck.add(head);
    const faceShape = [1, 1.06, 0.95, 1.02][a.face?.shape ?? 0];
    const headM = new THREE.Mesh(geo(`head:${s}:${faceShape}:${f}`, () => {
      const g = new THREE.SphereGeometry(0.105 * s, 16, 12);
      g.scale(f ? 0.92 : 0.95, 1.12 * faceShape, 1.0);
      g.translate(0, 0.09 * s, 0.005);
      return g;
    }), skin);
    head.add(headM);
    // traços do rosto: olhos, sobrancelhas, nariz, boca
    const eyeM = mat('#111111', { rough: 0.3 });
    const eyeY = 0.11 * s;
    const eyeSpread = [0.036, 0.04, 0.034, 0.038][a.face?.eyes ?? 0] * s;
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(geo('eye', () => new THREE.SphereGeometry(0.011, 8, 6)), eyeM);
      eye.position.set(sx * eyeSpread, eyeY, 0.095 * s);
      head.add(eye);
      const brow = new THREE.Mesh(geo('brow', () => new THREE.BoxGeometry(0.03, 0.006, 0.01)), hairM);
      brow.position.set(sx * eyeSpread, eyeY + 0.022 * s, 0.098 * s);
      head.add(brow);
    }
    const nose = new THREE.Mesh(geo(`nose:${s}`, () => new THREE.SphereGeometry(0.016 * s, 8, 6)), skin);
    nose.position.set(0, 0.085 * s, 0.108 * s);
    nose.scale.set(1.2, 1, 0.9);
    head.add(nose);
    const mouth = new THREE.Mesh(geo('mouth', () => new THREE.BoxGeometry(0.035, 0.007, 0.01)), mat('#5a2a2a'));
    mouth.position.set(0, 0.05 * s, 0.1 * s);
    head.add(mouth);
    this.addHair(head, a, s, hairM);
    this.addBeard(head, a, s, hairM);
    this.addAccessory(head, chest, a, s);

    // braços
    const armUpper = 0.29 * s;
    const armLower = 0.27 * s;
    const longSleeves = LONG_SLEEVES.has(a.top);
    const limbs = {};
    for (const side of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(side * shoulderW, torsoL * 0.28, 0);
      chest.add(sh);
      const ua = limb(armUpper, 0.045 * s * wide, DRESS_TOPS.has(a.top) && !longSleeves ? skin : topM, 'ua');
      sh.add(ua);
      const el = new THREE.Group();
      el.position.y = -armUpper;
      sh.add(el);
      el.add(limb(armLower, 0.038 * s * wide, longSleeves ? topM : skin, 'la'));
      const hand = new THREE.Mesh(geo(`hand:${s}`, () => new THREE.SphereGeometry(0.042 * s, 8, 6)), skin);
      hand.position.y = -armLower - 0.02 * s;
      hand.scale.set(0.8, 1.1, 0.55);
      el.add(hand);
      limbs[side < 0 ? 'shL' : 'shR'] = sh;
      limbs[side < 0 ? 'elL' : 'elR'] = el;
    }
    // pernas
    const shorts = SHORTS.has(a.bottom);
    const skirt = SKIRTS.has(a.bottom) || DRESS_TOPS.has(a.top);
    for (const side of [-1, 1]) {
      const hp = new THREE.Group();
      hp.position.set(side * hipW, 0, 0);
      hips.add(hp);
      hp.add(limb(thighL, 0.068 * s * wide, skirt ? skin : botM, 'th'));
      const kn = new THREE.Group();
      kn.position.y = -thighL;
      hp.add(kn);
      kn.add(limb(shinL, 0.052 * s * wide, shorts || skirt ? skin : botM, 'sh'));
      const foot = new THREE.Mesh(geo(`foot:${s}`, () => { const g = new THREE.BoxGeometry(0.09 * s, 0.07 * s, 0.24 * s); g.translate(0, -0.035 * s, 0.05 * s); return g; }), shoeM);
      foot.position.y = -shinL;
      foot.castShadow = true;
      kn.add(foot);
      limbs[side < 0 ? 'hipL' : 'hipR'] = hp;
      limbs[side < 0 ? 'knL' : 'knR'] = kn;
    }
    if (skirt) {
      const sk = new THREE.Mesh(geo(`skirt:${s}:${wide}:${DRESS_TOPS.has(a.top)}`, () => new THREE.CylinderGeometry(0.15 * s * wide, 0.24 * s * wide, (DRESS_TOPS.has(a.top) ? 0.5 : 0.42) * s, 14, 1, true)), DRESS_TOPS.has(a.top) ? topM : botM);
      sk.material.side = THREE.DoubleSide;
      sk.position.y = -0.14 * s;
      sk.castShadow = true;
      hips.add(sk);
      this.skirt = sk;
    }
    Object.assign(this, { hips, spine, chest, neck, head, ...limbs });
    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = this.shadows; o.receiveShadow = false; } });
  }

  addHair(head, a, s, hairM) {
    const st = a.hairStyle;
    if (st === 'careca') return;
    const cap = (scale = 1.0, low = 0.45) => {
      const m = new THREE.Mesh(geo(`cap:${s}:${scale}:${low}`, () => {
        const g = new THREE.SphereGeometry(0.112 * s * scale, 16, 10, 0, Math.PI * 2, 0, Math.PI * low);
        g.scale(0.97, 1.08, 1.04);
        g.translate(0, 0.1 * s, -0.004);
        return g;
      }), hairM);
      head.add(m);
      return m;
    };
    switch (st) {
      case 'rapado': cap(1.0, 0.42); break;
      case 'curto': cap(1.03, 0.47); break;
      case 'degradê': { const c = cap(1.03, 0.36); c.scale.set(1, 1.15, 1); break; }
      case 'afro': {
        const m = new THREE.Mesh(geo(`afro:${s}`, () => { const g = new THREE.SphereGeometry(0.16 * s, 14, 10); g.translate(0, 0.15 * s, -0.02 * s); return g; }), hairM);
        head.add(m);
        break;
      }
      case 'dreads':
      case 'trancas':
      case 'trancas_curtas': {
        cap(1.04, 0.5);
        const n = st === 'trancas_curtas' ? 10 : 16;
        const len = (st === 'trancas' ? 0.42 : st === 'dreads' ? 0.3 : 0.12) * s;
        for (let i = 0; i < n; i++) {
          const ang = Math.PI * 0.15 + (i / (n - 1)) * Math.PI * 0.7;
          const strand = new THREE.Mesh(geo(`strand:${len.toFixed(2)}`, () => { const g = new THREE.CylinderGeometry(0.012, 0.009, len, 5); g.translate(0, -len / 2, 0); return g; }), hairM);
          strand.position.set(Math.cos(ang) * 0.1 * s, 0.13 * s, -Math.sin(ang) * 0.08 * s);
          strand.rotation.x = -0.25;
          head.add(strand);
        }
        break;
      }
      case 'coque': {
        cap(1.03, 0.5);
        const b = new THREE.Mesh(geo(`bun:${s}`, () => new THREE.SphereGeometry(0.055 * s, 10, 8)), hairM);
        b.position.set(0, 0.2 * s, -0.07 * s);
        head.add(b);
        break;
      }
      case 'liso_comprido': {
        cap(1.05, 0.55);
        const back = new THREE.Mesh(geo(`long:${s}`, () => { const g = new THREE.BoxGeometry(0.2 * s, 0.32 * s, 0.05 * s); g.translate(0, -0.02 * s, -0.09 * s); return g; }), hairM);
        head.add(back);
        break;
      }
      case 'rabo_cavalo': {
        cap(1.04, 0.5);
        const t = new THREE.Mesh(geo(`pony:${s}`, () => { const g = new THREE.CapsuleGeometry(0.03 * s, 0.2 * s, 3, 6); g.translate(0, -0.1 * s, 0); return g; }), hairM);
        t.position.set(0, 0.16 * s, -0.11 * s);
        t.rotation.x = 0.35;
        head.add(t);
        break;
      }
      case 'lenco': {
        const m = new THREE.Mesh(geo(`wrap:${s}`, () => { const g = new THREE.SphereGeometry(0.125 * s, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55); g.scale(1, 1.2, 1.05); g.translate(0, 0.11 * s, -0.01); return g; }), mat(a.topColor, { pattern: 'capulana' }));
        head.add(m);
        break;
      }
      default: cap();
    }
  }

  addBeard(head, a, s, hairM) {
    const b = a.face?.beard;
    if (!b || b === 'nenhuma') return;
    if (b === 'bigode') {
      const m = new THREE.Mesh(geo('stache', () => new THREE.BoxGeometry(0.05, 0.012, 0.012)), hairM);
      m.position.set(0, 0.065 * s, 0.104 * s);
      head.add(m);
      return;
    }
    const m = new THREE.Mesh(geo(`beard:${s}:${b}`, () => {
      const g = new THREE.SphereGeometry(0.1 * s, 12, 8, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45);
      g.scale(0.95, b === 'pera' ? 0.8 : 1.0, 1.02);
      g.translate(0, 0.085 * s, 0.006);
      return g;
    }), hairM);
    head.add(m);
  }

  addAccessory(head, chest, a, s) {
    switch (a.accessory) {
      case 'bone': {
        const c = new THREE.Mesh(geo(`capC:${s}`, () => { const g = new THREE.SphereGeometry(0.118 * s, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.45); g.translate(0, 0.11 * s, 0); return g; }), mat(a.topColor === '#1a237e' ? '#1a237e' : '#222831'));
        const v = new THREE.Mesh(geo('visor', () => new THREE.BoxGeometry(0.16, 0.012, 0.1)), c.material);
        v.position.set(0, 0.155 * s, 0.11 * s);
        head.add(c, v);
        break;
      }
      case 'chapeu': {
        const brim = new THREE.Mesh(geo('brim', () => new THREE.CylinderGeometry(0.2, 0.2, 0.012, 18)), mat('#c8b28a'));
        brim.position.y = 0.19 * s;
        const crown = new THREE.Mesh(geo('crown', () => new THREE.CylinderGeometry(0.1, 0.115, 0.1, 16)), brim.material);
        crown.position.y = 0.24 * s;
        head.add(brim, crown);
        break;
      }
      case 'oculos': {
        const gm = mat('#0b0b0b', { rough: 0.15, metal: 0.4 });
        for (const sx of [-1, 1]) {
          const l = new THREE.Mesh(geo('lens', () => new THREE.BoxGeometry(0.045, 0.028, 0.008)), gm);
          l.position.set(sx * 0.038 * s, 0.11 * s, 0.108 * s);
          head.add(l);
        }
        break;
      }
      case 'auscultadores': {
        const hm = mat('#e53935', { rough: 0.4 });
        const band = new THREE.Mesh(geo('band', () => new THREE.TorusGeometry(0.115, 0.012, 6, 16, Math.PI)), hm);
        band.position.y = 0.1 * s;
        const cups = [-1, 1].map((sx) => { const c = new THREE.Mesh(geo('cup', () => new THREE.CylinderGeometry(0.035, 0.035, 0.03, 10)), hm); c.rotation.z = Math.PI / 2; c.position.set(sx * 0.11 * s, 0.1 * s, 0); return c; });
        head.add(band, ...cups);
        break;
      }
      case 'fio': {
        const chain = new THREE.Mesh(geo('chain', () => new THREE.TorusGeometry(0.08, 0.006, 6, 20)), mat('#d4af37', { rough: 0.25, metal: 1 }));
        chain.rotation.x = Math.PI / 2.4;
        chain.position.set(0, 0.17 * this.dims.s, 0.03);
        chest.add(chain);
        break;
      }
      case 'lenco_cabeca': {
        const m = new THREE.Mesh(geo(`scarf:${s}`, () => { const g = new THREE.TorusGeometry(0.105 * s, 0.022 * s, 6, 18); g.rotateX(Math.PI / 2); g.translate(0, 0.16 * s, 0); return g; }), mat('#d84315', { pattern: 'capulana' }));
        head.add(m);
        break;
      }
      default:
    }
  }

  setAnim(anim) { if (anim) this.anim = anim; }

  /**
   * @param {number} dt segundos
   * @param {number} speed m/s (para a cadência da passada)
   */
  update(dt, speed = 0) {
    const a = this.anim;
    const d = this.dims;
    const run = a === 'run' || speed > 3.2;
    const moving = a === 'walk' || a === 'run' || speed > 0.3;
    const stride = run ? 1.5 : 1.85;
    this.phase += dt * (moving ? Math.max(1.4, speed) * Math.PI / stride : 1.2);
    const p = this.phase;
    const t = performance.now() / 1000;
    const target = {
      hipL: 0, hipR: 0, knL: 0, knR: 0, shL: 0, shR: 0, shLz: 0.1, shRz: 0.1, elL: -0.1, elR: -0.1,
      spine: this.a.posture === 'curvada' ? 0.22 : this.a.posture === 'confiante' ? -0.05 : 0.02,
      neck: 0, headY: 0, hipsY: d.legLen, hipsRot: 0,
    };
    if (a === 'sit') {
      Object.assign(target, { hipL: -1.45, hipR: -1.45, knL: 1.45, knR: 1.45, hipsY: 0.47 * d.s, spine: -0.05, shL: -0.3, shR: -0.3, elL: -0.5, elR: -0.5 });
      target.headY = Math.sin(t * 0.4 + p) * 0.15;
    } else if (a === 'drive') {
      Object.assign(target, { hipL: -1.35, hipR: -1.35, knL: 1.2, knR: 1.2, hipsY: 0.5 * d.s, shL: -1.0, shR: -1.0, elL: -0.6, elR: -0.6, spine: -0.1 });
    } else if (moving) {
      const amp = run ? 0.75 : 0.45;
      target.hipL = Math.sin(p) * amp;
      target.hipR = -Math.sin(p) * amp;
      target.knL = Math.max(0, -Math.cos(p)) * (run ? 1.4 : 0.7) + 0.05;
      target.knR = Math.max(0, Math.cos(p)) * (run ? 1.4 : 0.7) + 0.05;
      target.shL = -Math.sin(p) * amp * 0.9;
      target.shR = Math.sin(p) * amp * 0.9;
      target.elL = target.elR = run ? -1.3 : -0.3;
      target.spine += run ? 0.18 : 0.04;
      target.hipsY = d.legLen - Math.abs(Math.cos(p)) * (run ? 0.06 : 0.025) - (run ? 0.03 : 0);
      target.hipsRot = Math.sin(p) * 0.08;
    } else if (a === 'jump') {
      Object.assign(target, { hipL: -0.6, hipR: -0.3, knL: 1.0, knR: 0.7, shL: -2.4, shR: -2.4, elL: -0.2, elR: -0.2 });
    } else {
      // idle e variantes com gestos
      const breathe = Math.sin(t * 1.6 + p) * 0.02;
      target.spine += breathe;
      target.headY = Math.sin(t * 0.3 + p) * 0.25;
      if (a === 'work') {
        target.shL = -0.9 + Math.sin(t * 2.2 + p) * 0.25;
        target.shR = -0.7 + Math.cos(t * 2.0 + p) * 0.3;
        target.elL = -1.2;
        target.elR = -1.0 + Math.sin(t * 3 + p) * 0.3;
        target.spine += 0.12;
        target.headY = Math.sin(t * 0.8 + p) * 0.2;
      } else if (a === 'talk' || a === 'talk_idle') {
        target.shR = -0.5 + Math.sin(t * 2.4 + p) * 0.25;
        target.elR = -1.1 + Math.sin(t * 3.1) * 0.3;
        target.shL = a === 'talk' ? -0.3 + Math.cos(t * 1.9) * 0.2 : 0;
        target.neck = Math.sin(t * 3.0 + p) * 0.06;
        target.headY = Math.sin(t * 0.9 + p) * 0.12;
      } else if (a === 'wave') {
        target.shR = -2.6;
        target.shRz = 0.45 + Math.sin(t * 9) * 0.35;
        target.elR = -0.4;
        target.headY = 0;
      }
    }
    const k = 1 - Math.exp(-dt * 10);
    const pz = this.pose;
    for (const key of Object.keys(target)) pz[key] = (pz[key] ?? target[key]) + (target[key] - (pz[key] ?? target[key])) * k;
    this.hipL.rotation.x = pz.hipL;
    this.hipR.rotation.x = pz.hipR;
    this.knL.rotation.x = pz.knL;
    this.knR.rotation.x = pz.knR;
    this.shL.rotation.x = pz.shL;
    this.shR.rotation.x = pz.shR;
    this.shL.rotation.z = -pz.shLz;
    this.shR.rotation.z = pz.shRz;
    this.elL.rotation.x = pz.elL;
    this.elR.rotation.x = pz.elR;
    this.spine.rotation.x = pz.spine;
    this.neck.rotation.x = pz.neck;
    this.head.rotation.y = pz.headY;
    this.hips.position.y = pz.hipsY;
    this.hips.rotation.y = pz.hipsRot;
    if (this.skirt) this.skirt.rotation.x = (pz.hipL + pz.hipR) * 0.15;
  }

  dispose() {
    this.root.removeFromParent();
  }
}

/** Representação simplificada para personagens distantes (LOD): 3 malhas, sem esqueleto. */
export class HumanoidLOD {
  constructor(appearance) {
    const a = appearance;
    const s = (a.height ?? 1.75) / 1.75;
    this.root = new THREE.Group();
    const body = new THREE.Mesh(geo(`lodB:${s}`, () => { const g = new THREE.CapsuleGeometry(0.17 * s, 0.6 * s, 3, 6); g.translate(0, 1.15 * s, 0); return g; }), mat(a.topColor ?? '#888888'));
    const legs = new THREE.Mesh(geo(`lodL:${s}`, () => { const g = new THREE.CapsuleGeometry(0.13 * s, 0.6 * s, 3, 6); g.translate(0, 0.45 * s, 0); return g; }), mat(a.bottomColor ?? '#333333'));
    const head = new THREE.Mesh(geo(`lodH:${s}`, () => { const g = new THREE.SphereGeometry(0.11 * s, 8, 6); g.translate(0, 1.62 * s, 0); return g; }), mat(a.skinTone ?? '#6b4430', { rough: 0.6 }));
    this.root.add(body, legs, head);
    this.anim = 'idle';
  }

  setAnim(a) { this.anim = a; this.root.scale.y = a === 'sit' ? 0.7 : 1; }

  update() {}

  dispose() { this.root.removeFromParent(); }
}
