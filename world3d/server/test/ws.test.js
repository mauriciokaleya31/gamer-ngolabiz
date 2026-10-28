import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { Store } from '../src/store.js';
import { World } from '../src/world.js';
import { createWorldServer } from '../src/http.js';
import { createDisabledProvider } from '../src/dialogue/providers.js';
import { loadEnv } from '../src/config.js';

function client(url, name) {
  const ws = new WebSocket(url);
  const inbox = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    inbox.push(m);
    for (const w of [...waiters]) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m); }
  });
  const wait = (pred, ms = 4000) => new Promise((resolve, reject) => {
    const found = inbox.find(pred);
    if (found) return resolve(found);
    const w = { pred, resolve };
    waiters.push(w);
    setTimeout(() => reject(new Error(`timeout à espera de mensagem (${name})`)), ms);
  });
  const ready = new Promise((r) => ws.on('open', r)).then(() => ws.send(JSON.stringify({ t: 'hello', guestName: name, appearance: { gender: 'f', top: 'vestido' } })));
  return { ws, inbox, wait, ready, send: (m) => ws.send(JSON.stringify(m)) };
}

test('multijogador: dois clientes vêem-se, emotes e emojis sincronizados, movimento cancela', async () => {
  const env = loadEnv({ WORLD3D_ENV: 'development', WORLD3D_DB: ':memory:' });
  const store = new Store(':memory:');
  const world = new World({ env, store, provider: createDisabledProvider() });
  const { server, wss } = createWorldServer({ world, env });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  world.start();
  const url = `ws://127.0.0.1:${server.address().port}/ws`;
  try {
    const a = client(url, 'Ana');
    const b = client(url, 'Beto');
    await Promise.all([a.ready, b.ready]);
    const wa = await a.wait((m) => m.t === 'welcome');
    const wb = await b.wait((m) => m.t === 'welcome');
    assert.equal(wa.you.appearance.top, 'blusa', 'item pago não possuído é substituído pelo base');
    assert.ok(wa.catalog.length > 20 && wa.emotes.length >= 12);
    // B vê A no snapshot
    await b.wait((m) => m.t === 'snap' && m.p.some((o) => o.id === wa.you.id));
    a.send({ t: 'emote', id: 'danca_kuduro' });
    const ev = await b.wait((m) => m.t === 'emote' && m.playerId === wa.you.id);
    assert.equal(ev.id, 'danca_kuduro');
    // estado do emote também viaja nos snapshots (para quem chega depois)
    await b.wait((m) => m.t === 'snap' && m.p.some((o) => o.id === wa.you.id && o.e?.id === 'danca_kuduro'));
    a.send({ t: 'emoji', e: '🎉' });
    assert.equal((await b.wait((m) => m.t === 'emoji')).e, '🎉');
    a.send({ t: 'emoji', e: 'x<script>' });
    await a.wait((m) => m.t === 'error' && /Emoji/.test(m.message));
    // mexer-se cancela o emote em todos os clientes
    a.send({ t: 'state', x: wa.you.x + 1.2, y: 0, z: wa.you.z, h: 0, a: 'walk', s: 1.5 });
    await b.wait((m) => m.t === 'emote_stop' && m.playerId === wa.you.id);
    // favoritos persistem nas preferências da conta
    a.send({ t: 'emote_favorites', ids: ['rir', 'acenar', 'inexistente'] });
    assert.deepEqual((await a.wait((m) => m.t === 'prefs')).prefs.emoteFavorites, ['rir', 'acenar']);
    // comprar longe da loja é recusado pelo servidor
    a.send({ t: 'shop_buy', itemId: 'mochila' });
    await a.wait((m) => m.t === 'error' && /Moda Muxima/.test(m.message));
    void wb;
    a.ws.terminate();
    b.ws.terminate();
  } finally {
    world.stop();
    for (const c of wss.clients) c.terminate();
    wss.close();
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
  }
});
