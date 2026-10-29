/**
 * HTTP (API pública + administração) e WebSocket (/ws) do servidor de mundo.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { WebSocketServer } from 'ws';
import { bearer, resolveIdentity, verifyToken } from './auth.js';
import { verifyRace } from './competition/race.js';
import { ARCHETYPES } from './npc/archetypes.js';
import { WEATHER_PRESETS } from './weather.js';
import { WORLD3D_ROOT } from './config.js';
import { exportZone } from './zoneExport.js';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const STATIC_DIRS = ['web', 'shared'];

function json(res, code, body, headers = {}) {
  const data = JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(data);
}

async function readBody(req, limit = 64 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw Object.assign(new Error('corpo demasiado grande'), { status: 413 });
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new Error('JSON inválido'), { status: 400 }); }
}

export function createWorldServer({ world, env }) {
  const corsHeaders = (req) => {
    const origin = req.headers.origin;
    if (origin && env.allowedOrigins.includes(origin)) return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, OPTIONS', Vary: 'Origin' };
    return {};
  };

  const isAdmin = (req) => {
    const p = verifyToken(bearer(req), env.joinSecret);
    return p?.role === 'admin' ? p : null;
  };

  async function serveStatic(req, res, pathname) {
    if (!env.serveStatic) return false;
    let rel = pathname === '/' ? '/web/index.html' : pathname;
    if (rel.endsWith('/')) rel += 'index.html';
    const top = rel.split('/')[1];
    if (!STATIC_DIRS.includes(top)) return false;
    const file = normalize(join(WORLD3D_ROOT, rel));
    if (!file.startsWith(resolve(WORLD3D_ROOT, top))) return false;
    try {
      const s = await stat(file);
      if (!s.isFile()) return false;
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
      return true;
    } catch {
      return false;
    }
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://local');
    const path = url.pathname;
    const cors = corsHeaders(req);
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
    try {
      // ------------------------------------------------ API pública
      if (path === '/api/health') return json(res, 200, { ok: true, zone: 'kianda_centro', players: world.players.size, status: world.adminConfig.zone.status }, cors);
      if (path === '/api/time') return json(res, 200, world.clock.publicState(), cors);
      if (path === '/api/weather') return json(res, 200, world.weather.publicState(), cors);
      if (path === '/api/zone') return json(res, 200, exportZone(), cors);
      if (path === '/api/catalog') return json(res, 200, { catalog: world.shop.publicCatalog(), emotes: world.expressions.publicList() }, cors);
      if (path === '/api/leaderboard') return json(res, 200, { rows: world.store.leaderboard(50) }, cors);
      if (path.startsWith('/api/races/')) {
        const stored = world.store.getRace(decodeURIComponent(path.slice('/api/races/'.length)));
        if (!stored) return json(res, 404, { error: 'corrida não encontrada' }, cors);
        return json(res, 200, { ...stored, verification: verifyRace(stored) }, cors);
      }
      if (path.startsWith('/api/profile/')) {
        const prof = world.playerProfile(decodeURIComponent(path.slice('/api/profile/'.length)), '');
        return prof ? json(res, 200, prof, cors) : json(res, 404, { error: 'perfil não encontrado' }, cors);
      }

      // ------------------------------------------------ Administração
      if (path.startsWith('/admin/')) {
        const admin = isAdmin(req);
        if (!admin) return json(res, 401, { error: 'token de administrador inválido' }, cors);
        const audit = (action, data = {}) => world.store.audit('admin_action', { admin: admin.sub, action, ...data });
        if (path === '/admin/config' && req.method === 'GET') return json(res, 200, { config: world.getAdminConfig(), archetypes: Object.fromEntries(Object.entries(ARCHETYPES).map(([k, v]) => [k, { label: v.label, workplaceTypes: v.workplaceTypes, dialogueTopics: v.dialogueTopics }])), weatherPresets: Object.keys(WEATHER_PRESETS) }, cors);
        if (path === '/admin/config' && req.method === 'PUT') {
          const body = await readBody(req);
          audit('update_config', { sections: Object.keys(body) });
          return json(res, 200, { config: world.updateAdminConfig(body) }, cors);
        }
        if (path === '/admin/metrics') return json(res, 200, world.adminMetrics(), cors);
        if (path === '/admin/npcs' && req.method === 'GET') return json(res, 200, { npcs: world.npcSim.adminState() }, cors);
        if (path.startsWith('/admin/npcs/') && req.method === 'PATCH') {
          const id = decodeURIComponent(path.slice('/admin/npcs/'.length));
          const body = await readBody(req);
          const ok = world.npcSim.setNpcStatus(id, String(body.status));
          audit('npc_status', { id, status: body.status });
          return json(res, ok ? 200 : 400, { ok }, cors);
        }
        if (path === '/admin/weather' && req.method === 'POST') {
          const body = await readBody(req);
          world.weather.setTarget(String(body.preset), Number(body.holdMinutes) || 30);
          audit('weather', { preset: body.preset });
          return json(res, 200, world.weather.publicState(), cors);
        }
        if (path === '/admin/training-bots' && req.method === 'PUT') {
          const body = await readBody(req);
          const bots = (Array.isArray(body.bots) ? body.bots : []).slice(0, 30).map((b, i) => ({
            id: `bot_treino_${String(b.id ?? i).replace(/[^\w-]/g, '').slice(0, 32)}`,
            name: String(b.name ?? `Bot ${i + 1}`).slice(0, 24),
            difficulty: ['facil', 'medio', 'dificil'].includes(b.difficulty) ? b.difficulty : 'medio',
            vehicle: b.vehicle === 'moto' ? 'moto' : 'car',
            enabled: b.enabled !== false,
            source: String(b.source ?? 'admin').slice(0, 24),
          }));
          audit('training_bots', { count: bots.length });
          return json(res, 200, { config: world.updateAdminConfig({ competitions: { trainingBots: bots } }) }, cors);
        }
        if (path === '/admin/catalog' && req.method === 'GET') {
          return json(res, 200, { catalog: world.shop.catalog, emotes: world.expressions.list(), overrides: { catalog: world.adminConfig.catalog.overrides, emotes: world.adminConfig.emotes.overrides } }, cors);
        }
        if (path === '/admin/catalog' && req.method === 'PUT') {
          const body = await readBody(req);
          const clean = (src, allowed) => Object.fromEntries(Object.entries(src ?? {}).filter(([id]) => allowed.has(id)).map(([id, o]) => {
            const v = {};
            if (typeof o.active === 'boolean') v.active = o.active;
            if (typeof o.published === 'boolean') v.published = o.published;
            if (['pronto', 'provisorio', 'indisponivel'].includes(o.status)) v.status = o.status;
            if (Number.isFinite(Number(o.price)) && o.price !== null && o.price !== '') v.price = Math.max(0, Math.min(1e6, Math.round(Number(o.price))));
            if (typeof o.category === 'string') v.category = o.category.slice(0, 32);
            if (typeof o.thumbnail === 'string' && /^(https:\/\/|assets\/)[\w./:%-]{1,200}$/.test(o.thumbnail)) v.thumbnail = o.thumbnail;
            if (Number.isFinite(Number(o.durationMs)) && o.durationMs) v.durationMs = Math.max(500, Math.min(20000, Number(o.durationMs)));
            if (Number.isFinite(Number(o.cooldownMs)) && o.cooldownMs !== undefined) v.cooldownMs = Math.max(0, Math.min(60000, Number(o.cooldownMs)));
            return [id, v];
          }));
          const cat = clean(body.catalog, new Set(world.shop.catalog.map((i) => i.id)));
          const emo = clean(body.emotes, new Set(world.expressions.list().map((e) => e.id)));
          audit('catalog', { items: Object.keys(cat).length, emotes: Object.keys(emo).length });
          const cfg = world.updateAdminConfig({ catalog: { overrides: { ...world.adminConfig.catalog.overrides, ...cat } }, emotes: { overrides: { ...world.adminConfig.emotes.overrides, ...emo } } });
          return json(res, 200, { overrides: { catalog: cfg.catalog.overrides, emotes: cfg.emotes.overrides } }, cors);
        }
        if (path === '/admin/ledger/verify') return json(res, 200, world.ledger.verify(), cors);
        if (path === '/admin/arena-matches') return json(res, 200, { rows: world.store.recentArenaMatches(Number(url.searchParams.get('limit')) || 50, url.searchParams.get('mode')) }, cors);
        if (path === '/admin/audit') return json(res, 200, { rows: world.store.recentAudit(Number(url.searchParams.get('limit')) || 50, url.searchParams.get('type')) }, cors);
        return json(res, 404, { error: 'rota admin desconhecida' }, cors);
      }

      if (req.method === 'GET' && await serveStatic(req, res, path)) return;
      json(res, 404, { error: 'não encontrado' }, cors);
    } catch (e) {
      json(res, e.status ?? 500, { error: e.status ? e.message : 'erro interno' }, cors);
      if (!e.status) console.error('[http]', e);
    }
  });

  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
  wss.on('connection', (socket, req) => {
    const origin = req.headers.origin;
    if (origin && !env.allowedOrigins.includes(origin) && !env.development) { socket.close(4003, 'origem não permitida'); return; }
    let player = null;
    const helloTimer = setTimeout(() => { if (!player) socket.close(4001, 'sem hello'); }, 10000);
    socket.on('message', async (raw) => {
      let m;
      try { m = JSON.parse(raw.toString('utf8')); } catch { return; }
      if (!player) {
        if (m.t !== 'hello') return;
        const can = world.canJoin();
        if (!can.ok) { socket.send(JSON.stringify({ t: 'error', code: 'join', message: can.reason })); socket.close(4002, 'indisponível'); return; }
        const identity = resolveIdentity({ token: m.token, secret: env.joinSecret, allowGuests: env.allowGuests, guestName: m.guestName });
        if (!identity) { socket.send(JSON.stringify({ t: 'error', code: 'auth', message: 'Sessão inválida. Entra pelo portal NgolaBiz Gamer.' })); socket.close(4001, 'auth'); return; }
        clearTimeout(helloTimer);
        player = world.join(identity, socket, { appearance: m.appearance });
        return;
      }
      await world.onMessage(player, m);
    });
    socket.on('close', () => { clearTimeout(helloTimer); if (player && world.players.get(player.id) === player) world.leave(player.id); });
    socket.on('error', () => {});
  });

  return { server, wss };
}
