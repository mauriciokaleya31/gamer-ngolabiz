/**
 * Catálogo de recursos visuais do mundo (roupa, acessórios, veículos).
 *
 * status:
 *   'pronto'       — recurso de qualidade final para o cliente web (modelo licenciado/optimizado)
 *   'provisorio'   — integrado e funcional, mas gerado proceduralmente (a substituir por arte final)
 *   'indisponivel' — anunciado, NÃO seleccionável (sem modelo integrado)
 * price: Kz DEMO (moeda fictícia). 0 = incluído para todos.
 * O administrador pode sobrepor active/price/status/category/thumbnail/published.
 */

const C = (id, slot, name, price, extra = {}) => ({ id, slot, kind: 'clothing', name, price, status: 'provisorio', active: true, published: true, thumbnail: null, gender: 'u', ...extra });

export const CLOTHING = [
  // parte de cima (slot top)
  C('t-shirt', 'top', 'T-shirt', 0),
  C('polo', 'top', 'Pólo', 0),
  C('blusa', 'top', 'Blusa', 0, { gender: 'f' }),
  C('camisa', 'top', 'Camisa de manga comprida', 800),
  C('casaco_leve', 'top', 'Casaco leve', 1500),
  C('camisa_capulana', 'top', 'Camisa de capulana', 1200),
  C('vestido', 'top', 'Vestido', 0, { gender: 'f' }),
  C('fato_treino', 'top', 'Casaco de fato de treino', 1400),
  C('hoodie', 'top', 'Hoodie com capuz', 2000),
  C('colete', 'top', 'Colete acolchoado sobre hoodie', 2600),
  // parte de baixo
  C('calca_ganga', 'bottom', 'Calças de ganga', 0),
  C('calca', 'bottom', 'Calças', 0),
  C('calcoes', 'bottom', 'Calções', 0),
  C('saia', 'bottom', 'Saia', 0, { gender: 'f' }),
  C('saia_capulana', 'bottom', 'Saia de capulana', 900, { gender: 'f' }),
  C('calca_cargo', 'bottom', 'Calças cargo', 1500),
  // calçado
  C('tenis', 'shoes', 'Ténis', 0),
  C('tenis_brancos', 'shoes', 'Ténis brancos', 1200),
  C('sapatos', 'shoes', 'Sapatos', 1000),
  C('botas', 'shoes', 'Botas', 1600),
  C('chinelos', 'shoes', 'Chinelos', 0),
  // acessórios (vários slots em simultâneo)
  C('bone', 'head', 'Boné', 600),
  C('chapeu', 'head', 'Chapéu', 900),
  C('lenco_cabeca', 'head', 'Lenço de cabeça', 500),
  C('auscultadores', 'head', 'Auscultadores', 1300),
  C('oculos', 'eyes', 'Óculos', 700),
  C('oculos_sol', 'eyes', 'Óculos de sol', 1100),
  C('fio', 'neck', 'Fio dourado', 1500),
  C('relogio', 'wrist', 'Relógio', 2500),
  C('mochila', 'back', 'Mochila', 1800),
  C('brincos', 'ears', 'Brincos', 600),
  C('mala_tiracolo', 'back', 'Mala a tiracolo', 1400, { status: 'indisponivel' }),
];

export const SLOTS = { top: 'Parte de cima', bottom: 'Parte de baixo', shoes: 'Calçado', head: 'Cabeça', eyes: 'Olhos', neck: 'Pescoço', wrist: 'Pulso', back: 'Costas', ears: 'Orelhas' };
export const OPTIONAL_SLOTS = ['head', 'eyes', 'neck', 'wrist', 'back', 'ears'];

const V = (id, name, vehicleClass, price, extra = {}) => ({ id, kind: 'vehicle', slot: 'vehicle', name, vehicleClass, price, status: 'provisorio', active: true, published: true, thumbnail: null, model: 'procedural', paints: 'palette', rims: ['classica', 'desportiva', 'cromada'], ...extra });

export const VEHICLES = [
  V('sedan_kianda', 'Kianda Sedan', 'car', 0, { body: 'sedan', specs: { maxSpeed: 38 } }),
  V('moto_ngola', 'Ngola 125', 'moto', 0, { body: 'moto', specs: { maxSpeed: 40 } }),
  V('hatch_muxima', 'Muxima Hatch', 'car', 6000, { body: 'hatch', specs: { maxSpeed: 40 } }),
  V('candongueiro', 'Candongueiro (carrinha táxi)', 'car', 9000, { body: 'van', livery: 'candongueiro', specs: { maxSpeed: 31 } }),
  V('carrinha_lobito', 'Lobito Carga', 'car', 12000, { body: 'pickup', specs: { maxSpeed: 33 } }),
  V('suv_namibe', 'Namibe SUV', 'car', 18000, { body: 'suv', specs: { maxSpeed: 39 } }),
  V('moto_kupapata', 'Kupapata (mota-táxi)', 'moto', 3500, { body: 'moto', livery: 'kupapata', specs: { maxSpeed: 38 } }),
  V('desportivo_gt', 'Kianda GT (concept)', 'car', 45000, {
    status: 'pronto', model: 'glb', asset: 'assets/vehicles/kianda_gt.glb', body: 'gt',
    paints: ['Carmine Candy', 'Pearly Swirly', 'Torched Graphite'], rims: ['original'],
    specs: { maxSpeed: 52 },
    license: 'CC-BY 4.0 — Eric Chadwick / Darmstadt Graphics Group (Khronos glTF Sample Assets "CarConcept", a partir de modelo CC0 de "Unity Fan")',
  }),
  V('autocarro', 'Autocarro urbano', 'car', 0, { status: 'indisponivel', active: true }),
];

export const PAINT_PALETTE = ['#b71c1c', '#0d47a1', '#f5f5f5', '#212121', '#9e9e9e', '#1b5e20', '#f9a825', '#e65100', '#6a1b9a', '#00838f', '#c2185b', '#4e342e'];

const S = (id, category, name, price, extra = {}) => ({
  id, kind: 'consumable', slot: 'consumable', category, name, price,
  status: 'pronto', active: true, published: true, thumbnail: null, ...extra,
});

export const SUPERMARKET_ITEMS = [
  S('agua_kianda', 'Bebidas', 'Água Mineral da Kianda 1,5L', 150, { icon: '💧', desc: 'Hidratação rápida para caminhadas na cidade (+10 Energia).' }),
  S('sumo_muka', 'Bebidas', 'Sumo Natural de Múcua', 350, { icon: '🧃', desc: 'Bebida tradicional angolana rica em energia (+25 Energia).' }),
  S('energetico_turbo', 'Energia', 'Energético Ngola Turbo', 600, { icon: '⚡', desc: 'Aumenta o fôlego e preparação antes de competições (+50 Energia).' }),
  S('refeicao_funge', 'Alimentação', 'Prato de Funge & Calulu', 1200, { icon: '🍲', desc: 'Refeição completa do Mercado Kianda (Recuperação Total).' }),
  S('mufete_ilha', 'Alimentação', 'Mufete Tradicional da Ilha', 1800, { icon: '🐟', desc: 'Especialidade grelhada com feijão de óleo de palma e banana.' }),
  S('kit_primeiros_socorros', 'Utilitários', 'Kit Médico de Arena', 900, { icon: '🧰', desc: 'Kit de apoio táctico para recuperações entre rondas.' }),
  S('kit_reparacao', 'Automóvel', 'Kit de Manutenção Kalunga', 1500, { icon: '🔧', desc: 'Ferramentas e aditivo para manutenção rápida de carro ou mota.' }),
  S('passe_vip_arena', 'Eventos', 'Passe VIP Camarote Arena', 2500, { icon: '🎟️', desc: 'Acesso distinto às galerias de espectador nos Centros de Competição.' }),
];

export const RENTAL_CATALOG = [
  { id: 'rent_sedan_kianda', vehicleItemId: 'sedan_kianda', name: 'Aluguer · Kianda Sedan Conforto', vehicleClass: 'car', priceKz: 400, durationMinutes: 30, depositKz: 0, specs: { maxSpeed: 38 }, status: 'pronto', active: true },
  { id: 'rent_hatch_muxima', vehicleItemId: 'hatch_muxima', name: 'Aluguer · Muxima Hatch Urbano', vehicleClass: 'car', priceKz: 550, durationMinutes: 30, depositKz: 0, specs: { maxSpeed: 40 }, status: 'pronto', active: true },
  { id: 'rent_suv_namibe', vehicleItemId: 'suv_namibe', name: 'Aluguer · Namibe SUV 4×4', vehicleClass: 'car', priceKz: 800, durationMinutes: 30, depositKz: 0, specs: { maxSpeed: 39 }, status: 'pronto', active: true },
  { id: 'rent_desportivo_gt', vehicleItemId: 'desportivo_gt', name: 'Aluguer · Kianda GT Desportivo', vehicleClass: 'car', priceKz: 1500, durationMinutes: 30, depositKz: 0, specs: { maxSpeed: 52 }, status: 'pronto', active: true },
  { id: 'rent_moto_ngola', vehicleItemId: 'moto_ngola', name: 'Aluguer · Mota Ngola 125', vehicleClass: 'moto', priceKz: 250, durationMinutes: 30, depositKz: 0, specs: { maxSpeed: 40 }, status: 'pronto', active: true },
  { id: 'rent_moto_kupapata', vehicleItemId: 'moto_kupapata', name: 'Aluguer · Mota Kupapata Rápida', vehicleClass: 'moto', priceKz: 350, durationMinutes: 30, depositKz: 0, specs: { maxSpeed: 38 }, status: 'pronto', active: true },
];

export const PROPERTIES_CATALOG = [
  { id: 'prop_apartamento_largo', buildingId: 'edificio_largo', name: 'Apartamento T2 Vista Largo', district: 'Largo da Kianda', type: 'apartment', buyPriceKz: 4500, rentPriceKz: 600, rentDays: 7, rooms: 'Sala ampla, 2 quartos, varanda sobre o Largo', spawn: [-31, -50], status: 'pronto', active: true },
  { id: 'prop_moradia_mangueiras', buildingId: 'moradia_maianga_1', name: 'Moradia Familiar das Mangueiras', district: 'Bairro das Mangueiras & Maianga', type: 'house', buyPriceKz: 6500, rentPriceKz: 850, rentDays: 7, rooms: 'Sala mobilada, quintal privado, 3 quartos', spawn: [-156, -79], status: 'pronto', active: true },
  { id: 'prop_vivenda_miramar', buildingId: 'vivenda_miramar', name: 'Vivenda Modelo Miramar', district: 'Maianga / Miramar', type: 'house', buyPriceKz: 9000, rentPriceKz: 1200, rentDays: 7, rooms: 'Vivenda de 2 pisos, salão nobre, garagem e jardim', spawn: [-156, -46], status: 'pronto', active: true },
  { id: 'prop_condominio_talatona', buildingId: 'apartamento_talatona', name: 'Penthouse Condomínio Talatona', district: 'Talatona Sul', type: 'apartment', buyPriceKz: 7800, rentPriceKz: 1000, rentDays: 7, rooms: 'Apartamento moderno com acabamentos premium e segurança', spawn: [-100, 145], status: 'pronto', active: true },
];

export const STARTER_ITEMS = [...CLOTHING.filter((i) => i.price === 0), ...VEHICLES.filter((v) => v.price === 0 && v.status !== 'indisponivel')].map((i) => i.id);

export const CATALOG = [...CLOTHING, ...VEHICLES, ...SUPERMARKET_ITEMS];
export const CATALOG_BY_ID = new Map(CATALOG.map((i) => [i.id, i]));

/** Aplica sobreposições do administrador. */
export function effectiveCatalog(overrides = {}) {
  return CATALOG.map((i) => ({ ...i, ...(overrides[i.id] ?? {}) }));
}

export function isSelectable(item) {
  return item && item.active && item.published && item.status !== 'indisponivel';
}
