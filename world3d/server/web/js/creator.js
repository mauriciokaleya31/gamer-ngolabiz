/**
 * Criação e personalização da personagem (masculina/feminina, pele, rosto, cabelo,
 * roupa, padrão, acessório, altura) com pré-visualização 3D em tempo real.
 */
import * as THREE from 'three';
import { Humanoid3 } from './character/humanoid3.js';
import { CLOTHING } from '../../shared/catalog.js';

export const SKIN_TONES = ['#3b2219', '#4a2c20', '#5a3825', '#6b4430', '#7a4f37', '#8d5d3f', '#a06a48', '#b97b54', '#c98e66', '#e0ac85'];
const HAIR_COLORS = ['#0d0b0a', '#2b1d16', '#4a2f1d', '#8d2a1a', '#c49a54', '#9e9e9e'];
const COLORS = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#00897b', '#1e88e5', '#3949ab', '#8e24aa', '#d81b60', '#f5f5f5', '#212121', '#6d4c41'];
const BOTTOM_COLORS = ['#1c2a48', '#263238', '#3e2723', '#455a64', '#c5b38a', '#1a1a1a', '#5d4037', '#283593'];
const HAIR = { m: [['curto', 'Curto'], ['degradê', 'Degradê'], ['afro', 'Afro'], ['dreads', 'Dreads'], ['trancas_curtas', 'Tranças curtas'], ['rapado', 'Rapado'], ['careca', 'Careca']], f: [['trancas', 'Tranças'], ['afro', 'Afro'], ['coque', 'Coque'], ['liso_comprido', 'Liso comprido'], ['rabo_cavalo', 'Rabo-de-cavalo'], ['curto', 'Curto'], ['lenco', 'Lenço']] };
/** Opções do catálogo por slot; itens pagos aparecem bloqueados (compram-se na Moda Muxima). */
const slotOptions = (slot, gender) => CLOTHING.filter((i) => i.slot === slot && (i.gender === 'u' || i.gender === gender) && i.status !== 'indisponivel')
  .map((i) => [i.id, i.price ? `${i.name} — ${i.price} Kz demo (Moda Muxima)` : i.name, i.price > 0]);
const BEARDS = [['nenhuma', 'Sem barba'], ['barba_curta', 'Barba curta'], ['bigode', 'Bigode'], ['pera', 'Pêra']];
const BODY = [['magro', 'Magro'], ['medio', 'Médio'], ['robusto', 'Robusto']];

const $ = (id) => document.getElementById(id);

export function defaultAppearance() {
  return { gender: 'm', skinTone: SKIN_TONES[3], face: { shape: 0, eyes: 0, beard: 'nenhuma' }, hairStyle: 'curto', hairColor: HAIR_COLORS[0], top: 't-shirt', topColor: '#1e88e5', topPattern: 'liso', bottom: 'calca_ganga', bottomColor: BOTTOM_COLORS[0], shoes: 'tenis', shoesColor: '#1a1a1a', accessories: {}, height: 1.75, bodyType: 'medio' };
}

export class CharacterCreator {
  constructor(initial) {
    this.a = { ...defaultAppearance(), ...(initial ?? {}) };
    const host = $('creator-preview');
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    this.camera.position.set(0, 1.25, 4.2);
    this.camera.lookAt(0, 0.95, 0);
    this.scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x3a2a20, 1.4));
    const key = new THREE.DirectionalLight(0xffe2c0, 2.2);
    key.position.set(2, 3, 3);
    this.scene.add(key);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.2, 40), new THREE.MeshStandardMaterial({ color: 0x2a3342 }));
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    this.holder = new THREE.Group();
    this.scene.add(this.holder);
    this.bindUI();
    this.rebuild();
    this.resize();
    addEventListener('resize', () => this.resize());
    this.running = true;
    const loop = (t) => {
      if (!this.running) return;
      this.holder.rotation.y = Math.sin(t / 2400) * 0.7;
      this.model?.update(1 / 60, 0);
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  resize() {
    const host = $('creator-preview');
    const w = host.clientWidth || 400;
    const h = host.clientHeight || 420;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  rebuild() {
    this.holder.clear();
    this.model = new Humanoid3(this.a, { shadows: false });
    this.model.setAnim('idle');
    this.holder.add(this.model.root);
  }

  swatches(id, colors, key) {
    const el = $(id);
    el.innerHTML = '';
    for (const c of colors) {
      const b = document.createElement('button');
      b.style.background = c;
      b.title = c;
      b.className = this.a[key] === c ? 'active' : '';
      b.onclick = () => { this.a[key] = c; el.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b)); this.rebuild(); };
      el.appendChild(b);
    }
  }

  options(id, list, key, get = (a) => a[key], set = (a, v) => { a[key] = v; }) {
    const el = $(id);
    if (!el) return;
    el.innerHTML = list.map(([v, l, locked]) => `<option value="${v}" ${locked ? 'disabled' : ''}>${l}</option>`).join('');
    if (!list.some(([v, , locked]) => v === get(this.a) && !locked)) set(this.a, list.find(([, , locked]) => !locked)[0]);
    el.value = get(this.a);
    el.onchange = () => { set(this.a, el.value); this.rebuild(); };
  }

  seg(id, onPick, current) {
    const el = $(id);
    el.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('active', b.dataset.v === String(current));
      b.onclick = () => { el.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b)); onPick(b.dataset.v); };
    });
  }

  bindUI() {
    const g = () => this.a.gender;
    const refreshGendered = () => {
      this.options('cr-hair', HAIR[g()], 'hairStyle');
      this.options('cr-top', slotOptions('top', g()), 'top');
      this.options('cr-bottom', slotOptions('bottom', g()), 'bottom');
      this.options('cr-shoes', slotOptions('shoes', g()), 'shoes');
    };
    this.seg('cr-gender', (v) => { this.a.gender = v; refreshGendered(); this.rebuild(); }, this.a.gender);
    this.seg('cr-face', (v) => { this.a.face = { ...this.a.face, shape: Number(v), eyes: Number(v) }; this.rebuild(); }, this.a.face.shape);
    this.seg('cr-pattern', (v) => { this.a.topPattern = v; this.rebuild(); }, this.a.topPattern);
    this.swatches('cr-skin', SKIN_TONES, 'skinTone');
    this.swatches('cr-haircolor', HAIR_COLORS, 'hairColor');
    this.swatches('cr-topcolor', COLORS, 'topColor');
    this.swatches('cr-bottomcolor', BOTTOM_COLORS, 'bottomColor');
    refreshGendered();
    this.options('cr-acc', BEARDS, 'beard', (a) => a.face?.beard ?? 'nenhuma', (a, v) => { a.face = { ...a.face, beard: v }; });
    this.options('cr-body', BODY, 'bodyType');
    const h = $('cr-height');
    h.value = this.a.height;
    h.oninput = () => { this.a.height = Number(h.value); this.rebuild(); };
  }

  dispose() {
    this.running = false;
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
