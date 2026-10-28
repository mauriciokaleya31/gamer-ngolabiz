/**
 * Controlos tácteis (telemóvel/tablet): joystick virtual à esquerda, arrastar à
 * direita para a câmara, botões contextuais grandes (≥ 56 px) que mudam a pé /
 * a conduzir, e acesso rápido a emotes, emojis, chat e menu.
 * Activado automaticamente em ecrãs de ponteiro "coarse" ou com ?touch=1.
 */
export function isTouchDevice() {
  return new URLSearchParams(location.search).get('touch') === '1' || matchMedia('(pointer: coarse)').matches;
}

export class TouchControls {
  constructor({ player, actions }) {
    this.player = player;
    this.actions = actions;
    document.body.classList.add('touch');
    const root = document.createElement('div');
    root.id = 'touch';
    root.innerHTML = `
      <div id="joy"><div id="joy-knob"></div></div>
      <div id="tbtns-foot" class="tbtns">
        <button data-k="Space" class="tb big" aria-label="Saltar">⤒<small>Saltar</small></button>
        <button data-hold="ShiftLeft" class="tb" aria-label="Correr">🏃<small>Correr</small></button>
        <button data-a="interact" class="tb" aria-label="Interagir">💬<small>Falar</small></button>
        <button data-a="vehicle" class="tb" aria-label="Veículo">🚗<small>Veículo</small></button>
      </div>
      <div id="tbtns-drive" class="tbtns hidden">
        <button data-hold="KeyW" class="tb big" aria-label="Acelerar">▲<small>Acelerar</small></button>
        <button data-hold="KeyS" class="tb" aria-label="Travar">▼<small>Travar/Ré</small></button>
        <button data-hold="Space" class="tb" aria-label="Travão de mão">⏸<small>Mão</small></button>
        <button data-a="vehicle" class="tb" aria-label="Sair">🚪<small>Sair</small></button>
        <button data-a="horn" class="tb small" aria-label="Buzina">📯</button>
      </div>
      <div id="ttop" class="tbar">
        <button data-a="emotes" aria-label="Emotes">😀</button>
        <button data-a="shop" aria-label="Loja">🛍️</button>
        <button data-a="emojis" aria-label="Emojis">💬</button>
        <button data-a="chat" aria-label="Chat">⌨️</button>
        <button data-a="menu" aria-label="Menu">☰</button>
      </div>`;
    document.body.appendChild(root);
    this.root = root;
    this.bindJoystick();
    root.querySelectorAll('[data-k]').forEach((b) => {
      b.addEventListener('touchstart', (e) => { e.preventDefault(); this.player.keys.add(b.dataset.k); setTimeout(() => this.player.keys.delete(b.dataset.k), 120); }, { passive: false });
    });
    root.querySelectorAll('[data-hold]').forEach((b) => {
      const k = b.dataset.hold;
      b.addEventListener('touchstart', (e) => { e.preventDefault(); this.player.keys.add(k); b.classList.add('on'); }, { passive: false });
      const up = (e) => { e.preventDefault(); this.player.keys.delete(k); b.classList.remove('on'); };
      b.addEventListener('touchend', up, { passive: false });
      b.addEventListener('touchcancel', up, { passive: false });
    });
    root.querySelectorAll('[data-a]').forEach((b) => {
      b.addEventListener('touchstart', (e) => { e.preventDefault(); this.actions[b.dataset.a]?.(); }, { passive: false });
      b.addEventListener('click', () => this.actions[b.dataset.a]?.());
    });
  }

  bindJoystick() {
    const joy = this.root.querySelector('#joy');
    const knob = this.root.querySelector('#joy-knob');
    let id = null;
    let cx = 0;
    let cy = 0;
    const R = 56;
    const set = (x, y) => {
      const d = Math.hypot(x, y);
      const k = d > R ? R / d : 1;
      const nx = (x * k) / R;
      const ny = (y * k) / R;
      knob.style.transform = `translate(${nx * R}px, ${ny * R}px)`;
      if (this.player.mode === 'vehicle') {
        this.player.touchMove = null;
        this.player.keys[nx < -0.3 ? 'add' : 'delete']('KeyA');
        this.player.keys[nx > 0.3 ? 'add' : 'delete']('KeyD');
      } else this.player.touchMove = { x: nx, y: ny };
    };
    joy.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      id = t.identifier;
      const r = joy.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      set(t.clientX - cx, t.clientY - cy);
    }, { passive: false });
    joy.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === id) set(t.clientX - cx, t.clientY - cy);
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== id) continue;
        id = null;
        knob.style.transform = '';
        this.player.touchMove = null;
        this.player.keys.delete('KeyA');
        this.player.keys.delete('KeyD');
      }
    };
    joy.addEventListener('touchend', end);
    joy.addEventListener('touchcancel', end);
  }

  /** Mostra os botões do contexto actual (a pé ou a conduzir). */
  update(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.root.querySelector('#tbtns-foot').classList.toggle('hidden', mode === 'vehicle');
    this.root.querySelector('#tbtns-drive').classList.toggle('hidden', mode !== 'vehicle');
  }
}
