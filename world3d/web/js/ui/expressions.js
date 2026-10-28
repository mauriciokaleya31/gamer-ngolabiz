/**
 * Roda de emotes (tecla G / botão 😀 no telemóvel), painel de emojis (tecla J),
 * favoritos guardados na conta (servidor) e atalhos rápidos 1–4 (primeiros favoritos).
 */
import { EMOJI_CATEGORIES, EMOTE_CATEGORIES } from '../../../shared/emotes.js';

const $ = (id) => document.getElementById(id);

export class ExpressionsUI {
  constructor({ net, onEmote, onEmoji }) {
    this.net = net;
    this.onEmote = onEmote;
    this.onEmoji = onEmoji;
    this.emotes = [];
    this.favorites = [];
    this.root = document.createElement('div');
    this.root.id = 'expr';
    this.root.className = 'panel glass hidden';
    document.body.appendChild(this.root);
    this.tab = 'emotes';
    this.category = 'todos';
    net.on('prefs', (m) => { this.favorites = m.prefs.emoteFavorites ?? this.favorites; if (this.isOpen()) this.render(); });
  }

  setup(emotes, prefs) {
    this.emotes = emotes.filter((e) => e.active && e.platforms.includes('web'));
    this.favorites = prefs?.emoteFavorites?.length ? prefs.emoteFavorites : ['acenar', 'positivo', 'rir', 'danca_kuduro'];
  }

  isOpen() { return !this.root.classList.contains('hidden'); }

  toggle(tab = this.tab, force) {
    const open = force ?? !(this.isOpen() && this.tab === tab);
    this.tab = tab;
    this.root.classList.toggle('hidden', !open);
    if (open) this.render();
    return open;
  }

  quick(slot) {
    const id = this.favorites[slot];
    if (id) this.onEmote(id);
  }

  toggleFavorite(id) {
    const fav = this.favorites.includes(id) ? this.favorites.filter((x) => x !== id) : [...this.favorites, id].slice(0, 8);
    this.favorites = fav;
    this.net.send({ t: 'emote_favorites', ids: fav });
    this.render();
  }

  render() {
    const tabs = `<div class="menu-tabs"><button data-t="emotes" class="${this.tab === 'emotes' ? 'active' : ''}">Emotes</button><button data-t="emojis" class="${this.tab === 'emojis' ? 'active' : ''}">Emojis</button><button class="icon-btn" data-close="1">✕</button></div>`;
    if (this.tab === 'emotes') {
      const cats = ['todos', 'favoritos', ...Object.keys(EMOTE_CATEGORIES)];
      const list = this.emotes.filter((e) => this.category === 'todos' || (this.category === 'favoritos' ? this.favorites.includes(e.id) : e.category === this.category));
      this.root.innerHTML = `${tabs}
        <div class="chips">${cats.map((c) => `<button data-c="${c}" class="${c === this.category ? 'active' : ''}">${c === 'todos' ? 'Todos' : c === 'favoritos' ? '★ Favoritos' : EMOTE_CATEGORIES[c]}</button>`).join('')}</div>
        <div class="emote-grid">${list.map((e) => `<div class="emote-card"><button class="emote-play" data-e="${e.id}" title="${e.name}"><span class="ico">${e.icon}</span><span>${e.name}</span></button><button class="fav ${this.favorites.includes(e.id) ? 'on' : ''}" data-f="${e.id}" title="Favorito">★</button></div>`).join('') || '<p class="muted">Sem emotes nesta categoria.</p>'}</div>
        <p class="muted">Atalhos: <b>1–4</b> = primeiros favoritos (${this.favorites.slice(0, 4).map((id) => this.emotes.find((e) => e.id === id)?.icon ?? '').join(' ')}). Mexer-se cancela o emote.</p>`;
    } else {
      this.root.innerHTML = `${tabs}${Object.values(EMOJI_CATEGORIES).map((c) => `<div class="emoji-cat"><div class="muted">${c.name}</div>${c.list.map((e) => `<button class="emoji-btn" data-j="${e}">${e}</button>`).join('')}</div>`).join('')}`;
    }
    this.root.querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => { this.tab = b.dataset.t; this.render(); }; });
    this.root.querySelector('[data-close]').onclick = () => this.toggle(this.tab, false);
    this.root.querySelectorAll('[data-c]').forEach((b) => { b.onclick = () => { this.category = b.dataset.c; this.render(); }; });
    this.root.querySelectorAll('[data-e]').forEach((b) => { b.onclick = () => { this.onEmote(b.dataset.e); this.toggle(this.tab, false); }; });
    this.root.querySelectorAll('[data-f]').forEach((b) => { b.onclick = () => this.toggleFavorite(b.dataset.f); });
    this.root.querySelectorAll('[data-j]').forEach((b) => { b.onclick = () => this.onEmoji(b.dataset.j); });
  }
}
