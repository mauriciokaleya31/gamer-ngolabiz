/**
 * NgolaBiz World 3D — Mapa Geral da Cidade & Navegação GPS (Interactivo).
 *
 * Abre com tecla M, clique no minimapa ou botão no HUD.
 * Permite explorar todos os bairros, pesquisar POIs/edifícios, filtrar por categorias,
 * definir waypoints/GPS com traçado de rota, e deslocação rápida/visita.
 */
import { ZONE_BOUNDS, ROADS, BUILDINGS, POIS, DISTRICTS, roadRect } from '../../../shared/zone.js';

const CATEGORIES = [
  { id: 'all', label: 'Tudo', icon: '📍' },
  { id: 'shop', label: 'Lojas & Supermercados', icon: '🛒' },
  { id: 'vehicle', label: 'Veículos & Stands', icon: '🚗' },
  { id: 'property', label: 'Imóveis & Casas', icon: '🏠' },
  { id: 'competition', label: 'Arenas & Competições', icon: '🥊' },
  { id: 'leisure', label: 'Lazer & Serviços', icon: '☕' },
];

const POI_CATEGORY = {
  supermarket: 'shop',
  shop_counter: 'shop',
  shop_floor: 'shop',
  shop: 'shop',
  dealership: 'vehicle',
  car_rental: 'vehicle',
  workshop: 'vehicle',
  parking: 'vehicle',
  fuel_station: 'vehicle',
  home: 'property',
  apartment: 'property',
  real_estate: 'property',
  combat_center: 'competition',
  shooting_center: 'competition',
  race_center: 'competition',
  arena: 'competition',
  challenge_board: 'competition',
  gym: 'competition',
  cafe: 'leisure',
  restaurant: 'leisure',
  hotel: 'leisure',
  plaza: 'leisure',
  park: 'leisure',
  kiosk: 'leisure',
  event_stage: 'leisure',
  bus_stop: 'leisure',
  guard_post: 'leisure',
  bench: 'leisure',
};

const POI_ICONS = {
  supermarket: '🛒',
  shop: '👕',
  dealership: '🚗',
  car_rental: '🔑',
  workshop: '🔧',
  fuel_station: '⛽',
  real_estate: '🏢',
  home: '🏠',
  apartment: '🏢',
  combat_center: '🥊',
  shooting_center: '🎯',
  race_center: '🏎️',
  arena: '🏆',
  gym: '💪',
  cafe: '☕',
  restaurant: '🍲',
  hotel: '🏨',
  plaza: '⛲',
  park: '🌳',
  bus_stop: '🚌',
  kiosk: '🥤',
};

export class WorldMapUI {
  constructor({ net, onTravel, onSetWaypoint }) {
    this.net = net;
    this.onTravel = onTravel;
    this.onSetWaypoint = onSetWaypoint;
    this.activeCategory = 'all';
    this.searchQuery = '';
    this.selectedPoi = null;
    this.activeWaypoint = null;
    this.playerPos = { x: 0, z: -28, heading: 0 };
    this.actors = { players: new Map(), npcs: new Map(), cars: new Map() };
    this.builtBase = false;

    this.root = document.createElement('div');
    this.root.id = 'world-map-modal';
    this.root.className = 'overlay hidden';
    this.root.innerHTML = `
      <div class="map-card glass">
        <div class="map-head">
          <div class="map-title-row">
            <h2>🗺️ Mapa Geral de Kianda Centro · Mundo Aberto</h2>
            <span class="muted">Área: 480 × 400 m · Navegação GPS e Deslocação</span>
          </div>
          <button class="icon-btn" id="map-close">✕</button>
        </div>
        <div class="map-toolbar">
          <input type="text" id="map-search" placeholder="🔍 Procurar local, loja, arena, moradia..." autocomplete="off">
          <div class="map-chips">
            ${CATEGORIES.map((c) => `<button class="map-chip ${c.id === 'all' ? 'active' : ''}" data-cat="${c.id}">${c.icon} ${c.label}</button>`).join('')}
          </div>
        </div>
        <div class="map-body">
          <div class="map-canvas-wrap">
            <canvas id="map-canvas" width="960" height="800"></canvas>
            <div class="map-hint">Clica em qualquer local para ver detalhes, definir GPS ou viajar</div>
          </div>
          <div class="map-sidebar" id="map-sidebar">
            <div class="map-sidebar-empty">
              <h3>Selecciona um ponto no mapa</h3>
              <p class="muted">Explora os estabelecimentos, centros de competição, concessionários, supermercado e moradias de Kianda Centro.</p>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(this.root);

    this.canvas = this.root.querySelector('#map-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.bindEvents();
    this.buildBaseMap();
  }

  bindEvents() {
    this.root.querySelector('#map-close').onclick = () => this.close();
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.close();
    });

    const search = this.root.querySelector('#map-search');
    search.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.trim().toLowerCase();
      this.render();
    });

    this.root.querySelectorAll('.map-chip').forEach((btn) => {
      btn.onclick = () => {
        this.root.querySelectorAll('.map-chip').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeCategory = btn.dataset.cat;
        this.render();
      };
    });

    this.canvas.addEventListener('click', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / rect.width;
      const scaleY = this.canvas.height / rect.height;
      const clickX = (e.clientX - rect.left) * scaleX;
      const clickY = (e.clientY - rect.top) * scaleY;

      const worldX = (clickX / this.mapScale) - this.mapOffsetX;
      const worldZ = (clickY / this.mapScale) - this.mapOffsetZ;

      const pois = this.filteredPois();
      let best = null;
      let bestDist = 24 * this.mapScale;
      for (const p of pois) {
        const px = (p.x + this.mapOffsetX) * this.mapScale;
        const pz = (p.z + this.mapOffsetZ) * this.mapScale;
        const d = Math.hypot(px - clickX, pz - clickY);
        if (d < bestDist) {
          bestDist = d;
          best = p;
        }
      }
      if (best) {
        this.selectPoi(best);
      } else {
        const b = BUILDINGS.find((bb) => worldX >= bb.minX && worldX <= bb.maxX && worldZ >= bb.minZ && worldZ <= bb.maxZ);
        if (b) {
          this.selectBuilding(b);
        }
      }
    });
  }

  isOpen() {
    return !this.root.classList.contains('hidden');
  }

  open() {
    this.root.classList.remove('hidden');
    this.render();
  }

  close() {
    this.root.classList.add('hidden');
  }

  toggle() {
    if (this.isOpen()) this.close();
    else this.open();
  }

  updatePlayer(x, z, heading) {
    this.playerPos.x = x;
    this.playerPos.z = z;
    this.playerPos.heading = heading;
    if (this.isOpen()) this.render();
  }

  updateActors(actors) {
    this.actors = actors;
    if (this.isOpen()) this.render();
  }

  buildBaseMap() {
    const minX = ZONE_BOUNDS.minX - 10;
    const maxX = ZONE_BOUNDS.maxX + 10;
    const minZ = ZONE_BOUNDS.minZ - 10;
    const maxZ = ZONE_BOUNDS.maxZ + 10;
    const widthM = maxX - minX;
    const heightM = maxZ - minZ;

    this.mapScale = Math.min(this.canvas.width / widthM, this.canvas.height / heightM);
    this.mapOffsetX = -minX + (this.canvas.width / this.mapScale - widthM) / 2;
    this.mapOffsetZ = -minZ + (this.canvas.height / this.mapScale - heightM) / 2;

    this.baseCanvas = document.createElement('canvas');
    this.baseCanvas.width = this.canvas.width;
    this.baseCanvas.height = this.canvas.height;
    const g = this.baseCanvas.getContext('2d');
    const toCanvasX = (x) => (x + this.mapOffsetX) * this.mapScale;
    const toCanvasZ = (z) => (z + this.mapOffsetZ) * this.mapScale;

    // Fundo geral do terreno
    g.fillStyle = '#0f141c';
    g.fillRect(0, 0, this.baseCanvas.width, this.baseCanvas.height);

    // Bairros / Distritos coloridos suaves no fundo
    g.fillStyle = 'rgba(47, 90, 42, 0.25)'; // Jardim
    g.fillRect(toCanvasX(-45), toCanvasZ(17), 56 * this.mapScale, 64 * this.mapScale);

    g.fillStyle = 'rgba(107, 91, 69, 0.28)'; // Largo Centro
    g.fillRect(toCanvasX(-21), toCanvasZ(-66), 42 * this.mapScale, 51 * this.mapScale);

    g.fillStyle = 'rgba(122, 53, 39, 0.25)'; // Complexo Arena
    g.fillRect(toCanvasX(14), toCanvasZ(17), 32 * this.mapScale, 37 * this.mapScale);

    g.fillStyle = 'rgba(15, 118, 110, 0.22)'; // Zona Comercial Norte
    g.fillRect(toCanvasX(-120), toCanvasZ(-155), 180 * this.mapScale, 45 * this.mapScale);

    g.fillStyle = 'rgba(30, 58, 138, 0.22)'; // Complexo Desportivo Sul
    g.fillRect(toCanvasX(-45), toCanvasZ(110), 200 * this.mapScale, 45 * this.mapScale);

    // Pavimentos e quarteirões
    g.fillStyle = '#1c2430';
    for (const b of [
      [-160, -63, -150, -15], [-160, -63, 15, 150],
      [63, 160, -150, -15], [63, 160, 15, 150],
      [-47, 47, -150, -98], [-47, 47, 98, 150],
      [-47, 47, -82, -15], [-47, 47, 15, 82],
    ]) {
      g.fillRect(toCanvasX(b[0]), toCanvasZ(b[2]), (b[1] - b[0]) * this.mapScale, (b[3] - b[2]) * this.mapScale);
    }

    // Estradas e Avenidas
    for (const r of ROADS) {
      const rr = roadRect(r);
      const rx = toCanvasX(rr.minX);
      const rz = toCanvasZ(rr.minZ);
      const rw = (rr.maxX - rr.minX) * this.mapScale;
      const rh = (rr.maxZ - rr.minZ) * this.mapScale;

      // Passeios da estrada
      g.fillStyle = '#334155';
      g.fillRect(rx - 2, rz - 2, rw + 4, rh + 4);

      // Asfalto
      g.fillStyle = '#1e293b';
      g.fillRect(rx, rz, rw, rh);

      // Linha central
      g.strokeStyle = r.lanes >= 4 ? '#f5b942' : '#ffffff';
      g.lineWidth = 1.5;
      g.setLineDash(r.lanes >= 4 ? [4, 4] : [2, 3]);
      g.beginPath();
      if (r.axis === 'x') {
        g.moveTo(rx, rz + rh / 2);
        g.lineTo(rx + rw, rz + rh / 2);
      } else {
        g.moveTo(rx + rw / 2, rz);
        g.lineTo(rx + rw / 2, rz + rh);
      }
      g.stroke();
      g.setLineDash([]);
    }

    // Edifícios
    for (const b of BUILDINGS) {
      const bx = toCanvasX(b.minX);
      const bz = toCanvasZ(b.minZ);
      const bw = (b.maxX - b.minX) * this.mapScale;
      const bh = (b.maxZ - b.minZ) * this.mapScale;

      const fill = {
        comercial: '#d97706',
        competicoes: '#b91c1c',
        industrial: '#475569',
        residencial: '#64748b',
        centro: '#0284c7',
        parque: '#059669',
      }[b.district] ?? '#334155';

      g.fillStyle = fill;
      g.fillRect(bx, bz, bw, bh);
      g.strokeStyle = b.interior ? '#f5b942' : 'rgba(255,255,255,0.2)';
      g.lineWidth = b.interior ? 2 : 1;
      g.strokeRect(bx, bz, bw, bh);

      // Nomes de marcos importantes
      if (b.sign || bw > 30) {
        g.fillStyle = '#f8fafc';
        g.font = `bold ${Math.max(9, Math.min(11, bw * 0.25))}px Rajdhani, sans-serif`;
        g.textAlign = 'center';
        g.fillText(b.name.split(' ')[0], bx + bw / 2, bz + bh / 2 + 3);
      }
    }

    this.builtBase = true;
  }

  filteredPois() {
    return POIS.filter((p) => {
      if (p.type === 'bench' || p.private) return false;
      const cat = POI_CATEGORY[p.type] ?? 'leisure';
      if (this.activeCategory !== 'all' && cat !== this.activeCategory) return false;
      if (this.searchQuery) {
        const name = (p.name ?? '').toLowerCase();
        const type = (p.type ?? '').toLowerCase();
        if (!name.includes(this.searchQuery) && !type.includes(this.searchQuery)) return false;
      }
      return true;
    });
  }

  render() {
    if (!this.builtBase) this.buildBaseMap();
    const g = this.ctx;
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g.drawImage(this.baseCanvas, 0, 0);

    const toCanvasX = (x) => (x + this.mapOffsetX) * this.mapScale;
    const toCanvasZ = (z) => (z + this.mapOffsetZ) * this.mapScale;

    // Rota / Waypoint GPS se ativo
    if (this.activeWaypoint) {
      const px = toCanvasX(this.playerPos.x);
      const pz = toCanvasZ(this.playerPos.z);
      const wx = toCanvasX(this.activeWaypoint.x);
      const wz = toCanvasZ(this.activeWaypoint.z);

      g.strokeStyle = '#22c98b';
      g.lineWidth = 3;
      g.setLineDash([6, 4]);
      g.beginPath();
      g.moveTo(px, pz);
      g.lineTo(wx, wz);
      g.stroke();
      g.setLineDash([]);

      // Ponto de destino pulsante
      g.fillStyle = '#22c98b';
      g.beginPath();
      g.arc(wx, wz, 9, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#ffffff';
      g.lineWidth = 2;
      g.stroke();
    }

    // Outros jogadores
    for (const p of this.actors.players?.values() ?? []) {
      const ox = toCanvasX(p.root.position.x);
      const oz = toCanvasZ(p.root.position.z);
      g.fillStyle = '#3ba7ff';
      g.beginPath();
      g.arc(ox, oz, 4.5, 0, Math.PI * 2);
      g.fill();
    }

    // POIs com ícones
    const pois = this.filteredPois();
    for (const p of pois) {
      const cx = toCanvasX(p.x);
      const cz = toCanvasZ(p.z);
      const isSel = this.selectedPoi?.id === p.id;
      const isWp = this.activeWaypoint?.id === p.id;

      g.fillStyle = isSel ? '#f0444a' : isWp ? '#22c98b' : '#1e293b';
      g.beginPath();
      g.arc(cx, cz, isSel ? 13 : 9, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = isSel || isWp ? '#ffffff' : 'rgba(255,255,255,0.4)';
      g.lineWidth = 2;
      g.stroke();

      const icon = POI_ICONS[p.type] ?? '📍';
      g.font = `${isSel ? 12 : 9}px sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(icon, cx, cz);
    }

    // Jogador local (Seta verde)
    const px = toCanvasX(this.playerPos.x);
    const pz = toCanvasZ(this.playerPos.z);
    g.save();
    g.translate(px, pz);
    g.rotate(-this.playerPos.heading);
    g.fillStyle = '#22c98b';
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -11);
    g.lineTo(8, 9);
    g.lineTo(0, 4);
    g.lineTo(-8, 9);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();

    // Legenda de orientação
    g.fillStyle = '#f8fafc';
    g.font = 'bold 14px Rajdhani, sans-serif';
    g.textAlign = 'left';
    g.fillText('Norte ↑', 16, 28);
    const dist = this.activeWaypoint ? Math.round(Math.hypot(this.playerPos.x - this.activeWaypoint.x, this.playerPos.z - this.activeWaypoint.z)) : null;
    if (dist !== null) {
      g.fillStyle = '#22c98b';
      g.fillText(`GPS: ${dist} m até ${this.activeWaypoint.name}`, 16, 50);
    }
  }

  selectPoi(poi) {
    this.selectedPoi = poi;
    const cat = POI_CATEGORY[poi.type] ?? 'leisure';
    const b = poi.buildingId ? BUILDINGS.find((bb) => bb.id === poi.buildingId) : null;
    const district = b ? (DISTRICTS[b.district]?.name ?? b.district) : 'Kianda Centro';
    const hours = poi.openHours ? `${poi.openHours[0]}h – ${poi.openHours[1]}h` : 'Aberto 24 Horas';
    const icon = POI_ICONS[poi.type] ?? '📍';

    const side = this.root.querySelector('#map-sidebar');
    side.innerHTML = `
      <div class="map-sidebar-card">
        <div class="map-poi-badge">${icon} ${cat.toUpperCase()}</div>
        <h3>${poi.name}</h3>
        <p class="muted">📍 ${district}</p>
        <div class="map-meta-row"><span>Horário:</span><b>${hours}</b></div>
        <div class="map-meta-row"><span>Coordenadas:</span><b>X: ${Math.round(poi.x)} · Z: ${Math.round(poi.z)}</b></div>
        <p class="map-desc">${this.poiDescription(poi)}</p>
        <div class="map-actions">
          <button class="btn good map-btn-gps" id="btn-set-gps">📍 Definir GPS / Rota</button>
          <button class="btn primary map-btn-travel" id="btn-travel-poi">⚡ Viajar para aqui</button>
        </div>
      </div>
    `;

    side.querySelector('#btn-set-gps').onclick = () => {
      this.activeWaypoint = poi;
      this.onSetWaypoint?.(poi);
      this.render();
    };

    side.querySelector('#btn-travel-poi').onclick = () => {
      this.onTravel?.(poi);
      this.close();
    };

    this.render();
  }

  selectBuilding(b) {
    const district = DISTRICTS[b.district]?.name ?? b.district;
    const side = this.root.querySelector('#map-sidebar');
    side.innerHTML = `
      <div class="map-sidebar-card">
        <div class="map-poi-badge">🏢 EDIFÍCIO</div>
        <h3>${b.name}</h3>
        <p class="muted">📍 ${district}</p>
        <div class="map-meta-row"><span>Pisos:</span><b>${b.floors} (${b.height.toFixed(1)} m)</b></div>
        <div class="map-meta-row"><span>Interior:</span><b>${b.interior ? 'Acessível ✓' : 'Fachada'}</b></div>
        <div class="map-actions">
          <button class="btn good map-btn-gps" id="btn-set-gps">📍 Marcar GPS</button>
          <button class="btn primary map-btn-travel" id="btn-travel-poi">⚡ Deslocar-se</button>
        </div>
      </div>
    `;
    const target = { id: b.id, name: b.name, x: b.cx, z: b.cz };
    side.querySelector('#btn-set-gps').onclick = () => {
      this.activeWaypoint = target;
      this.onSetWaypoint?.(target);
      this.render();
    };
    side.querySelector('#btn-travel-poi').onclick = () => {
      this.onTravel?.(target);
      this.close();
    };
  }

  poiDescription(poi) {
    if (poi.type === 'supermarket') return 'Supermercado Kwanza com corredores de alimentação, sumos naturais angolanos, água mineral e utilitários.';
    if (poi.type === 'dealership') return 'Showroom de carros e motas com garantia. Compras de veículos com saldo demo e envio directo para a garagem.';
    if (poi.type === 'car_rental') return 'Serviço de aluguer de viaturas por sessão e tempo para circulação livre e testes na cidade.';
    if (poi.type === 'real_estate') return 'Agência Imobiliária Kianda. Compra e arrendamento de apartamentos e vivendas familiares com interiores.';
    if (poi.type === 'combat_center') return 'Ringue oficial de combate corpo a corpo 1v1 com divisão 80% ao vencedor e 20% comissão da plataforma.';
    if (poi.type === 'shooting_center') return 'Arena táctica para duelos de tiro 1v1 e modo de sobrevivência com barricadas e rodadas.';
    if (poi.type === 'race_center') return 'Autódromo com circuitos oficiais: Circuito do Anel e Grande Circuito Urbano da Marginal.';
    if (poi.type === 'arena' || poi.type === 'gym') return 'Centro de apostas, desafios e competições da Arena Kianda.';
    return 'Estabelecimento comercial e ponto de encontro com cidadãos de Kianda Centro.';
  }
}
