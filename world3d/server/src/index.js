/**
 * NgolaBiz World 3D — servidor de mundo (ponto de entrada).
 *   npm run dev     → desenvolvimento (convidados + diagnóstico de tempo)
 *   npm start       → produção (exige WORLD3D_JOIN_SECRET)
 */
import { loadEnv } from './config.js';
import { Store } from './store.js';
import { World } from './world.js';
import { createWorldServer } from './http.js';
import { createOpenRouterProvider } from './dialogue/providers.js';

const env = loadEnv();
const store = new Store(env.dbPath);
const provider = createOpenRouterProvider();
const world = new World({ env, store, provider });
const { server } = createWorldServer({ world, env });

world.start();
server.listen(env.port, env.host, () => {
  const t = world.clock.publicState();
  console.log(`[world3d] Kianda Centro a correr em http://${env.host}:${env.port} (${env.development ? 'DESENVOLVIMENTO' : 'produção'})`);
  console.log(`[world3d] Hora em Luanda: ${String(t.local.hour).padStart(2, '0')}:${String(t.local.minute).padStart(2, '0')} · relógio ${t.clock.mode} · NPCs ${world.npcSim.npcs.size} · IA externa ${provider.available() ? 'configurada' : 'não configurada (respostas locais)'}`);
});

const shutdown = () => {
  world.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
