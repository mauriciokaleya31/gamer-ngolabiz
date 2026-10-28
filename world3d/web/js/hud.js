/**
 * Interface de jogo: discreta durante a exploração, com relógio sincronizado
 * (Africa/Luanda), clima, saldo demo, minimapa, chat, diálogo no mundo com NPCs,
 * perfis, desafios, corridas e painel de diagnóstico (só em desenvolvimento).
 */
import { formatClock, localParts } from '../../shared/time.js';
import { ROADS, BUILDINGS, RACE_TRACK, roadRect, POIS } from '../../shared/zone.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kz = (v) => `${Number(v).toLocaleString('pt-AO', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} Kz`;
const PERIODS = { amanhecer: 'Amanhecer', manha: 'Manhã', tarde: 'Tarde', por_do_sol: 'Pôr do Sol', noite: 'Noite' };
const STAKES = [0, 500, 1000, 2000, 5000];

export function weatherLabel(w) {
  if (!w) return '—';
  if (w.rain > 0.6) return 'Chuva forte';
  if (w.rain > 0.15) return 'Chuva';
  if (w.fog > 0.35) return 'Neblina';
  if (w.cloud > 0.6) return 'Nublado';
  if (w.cloud > 0.3) return 'Parcialmente nublado';
  return 'Céu limpo';
}

export function formatMs(ms) {
  if (ms === null || ms === undefined) return '—';
  const m = Math.floor(ms / 60000);
  const s = ((ms % 60000) / 1000).toFixed(1).padStart(4, '0');
  return `${m}:${s}`;
}

export class Hud {
  constructor({ net, onCloseDialogue, onAction }) {
    this.net = net;
    this.onAction = onAction;
    this.wallet = null;
    this.features = {};
    this.trainingBots = [];
    this.menuTab = 'perfil';
    this.minimap = $('minimap');
    this.mmCtx = this.minimap.getContext('2d');
    this.buildMinimapBase();
    this.bind(onCloseDialogue);
    net.on('chat', (m) => this.chatLine(m.name, m.text, m.scope));
    net.on('system', (m) => this.chatLine(null, m.text));
    net.on('error', (m) => this.toast(m.message, 'bad'));
    net.on('wallet', (m) => { this.wallet = m.wallet; this.walletHistory = m.history; this.renderWallet(); if (this.menuTab === 'carteira') this.renderMenu(); });
    net.on('shop_result', (m) => { this.wallet = m.wallet; this.renderWallet(); });
    net.on('leaderboard', (m) => { this.leaderboard = m.rows; if (this.menuTab === 'ranking') this.renderMenu(); });
    net.on('friends', (m) => { this.friends = m.friends; if (this.menuTab === 'social') this.renderMenu(); });
    net.on('party', (m) => { this.party = m.party; if (this.menuTab === 'social') this.renderMenu(); });
    net.on('friend_request', (m) => this.toastAction(`${m.name} quer ser teu amigo.`, 'Aceitar', () => net.send({ t: 'friend_accept', from: m.from })));
    net.on('party_invite', (m) => this.toastAction(`${m.name} convidou-te para o grupo.`, 'Entrar', () => net.send({ t: 'party_accept', from: m.from })));
    net.on('player_profile', (m) => this.showProfile(m.profile));
    net.on('challenge_in', (m) => this.showChallenge(m.challenge));
    net.on('challenge_update', (m) => this.onChallengeUpdate(m.challenge));
  }

  bind(onCloseDialogue) {
    $('dlg-close').onclick = () => onCloseDialogue();
    $('menu-close').onclick = () => this.toggleMenu(false);
    document.querySelectorAll('.menu-tabs button[data-tab]').forEach((b) => { b.onclick = () => { this.menuTab = b.dataset.tab; this.renderMenu(); }; });
    const input = $('chat-input');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const text = input.value.trim();
        if (text) {
          const party = text.startsWith('/g ');
          this.net.send({ t: 'chat', text: party ? text.slice(3) : text, scope: party ? 'party' : 'local' });
        }
        input.value = '';
        input.blur();
      } else if (e.key === 'Escape') input.blur();
      e.stopPropagation();
    });
  }

  show() { $('hud').classList.remove('hidden'); }

  setWelcome(w) {
    this.features = w.features;
    this.trainingBots = w.trainingBots;
    this.you = w.you;
    this.wallet = w.wallet;
    this.renderWallet();
    $('tab-diag').classList.toggle('hidden', !w.features.diagnostics);
  }

  // ----------------------------------------------------------- topo / relógio
  updateClock(virtualMs, time, weather) {
    $('clock').textContent = formatClock(virtualMs);
    const lp = localParts(virtualMs);
    const period = lp.hourFloat >= 5 && lp.hourFloat < 7 ? 'amanhecer' : lp.hourFloat < 12 && lp.hourFloat >= 7 ? 'manha' : lp.hourFloat >= 12 && lp.hourFloat < 17 ? 'tarde' : lp.hourFloat >= 17 && lp.hourFloat < 19 ? 'por_do_sol' : 'noite';
    $('period').textContent = PERIODS[period];
    $('weather').textContent = weatherLabel(weather);
    const diag = time?.clock?.mode !== 'realtime';
    const badge = $('diag-badge');
    badge.classList.toggle('hidden', !diag);
    if (diag) badge.textContent = time.clock.mode === 'fixed' ? 'TEMPO FIXO (DIAGNÓSTICO)' : `TEMPO ACELERADO ×${Math.round(time.clock.rate)}`;
  }

  renderWallet() {
    if (!this.wallet) return;
    $('wallet').textContent = `${kz(this.wallet.balanceKz)} demo`;
  }

  // -------------------------------------------------------------- minimapa
  buildMinimapBase() {
    const scale = 2;
    const c = document.createElement('canvas');
    c.width = 300 * scale;
    c.height = 260 * scale;
    const g = c.getContext('2d');
    const X = (x) => (x + 150) * scale;
    const Z = (z) => (z + 130) * scale;
    g.fillStyle = '#1a1f27';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#2f5a2a';
    g.fillRect(X(-45), Z(17), 56 * scale, 64 * scale);
    g.fillStyle = '#6b5b45';
    g.fillRect(X(-21), Z(-66), 42 * scale, 51 * scale);
    g.fillStyle = '#7a3527';
    g.fillRect(X(14), Z(17), 32 * scale, 37 * scale);
    g.fillStyle = '#4a4f57';
    for (const r of ROADS) { const rr = roadRect(r); g.fillRect(X(rr.minX), Z(rr.minZ), (rr.maxX - rr.minX) * scale, (rr.maxZ - rr.minZ) * scale); }
    g.fillStyle = '#8c8f96';
    for (const b of BUILDINGS) g.fillRect(X(b.minX), Z(b.minZ), (b.maxX - b.minX) * scale, (b.maxZ - b.minZ) * scale);
    this.mmBase = { canvas: c, scale, X, Z };
  }

  drawMinimap(player, yaw, actors, race) {
    const g = this.mmCtx;
    const W = this.minimap.width;
    const s = this.mmBase.scale * 0.55;
    g.save();
    g.clearRect(0, 0, W, W);
    g.beginPath();
    g.arc(W / 2, W / 2, W / 2 - 1, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#12161d';
    g.fillRect(0, 0, W, W);
    g.translate(W / 2, W / 2);
    g.rotate(yaw); // para cima = direcção para onde a câmara olha
    g.scale(s / this.mmBase.scale, s / this.mmBase.scale);
    g.translate(-this.mmBase.X(player.x), -this.mmBase.Z(player.z));
    g.drawImage(this.mmBase.canvas, 0, 0);
    const { X, Z } = this.mmBase;
    const dot = (x, z, color, r) => { g.fillStyle = color; g.beginPath(); g.arc(X(x), Z(z), r, 0, Math.PI * 2); g.fill(); };
    for (const a of actors.cars.values()) dot(a.root.position.x, a.root.position.z, '#f5b942', 3);
    for (const a of actors.npcs.values()) dot(a.root.position.x, a.root.position.z, '#c4bbff', 2.4);
    for (const a of actors.players.values()) dot(a.root.position.x, a.root.position.z, '#3ba7ff', 4);
    for (const a of actors.bots.values()) dot(a.root.position.x, a.root.position.z, '#ffd98a', 4);
    // pontos de interesse principais
    g.fillStyle = '#ffffff';
    g.font = `bold ${14}px Rajdhani, sans-serif`;
    for (const id of ['arena_centro', 'mercado_balcao', 'oficina_kalunga_porta', 'largo_centro']) {
      const p = POIS.find((pp) => pp.id === id);
      if (p) dot(p.x, p.z, '#f0444a', 4);
    }
    if (race) {
      g.strokeStyle = 'rgba(245,185,66,0.8)';
      g.lineWidth = 3;
      g.beginPath();
      RACE_TRACK.racingLine.forEach(([x, z], i) => (i ? g.lineTo(X(x), Z(z)) : g.moveTo(X(x), Z(z))));
      g.stroke();
      const next = RACE_TRACK.checkpoints[race.cp];
      if (next) dot(next[0], next[1], '#f5b942', 7);
    }
    g.restore();
    // seta do jogador (sempre ao centro)
    g.save();
    g.translate(W / 2, W / 2);
    g.rotate(Math.PI - player.heading + yaw);
    g.fillStyle = '#22c98b';
    g.beginPath();
    g.moveTo(0, -8); g.lineTo(6, 6); g.lineTo(0, 3); g.lineTo(-6, 6); g.closePath();
    g.fill();
    g.restore();
    g.fillStyle = '#fff';
    g.font = 'bold 13px Rajdhani, sans-serif';
    g.textAlign = 'center';
    g.fillText('N', W / 2 + Math.sin(yaw) * (W / 2 - 12), W / 2 - Math.cos(yaw) * (W / 2 - 12) + 4);
  }

  // ---------------------------------------------------------------- avisos
  setPrompt(html) {
    const p = $('prompt');
    if (!html) { p.classList.add('hidden'); return; }
    p.innerHTML = html;
    p.classList.remove('hidden');
  }

  toast(text, kind = '') {
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = text;
    $('toasts').appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  toastAction(text, label, fn) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.style.pointerEvents = 'auto';
    el.innerHTML = `${esc(text)} <button class="btn good">${esc(label)}</button>`;
    el.querySelector('button').onclick = () => { fn(); el.remove(); };
    $('toasts').appendChild(el);
    setTimeout(() => el.remove(), 15000);
  }

  chatLine(name, text, scope) {
    const log = $('chat-log');
    const div = document.createElement('div');
    if (!name) { div.className = 'sys'; div.textContent = text; } else {
      div.className = scope === 'party' ? 'party' : '';
      div.innerHTML = `<span class="who">${esc(name)}${scope === 'party' ? ' [grupo]' : ''}:</span> ${esc(text)}`;
    }
    log.appendChild(div);
    while (log.children.length > 60) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
  }

  setSpeed(kmh, visible) {
    $('speedo').classList.toggle('hidden', !visible);
    $('speed-val').textContent = kmh;
  }

  // -------------------------------------------------------------- diálogo
  openDialogue(profile) {
    $('dlg-name').textContent = profile.name;
    $('dlg-role').textContent = `${profile.role} · ${profile.bio}`;
    $('dlg-log').innerHTML = '';
    $('dialogue').classList.remove('hidden');
    setTimeout(() => $('dlg-input').focus(), 50);
  }

  closeDialogue() { $('dialogue').classList.add('hidden'); }

  dialogueLine(who, text) {
    const div = document.createElement('div');
    div.className = who;
    div.innerHTML = who === 'me' ? `Tu: ${esc(text)}` : `${esc(text)}`;
    $('dlg-log').appendChild(div);
    $('dlg-log').scrollTop = 1e9;
  }

  // ------------------------------------------------------------------ menu
  toggleMenu(force) {
    const el = $('menu');
    const open = force ?? el.classList.contains('hidden');
    el.classList.toggle('hidden', !open);
    if (open) {
      this.net.send({ t: 'wallet' });
      this.net.send({ t: 'leaderboard' });
      this.net.send({ t: 'friends' });
      if (this.you) this.net.send({ t: 'player_profile', playerId: this.you.id, self: true });
      this.renderMenu();
    }
    return open;
  }

  renderMenu() {
    document.querySelectorAll('.menu-tabs button[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === this.menuTab));
    const body = $('menu-body');
    const t = this.menuTab;
    if (t === 'perfil') {
      const p = this.selfProfile;
      body.innerHTML = `<h3>${esc(this.you?.displayName)} <span class="badge human">${this.you?.isGuest ? 'VISITANTE' : 'JOGADOR'}</span></h3>
        <div class="stat-grid">
          <div class="stat">Corridas<b>${p?.races ?? 0}</b></div>
          <div class="stat">Vitórias<b>${p?.wins ?? 0}</b></div>
          <div class="stat">Melhor volta<b>${formatMs(p?.bestLapMs)}</b></div>
          <div class="stat">Saldo demo<b>${this.wallet ? kz(this.wallet.balanceKz) : '—'}</b></div>
        </div>
        <h3>Histórico de corridas</h3>${this.historyTable(p?.history ?? [])}
        <div class="row"><button class="btn" id="m-appearance">Alterar aparência</button></div>`;
      $('m-appearance').onclick = () => this.onAction('edit_appearance');
    } else if (t === 'competicoes') {
      body.innerHTML = `<h3>Corrida no ${esc(RACE_TRACK.name)}</h3>
        <p class="muted">Uma volta ao anel (Rua das Acácias → Oficina → Parque → Mercado). O resultado é decidido pelo servidor a partir dos pontos de controlo e fica registado com um hash verificável.</p>
        <h3>Desafio Rápido de Pista</h3>
        <p class="muted">Escolhe um piloto da Arena para arrancar imediatamente na pista (Carro ou Mota):</p>
        <table><tr><th>Piloto</th><th>Dificuldade</th><th>Veículo</th><th></th></tr>
        ${this.trainingBots.map((b) => `<tr><td>🏎️ ${esc(b.name)}</td><td>${esc(b.difficulty)}</td><td>${b.vehicle === 'moto' ? 'Mota' : 'Carro'}</td><td><button class="btn good" data-bot="${esc(b.id)}" data-veh="car">Carro</button> <button class="btn good" data-bot="${esc(b.id)}" data-veh="moto">Mota</button></td></tr>`).join('')}
        </table>
        <h3>Desafiar outro jogador</h3>
        <p class="muted">Aproxima-te de um jogador e carrega em <b>P</b> para abrir o perfil e enviar o desafio. Entradas: gratuita ou ${STAKES.slice(1).map((s) => kz(s)).join(', ')} <b>demo</b>. Exemplo: 1.000 + 1.000 = 2.000 → 1.800 ao vencedor e 200 de taxa (demo).</p>`;
      body.querySelectorAll('[data-bot]').forEach((b) => { b.onclick = () => { this.net.send({ t: 'train_race', botId: b.dataset.bot, vehicle: b.dataset.veh }); this.toggleMenu(false); }; });
    } else if (t === 'social') {
      const fr = this.friends ?? [];
      body.innerHTML = `<h3>Amigos</h3>${fr.length ? `<table>${fr.map((f) => `<tr><td>${esc(f.displayName)}</td><td>${f.online ? '🟢 no mundo' : '⚪ offline'}</td><td>${f.status === 'accepted' ? 'amigo' : f.incoming ? `<button class="btn good" data-acc="${esc(f.playerId)}">Aceitar</button>` : 'pedido enviado'}</td></tr>`).join('')}</table>` : '<p class="muted">Ainda sem amigos. Aproxima-te de um jogador e carrega em P.</p>'}
        <h3>Grupo</h3>${this.party ? `<p>${this.party.members.map((m) => esc(m.name)).join(', ')}</p><p class="muted">Escreve <b>/g mensagem</b> no chat para falar só com o grupo.</p><button class="btn bad" id="m-leave">Sair do grupo</button>` : '<p class="muted">Não estás num grupo. Convida jogadores a partir do perfil (P).</p>'}`;
      body.querySelectorAll('[data-acc]').forEach((b) => { b.onclick = () => this.net.send({ t: 'friend_accept', from: b.dataset.acc }); });
      if ($('m-leave')) $('m-leave').onclick = () => this.net.send({ t: 'party_leave' });
    } else if (t === 'ranking') {
      const rows = this.leaderboard ?? [];
      body.innerHTML = `<h3>Classificação — corridas</h3><table><tr><th>#</th><th>Jogador</th><th>Vitórias</th><th>Corridas</th><th>Melhor volta</th></tr>${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.displayName)}</td><td>${r.wins}</td><td>${r.races}</td><td>${formatMs(r.bestLapMs)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Ainda sem corridas registadas.</td></tr>'}</table>`;
    } else if (t === 'carteira') {
      const w = this.wallet;
      body.innerHTML = `<h3>Carteira de demonstração</h3>
        <p class="muted">Saldo fictício (Kz demo) apenas para testar competições. Não há depósitos nem levantamentos e não está ligado ao saldo real da plataforma.</p>
        <div class="stat-grid"><div class="stat">Disponível<b>${w ? kz(w.balanceKz) : '—'}</b></div><div class="stat">Reservado em competições<b>${w ? kz(w.heldKz) : '—'}</b></div></div>
        <h3>Movimentos</h3><table><tr><th>Tipo</th><th>Descrição</th><th>Valor</th></tr>${(this.walletHistory ?? []).map((h) => `<tr><td>${esc(h.type)}</td><td>${esc(h.memo)}</td><td style="color:${h.amountKz >= 0 ? '#22c98b' : '#f0444a'}">${h.amountKz >= 0 ? '+' : ''}${kz(h.amountKz)}</td></tr>`).join('')}</table>`;
    } else if (t === 'definicoes') {
      const q = localStorage.getItem('w3d_quality') ?? 'media';
      body.innerHTML = `<h3>Qualidade gráfica</h3><div class="row">${['baixa', 'media', 'alta'].map((k) => `<button class="btn ${k === q ? 'good' : ''}" data-q="${k}">${k}</button>`).join('')}</div><p class="muted">Alterar a qualidade recarrega o cliente.</p>
        <h3>Áudio</h3><div class="row"><input type="range" id="m-vol" min="0" max="1" step="0.05" value="${this.volume ?? 0.7}"></div>`;
      body.querySelectorAll('[data-q]').forEach((b) => { b.onclick = () => { try { localStorage.setItem('w3d_quality', b.dataset.q); } catch { /* sem armazenamento */ } location.reload(); }; });
      $('m-vol').oninput = (e) => { this.volume = Number(e.target.value); this.onAction('volume', this.volume); };
    } else if (t === 'diagnostico') {
      body.innerHTML = `<h3>Diagnóstico de tempo e clima (desenvolvimento)</h3>
        <p class="muted">Permite ver a mesma zona de manhã, à tarde, ao pôr do Sol e à noite sem esperar. Desactivado em produção pelo servidor.</p>
        <div class="row">${[['Amanhecer 05:50', 5.83], ['Manhã 08:00', 8], ['Tarde 14:00', 14], ['Pôr do Sol 17:55', 17.92], ['Noite 21:30', 21.5], ['Madrugada 03:00', 3]].map(([l, h]) => `<button class="btn" data-h="${h}">${l}</button>`).join('')}</div>
        <div class="row"><span>Velocidade:</span>${[[0, 'Fixar'], [1, '×1'], [60, '×60'], [360, '×360']].map(([s, l]) => `<button class="btn" data-s="${s}">${l}</button>`).join('')}<button class="btn bad" id="d-reset">Repor hora real de Luanda</button></div>
        <h3>Clima</h3><div class="row">${['limpo', 'nublado', 'neblina', 'chuva', 'trovoada'].map((p) => `<button class="btn" data-w="${p}">${p}</button>`).join('')}</div>`;
      body.querySelectorAll('[data-h]').forEach((b) => { b.onclick = () => this.net.send({ t: 'diag_time', hour: Number(b.dataset.h), speed: 0 }); });
      body.querySelectorAll('[data-s]').forEach((b) => { b.onclick = () => this.net.send({ t: 'diag_time', speed: Number(b.dataset.s) }); });
      body.querySelectorAll('[data-w]').forEach((b) => { b.onclick = () => this.net.send({ t: 'diag_weather', preset: b.dataset.w }); });
      $('d-reset').onclick = () => this.net.send({ t: 'diag_time', reset: true });
    }
  }

  historyTable(rows) {
    if (!rows.length) return '<p class="muted">Sem corridas ainda.</p>';
    return `<table><tr><th>Data</th><th>Participantes</th><th>Resultado</th><th>Verificação</th></tr>${rows.map((r) => {
      const me = r.participants.find((p) => p.id === this.you?.id);
      const res = r.winnerId === this.you?.id ? '🏆 Vitória' : me?.status === 'finished' ? `Terminou (${formatMs(me.finishMs)})` : me?.status === 'dq' ? 'Desclassificado' : 'Não terminou';
      return `<tr><td>${new Date(r.endedAt).toLocaleString('pt-AO', { timeZone: 'Africa/Luanda' })}</td><td>${r.participants.map((p) => esc(p.name)).join(' vs ')}</td><td>${res}${r.stake ? ` · ${kz(r.stake)} demo` : ''}</td><td class="mono">${esc(r.hash.slice(0, 12))}…</td></tr>`;
    }).join('')}</table>`;
  }

  setSelfProfile(p) { this.selfProfile = p; if (this.menuTab === 'perfil' && !$('menu').classList.contains('hidden')) this.renderMenu(); }

  // ------------------------------------------------------ perfil de terceiros
  showProfile(p) {
    if (!p) return;
    if (p.playerId === this.you?.id) { this.setSelfProfile(p); return; }
    const el = $('profile');
    el.innerHTML = `<div class="dlg-head"><div><div class="dlg-name">${esc(p.displayName)}</div><div class="dlg-role">${esc(p.label)}</div></div><span class="badge human">ONLINE</span><button class="icon-btn" id="pf-close">✕</button></div>
      <div class="stat-grid" style="margin:8px 0"><div class="stat">Corridas<b>${p.races}</b></div><div class="stat">Vitórias<b>${p.wins}</b></div></div>
      <div class="row" style="display:flex;gap:6px;flex-wrap:wrap">
        ${p.friendship === 'accepted' ? '<span class="badge human">AMIGO</span>' : `<button class="btn" id="pf-friend">Adicionar amigo</button>`}
        <button class="btn" id="pf-party">Convidar para grupo</button>
      </div>
      <h3 style="margin:10px 0 6px;font-size:15px">Desafiar para corrida</h3>
      <div class="row" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        <select id="pf-veh"><option value="car">Carro</option><option value="moto">Mota</option></select>
        <select id="pf-stake">${STAKES.map((s) => `<option value="${s}">${s ? `${kz(s)} demo` : 'Gratuita'}</option>`).join('')}</select>
        <button class="btn good" id="pf-challenge">Desafiar</button>
      </div>`;
    el.classList.remove('hidden');
    $('pf-close').onclick = () => el.classList.add('hidden');
    if ($('pf-friend')) $('pf-friend').onclick = () => this.net.send({ t: 'friend_request', to: p.playerId });
    $('pf-party').onclick = () => this.net.send({ t: 'party_invite', to: p.playerId });
    $('pf-challenge').onclick = () => { this.net.send({ t: 'challenge', to: p.playerId, vehicle: $('pf-veh').value, stake: Number($('pf-stake').value) }); el.classList.add('hidden'); };
  }

  showChallenge(c) {
    const el = $('challenge-modal');
    el.innerHTML = `<h2>⚔️ Desafio de corrida</h2><p><b>${esc(c.from.name)}</b> desafiou-te para uma corrida de ${c.vehicle === 'moto' ? 'mota' : 'carro'} no anel.</p>
      <p>${c.stake ? `Entrada: <b>${kz(c.stake)} demo</b> cada · prémio ${kz(c.stake * 2 * 0.9)} demo` : 'Corrida <b>gratuita</b>'}</p>
      <div class="row" style="justify-content:center;display:flex;gap:8px"><button class="btn good" id="ch-yes">Aceitar</button><button class="btn bad" id="ch-no">Recusar</button></div>
      <p class="muted" style="font-size:12px">Expira em 60 s. Saldo demo, sem valor real.</p>`;
    el.classList.remove('hidden');
    $('ch-yes').onclick = () => { this.net.send({ t: 'challenge_respond', id: c.id, accept: true }); el.classList.add('hidden'); };
    $('ch-no').onclick = () => { this.net.send({ t: 'challenge_respond', id: c.id, accept: false }); el.classList.add('hidden'); };
    this.pendingChallenge = c.id;
  }

  onChallengeUpdate(c) {
    if (c.status === 'pending' && c.from.id === this.you?.id) this.toast(`Desafio enviado a ${c.to.name}.`);
    if (c.status === 'declined' && c.from.id === this.you?.id) this.toast(`${c.to.name} recusou o desafio.`, 'bad');
    if (c.status === 'expired' || c.status === 'cancelled') { if (this.pendingChallenge === c.id) $('challenge-modal').classList.add('hidden'); this.toast('Desafio expirado.', 'bad'); }
  }

  // ---------------------------------------------------------------- corrida
  raceSetup(m) {
    $('race-hud').classList.remove('hidden');
    $('race-title').textContent = m.participants.map((p) => p.name).join(' vs ');
    $('race-cp').textContent = `0/${m.track.checkpoints.length}`;
    $('race-time').textContent = '0:00.0';
    $('race-countdown').classList.remove('hidden');
  }

  raceTick(race, serverNow) {
    if (!race) return;
    const left = Math.ceil((race.goAt - serverNow) / 1000);
    const cd = $('race-countdown');
    if (left > 0) { cd.textContent = left; cd.classList.remove('hidden'); } else if (left > -1) { cd.textContent = 'JÁ!'; } else cd.classList.add('hidden');
    if (serverNow > race.goAt && !race.finished) $('race-time').textContent = formatMs(serverNow - race.goAt);
    $('race-cp').textContent = `${race.cp}/${race.total}`;
  }

  raceResult(m, onReturn) {
    $('race-hud').classList.add('hidden');
    const r = m.record;
    const el = $('result-modal');
    const me = r.participants.find((p) => p.id === this.you?.id);
    const won = r.winnerId === this.you?.id;
    el.innerHTML = `<h2>${won ? '🏆 Vitória!' : r.winnerId ? 'Corrida terminada' : 'Sem vencedor'}</h2>
      <table style="width:100%;font-size:14px;text-align:left">${r.participants.sort((a, b) => (a.finishMs ?? 1e12) - (b.finishMs ?? 1e12)).map((p, i) => `<tr><td>${i + 1}.</td><td>🏁 ${esc(p.name)}</td><td>${p.status === 'finished' ? formatMs(p.finishMs) : p.status === 'dq' ? `desclassificado (${esc(p.reason)})` : 'não terminou'}</td></tr>`).join('')}</table>
      ${r.settlement ? `<p>${r.settlement.prizeKz ? `Prémio: <b>${kz(r.settlement.prizeKz)} demo</b> · taxa ${kz(r.settlement.feeKz)} demo` : 'Entradas reembolsadas.'}</p>` : ''}
      <p class="muted" style="font-size:12px">Resultado decidido pelo servidor. Registo verificável:</p>
      <p class="mono">${esc(m.hash)}</p>
      <p class="muted" style="font-size:12px">ID: <span class="mono">${esc(r.raceId)}</span></p>
      <button class="primary" id="res-ok">Regressar ao mundo</button>`;
    el.classList.remove('hidden');
    $('res-ok').onclick = () => { el.classList.add('hidden'); onReturn(); };
    void me;
  }
}
