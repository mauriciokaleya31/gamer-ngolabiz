import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WeatherSystem } from '../src/weather.js';
import { TrafficSystem, densityAt } from '../src/traffic.js';
import { trafficLightState } from '../../shared/zone.js';
import { signToken, verifyToken, resolveIdentity } from '../src/auth.js';

test('clima: transição gradual e superfícies molham/secam', () => {
  let now = 0;
  const w = new WeatherSystem({ transitionMin: 4, minDurationMin: 600, maxDurationMin: 600 }, () => now);
  w.setTarget('chuva', 60);
  now += 60000; w.tick();
  const r1 = w.state.rain;
  assert.ok(r1 > 0 && r1 < 0.75, `após 1 min: ${r1}`);
  for (let i = 0; i < 10; i++) { now += 60000; w.tick(); }
  assert.ok(Math.abs(w.state.rain - 0.75) < 1e-6);
  assert.ok(w.state.wetness > 0.9);
  w.setTarget('limpo', 60);
  for (let i = 0; i < 20; i++) { now += 60000; w.tick(); }
  assert.equal(w.state.rain, 0);
  assert.ok(w.state.wetness < 0.3 && w.state.wetness >= 0, 'seca devagar');
});

test('trânsito: densidade varia com a hora', () => {
  assert.ok(densityAt(8) > 0.9);
  assert.ok(densityAt(3) < 0.25);
});

test('trânsito: carros param no vermelho e nunca se sobrepõem', () => {
  const t = new TrafficSystem({ maxCars: 14 });
  let now = 0;
  for (let i = 0; i < 40; i++) t.spawnCar(Object.keys(t.loops)[i % 6], []);
  let redRunners = 0;
  for (let i = 0; i < 1800; i++) {
    now += 100;
    t.tick(0.1, now, 8, {});
    for (const c of t.cars) {
      for (const l of [{ id: 'tl_rua_mercado', x: -55 }, { id: 'tl_rua_oficina', x: 55 }]) {
        const s = trafficLightState(now, l.id);
        // carro na faixa EW dentro do cruzamento com EW vermelho há > 3 s e que não estava já dentro
        if (Math.abs(Math.sin(c.heading)) > 0.9 && Math.abs(c.z) < 7.5 && Math.abs(c.x - l.x) < 3 && s.ew === 'red' && s.phase === 'NS_GREEN' && s.remaining < 13 && c.speed > 8) redRunners++;
      }
    }
  }
  assert.equal(redRunners, 0);
  assert.ok(t.cars.length > 0);
});

test('tokens do portal: assinatura, expiração e convidados', () => {
  const secret = 's3cr3t';
  const tok = signToken({ sub: 'u:42', name: 'Lukeny', role: 'player', exp: Math.floor(Date.now() / 1000) + 60 }, secret);
  assert.equal(verifyToken(tok, secret).sub, 'u:42');
  assert.equal(verifyToken(tok, 'outro'), null);
  const [b, s] = tok.split('.');
  assert.equal(verifyToken(`${b}x.${s}`, secret), null);
  const expired = signToken({ sub: 'u:1', exp: 1 }, secret);
  assert.equal(verifyToken(expired, secret), null);
  assert.equal(resolveIdentity({ token: null, secret, allowGuests: false }), null);
  const g = resolveIdentity({ token: null, secret, allowGuests: true, guestName: 'Zé<script>' });
  assert.ok(g.isGuest && g.playerId.startsWith('g:') && g.displayName === 'Zéscript');
});
