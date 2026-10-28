import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ExpressionService } from '../src/expressions.js';
import { ShopService } from '../src/shop.js';
import { Store } from '../src/store.js';
import { DemoLedger } from '../src/economy/ledger.js';
import { EMOTES } from '../../shared/emotes.js';

test('emotes: validação, cooldown, contexto e cancelamento pelo movimento', () => {
  let now = 1000;
  const svc = new ExpressionService({ now: () => now });
  const p = { id: 'u:1', x: 0, z: 0 };
  const ev = svc.startEmote(p, 'acenar');
  assert.equal(ev.t, 'emote');
  assert.equal(p.emote.id, 'acenar');
  assert.throws(() => svc.startEmote(p, 'acenar'), /Aguarda/);
  assert.throws(() => svc.startEmote(p, 'inexistente'), /desconhecido/);
  now += 2000;
  assert.throws(() => svc.startEmote({ ...p, inVehicle: true }, 'rir'), /veículo/);
  assert.throws(() => svc.startEmote(p, 'rir', { inRace: true }), /corrida/);
  svc.startEmote(p, 'danca_kuduro');
  assert.equal(svc.maintain(p), null, 'parado continua');
  p.x = 1;
  assert.equal(svc.maintain(p).t, 'emote_stop', 'mexer-se cancela');
  assert.equal(p.emote, null);
});

test('emotes: limite por minuto e desactivação pelo administrador', () => {
  let now = 0;
  const svc = new ExpressionService({ now: () => now, overrides: { rir: { active: false } } });
  assert.throws(() => svc.startEmote({ id: 'a', x: 0, z: 0 }, 'rir'), /desactivado/);
  const p = { id: 'b', x: 0, z: 0 };
  const ids = EMOTES.filter((e) => e.id !== 'rir').map((e) => e.id);
  let ok = 0;
  for (let i = 0; i < 40; i++) {
    now += 1300;
    try { svc.startEmote(p, ids[i % ids.length]); ok++; } catch { /* limite */ }
  }
  assert.equal(ok, 20);
  assert.throws(() => svc.emoji(p, '<script>'), /não permitido/);
  now += 61000;
  assert.equal(svc.emoji(p, '🎉').e, '🎉');
  assert.deepEqual(svc.sanitizeFavorites(['rir', 'x', 'acenar', 'rir']), ['rir', 'acenar']);
});

function shopSetup() {
  const store = new Store(':memory:');
  const ledger = new DemoLedger(store);
  ledger.ensurePlayer('u:1');
  return { store, ledger, shop: new ShopService({ store, ledger }) };
}

test('loja: comprar só junto à loja, com saldo demo, uma vez', () => {
  const { shop, ledger } = shopSetup();
  const far = { id: 'u:1', x: 0, z: 0 };
  assert.throws(() => shop.buy(far, 'mochila'), /Moda Muxima/);
  const atShop = { id: 'u:1', x: 16, z: -12 };
  shop.buy(atShop, 'mochila');
  assert.equal(ledger.wallet('u:1').balanceKz, 10000 - 1800);
  assert.throws(() => shop.buy(atShop, 'mochila'), /Já tens/);
  assert.throws(() => shop.buy(atShop, 'mala_tiracolo'), /indisponível/);
  assert.throws(() => shop.buy({ id: 'u:1', x: 110, z: -30 }, 'desportivo_gt'), /insuficiente/);
  assert.ok(ledger.verify().ok);
});

test('aparência: itens não possuídos/incompatíveis são substituídos; formato antigo migrado', () => {
  const { shop } = shopSetup();
  const a = shop.validateAppearance('u:1', { gender: 'm', top: 'vestido', bottom: 'calca_cargo', shoes: '#ffffff', accessory: 'bone', accessories: undefined, topColor: 'red' });
  assert.equal(a.top, 't-shirt');
  assert.equal(a.bottom, 'calca_ganga');
  assert.equal(a.shoes, 'tenis');
  assert.equal(a.shoesColor, '#ffffff');
  assert.deepEqual(a.accessories, {});
  assert.equal(a.topColor, undefined);
  shop.buy({ id: 'u:1', x: 16, z: -12 }, 'bone');
  assert.equal(shop.validateAppearance('u:1', { accessories: { head: 'bone' } }).accessories.head, 'bone');
});

test('garagem: só veículos possuídos; pintura validada', () => {
  const { shop } = shopSetup();
  assert.throws(() => shop.vehicleConfig('u:1', 'suv_namibe'), /Ainda não tens/);
  const c = shop.vehicleConfig('u:1', 'sedan_kianda', { paint: '#123456' });
  assert.equal(c.kind, 'car');
  assert.equal(c.paint, '#b71c1c', 'cor fora da paleta → primeira cor');
  shop.setOverrides({ sedan_kianda: { active: false } });
  assert.throws(() => shop.vehicleConfig('u:1', 'sedan_kianda'), /indisponível/);
});
