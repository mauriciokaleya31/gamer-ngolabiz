/**
 * Guarda-roupa, concessionário e garagem (economia DEMO).
 * - Itens gratuitos (price 0) pertencem a todos; os restantes compram-se com Kz demo.
 * - As compras só são aceites junto da loja física correspondente no mundo.
 * - A aparência pedida pelo cliente é validada: itens não possuídos, inactivos,
 *   indisponíveis ou incompatíveis são substituídos pelo item base.
 */
import { effectiveCatalog, isSelectable, OPTIONAL_SLOTS, PAINT_PALETTE } from '../../shared/catalog.js';
import { POIS } from '../../shared/zone.js';

export const SHOP_LOCATIONS = {
  wardrobe: { poi: 'loja_muxima_porta', name: 'Moda Muxima', kinds: ['clothing'] },
  dealership: { poi: 'estacionamento', name: 'Concessionário Kalunga', kinds: ['vehicle'] },
  garage: { poi: 'oficina_kalunga_porta', name: 'Garagem Kalunga Motors', kinds: [] },
};
export const GARAGE_SPAWN = { x: 89, z: -12, heading: Math.PI / 2 };
const POI_BY_ID = new Map(POIS.map((p) => [p.id, p]));

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
    return this.catalog.filter((i) => i.published).map(({ id, kind, slot, name, price, status, active, thumbnail, gender, vehicleClass, body, paints, rims, model, asset, specs, license, livery }) => ({ id, kind, slot, name, price, status, active, thumbnail, gender, vehicleClass, body, paints, rims, model, asset, specs, license, livery }));
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
    const poi = POI_BY_ID.get(loc.poi);
    return poi && Math.hypot(poi.x - p.x, poi.z - p.z) <= 14;
  }

  buy(p, itemId) {
    const item = this.byId.get(String(itemId));
    if (!item || !isSelectable(item)) throw new ShopError('Item indisponível.', 'unavailable');
    if (this.owns(p.id, item.id)) throw new ShopError('Já tens este item.', 'owned');
    const shop = item.kind === 'vehicle' ? 'dealership' : 'wardrobe';
    if (!this.nearShop(p, shop)) throw new ShopError(`Vai a ${SHOP_LOCATIONS[shop].name} para comprar.`, 'far');
    const r = this.ledger.purchase(p.id, item.id, item.price);
    this.store.grantItem(p.id, item.id, 'compra_demo', r.txnId);
    this.store.audit('purchase', { playerId: p.id, itemId: item.id, priceKz: item.price, txnId: r.txnId });
    return { item, txnId: r.txnId };
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
