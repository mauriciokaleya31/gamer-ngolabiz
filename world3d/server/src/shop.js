/**
 * Guarda-roupa, concessionário e garagem (economia DEMO).
 * - Itens gratuitos (price 0) pertencem a todos; os restantes compram-se com Kz demo.
 * - As compras só são aceites junto da loja física correspondente no mundo.
 * - A aparência pedida pelo cliente é validada: itens não possuídos, inactivos,
 *   indisponíveis ou incompatíveis são substituídos pelo item base.
 */
import { effectiveCatalog, isSelectable, OPTIONAL_SLOTS, PAINT_PALETTE, RENTAL_CATALOG, PROPERTIES_CATALOG } from '../../shared/catalog.js';
import { POIS } from '../../shared/zone.js';

export const SHOP_LOCATIONS = {
  wardrobe: { poi: 'loja_muxima_porta', name: 'Moda Muxima', kinds: ['clothing'] },
  dealership: { poi: 'estacionamento', altPoi: 'concessionario_kalunga_poi', name: 'Concessionário Auto Kalunga', kinds: ['vehicle'] },
  garage: { poi: 'oficina_kalunga_porta', name: 'Garagem Kalunga Motors', kinds: [] },
  supermarket: { poi: 'supermercado_kwanza_porta_poi', altPoi: 'mercado_balcao', name: 'Supermercado Kwanza & Mercado Kianda', kinds: ['consumable'] },
  rental: { poi: 'aluguer_kianda_poi', name: 'Rent-a-Car & Aluguer Kianda', kinds: ['rental'] },
  realestate: { poi: 'imobiliaria_kianda_poi', name: 'Agência Imobiliária Kianda', kinds: ['property'] },
  combat: { poi: 'centro_combate_poi', name: 'Centro de Combate & Ringue 1v1', kinds: [] },
  shooting: { poi: 'arena_tiro_poi', name: 'Arena Táctica de Tiro & Sobrevivência', kinds: [] },
  race_center: { poi: 'centro_corridas_poi', name: 'Autódromo & Centro de Corridas Kalunga', kinds: [] },
};
export const GARAGE_SPAWN = { x: 89, z: -12, heading: Math.PI / 2 };
export const RENTAL_SPAWN = { x: 158, z: -30, heading: 0 };
const POI_BY_ID = new Map(POIS.map((p) => [p.id, p]));
const RENTAL_BY_ID = new Map(RENTAL_CATALOG.map((r) => [r.id, r]));
const PROPERTY_BY_ID = new Map(PROPERTIES_CATALOG.map((pr) => [pr.id, pr]));

export class ShopError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

const DEFAULTS = { top: 't-shirt', bottom: 'calca_ganga', shoes: 'tenis' };
const HEX = /^#[0-9a-fA-F]{6}$/;

export class ShopService {
  constructor({ store, ledger, overrides = {} }) {
    this.store = store;
    this.ledger = ledger;
    this.setOverrides(overrides);
  }

  setOverrides(overrides = {}) {
    this.overrides = overrides;
    this.catalog = effectiveCatalog(overrides);
    this.byId = new Map(this.catalog.map((i) => [i.id, i]));
  }

  publicCatalog() {
    return this.catalog.filter((i) => i.published).map(({ id, kind, slot, category, name, price, status, active, thumbnail, gender, vehicleClass, body, paints, rims, model, asset, specs, license, livery, icon, desc }) => ({ id, kind, slot, category, name, price, status, active, thumbnail, gender, vehicleClass, body, paints, rims, model, asset, specs, license, livery, icon, desc }));
  }

  publicRentals() {
    return RENTAL_CATALOG.filter((r) => r.active);
  }

  publicProperties() {
    return PROPERTIES_CATALOG.filter((p) => p.active);
  }

  owns(playerId, itemId) {
    const item = this.byId.get(itemId);
    if (!item) return false;
    if (item.price === 0) return true;
    return this.store.ownedItems(playerId).includes(itemId);
  }

  owned(playerId) {
    const bought = new Set(this.store.ownedItems(playerId));
    return this.catalog.filter((i) => i.price === 0 || bought.has(i.id)).map((i) => i.id);
  }

  nearShop(p, shop) {
    const loc = SHOP_LOCATIONS[shop];
    if (!loc) return false;
    const poi = POI_BY_ID.get(loc.poi);
    if (poi && Math.hypot(poi.x - p.x, poi.z - p.z) <= 16) return true;
    if (loc.altPoi) {
      const alt = POI_BY_ID.get(loc.altPoi);
      if (alt && Math.hypot(alt.x - p.x, alt.z - p.z) <= 16) return true;
    }
    return false;
  }

  buy(p, itemId, { reqId = null } = {}) {
    const item = this.byId.get(String(itemId));
    if (!item || !isSelectable(item)) throw new ShopError('Item indisponível.', 'unavailable');
    if (item.kind === 'consumable') {
      if (!this.nearShop(p, 'supermarket')) throw new ShopError(`Vai a ${SHOP_LOCATIONS.supermarket.name} para comprar.`, 'far');
      const key = String(reqId ?? `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`).replace(/[^\w-]/g, '').slice(0, 40);
      const r = this.ledger.purchase(p.id, `${item.id}#${key}`, item.price);
      const consumables = r.duplicate ? this.store.consumablesOf(p.id) : this.store.addConsumable(p.id, item.id, 1);
      if (!r.duplicate) this.store.audit('supermarket_purchase', { playerId: p.id, itemId: item.id, priceKz: item.price, txnId: r.txnId });
      return { item, txnId: r.txnId, consumables, duplicate: !!r.duplicate };
    }
    if (this.owns(p.id, item.id)) throw new ShopError('Já tens este item.', 'owned');
    const shop = item.kind === 'vehicle' ? 'dealership' : 'wardrobe';
    if (!this.nearShop(p, shop)) throw new ShopError(`Vai a ${SHOP_LOCATIONS[shop].name} para comprar.`, 'far');
    const r = this.ledger.purchase(p.id, item.id, item.price);
    this.store.grantItem(p.id, item.id, 'compra_demo', r.txnId);
    this.store.audit('purchase', { playerId: p.id, itemId: item.id, priceKz: item.price, txnId: r.txnId });
    return { item, txnId: r.txnId };
  }

  rentVehicle(p, rentalId, now = Date.now()) {
    const def = RENTAL_BY_ID.get(String(rentalId));
    if (!def || !def.active) throw new ShopError('Veículo de aluguer indisponível.', 'unavailable');
    if (!this.nearShop(p, 'rental')) throw new ShopError(`Vai a ${SHOP_LOCATIONS.rental.name} para alugar um veículo.`, 'far');
    const contractId = `rent_${p.id}_${now}`;
    const r = this.ledger.purchase(p.id, contractId, def.priceKz);
    const expiresAt = now + def.durationMinutes * 60000;
    const rentals = this.store.createRental({
      id: contractId, playerId: p.id, rentalId: def.id, vehicleItemId: def.vehicleItemId,
      vehicleClass: def.vehicleClass, priceKz: def.priceKz, startedAt: now, expiresAt, txnId: r.txnId,
    });
    this.store.audit('vehicle_rent', { playerId: p.id, contractId, rentalId: def.id, priceKz: def.priceKz, expiresAt });
    return { contractId, def, rentals, txnId: r.txnId };
  }

  returnVehicle(p, contractId, now = Date.now()) {
    const ok = this.store.returnRental(p.id, String(contractId));
    if (!ok) throw new ShopError('Contrato de aluguer não encontrado ou já encerrado.', 'no_contract');
    this.store.audit('vehicle_return', { playerId: p.id, contractId });
    return { rentals: this.store.activeRentalsOf(p.id, now) };
  }

  acquireProperty(p, propertyId, mode = 'buy', now = Date.now()) {
    const prop = PROPERTY_BY_ID.get(String(propertyId));
    if (!prop || !prop.active) throw new ShopError('Imóvel indisponível.', 'unavailable');
    if (!this.nearShop(p, 'realestate')) throw new ShopError(`Vai a ${SHOP_LOCATIONS.realestate.name} para comprar ou arrendar imóveis.`, 'far');
    const existing = this.store.propertiesOf(p.id, now).find((x) => x.propertyId === prop.id && x.mode === 'buy');
    if (existing) throw new ShopError('Já és proprietário deste imóvel.', 'owned');
    const isBuy = mode === 'buy';
    const priceKz = isBuy ? prop.buyPriceKz : prop.rentPriceKz;
    const refId = `prop_${prop.id}_${isBuy ? 'buy' : `rent_${now}`}`;
    const r = this.ledger.purchase(p.id, refId, priceKz);
    const expiresAt = isBuy ? null : now + (prop.rentDays ?? 7) * 86400000;
    const properties = this.store.upsertProperty({
      playerId: p.id, propertyId: prop.id, buildingId: prop.buildingId,
      mode: isBuy ? 'buy' : 'rent', priceKz, acquiredAt: now, expiresAt, txnId: r.txnId,
    });
    this.store.audit(isBuy ? 'property_buy' : 'property_rent', { playerId: p.id, propertyId: prop.id, priceKz, expiresAt, txnId: r.txnId });
    return { prop, mode: isBuy ? 'buy' : 'rent', properties, txnId: r.txnId };
  }

  /** Normaliza e valida a aparência (inclui migração do formato antigo). */
  validateAppearance(playerId, a = {}, { trustAll = false } = {}) {
    const out = { ...a };
    out.gender = out.gender === 'f' ? 'f' : 'm';
    if (typeof out.shoes === 'string' && out.shoes.startsWith('#')) { out.shoesColor = out.shoes; out.shoes = 'tenis'; }
    if (out.accessory && !out.accessories) {
      const it = this.byId.get(out.accessory);
      out.accessories = it && OPTIONAL_SLOTS.includes(it.slot) ? { [it.slot]: it.id } : {};
    }
    delete out.accessory;
    const ok = (id, slot) => {
      const it = this.byId.get(id);
      return it && it.slot === slot && isSelectable(it) && (it.gender === 'u' || it.gender === out.gender) && (trustAll || this.owns(playerId, id));
    };
    for (const [slot, def] of Object.entries(DEFAULTS)) if (!ok(out[slot], slot)) out[slot] = slot === 'top' && out.gender === 'f' && ok('blusa', 'top') ? 'blusa' : def;
    const acc = {};
    for (const slot of OPTIONAL_SLOTS) {
      const id = out.accessories?.[slot];
      if (id && ok(id, slot)) acc[slot] = id;
    }
    out.accessories = acc;
    for (const k of ['skinTone', 'hairColor', 'topColor', 'bottomColor', 'shoesColor']) if (!HEX.test(out[k] ?? '')) delete out[k];
    return out;
  }

  /** Configuração de um veículo da garagem (pintura e jantes validadas). */
  vehicleConfig(playerId, itemId, { paint, rims } = {}) {
    const item = this.byId.get(String(itemId));
    if (!item || item.kind !== 'vehicle' || !isSelectable(item)) throw new ShopError('Veículo indisponível.', 'unavailable');
    if (!this.owns(playerId, item.id)) throw new ShopError('Ainda não tens este veículo.', 'not_owned');
    const paints = item.paints === 'palette' ? PAINT_PALETTE : item.paints;
    return {
      itemId: item.id,
      kind: item.vehicleClass,
      paint: paints.includes(paint) ? paint : paints[0],
      rims: item.rims.includes(rims) ? rims : item.rims[0],
      maxSpeed: item.specs?.maxSpeed ?? null,
    };
  }
}
