/**
 * Configuração do servidor. Segredos SÓ por variáveis de ambiente:
 *   WORLD3D_JOIN_SECRET   segredo HMAC partilhado com o portal PHP (obrigatório em produção)
 *   OPENROUTER_API_KEY    chave do fornecedor de IA (opcional; sem ela os NPCs usam respostas locais)
 * Restante:
 *   WORLD3D_ENV           development | production (por omissão: production)
 *   WORLD3D_PORT          porta HTTP/WebSocket (por omissão: 8787)
 *   WORLD3D_DB            caminho da base SQLite (por omissão: ./data/world3d.sqlite)
 *   WORLD3D_ALLOW_GUESTS  1/0 — permitir visitantes sem conta (só saldo demo)
 *   WORLD3D_ALLOWED_ORIGINS lista separada por vírgulas para WebSocket/CORS
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { DEFAULT_SIM_CONFIG } from './npc/simulation.js';
import { DEFAULT_DIALOGUE_CONFIG } from './dialogue/gateway.js';
import { DEFAULT_TRAFFIC_CONFIG } from './traffic.js';
import { DEFAULT_WEATHER_CONFIG } from './weather.js';
import { DEFAULT_ARCHETYPE_WEIGHTS, ARCHETYPE_MINIMUMS } from './npc/archetypes.js';
import { DEFAULT_TRAINING_BOTS } from './competition/trainingBot.js';

const here = dirname(fileURLToPath(import.meta.url));
export const WORLD3D_ROOT = resolve(here, '..', '..');

export function loadEnv(env = process.env) {
  const development = (env.WORLD3D_ENV ?? 'production') === 'development';
  const secret = env.WORLD3D_JOIN_SECRET ?? (development ? 'dev-only-insecure-secret' : null);
  if (!secret) throw new Error('WORLD3D_JOIN_SECRET é obrigatório em produção.');
  return {
    development,
    port: Number(env.WORLD3D_PORT ?? 8787),
    host: env.WORLD3D_HOST ?? '0.0.0.0',
    dbPath: env.WORLD3D_DB ?? resolve(WORLD3D_ROOT, 'server', 'data', 'world3d.sqlite'),
    joinSecret: secret,
    allowGuests: (env.WORLD3D_ALLOW_GUESTS ?? '1') === '1',
    allowedOrigins: (env.WORLD3D_ALLOWED_ORIGINS ?? 'https://gamer.ngolabiz.it.ao,https://www.ngolabiz.it.ao,http://localhost:8787,http://127.0.0.1:8787').split(',').map((s) => s.trim()).filter(Boolean),
    serveStatic: (env.WORLD3D_SERVE_STATIC ?? '1') === '1',
    maxPlayers: Number(env.WORLD3D_MAX_PLAYERS ?? 48),
  };
}

/** Configuração administrável (persistida na tabela kv como "admin_config"). */
export function defaultAdminConfig() {
  return {
    population: { count: 60, seed: 'kianda', weights: { ...DEFAULT_ARCHETYPE_WEIGHTS }, minimums: { ...ARCHETYPE_MINIMUMS }, archetypeStatus: {} },
    simulation: { ...DEFAULT_SIM_CONFIG },
    dialogue: { ...DEFAULT_DIALOGUE_CONFIG },
    traffic: { ...DEFAULT_TRAFFIC_CONFIG },
    weather: { ...DEFAULT_WEATHER_CONFIG },
    clock: { mode: 'realtime', dayLengthMinutes: 1440 },
    competitions: { raceEnabled: true, combatEnabled: true, shootingEnabled: true, survivalEnabled: true, stakesEnabled: true, feePct: 20, trainingBots: DEFAULT_TRAINING_BOTS.map((b) => ({ ...b })) },
    zone: { status: 'active', maintenanceMessage: '' },
    // sobreposições por id (active, price, status, category, thumbnail, published)
    catalog: { overrides: {} },
    // sobreposições por id de emote (active, durationMs, cooldownMs)
    emotes: { overrides: {} },
  };
}

/** Fusão superficial por secção, ignorando chaves desconhecidas. */
export function mergeAdminConfig(base, patch) {
  const out = structuredClone(base);
  for (const [section, value] of Object.entries(patch ?? {})) {
    if (!(section in out) || typeof value !== 'object' || value === null) continue;
    for (const [k, v] of Object.entries(value)) {
      if (!(k in out[section])) continue;
      out[section][k] = v && typeof v === 'object' && !Array.isArray(v) && typeof out[section][k] === 'object' && !Array.isArray(out[section][k])
        ? { ...out[section][k], ...v }
        : v;
    }
  }
  return out;
}
