import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localParts, zonedToUtc, sunPosition, sunTimes, makeClockState, virtualNow, rebaseClock, formatClock, daylightFactors } from '../../shared/time.js';
import { WorldClock } from '../src/clock.js';

test('14:00 em Luanda corresponde a 13:00 UTC (fuso IANA Africa/Luanda)', () => {
  const utc = zonedToUtc({ year: 2026, month: 10, day: 28, hour: 14, minute: 0 });
  assert.equal(new Date(utc).toISOString(), '2026-10-28T13:00:00.000Z');
  const lp = localParts(utc);
  assert.equal(lp.hour, 14);
  assert.equal(lp.offsetMinutes, 60);
  assert.equal(formatClock(utc), '14:00');
});

test('nascer e pôr do Sol em Luanda são plausíveis ao longo do ano', () => {
  for (const month of [1, 3, 6, 9, 10, 12]) {
    const noonUtc = zonedToUtc({ year: 2026, month, day: 15, hour: 12 });
    const { sunrise, sunset, solarNoon } = sunTimes(noonUtc);
    const rise = localParts(sunrise).hourFloat;
    const set = localParts(sunset).hourFloat;
    assert.ok(rise > 5.3 && rise < 6.4, `nascer ${rise} (mês ${month})`);
    assert.ok(set > 17.6 && set < 18.6, `pôr ${set} (mês ${month})`);
    // no instante calculado, o Sol está no horizonte (−0.83° geométrico + refracção)
    assert.ok(Math.abs(sunPosition(sunrise).elevation) < 1.2);
    assert.ok(sunPosition(solarNoon).elevation > 55);
  }
});

test('28/10/2026: nascer ≈ 05:39 e pôr ≈ 18:02 (Luanda)', () => {
  const { sunrise, sunset } = sunTimes(zonedToUtc({ year: 2026, month: 10, day: 28, hour: 12 }));
  assert.ok(Math.abs(localParts(sunrise).hourFloat - (5 + 39 / 60)) < 6 / 60);
  assert.ok(Math.abs(localParts(sunset).hourFloat - (18 + 2 / 60)) < 6 / 60);
});

test('Sol a Este de manhã e a Oeste à tarde; abaixo do horizonte à noite', () => {
  const morning = sunPosition(zonedToUtc({ year: 2026, month: 10, day: 28, hour: 8 }));
  const evening = sunPosition(zonedToUtc({ year: 2026, month: 10, day: 28, hour: 16 }));
  const night = sunPosition(zonedToUtc({ year: 2026, month: 10, day: 28, hour: 23 }));
  assert.ok(morning.azimuth > 45 && morning.azimuth < 135, `manhã az ${morning.azimuth}`);
  assert.ok(evening.azimuth > 225 && evening.azimuth < 315, `tarde az ${evening.azimuth}`);
  assert.ok(night.elevation < -30);
  assert.ok(daylightFactors(night.elevation).streetLights > 0.99);
  assert.ok(daylightFactors(morning.elevation).day > 0.9);
});

test('relógio acelerado e re-ancoragem sem saltos', () => {
  const t0 = Date.UTC(2026, 9, 28, 12);
  const c = makeClockState({ mode: 'accelerated', dayLengthMinutes: 24 }, t0);
  assert.equal(c.rate, 60);
  assert.equal(virtualNow(c, t0 + 60000) - t0, 3600000);
  const before = virtualNow(c, t0 + 120000);
  const c2 = rebaseClock(c, { dayLengthMinutes: 48 }, t0 + 120000);
  assert.equal(virtualNow(c2, t0 + 120000), before);
  assert.equal(c2.rate, 30);
});

test('modo realtime acompanha o relógio do servidor', () => {
  let now = Date.UTC(2026, 9, 28, 13, 0); // 14:00 Luanda
  const clock = new WorldClock({ now: () => now });
  assert.equal(clock.publicState().local.hour, 14);
  now += 3600000;
  assert.equal(clock.publicState().local.hour, 15);
});

test('diagnóstico de tempo só com allowDiagnostics', () => {
  let now = Date.UTC(2026, 9, 28, 13, 0);
  const prod = new WorldClock({ now: () => now });
  assert.throws(() => prod.diagnose({ hour: 19 }), /desactivado/);
  assert.throws(() => prod.configure({ mode: 'fixed' }), /diagnóstico/);
  const dev = new WorldClock({ now: () => now, allowDiagnostics: true });
  dev.diagnose({ hour: 19.5, speed: 0 });
  assert.equal(dev.publicState().local.hour, 19);
  now += 600000;
  assert.equal(dev.publicState().local.minute, 30, 'fixo não avança');
  dev.diagnose({ speed: 120 });
  now += 30000; // 30 s reais × 120 = 1 h
  assert.equal(dev.publicState().local.hour, 20);
  dev.diagnose({ reset: true });
  assert.equal(dev.publicState().clock.mode, 'realtime');
});
