/**
 * Sistema Unificado de Comércio, Habitação e Centros de Competição.
 *
 * Modos suportados:
 *  - wardrobe    : Moda Muxima (roupa e acessórios com preview 3D)
 *  - supermarket : Supermercado Kwanza & Mercado Kianda (consumíveis, bebidas angolanas, kits)
 *  - dealership  : Concessionário Auto Kalunga (compra de veículos para a garagem pessoal)
 *  - rental      : Rent-a-Car & Aluguer Kianda (aluguer de viaturas com devolução)
 *  - garage      : Garagem Kalunga Motors (configuração de pintura/jantes e levantamento)
 *  - realestate  : Agência Imobiliária Kianda (compra e arrendamento de vivendas e apartamentos)
 *  - betting     : Centros de Competição & Arenas 1v1 (luta, tiro, sobrevivência, corridas com 80/20)
 */
import * as THREE from 'three';
import { Humanoid2, normalizeAppearance } from '../character/humanoid2.js';
import { createVehicle } from '../vehicles2.js';
import { SLOTS, OPTIONAL_SLOTS, PAINT_PALETTE, RENTAL_CATALOG, PROPERTIES_CATALOG } from '../../../shared/catalog.js';

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
    this.rentals = RENTAL_CATALOG;
    this.myRentals = [];
    this.properties = PROPERTIES_CATALOG;
    this.myProperties = [];
    this.consumables = {};
    this.arenaOverview = null;
    this.feePct = 20;

    this.root = document.createElement('div');
    this.root.id = 'shop';
    this.root.className = 'panel glass hidden';
    this.root.innerHTML = '<div class="shop-head"><div id="shop-title"></div><button class="icon-btn" id="shop-close">✕</button></div><div class="shop-grid"><div id="shop-preview"></div><div id="shop-body"></div></div>';
    document.body.appendChild(this.root);
    this.root.querySelector('#shop-close').onclick = () => this.close();

    net.on('shop_result', (m) => {
      this.owned = new Set(m.owned);
      this.wallet = m.wallet;
      if (m.consumables) this.consumables = m.consumables;
      this.flash = `Operação concluída com sucesso (Saldo demo: ${kz(m.wallet.balanceKz)}).`;
      if (this.isOpen()) this.render();
    });
    net.on('inventory', (m) => {
      this.consumables = m.consumables ?? this.consumables;
      if (m.used) this.flash = `Artigo utilizado com sucesso.`;
      if (this.isOpen()) this.render();
    });
    net.on('rental_result', (m) => {
      this.myRentals = m.rentals ?? this.myRentals;
      this.wallet = m.wallet ?? this.wallet;
      this.flash = m.message ?? 'Operação de aluguer registada.';
      if (this.isOpen()) this.render();
    });
    net.on('property_result', (m) => {
      this.myProperties = m.properties ?? this.myProperties;
      this.wallet = m.wallet ?? this.wallet;
      this.flash = m.message ?? 'Imóvel registado com sucesso.';
      if (this.isOpen()) this.render();
    });
    net.on('arena_overview', (m) => {
      this.arenaOverview = m.state;
      if (this.isOpen() && this.mode === 'betting') this.render();
    });
    net.on('prefs', (m) => { this.prefs = m.prefs; if (this.isOpen()) this.render(); });
    net.on('appearance_saved', (m) => { this.flash = 'Aparência guardada na tua conta.'; this.onAppearanceSaved?.(m.appearance); this.render(); });
    net.on('error', (m) => { if (this.isOpen()) { this.flash = m.message; this.render(); } });
  }

  setup({ catalog, owned, prefs, rentals, properties, myRentals, myProperties, consumables, feePct }) {
    this.catalog = catalog ?? this.catalog;
    this.owned = new Set(owned ?? []);
    this.prefs = prefs ?? {};
    if (rentals) this.rentals = rentals;
    if (properties) this.properties = properties;
    if (myRentals) this.myRentals = myRentals;
    if (myProperties) this.myProperties = myProperties;
    if (consumables) this.consumables = consumables;
    if (feePct !== undefined) this.feePct = feePct;
  }

  isOpen() { return !this.root.classList.contains('hidden'); }

  open(mode = 'wardrobe') {
    this.mode = mode;
    this.slot = mode === 'wardrobe' ? 'top' : null;
    this.draft = normalizeAppearance(structuredClone(this.getAppearance()));
    this.selectedVehicle = null;
    this.flash = '';

    if (['wardrobe', 'dealership', 'garage', 'supermarket', 'rental', 'realestate', 'betting'].includes(mode) && !this.isNear(mode)) {
      this.net.send({ t: 'travel', to: mode });
    }
    if (mode === 'betting') {
      this.net.send({ t: 'arena_state' });
    }

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
    this.model = createVehicle(item.id ?? item.vehicleItemId, { paint, rims });
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
    const near = true;
    const titles = {
      wardrobe: '👕 Moda Muxima — Loja de Roupa & Acessórios',
      supermarket: '🛒 Supermercado Kwanza — Artigos & Consumíveis',
      dealership: '🚗 Concessionário Auto Kalunga — Carros & Motas',
      rental: '🔑 Rent-a-Car Kianda — Aluguer de Veículos',
      garage: '🔧 Garagem Kalunga Motors — Meus Veículos',
      realestate: '🏠 Agência Imobiliária Kianda — Habitações',
      betting: '🥊 Centros de Competição & Arenas 1v1',
    };
    const title = titles[this.mode] ?? 'Comércio & Serviços de Kianda Centro';

    this.root.querySelector('#shop-title').innerHTML = `
      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;">
        <b style="margin-right:8px;font-size:16px;">${title}</b>
        <button class="btn ${this.mode === 'wardrobe' ? 'good' : ''}" data-shopmode="wardrobe">👕 Roupas</button>
        <button class="btn ${this.mode === 'supermarket' ? 'good' : ''}" data-shopmode="supermarket">🛒 Supermercado</button>
        <button class="btn ${this.mode === 'dealership' ? 'good' : ''}" data-shopmode="dealership">🚗 Comprar Carro</button>
        <button class="btn ${this.mode === 'rental' ? 'good' : ''}" data-shopmode="rental">🔑 Alugar Carro</button>
        <button class="btn ${this.mode === 'garage' ? 'good' : ''}" data-shopmode="garage">🔧 Minha Garagem</button>
        <button class="btn ${this.mode === 'realestate' ? 'good' : ''}" data-shopmode="realestate">🏠 Imobiliária</button>
        <button class="btn ${this.mode === 'betting' ? 'good' : ''}" data-shopmode="betting">🥊 Arenas & Apostas</button>
      </div>`;

    this.root.querySelectorAll('[data-shopmode]').forEach((b) => {
      b.onclick = () => this.open(b.dataset.shopmode);
    });

    const body = this.root.querySelector('#shop-body');
    if (this.mode === 'wardrobe') this.renderWardrobe(body, near);
    else if (this.mode === 'supermarket') this.renderSupermarket(body);
    else if (this.mode === 'dealership') this.renderDealership(body, near);
    else if (this.mode === 'rental') this.renderRental(body);
    else if (this.mode === 'realestate') this.renderRealEstate(body);
    else if (this.mode === 'betting') this.renderBetting(body);
    else this.renderGarage(body, near);
  }

  // ---------------------------------------------------------------- Roupa
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
      <p class="muted">Itens comprados com saldo demo ficam gravados permanentemente na tua conta.</p>`;
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
    body.querySelectorAll('[data-buy]').forEach((b) => { b.onclick = () => this.net.send({ t: 'shop_buy', itemId: b.dataset.buy, autoTravel: true }); });
    body.querySelectorAll('[data-color]').forEach((b) => { b.onclick = () => { d[colorKey] = b.dataset.color; this.showCharacter(); }; });
    body.querySelectorAll('[data-pattern]').forEach((b) => { b.onclick = () => { d.topPattern = b.dataset.pattern; this.showCharacter(); this.render(); }; });
    body.querySelector('#shop-save').onclick = () => this.net.send({ t: 'appearance', appearance: d });
    if (!this.model || !(this.model instanceof Humanoid2)) this.showCharacter();
  }

  // ---------------------------------------------------------------- Supermercado
  renderSupermarket(body) {
    const items = this.catalog.filter((i) => i.kind === 'consumable');
    const myInv = this.consumables ?? {};
    body.innerHTML = `
      <h3 style="margin:4px 0 8px;">🛒 Supermercado Kwanza & Mercado Kianda</h3>
      <p class="muted">Alimentos tradicionais, bebidas de Luanda, recarga de energia e utilitários para as tuas actividades na cidade:</p>
      <div class="item-grid" style="margin-bottom:14px;">
        ${items.map((i) => `
          <div class="item">
            <div style="font-size:24px;">${i.icon ?? '📦'}</div>
            <b>${esc(i.name)}</b>
            <div class="price">${kz(i.price)} demo</div>
            <small class="muted">${esc(i.desc ?? i.category)}</small>
            <div class="row" style="margin-top:6px;">
              <button class="btn good" data-buysuper="${i.id}">Comprar</button>
            </div>
          </div>
        `).join('')}
      </div>
      <h3 style="margin:12px 0 6px;">🎒 Teu Inventário de Artigos</h3>
      <div class="item-grid">
        ${Object.entries(myInv).filter(([, q]) => q > 0).map(([id, q]) => {
          const def = items.find((x) => x.id === id);
          return `
            <div class="item" style="border-color:rgba(34,201,139,.4);">
              <div style="font-size:22px;">${def?.icon ?? '📦'}</div>
              <b>${esc(def?.name ?? id)}</b>
              <div class="price">Quantidade: ${q}</div>
              <button class="btn primary" data-useitem="${id}">Utilizar / Consumir</button>
            </div>
          `;
        }).join('') || '<p class="muted">Ainda não tens artigos no inventário.</p>'}
      </div>
      <div class="row muted" style="margin-top:10px;">${esc(this.flash)}</div>
    `;
    body.querySelectorAll('[data-buysuper]').forEach((b) => {
      b.onclick = () => this.net.send({ t: 'shop_buy', itemId: b.dataset.buysuper, reqId: `buy_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, autoTravel: true });
    });
    body.querySelectorAll('[data-useitem]').forEach((b) => {
      b.onclick = () => this.net.send({ t: 'consume', itemId: b.dataset.useitem });
    });
    if (!this.model || !(this.model instanceof Humanoid2)) this.showCharacter();
  }

  // ---------------------------------------------------------------- Concessionário
  renderDealership(body, near) {
    const items = this.catalog.filter((i) => i.kind === 'vehicle');
    this.selectedVehicle ??= items.find((i) => i.status === 'pronto')?.id ?? items[0]?.id;
    body.innerHTML = `
      <h3 style="margin:4px 0 8px;">🚗 Concessionário Auto Kalunga — Compra Definitiva</h3>
      <p class="muted">Adquire viaturas para a tua coleção pessoal. Ficam guardadas permanentemente na tua garagem:</p>
      <div class="item-grid">${items.map((i) => this.vehicleCard(i, near, 'dealership')).join('')}</div>
      <div class="row muted">${esc(this.flash)}</div>
    `;
    this.bindVehicleCards(body);
    body.querySelectorAll('[data-buyv]').forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); this.net.send({ t: 'shop_buy', itemId: b.dataset.buyv, autoTravel: true }); };
    });
  }

  // ---------------------------------------------------------------- Rent-a-Car
  renderRental(body) {
    const rentals = this.rentals ?? RENTAL_CATALOG;
    const active = this.myRentals ?? [];
    body.innerHTML = `
      <h3 style="margin:4px 0 8px;">🔑 Rent-a-Car Kianda — Aluguer de Frotas</h3>
      <p class="muted">Aluga veículos prontos a andar por 30 minutos com saldo demo para circulação rápida na cidade:</p>
      <div class="item-grid" style="margin-bottom:14px;">
        ${rentals.map((r) => `
          <div class="item">
            <b>${esc(r.name)}</b>
            <div class="price">${kz(r.priceKz)} demo · 30 minutos</div>
            <small class="muted">${r.vehicleClass === 'moto' ? '🏍️ Mota Ágil' : '🚗 Viatura Urbana'} · até ${Math.round(r.specs.maxSpeed * 3.6)} km/h</small>
            <div class="row" style="margin-top:6px;">
              <button class="btn good" data-rentveh="${r.id}">Alugar Veículo</button>
            </div>
          </div>
        `).join('')}
      </div>
      <h3 style="margin:12px 0 6px;">📋 Teus Contratos de Aluguer Activos</h3>
      <div class="item-grid">
        ${active.map((ac) => `
          <div class="item" style="border-color:rgba(2,132,199,.6);">
            <b>${esc(ac.rentalId)}</b>
            <div class="price">Estado: Activo ✓</div>
            <small class="muted">Válido até: ${new Date(ac.expiresAt).toLocaleTimeString('pt-AO')}</small>
            <button class="btn bad" data-returnveh="${ac.id}">Devolver Viatura</button>
          </div>
        `).join('') || '<p class="muted">Nenhum veículo alugado de momento.</p>'}
      </div>
      <div class="row muted" style="margin-top:10px;">${esc(this.flash)}</div>
    `;
    body.querySelectorAll('[data-rentveh]').forEach((b) => {
      b.onclick = () => this.net.send({ t: 'vehicle_rent', rentalId: b.dataset.rentveh, autoTravel: true });
    });
    body.querySelectorAll('[data-returnveh]').forEach((b) => {
      b.onclick = () => this.net.send({ t: 'vehicle_return', contractId: b.dataset.returnveh });
    });
    const firstVeh = this.catalog.find((i) => i.id === 'sedan_kianda');
    if (firstVeh) this.showVehicle(firstVeh, '#0d47a1', 'desportiva');
  }

  // ---------------------------------------------------------------- Imobiliária
  renderRealEstate(body) {
    const props = this.properties ?? PROPERTIES_CATALOG;
    const myProps = this.myProperties ?? [];
    body.innerHTML = `
      <h3 style="margin:4px 0 8px;">🏠 Agência Imobiliária Kianda — Habitação com Interiores</h3>
      <p class="muted">Compra ou arrenda casas, moradias familiares e apartamentos modelo com interiores decorados acessíveis:</p>
      <div class="item-grid" style="margin-bottom:14px;">
        ${props.map((p) => {
          const ownedBuy = myProps.some((x) => x.propertyId === p.id && x.mode === 'buy');
          const rented = myProps.some((x) => x.propertyId === p.id && x.mode === 'rent');
          return `
            <div class="item ${ownedBuy || rented ? 'sel' : ''}">
              <b>${esc(p.name)}</b>
              <div class="price">Compra: ${kz(p.buyPriceKz)} demo<br>Arrendamento: ${kz(p.rentPriceKz)} demo / sem.</div>
              <small class="muted">📍 ${esc(p.district)} · ${esc(p.rooms)}</small>
              <div class="row" style="margin-top:6px;gap:4px;">
                ${ownedBuy ? '<span class="st good">PROPRIETÁRIO ✓</span>' : `<button class="btn good" data-propbuy="${p.id}">Comprar</button>`}
                ${rented ? '<span class="st good">ARRENDADO ✓</span>' : !ownedBuy ? `<button class="btn" data-proprent="${p.id}">Arrendar</button>` : ''}
                <button class="btn primary" data-propenter="${p.id}">Entrar no Imóvel</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
      <div class="row muted">${esc(this.flash)}</div>
    `;
    body.querySelectorAll('[data-propbuy]').forEach((b) => {
      b.onclick = () => this.net.send({ t: 'property_acquire', propertyId: b.dataset.propbuy, mode: 'buy', autoTravel: true });
    });
    body.querySelectorAll('[data-proprent]').forEach((b) => {
      b.onclick = () => this.net.send({ t: 'property_acquire', propertyId: b.dataset.proprent, mode: 'rent', autoTravel: true });
    });
    body.querySelectorAll('[data-propenter]').forEach((b) => {
      b.onclick = () => { this.net.send({ t: 'property_visit', propertyId: b.dataset.propenter, preview: true }); this.close(); };
    });
    if (!this.model || !(this.model instanceof Humanoid2)) this.showCharacter();
  }

  // ---------------------------------------------------------------- Centros de Competição
  renderBetting(body) {
    const feePct = this.feePct ?? 20;
    const winnerPct = 100 - feePct;
    const s = this.arenaOverview;

    body.innerHTML = `
      <div style="background:rgba(240,68,74,.12);border:1px solid rgba(240,68,74,.35);padding:10px 14px;border-radius:10px;margin-bottom:12px;">
        <h3 style="margin:0 0 4px;color:var(--gold);">🥊 Centros de Competição & Arenas 1v1 da Cidade</h3>
        <p class="muted" style="margin:0;font-size:13px;">
          Regra de Liquidação Oficial: <b>${winnerPct}% ao Vencedor</b> e <b>${feePct}% de Comissão da Plataforma</b>.<br>
          <i>Exemplo: Entrada de 1.000 Kz + 1.000 Kz = 2.000 Kz demo de pote → 1.600 Kz ao Vencedor e 400 Kz à Arena.</i>
        </p>
      </div>

      <div class="chips" style="margin-bottom:10px;">
        <button class="active" id="b-tab-fight">⚔️ Combate 1v1</button>
        <button id="b-tab-shooting">🎯 Duelo de Tiro 1v1</button>
        <button id="b-tab-survival">🛡️ Sobrevivência</button>
        <button id="b-tab-races">🏎️ Corridas no Anel & Marginal</button>
      </div>

      <div id="betting-tab-content">
        <h3 style="margin:6px 0;">Desafiar Oponentes de Treino da Arena (Gratuito)</h3>
        <div class="item-grid" style="margin-bottom:14px;">
          <div class="item">
            <b>🥊 Lutador Kamba (Fácil)</b>
            <div class="price">Ringue 1v1 · Treino Livre</div>
            <button class="btn good" data-arenabot="arena_bot_kamba" data-mode="combate_1v1">Entrar no Ringue</button>
          </div>
          <div class="item">
            <b>🔥 Mestre Kalunga (Médio)</b>
            <div class="price">Ringue 1v1 · Treino Técnico</div>
            <button class="btn good" data-arenabot="arena_bot_relampago" data-mode="combate_1v1">Entrar no Ringue</button>
          </div>
          <div class="item">
            <b>⚡ Campeão de Luanda (Difícil)</b>
            <div class="price">Ringue 1v1 · Nível Avançado</div>
            <button class="btn good" data-arenabot="arena_bot_campeao" data-mode="combate_1v1">Entrar no Ringue</button>
          </div>
        </div>

        <h3 style="margin:10px 0 6px;">Criar Desafio com Saldo Demo (Duelo com Outro Jogador)</h3>
        <div class="row" style="background:rgba(255,255,255,.05);padding:10px;border-radius:10px;gap:10px;">
          <select id="cr-arena-mode">
            <option value="combate_1v1">🥊 Combate Corpo a Corpo 1v1</option>
            <option value="tiro_1v1">🎯 Duelo Táctico de Tiro 1v1</option>
            <option value="sobrevivencia">🛡️ Desafio de Sobrevivência</option>
          </select>
          <select id="cr-arena-stake">
            <option value="0">Gratuito (Treino)</option>
            <option value="500">500 Kz (Pote: 1.000 → 800 Kz)</option>
            <option value="1000" selected>1.000 Kz (Pote: 2.000 → 1.600 Kz)</option>
            <option value="2000">2.000 Kz (Pote: 4.000 → 3.200 Kz)</option>
            <option value="5000">5.000 Kz (Pote: 10.000 → 8.000 Kz)</option>
          </select>
          <button class="btn primary" id="btn-create-lobby">Lançar Desafio Aberto</button>
        </div>

        <h3 style="margin:12px 0 6px;">Desafios Abertos na Arena (Aguardando Adversário)</h3>
        <div class="item-grid" style="margin-bottom:14px;">
          ${(s?.openLobbies ?? []).map((lob) => `
            <div class="item" style="border-color:var(--gold);">
              <b>${esc(lob.hostName)}</b>
              <div class="price">${lob.stakeKz ? `${kz(lob.stakeKz)} demo` : 'Gratuito'} · Modo ${lob.mode}</div>
              <small class="muted">Prémio: ${kz(lob.split.prizeKz)} demo (80%)</small>
              <button class="btn good" data-joinlobby="${lob.id}">Aceitar e Batalhar</button>
            </div>
          `).join('') || '<p class="muted">Nenhum desafio aberto neste momento. Sê o primeiro a lançar um desafio acima!</p>'}
        </div>

        ${(s?.activeMatches ?? []).length > 0 ? `
          <h3 style="margin:12px 0 6px;">Batalhas ao Vivo em Curso</h3>
          <div class="item-grid">
            ${s.activeMatches.map((m) => `
              <div class="item" style="border-color:rgba(240,68,74,.5);">
                <b>${esc(m.fighters.map((f) => f.name).join(' vs '))}</b>
                <div class="price">Arena: ${esc(m.centerId)} · ${m.status}</div>
                <button class="btn" data-spectate="${m.matchId}">👁️ Assistir como Espectador</button>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
      <div class="row muted" style="margin-top:10px;">${esc(this.flash)}</div>
    `;

    body.querySelector('#b-tab-fight').onclick = () => this.renderBetting(body);
    body.querySelector('#b-tab-shooting').onclick = () => {
      body.querySelector('#betting-tab-content').innerHTML = `
        <h3 style="margin:6px 0;">🎯 Arena Táctica de Tiro 1v1 (Alvos e Barricadas)</h3>
        <p class="muted">Disparos e mira táctica de precisão com contagem de munições e protecção atrás de barricadas:</p>
        <div class="item-grid" style="margin-bottom:14px;">
          <div class="item"><b>🎯 Atirador Falcão (Fácil)</b><button class="btn good" data-arenabot="tiro_bot_falcao" data-mode="tiro_1v1">Entrar no Duelo</button></div>
          <div class="item"><b>⚡ Operador Sombra (Médio)</b><button class="btn good" data-arenabot="tiro_bot_sombra" data-mode="tiro_1v1">Entrar no Duelo</button></div>
          <div class="item"><b>🔥 Comandante Kianda (Elite)</b><button class="btn good" data-arenabot="tiro_bot_elite" data-mode="tiro_1v1">Entrar no Duelo</button></div>
        </div>
      `;
      this.bindArenaBotButtons(body);
    };
    body.querySelector('#b-tab-survival').onclick = () => {
      body.querySelector('#betting-tab-content').innerHTML = `
        <h3 style="margin:6px 0;">🛡️ Modo de Sobrevivência por Rondas</h3>
        <p class="muted">Resiste a 3 ondas consecutivas de patrulhas na Arena Táctica. Ganha prestígio e recompensas:</p>
        <button class="btn primary" id="btn-start-survival" style="padding:10px 18px;font-size:15px;">🛡️ Iniciar Desafio de Sobrevivência</button>
      `;
      body.querySelector('#btn-start-survival').onclick = () => {
        this.net.send({ t: 'arena_train', mode: 'sobrevivencia', botId: 'tiro_bot_falcao' });
        this.close();
      };
    };
    body.querySelector('#b-tab-races').onclick = () => {
      body.querySelector('#betting-tab-content').innerHTML = `
        <h3 style="margin:6px 0;">🏎️ Circuitos Oficiais de Corrida</h3>
        <div class="item-grid" style="margin-bottom:14px;">
          <div class="item">
            <b>🏁 Circuito do Anel da Kianda (1 Volta)</b>
            <div class="price">Acácias → Oficina → Parque → Mercado</div>
            <div class="row"><button class="btn good" data-racebot="bot_medio" data-veh="car" data-track="circuito_anel_kianda">Carro</button><button class="btn good" data-racebot="bot_medio" data-veh="moto" data-track="circuito_anel_kianda">Mota</button></div>
          </div>
          <div class="item">
            <b>⚡ Grande Circuito da Marginal & Talatona</b>
            <div class="price">Marginal Norte → Polo Industrial → Talatona Sul → Maianga</div>
            <div class="row"><button class="btn good" data-racebot="bot_dificil" data-veh="car" data-track="circuito_grande_luanda">Carro</button><button class="btn good" data-racebot="bot_dificil" data-veh="moto" data-track="circuito_grande_luanda">Mota</button></div>
          </div>
        </div>
      `;
      body.querySelectorAll('[data-racebot]').forEach((b) => {
        b.onclick = () => {
          this.net.send({ t: 'train_race', botId: b.dataset.racebot, vehicle: b.dataset.veh, trackId: b.dataset.track });
          this.close();
        };
      });
    };

    body.querySelector('#btn-create-lobby')?.addEventListener('click', () => {
      const mode = body.querySelector('#cr-arena-mode').value;
      const stakeKz = Number(body.querySelector('#cr-arena-stake').value);
      this.net.send({ t: 'arena_create', mode, stakeKz });
    });

    body.querySelectorAll('[data-joinlobby]').forEach((b) => {
      b.onclick = () => { this.net.send({ t: 'arena_join', lobbyId: b.dataset.joinlobby }); this.close(); };
    });
    body.querySelectorAll('[data-spectate]').forEach((b) => {
      b.onclick = () => { this.net.send({ t: 'arena_spectate', matchId: b.dataset.spectate }); this.close(); };
    });
    this.bindArenaBotButtons(body);
  }

  bindArenaBotButtons(body) {
    body.querySelectorAll('[data-arenabot]').forEach((b) => {
      b.onclick = () => {
        this.net.send({ t: 'arena_train', botId: b.dataset.arenabot, mode: b.dataset.mode });
        this.close();
      };
    });
  }

  // ---------------------------------------------------------------- Garagem
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
      body.querySelector('#g-spawn').onclick = () => { this.net.send({ t: 'garage_spawn', itemId: item.id, paint: this.paint, rims: this.rims, autoTravel: true }); this.close(); };
      if (this.model?.itemId !== item.id) this.showVehicle(item, this.paint, this.rims);
    }
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
