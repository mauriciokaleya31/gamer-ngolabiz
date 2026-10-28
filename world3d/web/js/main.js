/**
 * NgolaBiz World 3D — cliente web de pré-visualização (Three.js).
 * Liga o mundo 3D, o servidor autoritativo, o HUD, o áudio e as interacções.
 */
import * as THREE from 'three';
import { RACE_TRACK, POIS } from '../../shared/zone.js';
import { EMOTE_BY_ID } from '../../shared/emotes.js';
import { ExpressionsUI } from './ui/expressions.js';
import { ShopsUI } from './ui/shops.js';
import { TouchControls, isTouchDevice } from './ui/touch.js';
import { City } from './city.js';
import { Environment } from './environment.js';
import { setMaxAnisotropy } from './textures.js';
import { WorldNet, resolveServerUrl, fetchJoinToken } from './net.js';
import { Actors } from './actors.js';
import { LocalPlayer } from './player.js';
import { Hud } from './hud.js';
import { Soundscape } from './audio.js';
import { CharacterCreator, defaultAppearance } from './creator.js';
import { pickQuality, QUALITY_PROFILES } from './quality.js';

const $ = (id) => document.getElementById(id);
let quality = pickQuality();

function fatal(msg) {
  $('fatal-msg').textContent = msg;
  $('fatal').classList.remove('hidden');
}

const canvas = $('scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.antialias, powerPreference: 'high-performance' });
} catch (e) {
  fatal('O teu navegador não suporta WebGL. Experimenta outro navegador ou o cliente nativo quando estiver disponível.');
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, quality.pixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.8;
renderer.shadowMap.enabled = quality.shadows;
renderer.shadowMap.type = THREE.PCFShadowMap;
setMaxAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.25, quality.far);
camera.position.set(0, 6, -10);
camera.lookAt(0, 2, -40);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

const city = new City(scene, { quality });
const env = new Environment(scene, renderer, camera, { quality });
const net = new WorldNet();
const audio = new Soundscape();
let player = null;
let actors = null;
let race = null;
let talkingTo = null;
let shopPositions = {};
let touch = null;

function nearShop(mode) {
  const p = shopPositions[mode];
  return !!(p && player && Math.hypot(p.x - player.pos.x, p.z - player.pos.z) <= 12);
}

const expressions = new ExpressionsUI({
  net,
  onEmote: (id) => requestEmote(id),
  onEmoji: (e) => net.send({ t: 'emoji', e }),
});
const shops = new ShopsUI({
  net,
  getAppearance: () => player?.appearance ?? {},
  isNear: (mode) => nearShop(mode),
  onAppearanceSaved: (a) => { player.setAppearance(a); try { localStorage.setItem('w3d_appearance', JSON.stringify(a)); } catch { /* ignorar */ } },
});

function requestEmote(id) {
  if (!player || player.mode !== 'foot' || race) { hud.toast('Emotes disponíveis a pé, fora das corridas.', 'bad'); return; }
  const def = EMOTE_BY_ID.get(id);
  const dir = id === 'apontar' ? 0 : null;
  if (player.playEmote(id, dir)) net.send({ t: 'emote', id, dir });
  if (def) hud.toast(`${def.icon} ${def.name}`);
}
const checkpointMarkers = new THREE.Group();
scene.add(checkpointMarkers);

const hud = new Hud({
  net,
  onCloseDialogue: () => closeDialogue(),
  onAction: (a, v) => {
    if (a === 'volume') audio.setVolume(v);
    if (a === 'edit_appearance') openAppearanceEditor();
  },
});

// ---------------------------------------------------------- criador / entrada
let saved = null;
try { saved = JSON.parse(localStorage.getItem('w3d_appearance') ?? 'null'); } catch { /* ignorar */ }
let creator = new CharacterCreator(saved ?? defaultAppearance());
try { $('cr-name').value = localStorage.getItem('w3d_name') ?? ''; } catch { /* ignorar */ }
document.querySelectorAll('#cr-quality button').forEach((b) => {
  b.classList.toggle('active', b.dataset.v === quality.name);
  b.onclick = () => {
    try { localStorage.setItem('w3d_quality', b.dataset.v); } catch { /* ignorar */ }
    if (b.dataset.v !== quality.name) location.reload();
  };
});

const serverUrl = resolveServerUrl();
const healthUrl = serverUrl.replace(/^ws/, 'http').replace(/\/ws$/, '/api/health');
fetch(healthUrl).then((r) => r.json()).then((h) => {
  $('cr-status').textContent = h.status === 'active' ? `Servidor do mundo online · ${h.players} jogador(es) em Kianda Centro` : 'Zona em manutenção.';
}).catch(() => { $('cr-status').textContent = 'A aguardar o servidor do mundo…'; });

$('cr-enter').onclick = async () => {
  const btn = $('cr-enter');
  btn.disabled = true;
  $('cr-status').textContent = 'A entrar…';
  const appearance = { ...creator.a };
  const guestName = $('cr-name').value.trim();
  try {
    localStorage.setItem('w3d_appearance', JSON.stringify(appearance));
    localStorage.setItem('w3d_name', guestName);
  } catch { /* ignorar */ }
  try {
    const { token } = await fetchJoinToken();
    const welcome = await net.connect(resolveServerUrl(), { token, appearance, guestName });
    startGame(welcome);
  } catch (e) {
    $('cr-status').textContent = `Erro: ${e.message}`;
    btn.disabled = false;
  }
};

function openAppearanceEditor() {
  hud.toggleMenu(false);
  $('creator').classList.remove('hidden');
  creator = new CharacterCreator(player.appearance);
  const btn = $('cr-enter');
  btn.textContent = 'GUARDAR APARÊNCIA';
  btn.disabled = false;
  player.inputEnabled = false;
  btn.onclick = () => {
    const a = { ...creator.a };
    net.send({ t: 'appearance', appearance: a });
    try { localStorage.setItem('w3d_appearance', JSON.stringify(a)); } catch { /* ignorar */ }
    player.setAppearance(a);
    creator.dispose();
    $('creator').classList.add('hidden');
    player.inputEnabled = true;
  };
}

function startGame(welcome) {
  creator.dispose();
  $('creator').classList.add('hidden');
  player = new LocalPlayer(scene, camera, canvas, { appearance: welcome.you.appearance, groundHeightAt: (x, z) => city.groundHeightAt(x, z), quality });
  player.teleport(welcome.you.x, welcome.you.z, welcome.you.h);
  actors = new Actors(scene, { quality, net, groundHeightAt: (x, z) => city.groundHeightAt(x, z), tagsEl: $('tags') });
  actors.localId = welcome.you.id;
  actors.setParked(welcome.vehicles);
  actors.localAnchor = () => player.root.visible ? player.root : player.vehicle?.model.root ?? player.root;
  player.onEmoteCancelled = () => net.send({ t: 'emote_stop' });
  expressions.setup(welcome.emotes, welcome.prefs);
  shops.setup({ catalog: welcome.catalog, owned: welcome.owned, prefs: welcome.prefs });
  for (const [mode, sh] of Object.entries(welcome.shops)) { const poi = POIS.find((p) => p.id === sh.poi); if (poi) shopPositions[mode] = { x: poi.x, z: poi.z, name: sh.name }; }
  if (isTouchDevice()) {
    touch = new TouchControls({
      player,
      actions: {
        interact: () => dispatchKey('KeyE'),
        shop: () => dispatchKey('KeyB'),
        vehicle: () => dispatchKey('KeyF'),
        horn: () => audio.horn(),
        emotes: () => expressions.toggle('emotes'),
        emojis: () => expressions.toggle('emojis'),
        chat: () => { const c = $('chat'); c.classList.toggle('collapsed'); if (!c.classList.contains('collapsed')) $('chat-input').focus(); },
        menu: () => { player.inputEnabled = !hud.toggleMenu(); },
      },
    });
    $('chat').classList.add('collapsed');
  }
  hud.setWelcome(welcome);
  hud.show();
  hud.chatLine(null, `Bem-vindo a Kianda Centro, ${welcome.you.displayName}. ${welcome.features.aiDialogue ? 'Os NPCs usam IA generativa no servidor.' : 'Os NPCs respondem com o sistema de diálogo local.'}`);
  audio.start();
  bindGameKeys();
  canvas.focus();
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- interacções
function openDialogue(npcActor) {
  const prof = actors.npcProfiles.get(npcActor.id);
  if (!prof) return;
  talkingTo = npcActor.id;
  player.talking = true;
  document.exitPointerLock?.();
  hud.openDialogue(prof);
  net.send({ t: 'talk', npcId: npcActor.id, text: 'Olá!' });
  hud.dialogueLine('me', 'Olá!');
}

function closeDialogue() {
  if (talkingTo) net.send({ t: 'talk_end', npcId: talkingTo });
  talkingTo = null;
  if (player) player.talking = false;
  hud.closeDialogue();
  canvas.focus();
}

$('dlg-form').onsubmit = (e) => {
  e.preventDefault();
  const input = $('dlg-input');
  const text = input.value.trim();
  if (!text || !talkingTo) return;
  hud.dialogueLine('me', text);
  net.send({ t: 'talk', npcId: talkingTo, text });
  input.value = '';
};
document.querySelectorAll('.dlg-quick button').forEach((b) => {
  b.onclick = () => { if (!talkingTo) return; hud.dialogueLine('me', b.dataset.q); net.send({ t: 'talk', npcId: talkingTo, text: b.dataset.q }); };
});
$('dlg-input').addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDialogue(); e.stopPropagation(); });

net.on('npc_reply', (m) => {
  if (m.npcId !== talkingTo) return;
  if (m.error) hud.dialogueLine('npc', m.error, 'local'); else hud.dialogueLine('npc', m.text, m.source);
});
net.on('player_profile', (m) => { if (m.profile?.playerId === hud.you?.id) hud.setSelfProfile(m.profile); });
net.on('emote', (m) => { if (m.playerId === hud.you?.id && player && !player.emoteId) player.playEmote(m.id, m.dir); });
net.on('emoji', (m) => { if (m.playerId === hud.you?.id) return; const a = actors?.players.get(m.playerId); if (a) hud.chatLine(null, `${a.name ?? ''} ${m.e}`); });
net.on('error', (m) => { if (['rate', 'cooldown', 'context', 'inactive', 'unknown'].includes(m.code) && player?.emoteId) player.stopEmote(); });
net.on('vehicle_ok', (m) => {
  const parked = actors.parked.get(m.id);
  player.enterVehicle(m.kind, m.x, m.z, m.heading, ['#0d47a1', '#b71c1c', '#f5f5f5', '#212121'][m.id.length % 4], { id: m.id, itemId: m.itemId ?? parked?.item, paint: m.paint ?? parked?.data?.paint, rims: m.rims });
  attachHeadlights();
});
net.on('correct', (m) => { if (player && !race) player.teleport(m.x, m.z, m.diag ? m.h : player.heading); });
net.on('close', () => hud.toast('Ligação ao servidor perdida. Recarrega a página para voltar a entrar.', 'bad'));

// --------------------------------------------------------------- corridas
function showCheckpoints() {
  checkpointMarkers.clear();
  RACE_TRACK.checkpoints.forEach(([x, z], i) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(5.5, 0.25, 8, 32), new THREE.MeshStandardMaterial({ color: 0xf5b942, emissive: 0xf5b942, emissiveIntensity: 0.6, transparent: true, opacity: 0.85 }));
    ring.position.set(x, 5.5, z);
    const prev = i === 0 ? RACE_TRACK.grid[0] : RACE_TRACK.checkpoints[i - 1];
    ring.rotation.y = Math.atan2(x - prev[0], z - prev[1]);
    ring.userData.index = i;
    checkpointMarkers.add(ring);
  });
}

function updateCheckpoints() {
  for (const r of checkpointMarkers.children) {
    const active = race && r.userData.index === race.cp;
    r.visible = race && r.userData.index >= race.cp;
    r.material.emissiveIntensity = active ? 2 : 0.3;
    r.scale.setScalar(active ? 1 + Math.sin(performance.now() / 200) * 0.05 : 0.8);
  }
}

net.on('race_setup', (m) => {
  if (talkingTo) closeDialogue();
  if (player.vehicle && !player.vehicle.race) { player.exitVehicle(); net.send({ t: 'vehicle_exit' }); }
  race = { id: m.raceId, goAt: m.goAt, cp: 0, total: m.track.checkpoints.length, finished: false };
  player.teleport(m.you.grid[0], m.you.grid[1], m.track.heading);
  player.enterVehicle(m.you.vehicle, m.you.grid[0], m.you.grid[1], m.track.heading, '#f0444a', { race: true });
  attachHeadlights();
  player.frozen = true;
  hud.raceSetup(m);
  showCheckpoints();
  hud.toast(m.stake ? `Corrida com entrada de ${m.stake} Kz demo` : 'Corrida gratuita — boa sorte!');
});
net.on('race_go', () => { if (player) player.frozen = false; });
net.on('race_progress', (m) => {
  if (!race || m.raceId !== race.id) return;
  if (m.checkpoint) race.cp = m.checkpoint;
  if (m.finished) { hud.toast(`${m.name} terminou em ${(m.ms / 1000).toFixed(1)} s`, 'good'); if (m.finished === hud.you.id) race.finished = true; }
  if (m.disqualified) hud.toast(`${m.name} desclassificado: ${m.reason}`, 'bad');
});
net.on('race_result', (m) => {
  hud.raceResult(m, () => {
    if (player.vehicle?.race) player.exitVehicle();
    race = null;
    checkpointMarkers.clear();
    net.send({ t: 'wallet' });
  });
  player.frozen = true;
  race && (race.finished = true);
});

const headlights = [new THREE.SpotLight(0xfff2d6, 0, 45, 0.45, 0.5, 1.4), new THREE.SpotLight(0xfff2d6, 0, 45, 0.45, 0.5, 1.4)];
function attachHeadlights() {
  const v = player.vehicle;
  if (!v) return;
  headlights.forEach((l, i) => {
    const sx = v.kind === 'moto' ? 0 : i ? 0.7 : -0.7;
    l.position.set(sx, 0.8, v.kind === 'moto' ? 0.8 : 2.2);
    l.target.position.set(sx, 0, 14);
    v.model.root.add(l, l.target);
    l.visible = v.kind !== 'moto' || i === 0;
  });
}

// ------------------------------------------------------------------ teclas
function dispatchKey(code) { dispatchEvent(new KeyboardEvent('keydown', { code })); }

function bindGameKeys() {
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (!$('creator').classList.contains('hidden')) return;
    switch (e.code) {
      case 'KeyE': {
        if (talkingTo || player.mode !== 'foot') break;
        const npc = actors.nearestNpc(player.pos.x, player.pos.z);
        if (npc) openDialogue(npc);
        break;
      }
      case 'KeyB': {
        if (player.mode !== 'foot') break;
        const shop = Object.keys(shopPositions).find((k) => nearShop(k));
        if (shop) { document.exitPointerLock?.(); shops.open(shop); } else hud.toast('Lojas: Moda Muxima (roupa), Concessionário Kalunga, Garagem Kalunga Motors.');
        break;
      }
      case 'KeyG': e.preventDefault(); document.exitPointerLock?.(); expressions.toggle('emotes'); break;
      case 'KeyJ': e.preventDefault(); document.exitPointerLock?.(); expressions.toggle('emojis'); break;
      case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': expressions.quick(Number(e.code.slice(-1)) - 1); break;
      case 'KeyF': {
        if (race) break;
        if (player.vehicle) { player.exitVehicle({ keepModel: true }); net.send({ t: 'vehicle_exit' }); break; }
        const v = actors.nearestParked(player.pos.x, player.pos.z);
        if (v) net.send({ t: 'vehicle_enter', id: v.id });
        break;
      }
      case 'KeyP': {
        const p = actors.nearestPlayer(player.pos.x, player.pos.z, 8);
        if (p) net.send({ t: 'player_profile', playerId: p.id });
        else {
          const npc = actors.nearestNpc(player.pos.x, player.pos.z, 6);
          if (npc) { const prof = actors.npcProfiles.get(npc.id); hud.toast(`${prof.name} — ${prof.role}. ${prof.label}.`); }
        }
        break;
      }
      case 'KeyH': if (player.vehicle) audio.horn(); break;
      case 'Tab': e.preventDefault(); document.exitPointerLock?.(); player.inputEnabled = !hud.toggleMenu(); break;
      case 'Enter': e.preventDefault(); document.exitPointerLock?.(); $('chat-input').focus(); break;
      case 'Escape': closeDialogue(); hud.toggleMenu(false); shops.close(); expressions.toggle(expressions.tab, false); $('profile').classList.add('hidden'); player.inputEnabled = true; break;
      case 'F6': case 'F7': case 'F8': case 'F9': {
        if (!hud.features.diagnostics) break;
        e.preventDefault();
        const hour = { F6: 7, F7: 14, F8: 17.92, F9: 21.5 }[e.code];
        net.send({ t: 'diag_time', hour, speed: 0 });
        break;
      }
      default:
    }
  });
}

// ----------------------------------------------------------------- ciclo
let last = performance.now();
let sendAcc = 0;
let mmAcc = 0;
let fpsAcc = 0;
let frames = 0;
window.__w3d = { fps: 0, scene, camera, renderer, get player() { return player; }, get actors() { return actors; }, net, env, quality: QUALITY_PROFILES };

function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const vNow = net.virtualNow();
  env.update(dt, vNow, net.weather, city, player.pos);
  city.update(dt, env.state);
  const w = net.weather ?? {};
  const lightsOn = env.state.light.streetLights > 0.4 || (w.rain ?? 0) > 0.3 || (w.fog ?? 0) > 0.4;

  const dynamic = actors.dynamicObstacles();
  player.update(dt, player.mode === 'vehicle' ? dynamic : dynamic.filter((o) => o.r > 1.25));
  if (player.vehicle) {
    player.vehicle.model.setLights(lightsOn, player.input().back && player.speed > 0.5);
    headlights.forEach((l) => { l.intensity = lightsOn ? 60 : 0; });
  }
  sendAcc += dt;
  if (sendAcc >= 0.1) { sendAcc = 0; net.send(player.stateMessage()); }

  actors.update(dt, camera, lightsOn);
  city.setTrafficLights(actors.lightsSnapshot);
  updateCheckpoints();

  // acção contextual
  if (player.mode === 'foot' && !talkingTo) {
    const npc = actors.nearestNpc(player.pos.x, player.pos.z);
    const veh = actors.nearestParked(player.pos.x, player.pos.z);
    const pl = actors.nearestPlayer(player.pos.x, player.pos.z, 4);
    const shopHere = Object.keys(shopPositions).find((k) => nearShop(k));
    const shopTxt = shopHere ? ` · <kbd>B</kbd>${shopHere === 'wardrobe' ? 'Guarda-roupa' : shopHere === 'dealership' ? 'Concessionário' : 'Garagem'}` : '';
    if (npc) { const p = actors.npcProfiles.get(npc.id); hud.setPrompt(`<kbd>E</kbd>Falar com ${p.name} <span class="badge ai">IA · ${p.role}</span>${shopTxt}`); }
    else if (veh && !race) hud.setPrompt(`<kbd>F</kbd>Conduzir ${veh.kind === 'moto' ? 'mota' : 'carro'}`);
    else if (pl) hud.setPrompt(`<kbd>P</kbd>Perfil de ${pl.name} <span class="badge human">JOGADOR</span>`);
    else {
      const shop = Object.keys(shopPositions).find((k) => nearShop(k));
      hud.setPrompt(shop ? `<kbd>B</kbd>${shop === 'wardrobe' ? 'Guarda-roupa' : shop === 'dealership' ? 'Concessionário' : 'Garagem'} — ${shopPositions[shop].name}` : null);
    }
  } else if (player.mode === 'vehicle' && !race) hud.setPrompt('<kbd>F</kbd>Sair do veículo · <kbd>H</kbd>Buzina');
  else hud.setPrompt(null);
  hud.setSpeed(player.speedKmh(), player.mode === 'vehicle');
  touch?.update(player.mode);

  hud.updateClock(vNow, net.time, net.weather);
  if (race) hud.raceTick(race, net.serverNow());
  mmAcc += dt;
  if (mmAcc > 0.08) { mmAcc = 0; hud.drawMinimap({ x: player.pos.x, z: player.pos.z, heading: player.heading }, player.yaw, actors, race); }

  let carsNear = 0;
  for (const a of actors.cars.values()) if (a.root.position.distanceTo(player.pos) < 60) carsNear++;
  let npcsNear = 0;
  for (const a of actors.npcs.values()) if (a.root.position.distanceTo(player.pos) < 25) npcsNear++;
  const inPark = player.pos.x > -45 && player.pos.x < 11 && player.pos.z > 17 && player.pos.z < 81;
  audio.update(dt, env.state.light, w.rain !== undefined ? w : { rain: 0, wind: 0.2 }, { carsNear, npcsNear, inPark, vehicleSpeed: player.vehicle ? player.speed : null, maxSpeed: player.vehicle ? player.vehicle.phys.spec.maxSpeed : 1 });
  const step = player.consumeFootstep();
  if (step) audio.footstep(step, inPark ? 'relva' : 'rua');

  renderer.render(scene, camera);
  frames++;
  fpsAcc += dt;
  if (fpsAcc > 1) { window.__w3d.fps = Math.round(frames / fpsAcc); frames = 0; fpsAcc = 0; }
  requestAnimationFrame(loop);
}

// pré-visualização do cenário por trás do criador (antes de entrar)
function idleLoop() {
  if (player) return;
  const vNow = net.virtualNow();
  env.update(1 / 60, vNow, null, city, new THREE.Vector3(0, 0, -40));
  city.update(1 / 60, env.state);
  const t = performance.now() / 9000;
  camera.position.set(Math.sin(t) * 40, 18, -40 + Math.cos(t) * 40);
  camera.lookAt(0, 4, -40);
  renderer.render(scene, camera);
  requestAnimationFrame(idleLoop);
}
requestAnimationFrame(idleLoop);
