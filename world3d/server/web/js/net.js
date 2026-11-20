/**
 * Ligação WebSocket ao servidor de mundo + sincronização de relógio.
 * O relógio do jogo deriva SEMPRE do servidor: offset estimado por ping/pong
 * (NTP simplificado, mediana das amostras com menor RTT). O relógio local do
 * dispositivo só serve para medir intervalos.
 */
import { virtualNow as clockVirtualNow } from '../../shared/time.js';

export class WorldNet {
  constructor() {
    this.handlers = new Map();
    this.offset = 0;
    this.samples = [];
    this.clock = null;
    this.connected = false;
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(fn);
  }

  emit(type, msg) {
    for (const fn of this.handlers.get(type) ?? []) fn(msg);
    for (const fn of this.handlers.get('*') ?? []) fn(msg);
  }

  connect(url, hello) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(url);
      this.ws = ws;
      const timer = setTimeout(() => { if (!settled) { settled = true; reject(new Error('Tempo esgotado a ligar ao servidor do mundo.')); ws.close(); } }, 9000);
      ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', ...hello }));
      ws.onmessage = (ev) => {
        let m;
        try { m = JSON.parse(ev.data); } catch { return; }
        if (m.t === 'welcome') {
          this.connected = true;
          this.offset = m.serverNowMs - Date.now();
          this.setEnv(m.env);
          this.pingTimer = setInterval(() => this.ping(), 2000);
          this.ping();
          if (!settled) { settled = true; clearTimeout(timer); resolve(m); }
        } else if (m.t === 'error' && !settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error(m.message));
          return;
        }
        if (m.t === 'pong') this.onPong(m);
        if (m.t === 'env') this.setEnv(m);
        this.emit(m.t, m);
      };
      ws.onclose = (ev) => {
        this.connected = false;
        clearInterval(this.pingTimer);
        if (!settled) { settled = true; clearTimeout(timer); reject(new Error(ev.reason || 'Servidor do mundo indisponível.')); }
        this.emit('close', { code: ev.code, reason: ev.reason });
      };
      ws.onerror = () => {};
    });
  }

  send(msg) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  ping() { this.send({ t: 'ping', c: Date.now() }); }

  onPong({ c, s }) {
    const now = Date.now();
    const rtt = now - c;
    this.samples.push({ rtt, offset: s - (c + rtt / 2) });
    if (this.samples.length > 12) this.samples.shift();
    const best = [...this.samples].sort((a, b) => a.rtt - b.rtt).slice(0, 5).map((x) => x.offset).sort((a, b) => a - b);
    this.offset = best[Math.floor(best.length / 2)];
    this.rtt = rtt;
  }

  setEnv(env) {
    if (!env?.time) return;
    this.clock = env.time.clock;
    this.time = env.time;
    this.weather = env.weather;
  }

  serverNow() { return Date.now() + this.offset; }

  /** Instante virtual do mundo (UTC ms) — a mesma fonte para relógio, Sol e rotinas. */
  virtualNow() {
    if (!this.clock) return this.serverNow();
    return clockVirtualNow(this.clock, this.serverNow());
  }
}

export function resolveServerUrl() {
  const q = new URLSearchParams(location.search);
  const cfg = window.WORLD3D_CONFIG ?? {};
  if (q.get('server')) return q.get('server');
  if (cfg.wsUrl) return cfg.wsUrl;
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

/** Token de sessão emitido pelo portal NgolaBiz (PHP) — ausente = visitante. */
export async function fetchJoinToken() {
  const cfg = window.WORLD3D_CONFIG ?? {};
  const q = new URLSearchParams(location.hash.slice(1));
  if (q.get('token')) return { token: q.get('token') };
  if (!cfg.tokenUrl) return { token: null };
  try {
    const res = await fetch(cfg.tokenUrl, { credentials: 'include' });
    if (!res.ok) return { token: null };
    const data = await res.json();
    if (data.wsUrl) cfg.wsUrl = data.wsUrl;
    return { token: data.token ?? null, displayName: data.displayName ?? null };
  } catch {
    return { token: null };
  }
}
