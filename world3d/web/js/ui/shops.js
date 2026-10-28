/**
 * Guarda-roupa (Moda Muxima), Concessionário Kalunga e Garagem Kalunga Motors.
 * Pré-visualização 3D em tempo real; só itens integrados são seleccionáveis; os
 * indisponíveis aparecem identificados e bloqueados. Compras com Kz DEMO validadas
 * pelo servidor (junto da loja física).
 */
import * as THREE from 'three';
import { Humanoid2, normalizeAppearance } from '../character/humanoid2.js';
import { createVehicle } from '../vehicles2.js';
import { SLOTS, OPTIONAL_SLOTS, PAINT_PALETTE } from '../../../shared/catalog.js';

const STATUS = { pronto: ['PRONTO', 'good'], provisorio: ['PROVISÓRIO', 'warn'], indisponivel: ['INDISPONÍVEL', 'off'] };
const COLORS = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#00897b', '#1e88e5', '#3949ab', '#8e24aa', '#d81b60', '#f5f5f5', '#212121', '#6d4c41', '#c62828', '#eceff1'];
const BOTTOM_COLORS = ['#1c2a48', '#263238', '#3e2723', '#455a64', '#c5b38a', '#1a1a1a', '#5d4037', '#a1887f'];
const kz = (v) => `${Number(v).toLocaleString('pt-AO')} Kz`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export class ShopsUI {
  constructor({ net, getAppearance, onAppearanceSaved, isNear }) {
    this.net = net;
    this.getAppearance = getAppearance;
    this.onAppearanceSaved = onAppearanceSaved;
    this.isNear = isNear;
    this.catalog = [];
    this.owned = new Set();
    this.prefs = {};
    this.root = document.createElement('div');
    this.root.id = 'shop';
    this.root.className = 'panel glass hidden';
    this.root.innerHTML = '<div class="shop-head"><div id="shop-title"></div><button class="icon-btn" id="shop-close">✕</button></div><div class="shop-grid"><div id="shop-preview"></div><div id="shop-body"></div></div>';
    document.body.appendChild(this.root);
    this.root.querySelector('#shop-close').onclick = () => this.close();
    net.on('shop_result', (m) => { this.owned = new Set(m.owned); this.wallet = m.wallet; this.flash = `Compra concluída (saldo demo: ${kz(m.wallet.balanceKz)}).`; this.render(); });
    net.on('prefs', (m) => { this.prefs = m.prefs; if (this.isOpen()) this.render(); });
    net.on('appearance_saved', (m) => { this.flash = 'Aparência guardada na tua conta.'; this.onAppearanceSaved?.(m.appearance); this.render(); });
    net.on('error', (m) => { if (this.isOpen()) { this.flash = m.message; this.render(); } });
  }

  setup({ catalog, owned, prefs }) {
    this.catalog = catalog;
    this.owned = new Set(owned);
    this.prefs = prefs ?? {};
  }

  isOpen() { return !this.root.classList.contains('hidden'); }

  open(mode) {
    this.mode = mode;
    this.slot = mode === 'wardrobe' ? 'top' : null;
    this.draft = normalizeAppearance(structuredClone(this.getAppearance()));
    this.selectedVehicle = null;
    this.flash = '';
    this.root.classList.remove('hidden');
    this.ensurePreview();
    this.render();
  }

  close() {
    this.root.classList.add('hidden');
    this.running = false;
  }

  ensurePreview() {
    const host = this.root.querySelector('#shop-preview');
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      host.appendChild(this.renderer.domElement);
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 60);
      this.scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x3a2a20, 1.3));
      const key = new THREE.DirectionalLight(0xffe7cc, 2.4);
      key.position.set(2, 4, 4);
      this.scene.add(key);
      const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 48), new THREE.MeshStandardMaterial({ color: 0x2a3342, roughness: 0.5, metalness: 0.2 }));
      floor.rotation.x = -Math.PI / 2;
      this.scene.add(floor);
      this.holder = new THREE.Group();
      this.scene.add(this.holder);
    }
    const w = host.clientWidth || 320;
    const h = host.clientHeight || 360;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (!this.running) {
      this.running = true;
      let last = performance.now();
      const loop = (t) => {
        if (!this.running) return;
        const dt = Math.min(0.05, (t - last) / 1000);
        last = t;
        this.holder.rotation.y += dt * 0.35;
        this.model?.update?.(dt, 0);
        this.model?.animate?.(dt, 0, 0);
        this.renderer.render(this.scene, this.camera);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
  }

  showCharacter() {
    this.holder.clear();
    this.model = new Humanoid2(this.draft, { shadows: false });
    this.holder.add(this.model.root);
    this.camera.position.set(0, 1.2, 4.2);
    this.camera.lookAt(0, 0.95, 0);
  }

  showVehicle(item, paint, rims) {
    this.holder.clear();
    this.model = createVehicle(item.id, { paint, rims });
    this.model.setLights(true, false);
    this.holder.add(this.model.root);
    const fit = 1 / Math.min(1, this.camera.aspect * 1.25);
    this.camera.position.set(0, 2.2 * fit, (item.vehicleClass === 'moto' ? 4.5 : 7.8) * fit);
    this.camera.lookAt(0, 0.6, 0);
  }

  badge(item) {
    const [label, cls] = STATUS[item.status] ?? STATUS.provisorio;
    return `<span class="st ${cls}">${label}</span>`;
  }

  render() {
    const near = this.isNear(this.mode);
    const title = { wardrobe: 'Moda Muxima — guarda-roupa', dealership: 'Concessionário Kalunga', garage: 'Garagem Kalunga Motors' }[this.mode];
    this.root.querySelector('#shop-title').innerHTML = `<b>${title}</b> ${near ? '' : '<span class="st warn">só consulta — vai à loja para comprar/levantar</span>'}`;
    const body = this.root.querySelector('#shop-body');
    if (this.mode === 'wardrobe') this.renderWardrobe(body, near);
    else if (this.mode === 'dealership') this.renderDealership(body, near);
    else this.renderGarage(body, near);
  }

  renderWardrobe(body, near) {
    const d = this.draft;
    const slots = ['top', 'bottom', 'shoes', ...OPTIONAL_SLOTS];
    const items = this.catalog.filter((i) => i.kind === 'clothing' && i.slot === this.slot && (i.gender === 'u' || i.gender === d.gender));
    const current = OPTIONAL_SLOTS.includes(this.slot) ? d.accessories?.[this.slot] : d[this.slot];
    const colorKey = { top: 'topColor', bottom: 'bottomColor', shoes: 'shoesColor' }[this.slot];
    body.innerHTML = `
      <div class="chips">${slots.map((s) => `<button data-slot="${s}" class="${s === this.slot ? 'active' : ''}">${SLOTS[s]}</button>`).join('')}</div>
      <div class="item-grid">
        ${OPTIONAL_SLOTS.includes(this.slot) ? `<button class="item ${!current ? 'sel' : ''}" data-none="1"><b>Nenhum</b></button>` : ''}
        ${items.map((i) => {
          const owned = this.owned.has(i.id) || i.price === 0;
          const locked = i.status === 'indisponivel' || !i.active;
          return `<div class="item ${current === i.id ? 'sel' : ''} ${locked ? 'locked' : ''}">
            <b>${esc(i.name)}</b>${this.badge(i)}
            <div class="price">${i.price ? kz(i.price) + ' demo' : 'Incluído'}${owned && i.price ? ' · ✓ teu' : ''}</div>
            ${locked ? '<small>Ainda sem modelo integrado</small>' : `<button class="btn" data-try="${i.id}">Experimentar</button>${owned ? '' : `<button class="btn good" data-buy="${i.id}" ${near ? '' : 'disabled'}>Comprar</button>`}`}
          </div>`;
        }).join('')}
      </div>
      ${colorKey ? `<div class="row"><span class="muted">Cor</span> ${(this.slot === 'bottom' ? BOTTOM_COLORS : COLORS).map((c) => `<button class="sw" data-color="${c}" style="background:${c}"></button>`).join('')}</div>` : ''}
      ${this.slot === 'top' ? `<div class="row"><span class="muted">Padrão</span>${['liso', 'riscas', 'capulana'].map((p) => `<button class="btn ${d.topPattern === p ? 'good' : ''}" data-pattern="${p}">${p}</button>`).join('')}</div>` : ''}
      <div class="row"><button class="primary" id="shop-save">Guardar aparência na conta</button> <span class="muted">${esc(this.flash)}</span></div>
      <p class="muted">Itens não comprados podem ser experimentados, mas o servidor só guarda os que te pertencem.</p>`;
    body.querySelectorAll('[data-slot]').forEach((b) => { b.onclick = () => { this.slot = b.dataset.slot; this.render(); }; });
    body.querySelectorAll('[data-try]').forEach((b) => {
      b.onclick = () => {
        if (OPTIONAL_SLOTS.includes(this.slot)) d.accessories = { ...(d.accessories ?? {}), [this.slot]: b.dataset.try };
        else d[this.slot] = b.dataset.try;
        this.showCharacter();
        this.render();
      };
    });
    const none = body.querySelector('[data-none]');
    if (none) none.onclick = () => { const acc = { ...(d.accessories ?? {}) }; delete acc[this.slot]; d.accessories = acc; this.showCharacter(); this.render(); };
    body.querySelectorAll('[data-buy]').forEach((b) => { b.onclick = () => this.net.send({ t: 'shop_buy', itemId: b.dataset.buy }); });
    body.querySelectorAll('[data-color]').forEach((b) => { b.onclick = () => { d[colorKey] = b.dataset.color; this.showCharacter(); }; });
    body.querySelectorAll('[data-pattern]').forEach((b) => { b.onclick = () => { d.topPattern = b.dataset.pattern; this.showCharacter(); this.render(); }; });
    body.querySelector('#shop-save').onclick = () => this.net.send({ t: 'appearance', appearance: d });
    if (!this.model || !(this.model instanceof Humanoid2)) this.showCharacter();
  }

  vehicleCard(i, near, mode) {
    const owned = this.owned.has(i.id) || i.price === 0;
    const locked = i.status === 'indisponivel' || !i.active;
    return `<div class="item ${this.selectedVehicle === i.id ? 'sel' : ''} ${locked ? 'locked' : ''}" data-veh="${i.id}">
      <b>${esc(i.name)}</b>${this.badge(i)}
      <div class="price">${i.price ? kz(i.price) + ' demo' : 'Incluído'} · ${i.vehicleClass === 'moto' ? 'mota' : 'carro'} · até ${Math.round((i.specs?.maxSpeed ?? 35) * 3.6)} km/h</div>
      ${i.license ? `<small>Licença: ${esc(i.license)}</small>` : i.model === 'procedural' ? '<small>Modelo procedural provisório</small>' : ''}
      ${locked ? '<small>Ainda sem modelo integrado</small>' : mode === 'dealership' ? (owned ? '<span class="st good">NA TUA GARAGEM</span>' : `<button class="btn good" data-buyv="${i.id}" ${near ? '' : 'disabled'}>Comprar</button>`) : ''}
    </div>`;
  }

  renderDealership(body, near) {
    const items = this.catalog.filter((i) => i.kind === 'vehicle');
    this.selectedVehicle ??= items.find((i) => i.status === 'pronto')?.id ?? items[0]?.id;
    body.innerHTML = `<div class="item-grid">${items.map((i) => this.vehicleCard(i, near, 'dealership')).join('')}</div><div class="row muted">${esc(this.flash)}</div>
      <p class="muted">Compras com saldo de demonstração. Os veículos comprados ficam na Garagem Kalunga Motors.</p>`;
    this.bindVehicleCards(body);
    body.querySelectorAll('[data-buyv]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); this.net.send({ t: 'shop_buy', itemId: b.dataset.buyv }); }; });
  }

  renderGarage(body, near) {
    const items = this.catalog.filter((i) => i.kind === 'vehicle' && (this.owned.has(i.id) || i.price === 0) && i.status !== 'indisponivel');
    this.selectedVehicle ??= items[0]?.id;
    const item = items.find((i) => i.id === this.selectedVehicle) ?? items[0];
    const pref = this.prefs.garage?.[item?.id] ?? {};
    const paints = item?.paints === 'palette' ? PAINT_PALETTE : item?.paints ?? [];
    this.paint ??= pref.paint ?? paints[0];
    this.rims ??= pref.rims ?? item?.rims?.[0];
    body.innerHTML = `<div class="item-grid">${items.map((i) => this.vehicleCard(i, near, 'garage')).join('')}</div>
      ${item ? `<div class="row"><span class="muted">Pintura</span>${paints.map((p) => p.startsWith('#') ? `<button class="sw ${p === this.paint ? 'on' : ''}" data-paint="${p}" style="background:${p}"></button>` : `<button class="btn ${p === this.paint ? 'good' : ''}" data-paint="${esc(p)}">${esc(p)}</button>`).join('')}</div>
      <div class="row"><span class="muted">Jantes</span>${item.rims.map((r) => `<button class="btn ${r === this.rims ? 'good' : ''}" data-rims="${r}">${r}</button>`).join('')}</div>
      <div class="row"><button class="btn" id="g-save">Guardar configuração</button><button class="primary" id="g-spawn" ${near ? '' : 'disabled'}>Levantar veículo</button><span class="muted">${esc(this.flash)}</span></div>` : '<p class="muted">Ainda não tens veículos.</p>'}`;
    this.bindVehicleCards(body, () => { this.paint = null; this.rims = null; });
    body.querySelectorAll('[data-paint]').forEach((b) => { b.onclick = () => { this.paint = b.dataset.paint; this.showVehicle(item, this.paint, this.rims); this.render(); }; });
    body.querySelectorAll('[data-rims]').forEach((b) => { b.onclick = () => { this.rims = b.dataset.rims; this.showVehicle(item, this.paint, this.rims); this.render(); }; });
    if (item) {
      body.querySelector('#g-save').onclick = () => this.net.send({ t: 'garage_prefs', itemId: item.id, paint: this.paint, rims: this.rims });
      body.querySelector('#g-spawn').onclick = () => { this.net.send({ t: 'garage_spawn', itemId: item.id, paint: this.paint, rims: this.rims }); this.close(); };
      if (this.model?.itemId !== item.id) this.showVehicle(item, this.paint, this.rims);
    }
  }

  bindVehicleCards(body, onChange) {
    body.querySelectorAll('[data-veh]').forEach((el) => {
      el.onclick = () => {
        this.selectedVehicle = el.dataset.veh;
        onChange?.();
        const item = this.catalog.find((i) => i.id === el.dataset.veh);
        if (item && item.status !== 'indisponivel') this.showVehicle(item, this.paint ?? (item.paints === 'palette' ? PAINT_PALETTE[0] : item.paints[0]), this.rims ?? item.rims[0]);
        this.render();
      };
    });
    const sel = this.catalog.find((i) => i.id === this.selectedVehicle);
    if (sel && this.model?.itemId !== sel.id && sel.status !== 'indisponivel') this.showVehicle(sel, sel.paints === 'palette' ? PAINT_PALETTE[0] : sel.paints[0], sel.rims[0]);
  }
}
